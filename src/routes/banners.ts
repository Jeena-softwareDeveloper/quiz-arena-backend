import { Router, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

/**
 * Public endpoint to fetch active hero banners for mobile app
 */
router.get('/', async (_req, res: Response): Promise<any> => {
  try {
    const banners = await prisma.banner.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
    return res.json(banners);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

