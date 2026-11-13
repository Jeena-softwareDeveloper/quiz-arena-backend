import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { CONFIG } from '../config';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Register new user with educational profiling & language preference
router.post('/register', async (req, res): Promise<any> => {
  try {
    const { phone, password, name, email, educationLevel, examInterests, languagePreference } = req.body;

    if (!phone || !password || !name) {
      return res.status(400).json({ error: 'Phone, password, and name are required' });
    }

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const validEducation = educationLevel || 'DEGREE';
    const validInterests = Array.isArray(examInterests)
      ? examInterests.join(',')
      : (examInterests || 'TNPSC,GENERAL_GK');

    // Create user and give ₹50 free welcome bonus
    const user = await prisma.user.create({
      data: {
        phone,
        password: hashedPassword,
        name,
        email: email || `${phone}@quizarena.com`,
        languagePreference: languagePreference || 'EN',
        educationLevel: validEducation,
        examInterests: validInterests,
        walletBalance: 50.0,
      },
    });

    // Create Welcome Bonus ledger entry
    await prisma.walletLedger.create({
      data: {
        userId: user.id,
        type: 'CREDIT',
        category: 'WELCOME_BONUS',
        amount: 50.0,
        balanceAfter: 50.0,
        description: '₹50 Free Welcome Bonus credited to your wallet!',
        referenceId: 'WELCOME-BONUS',
      },
    });

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      CONFIG.JWT_SECRET,
      { expiresIn: CONFIG.JWT_EXPIRES_IN as any }
    );

    return res.status(201).json({
      message: 'Registration successful! ₹50 welcome bonus added to your wallet.',
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        languagePreference: user.languagePreference,
        role: user.role,
        educationLevel: user.educationLevel,
        examInterests: user.examInterests.split(','),
        walletBalance: user.walletBalance,
        skillRating: user.skillRating,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res): Promise<any> => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      CONFIG.JWT_SECRET,
      { expiresIn: CONFIG.JWT_EXPIRES_IN as any }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        languagePreference: user.languagePreference || 'EN',
        role: user.role,
        educationLevel: user.educationLevel,
        examInterests: user.examInterests.split(','),
        walletBalance: user.walletBalance,
        skillRating: user.skillRating,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get current profile
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        languagePreference: true,
        role: true,
        educationLevel: true,
        examInterests: true,
        walletBalance: true,
        skillRating: true,
        createdAt: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      ...user,
      examInterests: user.examInterests.split(','),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Update profile & preferences (language, education, email, interests)
router.put('/profile', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { name, email, educationLevel, examInterests, languagePreference } = req.body;
    const updateData: any = {};

    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (educationLevel) updateData.educationLevel = educationLevel;
    if (languagePreference) updateData.languagePreference = languagePreference;
    if (examInterests) {
      updateData.examInterests = Array.isArray(examInterests)
        ? examInterests.join(',')
        : examInterests;
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: updateData,
    });

    return res.json({
      message: 'Profile updated successfully',
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        languagePreference: updated.languagePreference,
        educationLevel: updated.educationLevel,
        examInterests: updated.examInterests.split(','),
        walletBalance: updated.walletBalance,
        skillRating: updated.skillRating,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
