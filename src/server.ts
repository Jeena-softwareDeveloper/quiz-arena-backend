import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import { CONFIG } from './config';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import walletRoutes from './routes/wallet';
import adminRoutes from './routes/admin';
import bannerRoutes from './routes/banners';
import onboardingRoutes from './routes/onboarding';
import tradingRoutes from './routes/trading';
import { RoomEngine } from './services/roomEngine';
import { TradingEngine } from './services/tradingEngine';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/trading', tradingRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Set Quick Trade Backend Engine',
  });
});

// Initialize real-time Room Engine with Socket.io
export const roomEngine = new RoomEngine(io);
export const tradingEngine = TradingEngine.getInstance(io);

// Start Server
server.listen(CONFIG.PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Set Quick Trade Backend running on port ${CONFIG.PORT}`);
  console.log(`⚡ WebSocket Server attached and ready`);
  console.log(`📡 API Endpoints available at http://localhost:${CONFIG.PORT}/api`);
  console.log(`===============================================`);
});

