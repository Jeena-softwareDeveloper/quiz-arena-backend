import { Server } from 'socket.io';
import { prisma } from '../prisma';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradeAsset {
  id: string;
  name: string;
  symbol: string;
  category: string;
  price: number;
  basePrice?: number;
  change: string;
  isPositive: boolean;
  payoutRate: number; // e.g. 90%
}

export interface TradeBet {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  assetId: string;
  amount: number;
  direction: 'UP' | 'DOWN'; // UP = Green, DOWN = Red
  entryPrice: number;
  payoutRate: number;
  potentialWin: number;
  placedAt: number;
  expiresAt: number;
  status: 'ACTIVE' | 'WON' | 'LOST';
  adminOverride?: 'FORCE_WIN' | 'FORCE_LOSS' | null;
  resultPrice?: number;
}

export type ForceOutcomeMode = 'AUTO' | 'FORCE_GREEN' | 'FORCE_RED' | 'HOUSE_ADVANTAGE';

export class TradingEngine {
  private static instance: TradingEngine;
  private io?: Server;

  private assets: Map<string, TradeAsset> = new Map();
  private candleHistory: Map<string, Candle[]> = new Map();
  private activeBets: Map<string, TradeBet> = new Map();
  private betHistory: TradeBet[] = [];

  // Admin controls
  private forceMode: ForceOutcomeMode = 'AUTO';
  private presetAmounts: number[] = [100, 500, 1000, 5000];
  private roundDurationSec: number = 30;

  private tickInterval?: NodeJS.Timeout;

  constructor(io?: Server) {
    this.io = io;
    TradingEngine.instance = this;
    this.initDefaultAssets();
    this.startLiveTicker();
  }

  public static getInstance(io?: Server): TradingEngine {
    if (!TradingEngine.instance) {
      TradingEngine.instance = new TradingEngine(io);
    } else if (io && !TradingEngine.instance.io) {
      TradingEngine.instance.io = io;
    }
    return TradingEngine.instance;
  }

  public setSocketServer(io: Server) {
    this.io = io;
  }

  private initDefaultAssets() {
    const defaultAssets: TradeAsset[] = [
      {
        id: 'bitcoin',
        name: 'Bitcoin',
        symbol: 'BTC/USDT',
        category: 'Crypto',
        price: 68342.56,
        basePrice: 68342.56,
        change: '+0.82%',
        isPositive: true,
        payoutRate: 90,
      },
      {
        id: 'ethereum',
        name: 'Ethereum',
        symbol: 'ETH/USDT',
        category: 'Crypto',
        price: 2948.12,
        basePrice: 2948.12,
        change: '+1.45%',
        isPositive: true,
        payoutRate: 88,
      },
      {
        id: 'gold',
        name: 'Gold',
        symbol: 'XAU/USD',
        category: 'Commodity',
        price: 6238.40,
        basePrice: 6238.40,
        change: '-0.34%',
        isPositive: false,
        payoutRate: 85,
      },
      {
        id: 'solana',
        name: 'Solana',
        symbol: 'SOL/USDT',
        category: 'Crypto',
        price: 13420.00,
        basePrice: 13420.00,
        change: '+3.20%',
        isPositive: true,
        payoutRate: 90,
      },
      {
        id: 'silver',
        name: 'Silver',
        symbol: 'XAG/USD',
        category: 'Commodity',
        price: 78.20,
        basePrice: 78.20,
        change: '+0.15%',
        isPositive: true,
        payoutRate: 82,
      },
    ];

    for (const a of defaultAssets) {
      this.assets.set(a.id, a);
      this.candleHistory.set(a.id, this.generateInitialCandles(a.price, 30));
    }
  }

  /**
   * Generates realistic historical candles for chart display by walking BACKWARDS
   * from basePrice. This guarantees that the latest candle seamlessly connects to the live price!
   */
  private generateInitialCandles(basePrice: number, count: number): Candle[] {
    const candles: Candle[] = [];
    const now = Date.now();
    const intervalMs = 60 * 1000; // 1m candles
    let runningPrice = basePrice;
    const volatility = basePrice * 0.0006;

    for (let i = 0; i < count; i++) {
      const time = now - i * intervalMs;
      const close = Math.round(runningPrice * 100) / 100;
      const delta = (Math.random() - 0.49) * volatility;
      const open = Math.round((runningPrice - delta) * 100) / 100;
      const wickExtra = Math.random() * (volatility * 0.5);
      const high = Math.round((Math.max(open, close) + wickExtra) * 100) / 100;
      const low = Math.round((Math.min(open, close) - wickExtra) * 100) / 100;

      // Unshift to put earliest candle first, latest candle at the end
      candles.unshift({ time, open, high, low, close });
      runningPrice = open;
    }
    return candles;
  }

