import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { MatchmakingService } from '../services/matchmakingService';
import { WalletService } from '../services/walletService';
import { EmailService } from '../services/emailService';
import { QuestionRotationService } from '../services/questionRotationService';

const router = Router();

// Get personalized recommended rooms for logged-in user
router.get('/recommended', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const rooms = await MatchmakingService.getRecommendedRooms(req.user!.id);
    const userId = req.user!.id;

    // Check pre-registration status for each room
    const userParticipations = await prisma.roomParticipant.findMany({
      where: { userId },
      select: { roomId: true, hasJoinedArena: true },
    });
    const registeredRoomIds = new Set(userParticipations.map((p) => p.roomId));

    const enrichedRooms = await Promise.all(
      rooms.map(async (r: any) => {
        const freshness = await QuestionRotationService.calculateRoomFreshnessForUser(
          userId,
          r.questionIds
        );
        const startTime = r.scheduledStartTime;
        const endTime = r.scheduledEndTime || (startTime ? new Date(new Date(startTime).getTime() + 15 * 60 * 1000) : null);
        return {
          ...r,
          scheduledEndTime: endTime,
          isRegistered: registeredRoomIds.has(r.id),
          freshnessPercent: freshness.freshnessPercent,
          unseenQuestions: freshness.unseen,
          totalQuestions: freshness.total,
        };
      })
    );

    return res.json(enrichedRooms);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get dynamic system configuration (categories, education levels, topic tags)
router.get('/meta/options', async (_req, res: Response): Promise<any> => {
  try {
    const categories = ['TNPSC', 'CINEMA', 'GENERAL_GK', 'SCIENCE', 'SPORTS'];
    const educationLevels = [
      { label: 'School (Below 10th)', value: 'BELOW_10TH' },
      { label: '10th / +2 Passed', value: 'TENTH_PLUS_TWO' },
      { label: 'Diploma', value: 'DIPLOMA' },
      { label: 'Degree / Graduate', value: 'DEGREE' },
      { label: 'Post Graduate', value: 'POST_GRADUATE' },
    ];
    const difficulties = ['EASY', 'MEDIUM', 'HARD'];

    return res.json({
      categories,
      educationLevels,
      difficulties,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get category stats
router.get('/categories/stats', async (_req, res: Response): Promise<any> => {
  try {
    const stats = await MatchmakingService.getCategoryStats();
    return res.json(stats);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get rooms by category with user registration status
router.get('/category/:category', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const category = req.params.category.toUpperCase();
    const userId = req.user!.id;

    const rooms = await prisma.quizRoom.findMany({
      where: {
        category,
        status: { in: ['SCHEDULED', 'WAITING', 'COUNTDOWN', 'LIVE', 'WAITING_RESULTS'] },
      },
      include: {
        _count: { select: { participants: true } },
      },
      orderBy: { scheduledStartTime: 'asc' },
    });

    const userParticipations = await prisma.roomParticipant.findMany({
      where: { userId },
      select: { roomId: true, hasJoinedArena: true },
    });
    const registeredRoomIds = new Set(userParticipations.map((p) => p.roomId));

    const enrichedRooms = await Promise.all(
      rooms.map(async (r) => {
        const freshness = await QuestionRotationService.calculateRoomFreshnessForUser(
          userId,
          r.questionIds
        );
        const startTime = r.scheduledStartTime;
        const endTime = r.scheduledEndTime || (startTime ? new Date(new Date(startTime).getTime() + 15 * 60 * 1000) : null);
        return {
          ...r,
          scheduledEndTime: endTime,
          currentPlayers: r._count.participants,
          isRegistered: registeredRoomIds.has(r.id),
          freshnessPercent: freshness.freshnessPercent,
          unseenQuestions: freshness.unseen,
          totalQuestions: freshness.total,
        };
      })
    );

    return res.json(enrichedRooms);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get room details
router.get('/:id', async (req, res: Response): Promise<any> => {
  try {
    const room = await prisma.quizRoom.findUnique({
      where: { id: req.params.id },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, skillRating: true, isBot: true } },
          },
        },
      },
    });

    if (!room) return res.status(404).json({ error: 'Room not found' });
    return res.json(room);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Pre-register for scheduled room & pay entry fee + send confirmation email
router.post('/:id/join', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const roomId = req.params.id;
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const room = await prisma.quizRoom.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (room.status === 'FINISHED') {
      return res.status(400).json({ error: 'Quiz room already finished' });
    }

    // Check if user already joined
    const existing = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (existing) {
      return res.json({
        message: 'Already registered for this tournament!',
        participant: existing,
        roomStatus: room.status,
      });
    }

    // Check room capacity
    const participantCount = await prisma.roomParticipant.count({ where: { roomId } });
    if (participantCount >= room.maxPlayers) {
      return res.status(400).json({ error: 'Tournament room is at maximum capacity' });
    }

    // Deduct entry fee from wallet
    let newBalance = user.walletBalance;
    if (room.entryFee > 0) {
      const deduction = await WalletService.deductEntryFee(userId, roomId, room.entryFee);
      newBalance = deduction.balance;
    }

    // Create participant entry with preRegisteredAt timestamp
    const participant = await prisma.roomParticipant.create({
      data: {
        roomId,
        userId,
        preRegisteredAt: new Date(),
        hasJoinedArena: false,
      },
    });

    // Send instant email confirmation
    const scheduledTime = room.scheduledStartTime || new Date(Date.now() + 15 * 60 * 1000);
    await EmailService.sendRegistrationConfirmation(
      user.email || 'player@quizarena.com',
      user.name,
      room.title,
      room.category,
      scheduledTime,
      room.joinWindowMinutes || 10,
      room.entryFee
    );

    return res.json({
      message: `Payment of ₹${room.entryFee} successful! Slot confirmed.`,
      participant,
      ticketId: `TKT-${participant.id.substring(0, 8).toUpperCase()}`,
      newWalletBalance: newBalance,
      roomStatus: room.status,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// Check if joining window is open to enter the live arena
router.post('/:id/enter-arena', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const roomId = req.params.id;
    const userId = req.user!.id;

    const room = await prisma.quizRoom.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const participant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!participant) {
      return res.status(400).json({ error: 'You must pre-register before entering the arena' });
    }

    const now = Date.now();
    const scheduledTime = room.scheduledStartTime ? new Date(room.scheduledStartTime).getTime() : now;
    const joinWindowOpens = scheduledTime - (room.joinWindowMinutes || 10) * 60 * 1000;

    // Check if joining window is open
    if (now < joinWindowOpens && room.status === 'SCHEDULED') {
      const waitMinutes = Math.ceil((joinWindowOpens - now) / 60000);
      return res.status(400).json({
        error: `Joining window opens ${waitMinutes} minutes before scheduled battle time.`,
        joinWindowOpensAt: new Date(joinWindowOpens),
      });
    }

    // Check if tournament already ended
    if (room.status === 'FINISHED') {
      return res.status(400).json({ error: 'This tournament has concluded' });
    }

    // Mark as joined in DB
    await prisma.roomParticipant.update({
      where: { id: participant.id },
      data: { hasJoinedArena: true },
    });

    return res.json({
      canEnter: true,
      room,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

export default router;
