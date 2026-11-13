import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { CONFIG } from './config';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import walletRoutes from './routes/wallet';
import adminRoutes from './routes/admin';
import bannerRoutes from './routes/banners';
import { RoomEngine } from './services/roomEngine';

const app = express();
const server = http.createServer(app);

// Enable Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware (with 25mb limit for banner image uploads)
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/banners', bannerRoutes);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Quiz Arena Backend Engine',
  });
});

// Initialize real-time Room Engine with Socket.io
export const roomEngine = new RoomEngine(io);

// Start Server
server.listen(CONFIG.PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Quiz Arena Backend running on port ${CONFIG.PORT}`);
  console.log(`⚡ WebSocket Server attached and ready`);
  console.log(`📡 API Endpoints available at http://localhost:${CONFIG.PORT}/api`);
  console.log(`===============================================`);
});

