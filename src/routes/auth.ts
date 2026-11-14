import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { CONFIG } from '../config';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Register new user with Email or Phone
router.post('/register', async (req, res): Promise<any> => {
  try {
    const { email, phone, password, name, educationLevel, examInterests, languagePreference } = req.body;

    const userEmail = email ? String(email).trim().toLowerCase() : '';
    const userPhone = phone ? String(phone).trim() : '';

    if ((!userEmail && !userPhone) || !password || !name) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }

    // Check if email already registered
    if (userEmail) {
      const existingEmail = await prisma.user.findFirst({ where: { email: userEmail } });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email address already registered. Please sign in.' });
      }
    }

    // If phone is provided, check uniqueness; otherwise generate unique placeholder phone
    let finalPhone = userPhone;
    if (finalPhone) {
      const existingPhone = await prisma.user.findUnique({ where: { phone: finalPhone } });
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
    } else {
      // Generate unique random 10-digit number
      finalPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const validEducation = educationLevel || 'DEGREE';
    const validInterests = Array.isArray(examInterests)
      ? examInterests.join(',')
      : (examInterests || 'TNPSC,GENERAL_GK');

    // Create user and give ₹50 free welcome bonus
    const user = await prisma.user.create({
      data: {
        phone: finalPhone,
        password: hashedPassword,
        name: name.trim(),
        email: userEmail || `${finalPhone}@quicktrade.com`,
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
      { id: user.id, phone: user.phone, role: user.role, email: user.email },
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

// Login with Email or Phone
router.post('/login', async (req, res): Promise<any> => {
  try {
    const { email, phone, identifier, password } = req.body;
    const loginQuery = (email || phone || identifier || '').trim();

    if (!loginQuery || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: loginQuery.toLowerCase() },
          { email: loginQuery },
          { phone: loginQuery },
        ],
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role, email: user.email },
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
