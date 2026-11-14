import { Router, Response } from 'express';
import * as XLSX from 'xlsx';
import { prisma } from '../prisma';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { RoomEngine } from '../services/roomEngine';
import { BotEngine } from '../services/botEngine';
import { QuestionRotationService } from '../services/questionRotationService';
import { uploadImage } from '../services/uploadService';

const router = Router();

// Protect all admin routes
router.use(authenticateToken);
router.use(requireAdmin);

// System overview stats
router.get('/stats', async (_req, res: Response): Promise<any> => {
  try {
    const totalUsers = await prisma.user.count({ where: { role: 'USER' } });
    const totalRooms = await prisma.quizRoom.count();
    const activeRooms = await prisma.quizRoom.count({
      where: { status: { in: ['SCHEDULED', 'WAITING', 'COUNTDOWN', 'LIVE', 'WAITING_RESULTS'] } },
    });
    const totalQuestions = await prisma.question.count();
    const totalWalletBalances = await prisma.user.aggregate({
      _sum: { walletBalance: true },
    });
    const totalTransactions = await prisma.walletLedger.count();

    const categoryBreakdown = await prisma.question.groupBy({
      by: ['category'],
      _count: { id: true },
    });

    return res.json({
      totalUsers,
      totalRooms,
      activeRooms,
      totalQuestions,
      totalWalletPool: totalWalletBalances._sum.walletBalance || 0,
      totalTransactions,
      categoryBreakdown,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Questions list
router.get('/questions', async (req, res: Response): Promise<any> => {
  try {
    const { category, search } = req.query;
    const where: any = {};
    if (category && category !== 'ALL') where.category = String(category).toUpperCase();
    if (search) {
      where.OR = [
        { questionText: { contains: String(search) } },
        { questionTextTamil: { contains: String(search) } },
      ];
    }

    const questions = await prisma.question.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json(
      questions.map((q) => ({
        ...q,
        options: JSON.parse(q.options),
      }))
    );
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Download Question Bank Excel / CSV Template
router.get('/questions/template', async (req, res: Response): Promise<any> => {
  try {
    const templateData = [
      {
        category: 'TNPSC',
        subCategory: 'Tamil Literature',
        difficulty: 'EASY',
        targetEducation: 'ALL',
        questionText: 'Who authored the Tamil epic Tirukkural?',
        questionTextTamil: 'திருக்குறளை இயற்றியவர் யார்?',
        optionA: 'Thiruvalluvar',
        optionB: 'Avvaiyar',
        optionC: 'Kambar',
        optionD: 'Bharathiyar',
        correctOption: 'A',
        explanation: 'Thiruvalluvar composed Tirukkural containing 1330 couplets.',
      },
      {
        category: 'CINEMA',
        subCategory: 'Kollywood',
        difficulty: 'MEDIUM',
        targetEducation: 'ALL',
        questionText: 'Which music composer won Oscar for Slumdog Millionaire?',
        questionTextTamil: 'ஸ்லம்டாக் மில்லியனர் படத்திற்காக ஆஸ்கார் விருது வென்ற தமிழ் இசையமைப்பாளர் யார்?',
        optionA: 'Ilaiyaraaja',
        optionB: 'A. R. Rahman',
        optionC: 'Anirudh',
        optionD: 'Harris Jayaraj',
        correctOption: 'B',
        explanation: 'A.R. Rahman won two Academy Awards in 2009 for Slumdog Millionaire.',
      },
      {
        category: 'GENERAL_GK',
        subCategory: 'Geography',
        difficulty: 'EASY',
        targetEducation: 'SCHOOL',
        questionText: 'What is the capital city of Tamil Nadu?',
        questionTextTamil: 'தமிழ்நாட்டின் தலைநகரம் எது?',
        optionA: 'Madurai',
        optionB: 'Coimbatore',
        optionC: 'Chennai',
        optionD: 'Tiruchirappalli',
        correctOption: 'C',
        explanation: 'Chennai (formerly Madras) is the state capital of Tamil Nadu.',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Questions');

    const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=question_template.csv');
      return res.send(csv);
    } else {
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=question_template.xlsx');
      return res.send(buf);
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Bulk upload questions from parsed Excel/CSV data
router.post('/questions/bulk-upload', async (req, res: Response): Promise<any> => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Valid array of question rows is required' });
    }

    const inserted = [];
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const rowNum = i + 1;

      if (!q.questionText || !q.category) {
        errors.push({ row: rowNum, reason: 'Missing question text or category' });
        continue;
      }

      // Format options
      let optionsArray: string[] = [];
      if (Array.isArray(q.options) && q.options.length === 4) {
        optionsArray = q.options;
      } else if (q.optionA && q.optionB && q.optionC && q.optionD) {
        optionsArray = [String(q.optionA), String(q.optionB), String(q.optionC), String(q.optionD)];
      } else {
        errors.push({ row: rowNum, reason: 'Question must have 4 distinct options (A, B, C, D)' });
        continue;
      }

      // Format correct index
      let correctIndex = 0;
      if (typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3) {
        correctIndex = q.correctIndex;
      } else if (typeof q.correctOption === 'string') {
        const char = q.correctOption.trim().toUpperCase();
        if (char === 'A' || char === '1') correctIndex = 0;
        else if (char === 'B' || char === '2') correctIndex = 1;
        else if (char === 'C' || char === '3') correctIndex = 2;
        else if (char === 'D' || char === '4') correctIndex = 3;
      }

      const item = await prisma.question.create({
        data: {
          category: q.category.toUpperCase().trim(),
          subCategory: q.subCategory?.trim() || null,
          difficulty: q.difficulty?.toUpperCase().trim() || 'MEDIUM',
          targetEducation: q.targetEducation?.toUpperCase().trim() || 'ALL',
          questionText: q.questionText.trim(),
          questionTextTamil: q.questionTextTamil?.trim() || null,
          options: JSON.stringify(optionsArray),
          correctIndex,
          explanation: q.explanation?.trim() || null,
        },
      });

      inserted.push(item);
    }

    return res.json({
      message: `Successfully uploaded ${inserted.length} questions`,
      importedCount: inserted.length,
      errorCount: errors.length,
      errors,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Create single question
router.post('/questions', async (req, res: Response): Promise<any> => {
  try {
    const { category, subCategory, difficulty, targetEducation, questionText, questionTextTamil, options, correctIndex, explanation } = req.body;

    if (!category || !questionText || !Array.isArray(options) || options.length !== 4 || correctIndex === undefined) {
      return res.status(400).json({ error: 'Valid question text, 4 options, category, and correctIndex (0-3) are required' });
    }

    const question = await prisma.question.create({
      data: {
        category: category.toUpperCase(),
        subCategory,
        difficulty: difficulty || 'MEDIUM',
        targetEducation: targetEducation || 'ALL',
        questionText,
        questionTextTamil,
        options: JSON.stringify(options),
        correctIndex: parseInt(correctIndex, 10),
        explanation,
      },
    });

    return res.status(201).json({ message: 'Question created successfully', question });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Rooms list
router.get('/rooms', async (_req, res: Response): Promise<any> => {
  try {
    const rooms = await prisma.quizRoom.findMany({
      include: {
        _count: { select: { participants: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json(
      rooms.map((r) => ({
        ...r,
        participantCount: r._count.participants,
      }))
    );
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Review room participants & tentative scores before releasing results
router.get('/rooms/:id/review', async (req, res: Response): Promise<any> => {
  try {
    const room = await prisma.quizRoom.findUnique({
      where: { id: req.params.id },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, phone: true, isBot: true, email: true } },
          },
          orderBy: [{ score: 'desc' }, { totalAnswerTimeMs: 'asc' }],
        },
      },
    });

    if (!room) return res.status(404).json({ error: 'Room not found' });

    return res.json({
      room,
      participants: room.participants.map((p, idx) => ({
        id: p.id,
        userId: p.userId,
        name: p.user.name,
        phone: p.user.phone,
        isBot: p.isBot || p.user.isBot,
        score: p.score,
        correctAnswers: p.correctAnswers,
        totalAnswerTimeMs: p.totalAnswerTimeMs,
        currentRank: p.rank || idx + 1,
        prizeWon: p.prizeWon,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Admin officially releases results and distributes prize money
router.post('/rooms/:id/release-results', async (req, res: Response): Promise<any> => {
  try {
    const roomId = req.params.id;
    const { designatedWinnerId } = req.body;

    const result = await RoomEngine.getInstance().releaseResults(roomId, designatedWinnerId);
    return res.json({
      message: 'Tournament results officially released and prize balances credited!',
      result,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// Create new Scheduled Quiz Room
router.post('/rooms', async (req, res: Response): Promise<any> => {
  try {
    const {
      title,
      category,
      targetEducation,
      entryFee,
      prizePool,
      maxPlayers,
      totalQuestions,
      scheduledStartTime,
      scheduledEndTime,
      joinWindowMinutes,
      botCount,
      winnerStrategy,
      targetWinnerType,
    } = req.body;

    const count = parseInt(totalQuestions || '5', 10);

    // Pick non-repeating fresh questions using the Question Rotation Engine
    const selectedIds = await QuestionRotationService.selectFreshQuestions(
      category,
      targetEducation || 'ALL',
      count
    );

    if (selectedIds.length < count) {
      return res.status(400).json({
        error: `Only ${selectedIds.length} fresh questions available for category ${category}. Please add more questions in Question Bank.`,
      });
    }

    // Compute scheduled start time
    let parsedScheduledTime: Date | null = null;
    if (scheduledStartTime) {
      parsedScheduledTime = new Date(scheduledStartTime);
    } else {
      // Default: 15 minutes from now
      parsedScheduledTime = new Date(Date.now() + 15 * 60 * 1000);
    }

    let parsedEndTime: Date | null = null;
    if (scheduledEndTime) {
      parsedEndTime = new Date(scheduledEndTime);
    } else if (parsedScheduledTime) {
      parsedEndTime = new Date(parsedScheduledTime.getTime() + 15 * 60 * 1000);
    }

    const botsNum = botCount !== undefined ? parseInt(botCount, 10) : 5;

    const room = await prisma.quizRoom.create({
      data: {
        title,
        category: category.toUpperCase(),
        targetEducation: targetEducation || 'ALL',
        entryFee: parseFloat(entryFee || '10'),
        prizePool: parseFloat(prizePool || '80'),
        maxPlayers: parseInt(maxPlayers || '20', 10),
        totalQuestions: count,
        questionIds: JSON.stringify(selectedIds),
        scheduledStartTime: parsedScheduledTime,
        scheduledEndTime: parsedEndTime,
        joinWindowMinutes: parseInt(joinWindowMinutes || '10', 10),
        botCount: botsNum,
        winnerStrategy: winnerStrategy || 'HUMAN_PRIORITY',
        targetWinnerType: targetWinnerType || 'HUMAN',
        status: 'SCHEDULED',
      },
    });

    // Automatically pre-populate simulated bots for this tournament
    if (botsNum > 0) {
      await BotEngine.populateRoomWithBots(room.id, botsNum);
    }

    return res.status(201).json({ message: 'Tournament room scheduled successfully', room });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Users profiling overview
router.get('/users', async (_req, res: Response): Promise<any> => {
  try {
    const users = await prisma.user.findMany({
      where: { isBot: false },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        role: true,
        educationLevel: true,
        examInterests: true,
        skillRating: true,
        walletBalance: true,
        createdAt: true,
        _count: { select: { participations: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json(users);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Platform ledger audit
router.get('/ledgers', async (_req, res: Response): Promise<any> => {
  try {
    const ledgers = await prisma.walletLedger.findMany({
      include: {
        user: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json(ledgers);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// HERO BANNER MANAGEMENT (ADMIN)
// ==========================================

// Get all banners
router.get('/banners', async (_req, res: Response): Promise<any> => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
    return res.json(banners);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Create new banner (supports uploaded image base64 or URL)
router.post('/banners', async (req, res: Response): Promise<any> => {
  try {
    const {
      title,
      titleTamil,
      subtitle,
      subtitleTamil,
      imageUrl,
      actionType,
      actionTarget,
      actionText,
      actionTextTamil,
      isActive,
      order,
    } = req.body;

    if (!title || !imageUrl) {
      return res.status(400).json({ error: 'Title and Banner Image are required' });
    }

    const banner = await prisma.banner.create({
      data: {
        title,
        titleTamil: titleTamil || null,
        subtitle: subtitle || null,
        subtitleTamil: subtitleTamil || null,
        imageUrl,
        actionType: actionType || 'PLAY_NOW',
        actionTarget: actionTarget || null,
        actionText: actionText || 'Play Now',
        actionTextTamil: actionTextTamil || 'இப்போதே விளையாடு',
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        order: Number(order) || 0,
      },
    });

    return res.status(201).json(banner);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Update banner (toggle active, change text/image, change order)
router.put('/banners/:id', async (req, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const {
      title,
      titleTamil,
      subtitle,
      subtitleTamil,
      imageUrl,
      actionType,
      actionTarget,
      actionText,
      actionTextTamil,
      isActive,
      order,
    } = req.body;

    const data: any = {};
    if (title !== undefined) data.title = title;
    if (titleTamil !== undefined) data.titleTamil = titleTamil;
    if (subtitle !== undefined) data.subtitle = subtitle;
    if (subtitleTamil !== undefined) data.subtitleTamil = subtitleTamil;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (actionType !== undefined) data.actionType = actionType;
    if (actionTarget !== undefined) data.actionTarget = actionTarget;
    if (actionText !== undefined) data.actionText = actionText;
    if (actionTextTamil !== undefined) data.actionTextTamil = actionTextTamil;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (order !== undefined) data.order = Number(order);

    const banner = await prisma.banner.update({
      where: { id },
      data,
    });

    return res.json(banner);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Delete banner
router.delete('/banners/:id', async (req, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    await prisma.banner.delete({ where: { id } });
    return res.json({ success: true, message: 'Banner deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// IMAGE UPLOAD (CLOUDINARY / LOCAL FALLBACK)
// ==========================================
router.post('/upload', async (req, res: Response): Promise<any> => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required' });
    }
    const hostHeader = req.get('host');
    const result = await uploadImage(image, hostHeader);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ONBOARDING SLIDES MANAGEMENT (ADMIN)
// ==========================================

// Get all onboarding slides
router.get('/onboarding', async (_req, res: Response): Promise<any> => {
  try {
    const slides = await prisma.onboardingSlide.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
    return res.json(slides);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Create new onboarding slide
router.post('/onboarding', async (req, res: Response): Promise<any> => {
  try {
    const { title, subtitle, imageUrl, order, isActive } = req.body;

    if (!title || !imageUrl) {
      return res.status(400).json({ error: 'Title and Image are required' });
    }

    // Process image through upload service if it's base64 data
    let finalImageUrl = imageUrl;
    if (imageUrl.startsWith('data:image')) {
      const uploadRes = await uploadImage(imageUrl, req.get('host'));
      finalImageUrl = uploadRes.url;
    }

    const slide = await prisma.onboardingSlide.create({
      data: {
        title,
        subtitle: subtitle || null,
        imageUrl: finalImageUrl,
        order: order !== undefined ? Number(order) : 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    return res.status(201).json(slide);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Update onboarding slide
router.put('/onboarding/:id', async (req, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { title, subtitle, imageUrl, order, isActive } = req.body;

    const data: any = {};
    if (title !== undefined) data.title = title;
    if (subtitle !== undefined) data.subtitle = subtitle;
    if (imageUrl !== undefined) {
      if (imageUrl.startsWith('data:image')) {
        const uploadRes = await uploadImage(imageUrl, req.get('host'));
        data.imageUrl = uploadRes.url;
      } else {
        data.imageUrl = imageUrl;
      }
    }
    if (order !== undefined) data.order = Number(order);
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const slide = await prisma.onboardingSlide.update({
      where: { id },
      data,
    });

    return res.json(slide);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Delete onboarding slide
router.delete('/onboarding/:id', async (req, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    await prisma.onboardingSlide.delete({ where: { id } });
    return res.json({ success: true, message: 'Onboarding slide deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

