import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { WalletService } from '../services/walletService';

const router = Router();

// Get balance
router.get('/balance', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const balance = await WalletService.getBalance(req.user!.id);
    return res.json({ balance });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Recharge wallet
router.post('/recharge', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { amount, referenceId } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid recharge amount required' });
    }

    const result = await WalletService.recharge(req.user!.id, numAmount, referenceId);
    return res.json({
      message: `Successfully recharged ₹${numAmount} into your wallet`,
      ...result,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// Withdraw from wallet
router.post('/withdraw', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { amount, upiId } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount < 20) {
      return res.status(400).json({ error: 'Minimum withdrawal is ₹20' });
    }
    if (!upiId || !upiId.includes('@')) {
      return res.status(400).json({ error: 'Valid UPI ID (e.g. name@okhdfcbank) is required' });
    }

    const result = await WalletService.requestWithdrawal(req.user!.id, numAmount, upiId);
    return res.json({
      message: `Withdrawal request of ₹${numAmount} to ${upiId} processed successfully!`,
      ...result,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// Get transactions history
router.get('/transactions', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const history = await WalletService.getHistory(req.user!.id);
    return res.json(history);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

