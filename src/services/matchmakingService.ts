import { prisma } from '../prisma';

export class MatchmakingService {
  /**
   * Get personalized rooms matching the user's education and interests
   */
  static async getRecommendedRooms(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        educationLevel: true,
        examInterests: true,
        skillRating: true,
      },
    });

    if (!user) throw new Error('User not found');

    const interests = user.examInterests.split(',').map((s) => s.trim().toUpperCase());
    const isGraduate = ['DEGREE', 'POST_GRADUATE'].includes(user.educationLevel);

    // Education target mapping
    const targetEdFilter = isGraduate
      ? ['ALL', 'GRADUATE']
      : ['ALL', 'SCHOOL'];

    // Find active, scheduled, and waiting rooms matching preferences
    const rooms = await prisma.quizRoom.findMany({
      where: {
        status: { in: ['SCHEDULED', 'WAITING', 'COUNTDOWN', 'LIVE', 'WAITING_RESULTS'] },
        targetEducation: { in: targetEdFilter },
        minSkillRating: { lte: user.skillRating + 200 },
        maxSkillRating: { gte: user.skillRating - 200 },
      },
      include: {
        _count: {
          select: { participants: true },
        },
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Score and rank rooms based on matching interests
    const scoredRooms = rooms.map((room) => {
      let matchScore = 0;
      if (interests.includes(room.category.toUpperCase())) {
        matchScore += 50;
      }
      if (room.targetEducation === (isGraduate ? 'GRADUATE' : 'SCHOOL')) {
        matchScore += 30;
      }
      if (user.skillRating >= room.minSkillRating && user.skillRating <= room.maxSkillRating) {
        matchScore += 20;
      }

      return {
        ...room,
        currentPlayers: room._count.participants,
        matchScore,
        isRecommended: matchScore >= 50,
      };
    });

    // Sort by match score descending
    return scoredRooms.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Get all categories with room counts
   */
  static async getCategoryStats() {
    const categories = [
      'SPEED_LUDO',
      'FRUIT_SLICER',
      'KNIFE_HIT',
      'SPEED_MATH',
      'TAMIL_QUIZ',
      'CINEMA',
      'GENERAL_GK',
    ];
    const stats = [];

    for (const cat of categories) {
      const activeCount = await prisma.quizRoom.count({
        where: {
          category: cat,
          status: { in: ['WAITING', 'LIVE'] },
        },
      });
      const questionCount = await prisma.question.count({
        where: { category: cat },
      });
      stats.push({ category: cat, activeRooms: activeCount, totalQuestions: questionCount });
    }

    return stats;
  }
}