  /**
   * Real-time live price ticker (runs every 1.5s)
   */
  private startLiveTicker() {
    if (this.tickInterval) clearInterval(this.tickInterval);

    this.tickInterval = setInterval(() => {
      const now = Date.now();

      for (const [assetId, asset] of this.assets.entries()) {
        const history = this.candleHistory.get(assetId) || [];
        if (history.length === 0) continue;

        let currentCandle = history[history.length - 1];
        const isCandleExpired = now - currentCandle.time > 60 * 1000;

        if (isCandleExpired) {
          // Push new candle
          const newCandle: Candle = {
            time: now,
            open: currentCandle.close,
            high: currentCandle.close,
            low: currentCandle.close,
            close: currentCandle.close,
          };
          history.push(newCandle);
          if (history.length > 50) history.shift();
          currentCandle = newCandle;
        }

        // Calculate next tick direction based on admin forceMode
        let tickDelta = 0;
        const volatility = asset.price * 0.0004;

        if (this.forceMode === 'FORCE_GREEN') {
          tickDelta = Math.random() * volatility * 1.4;
        } else if (this.forceMode === 'FORCE_RED') {
          tickDelta = -Math.random() * volatility * 1.4;
        } else if (this.forceMode === 'HOUSE_ADVANTAGE') {
          // Check active bets on this asset
          let upMoney = 0;
          let downMoney = 0;
          for (const b of this.activeBets.values()) {
            if (b.assetId === assetId && b.status === 'ACTIVE') {
              if (b.direction === 'UP') upMoney += b.amount;
              else downMoney += b.amount;
            }
          }
          // Push against majority
          if (upMoney > downMoney) {
            tickDelta = -Math.random() * volatility;
          } else if (downMoney > upMoney) {
            tickDelta = Math.random() * volatility;
          } else {
            tickDelta = (Math.random() - 0.5) * volatility;
          }
        } else {
          // AUTO mode: Realistic mean-reverting wave walk (prevents runaway single candle spikes)
          const candleOpen = currentCandle.open;
          const openOffset = (asset.price - candleOpen) / Math.max(1, asset.price);
          const reversion = -openOffset * asset.price * 0.12;
          const randomStep = (Math.random() - 0.5) * volatility;
          tickDelta = randomStep + reversion;
        }

        const newPrice = Math.max(1, Math.round((asset.price + tickDelta) * 100) / 100);
        asset.price = newPrice;
        currentCandle.close = newPrice;
        currentCandle.high = Math.max(currentCandle.high, newPrice);
        currentCandle.low = Math.min(currentCandle.low, newPrice);

        // Update change percentage
        const base = asset.basePrice || newPrice;
        const diffPercent = ((newPrice - base) / base) * 100;
        asset.change = `${diffPercent >= 0 ? '+' : ''}${diffPercent.toFixed(2)}%`;
        asset.isPositive = diffPercent >= 0;

        // Broadcast to clients
        if (this.io) {
          this.io.emit('trade:price_tick', {
            assetId,
            price: newPrice,
            change: asset.change,
            isPositive: asset.isPositive,
            candle: currentCandle,
          });
        }
      }

      // Check and resolve expired bets
      this.evaluateExpiredBets(now);
    }, 1500);
  }

  /**
   * Evaluates any bets whose round duration has completed
   */
  private async evaluateExpiredBets(now: number) {
    for (const [betId, bet] of this.activeBets.entries()) {
      if (bet.status === 'ACTIVE' && now >= bet.expiresAt) {
        const asset = this.assets.get(bet.assetId);
        const currentPrice = asset?.price || bet.entryPrice;
        bet.resultPrice = currentPrice;

        let isWin = false;

        if (bet.adminOverride === 'FORCE_WIN') {
          isWin = true;
        } else if (bet.adminOverride === 'FORCE_LOSS') {
          isWin = false;
        } else if (this.forceMode === 'FORCE_GREEN') {
          isWin = bet.direction === 'UP';
        } else if (this.forceMode === 'FORCE_RED') {
          isWin = bet.direction === 'DOWN';
        } else {
          // Compare currentPrice to entryPrice
          if (bet.direction === 'UP') {
            isWin = currentPrice >= bet.entryPrice;
          } else {
            isWin = currentPrice <= bet.entryPrice;
          }
        }

        bet.status = isWin ? 'WON' : 'LOST';

        // Credit wallet if won
        if (isWin) {
          try {
            const winAmount = bet.potentialWin;
            const user = await prisma.user.findUnique({ where: { id: bet.userId } });
            if (user) {
              const newBalance = user.walletBalance + winAmount;
              await prisma.user.update({
                where: { id: bet.userId },
                data: { walletBalance: newBalance },
              });
              await prisma.walletLedger.create({
                data: {
                  userId: bet.userId,
                  type: 'CREDIT',
                  category: 'PRIZE_WON',
                  amount: winAmount,
                  balanceAfter: newBalance,
                  description: `QuickTrade Won: ${asset?.name || 'Asset'} ${bet.direction} prediction`,
                  referenceId: bet.id,
                },
              });
            }
          } catch (e) {
            console.error('Error crediting trade win:', e);
          }
        }

        // Move to history
        this.betHistory.unshift({ ...bet });
        if (this.betHistory.length > 100) this.betHistory.pop();
        this.activeBets.delete(betId);

        // Notify client
        if (this.io) {
          this.io.emit(`trade:bet_result:${bet.userId}`, {
            betId: bet.id,
            status: bet.status,
            winAmount: isWin ? bet.potentialWin : 0,
            assetName: asset?.name,
            direction: bet.direction,
            entryPrice: bet.entryPrice,
            resultPrice: currentPrice,
          });
        }
      }
    }
  }

