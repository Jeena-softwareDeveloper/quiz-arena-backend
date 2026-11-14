import { Router } from 'express';
import { TradingEngine } from '../services/tradingEngine';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();
const engine = TradingEngine.getInstance();

// 1. Get all assets
router.get('/assets', (_req, res) => {
  res.json({
    success: true,
    assets: engine.getAssets(),
  });
});

// 2. Get candles for an asset
router.get('/candles/:assetId', (req, res) => {
  const { assetId } = req.params;
  const candles = engine.getCandles(assetId);
  const asset = engine.getAsset(assetId);
  res.json({
    success: true,
    asset,
    candles,
  });
});

// 3. User places trade prediction (UP / DOWN)
router.post('/predict', authenticateToken, async (req: any, res) => {
  try {
    const { assetId, amount, direction } = req.body;
    const user = req.user;

    if (!assetId || !amount || !direction) {
      return res.status(400).json({ error: 'Missing required trade parameters' });
    }

    if (direction !== 'UP' && direction !== 'DOWN') {
      return res.status(400).json({ error: 'Direction must be UP or DOWN' });
    }

    const result = await engine.placeBet({
      userId: user.id,
      userName: user.name || 'Trader',
      userPhone: user.phone,
      assetId,
      amount: Number(amount),
      direction,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      bet: result.bet,
      newWalletBalance: result.newBalance,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to place trade' });
  }
});

// 4. Get User Trades
router.get('/my-trades', authenticateToken, (req: any, res) => {
  const user = req.user;
  const trades = engine.getUserBets(user.id);
  res.json({
    success: true,
    active: trades.active,
    history: trades.history,
  });
});

// --- ADMIN CONTROL ROUTES ---

// 5. Admin Overview & Control Dashboard
router.get('/admin/overview', authenticateToken, (req: any, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.json({
    success: true,
    data: engine.getAdminOverview(),
  });
});

// 6. Admin Update Global Settings (Force Mode, Round Duration, Preset Amounts)
router.post('/admin/settings', authenticateToken, (req: any, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { forceMode, roundDurationSec, presetAmounts } = req.body;
  engine.setAdminSettings({ forceMode, roundDurationSec, presetAmounts });
  res.json({
    success: true,
    message: 'Trading settings updated successfully',
    data: engine.getAdminOverview(),
  });
});

// 7. Admin Update Asset Control (Price, Payout %, Change %)
router.post('/admin/asset-control', authenticateToken, (req: any, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { assetId, price, payoutRate, change, isPositive } = req.body;
  if (!assetId) {
    return res.status(400).json({ error: 'Asset ID required' });
  }
  const ok = engine.updateAssetControl(assetId, {
    price: price !== undefined ? Number(price) : undefined,
    payoutRate: payoutRate !== undefined ? Number(payoutRate) : undefined,
    change,
    isPositive,
  });
  if (!ok) return res.status(404).json({ error: 'Asset not found' });

  res.json({
    success: true,
    message: `Asset ${assetId} updated`,
    asset: engine.getAsset(assetId),
  });
});

// 8. Admin Force Specific Bet Outcome
router.post('/admin/force-bet', authenticateToken, (req: any, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { betId, outcome } = req.body;
  if (!betId || (outcome !== 'FORCE_WIN' && outcome !== 'FORCE_LOSS')) {
    return res.status(400).json({ error: 'Valid betId and outcome required' });
  }
  const ok = engine.forceBetResult(betId, outcome);
  res.json({ success: ok });
});

export default router;
