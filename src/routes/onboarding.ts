import { Router, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

/**
 * Public endpoint to fetch active onboarding slides for mobile app auth screen
 * GET /api/onboarding/slides
 */
router.get('/slides', async (_req, res: Response): Promise<any> => {
  try {
    const slides = await prisma.onboardingSlide.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
    return res.json(slides);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