  // --- Public APIs ---

  public getAssets(): TradeAsset[] {
    return Array.from(this.assets.values());
  }

  public getAsset(assetId: string): TradeAsset | undefined {
    return this.assets.get(assetId);
  }

  public getCandles(assetId: string): Candle[] {
    return this.candleHistory.get(assetId) || [];
  }

  public async placeBet(params: {
    userId: string;
    userName: string;
    userPhone: string;
    assetId: string;
    amount: number;
    direction: 'UP' | 'DOWN';
  }): Promise<{ success: boolean; bet?: TradeBet; newBalance?: number; error?: string }> {
    const { userId, userName, userPhone, assetId, amount, direction } = params;

    const asset = this.assets.get(assetId);
    if (!asset) return { success: false, error: 'Asset not found' };

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: 'User not found' };

    if (user.walletBalance < amount) {
      return { success: false, error: 'Insufficient wallet balance' };
    }

    // Debit wallet
    const newBalance = user.walletBalance - amount;
    await prisma.user.update({
      where: { id: userId },
      data: { walletBalance: newBalance },
    });

    const betId = `TRADE-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

    await prisma.walletLedger.create({
      data: {
        userId,
        type: 'DEBIT',
        category: 'ENTRY_FEE',
        amount,
        balanceAfter: newBalance,
        description: `Trade Bid: ${asset.name} ${direction} (₹${amount})`,
        referenceId: betId,
      },
    });

    const payoutMultiplier = 1 + asset.payoutRate / 100;
    const potentialWin = Math.round(amount * payoutMultiplier);
    const placedAt = Date.now();
    const expiresAt = placedAt + this.roundDurationSec * 1000;

    const bet: TradeBet = {
      id: betId,
      userId,
      userName,
      userPhone,
      assetId,
      amount,
      direction,
      entryPrice: asset.price,
      payoutRate: asset.payoutRate,
      potentialWin,
      placedAt,
      expiresAt,
      status: 'ACTIVE',
    };

    this.activeBets.set(betId, bet);

    if (this.io) {
      this.io.emit('trade:new_bet', {
        betId: bet.id,
        userName,
        assetName: asset.name,
        amount,
        direction,
        potentialWin,
      });
    }

    return { success: true, bet, newBalance };
  }

  public getUserBets(userId: string): { active: TradeBet[]; history: TradeBet[] } {
    const active: TradeBet[] = [];
    for (const b of this.activeBets.values()) {
      if (b.userId === userId) active.push(b);
    }
    const history = this.betHistory.filter((b) => b.userId === userId);
    return { active, history };
  }

  // --- Admin APIs ---

  public getAdminOverview() {
    return {
      forceMode: this.forceMode,
      roundDurationSec: this.roundDurationSec,
      presetAmounts: this.presetAmounts,
      assets: Array.from(this.assets.values()),
      activeBetsCount: this.activeBets.size,
      activeBets: Array.from(this.activeBets.values()),
      recentHistory: this.betHistory.slice(0, 30),
    };
  }

  public setAdminSettings(params: {
    forceMode?: ForceOutcomeMode;
    roundDurationSec?: number;
    presetAmounts?: number[];
  }) {
    if (params.forceMode) this.forceMode = params.forceMode;
    if (params.roundDurationSec) this.roundDurationSec = params.roundDurationSec;
    if (params.presetAmounts) this.presetAmounts = params.presetAmounts;

    if (this.io) {
      this.io.emit('trade:admin_settings_changed', {
        forceMode: this.forceMode,
        roundDurationSec: this.roundDurationSec,
        presetAmounts: this.presetAmounts,
      });
    }
  }

  public updateAssetControl(
    assetId: string,
    params: {
      price?: number;
      payoutRate?: number;
      change?: string;
      isPositive?: boolean;
    }
  ) {
    const asset = this.assets.get(assetId);
    if (!asset) return false;

    if (params.price !== undefined) {
      asset.price = params.price;
      const history = this.candleHistory.get(assetId);
      if (history && history.length > 0) {
        history[history.length - 1].close = params.price;
      }
    }
    if (params.payoutRate !== undefined) asset.payoutRate = params.payoutRate;
    if (params.change !== undefined) asset.change = params.change;
    if (params.isPositive !== undefined) asset.isPositive = params.isPositive;

    if (this.io) {
      this.io.emit('trade:asset_updated', asset);
    }
    return true;
  }

  public forceBetResult(betId: string, outcome: 'FORCE_WIN' | 'FORCE_LOSS') {
    const bet = this.activeBets.get(betId);
    if (bet) {
      bet.adminOverride = outcome;
      return true;
    }
    return false;
  }
}

