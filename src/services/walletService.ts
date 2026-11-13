import { prisma } from '../prisma';

export class WalletService {
  /**
   * Get current balance for a user
   */
  static async getBalance(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });
    return user?.walletBalance ?? 0;
  }

  /**
   * Add money to wallet (Recharge)
   */
  static async recharge(userId: string, amount: number, referenceId?: string): Promise<{ balance: number; ledgerId: string }> {
    if (amount <= 0) throw new Error('Recharge amount must be greater than zero');

    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      const newBalance = user.walletBalance + amount;

      await tx.user.update({
        where: { id: userId },
        data: { walletBalance: newBalance },
      });

      const ledger = await tx.walletLedger.create({
        data: {
          userId,
          type: 'CREDIT',
          category: 'RECHARGE',
          amount,
          balanceAfter: newBalance,
          description: `Wallet recharge via UPI / NetBanking of ₹${amount}`,
          referenceId: referenceId || `PAY-${Date.now()}`,
        },
      });

      return { balance: newBalance, ledgerId: ledger.id };
    });
  }

  /**
   * Deduct Entry Fee when joining a quiz room
   */
  static async deductEntryFee(userId: string, roomId: string, amount: number): Promise<{ success: boolean; balance: number }> {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      if (user.walletBalance < amount) {
        throw new Error(`Insufficient wallet balance. You need ₹${amount}, but have ₹${user.walletBalance}`);
      }

      const newBalance = user.walletBalance - amount;

      await tx.user.update({
        where: { id: userId },
        data: { walletBalance: newBalance },
      });

      await tx.walletLedger.create({
        data: {
          userId,
          type: 'DEBIT',
          category: 'ENTRY_FEE',
          amount,
          balanceAfter: newBalance,
          description: `Entry fee for Room #${roomId.substring(0, 8)}`,
          referenceId: roomId,
        },
      });

      return { success: true, balance: newBalance };
    });
  }

  /**
   * Credit prize money to winners
   */
  static async creditPrize(userId: string, roomId: string, amount: number, rank: number): Promise<number> {
    if (amount <= 0) return 0;

    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      const newBalance = user.walletBalance + amount;

      await tx.user.update({
        where: { id: userId },
        data: { walletBalance: newBalance },
      });

      await tx.walletLedger.create({
        data: {
          userId,
          type: 'CREDIT',
          category: 'PRIZE_WON',
          amount,
          balanceAfter: newBalance,
          description: `🏆 Prize Won: Rank #${rank} in Quiz Room #${roomId.substring(0, 8)}`,
          referenceId: roomId,
        },
      });

      return newBalance;
    });
  }

  /**
   * Request withdrawal to UPI
   */
  static async requestWithdrawal(userId: string, amount: number, upiId: string): Promise<{ success: boolean; balance: number }> {
    if (amount < 20) throw new Error('Minimum withdrawal amount is ₹20');

    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      if (user.walletBalance < amount) {
        throw new Error('Insufficient wallet balance for withdrawal');
      }

      const newBalance = user.walletBalance - amount;

      await tx.user.update({
        where: { id: userId },
        data: { walletBalance: newBalance },
      });

      await tx.walletLedger.create({
        data: {
          userId,
          type: 'DEBIT',
          category: 'WITHDRAWAL',
          amount,
          balanceAfter: newBalance,
          description: `Withdrawal payout to UPI ID: ${upiId}`,
          referenceId: `WD-${Date.now()}`,
        },
      });

      return { success: true, balance: newBalance };
    });
  }

  /**
   * Get user transaction history
   */
  static async getHistory(userId: string) {
    return await prisma.walletLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

