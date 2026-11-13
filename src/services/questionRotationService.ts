import { prisma } from '../prisma';

export class QuestionRotationService {
  /**
   * Select fresh, non-repeating questions for a new tournament room.
   * Prioritizes:
   * 1. Questions least used in previous tournaments (timesUsed ASC)
   * 2. Questions not used recently (lastUsedAt ASC or NULL)
   * 3. If a specific user is targeted, excludes questions they already answered
   */
  public static async selectFreshQuestions(
    category: string,
    targetEducation: string = 'ALL',
    count: number = 5,
    excludeUserIds: string[] = []
  ): Promise<string[]> {
    const whereClause: any = {
      category: category.toUpperCase(),
    };

    if (targetEducation !== 'ALL') {
      whereClause.OR = [
        { targetEducation: 'ALL' },
        { targetEducation },
      ];
    }

    // Get list of question IDs already answered by the specified users
    let answeredQuestionIds: string[] = [];
    if (excludeUserIds.length > 0) {
      const history = await prisma.userQuestionHistory.findMany({
        where: { userId: { in: excludeUserIds } },
        select: { questionId: true },
      });
      answeredQuestionIds = history.map((h) => h.questionId);
    }

    // Attempt 1: Fetch questions that these users have NEVER seen, ordered by timesUsed ASC
    const freshQuestions = await prisma.question.findMany({
      where: {
        ...whereClause,
        ...(answeredQuestionIds.length > 0 ? { id: { notIn: answeredQuestionIds } } : {}),
      },
      orderBy: [
        { timesUsed: 'asc' },
        { lastUsedAt: 'asc' },
      ],
      select: { id: true },
      take: count * 3, // take a small pool to randomize among the freshest
    });

    let selectedIds: string[] = [];

    if (freshQuestions.length >= count) {
      // Shuffle the freshest pool slightly so questions aren't in strict chronological order
      const shuffled = freshQuestions.sort(() => 0.5 - Math.random());
      selectedIds = shuffled.slice(0, count).map((q) => q.id);
    } else {
      // If fresh pool is small, take all fresh questions and fill the rest with least-recently used questions
      const freshIds = freshQuestions.map((q) => q.id);
      selectedIds = [...freshIds];

      const remainingNeeded = count - selectedIds.length;
      if (remainingNeeded > 0) {
        const fallbackQuestions = await prisma.question.findMany({
          where: {
            ...whereClause,
            id: { notIn: selectedIds },
          },
          orderBy: [
            { timesUsed: 'asc' },
            { lastUsedAt: 'asc' },
          ],
          select: { id: true },
          take: remainingNeeded,
        });
        selectedIds.push(...fallbackQuestions.map((q) => q.id));
      }
    }

    // Update timesUsed and lastUsedAt for all selected questions
    if (selectedIds.length > 0) {
      await prisma.question.updateMany({
        where: { id: { in: selectedIds } },
        data: {
          timesUsed: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    }

    return selectedIds;
  }

  /**
   * Record that a user encountered and answered a question in a tournament room.
   */
  public static async recordUserAnswer(
    userId: string,
    questionId: string,
    roomId: string,
    wasCorrect: boolean
  ) {
    try {
      await prisma.userQuestionHistory.upsert({
        where: {
          userId_questionId: {
            userId,
            questionId,
          },
        },
        update: {
          roomId,
          wasCorrect,
          answeredAt: new Date(),
        },
        create: {
          userId,
          questionId,
          roomId,
          wasCorrect,
          answeredAt: new Date(),
        },
      });
    } catch (err) {
      console.error('[QuestionRotationService] Failed to record user answer history:', err);
    }
  }

  /**
   * Calculate question freshness percentage for a user in a given room.
   * e.g. 5 out of 5 questions unseen = 100% Fresh
   */
  public static async calculateRoomFreshnessForUser(
    userId: string,
    questionIdsJson: string
  ): Promise<{ total: number; unseen: number; freshnessPercent: number }> {
    try {
      let qIds: string[] = [];
      try {
        qIds = JSON.parse(questionIdsJson);
      } catch (e) {
        return { total: 0, unseen: 0, freshnessPercent: 100 };
      }

      if (qIds.length === 0) return { total: 0, unseen: 0, freshnessPercent: 100 };

      const seenCount = await prisma.userQuestionHistory.count({
        where: {
          userId,
          questionId: { in: qIds },
        },
      });

      const unseen = Math.max(0, qIds.length - seenCount);
      const freshnessPercent = Math.round((unseen / qIds.length) * 100);

      return {
        total: qIds.length,
        unseen,
        freshnessPercent,
      };
    } catch (err) {
      return { total: 0, unseen: 0, freshnessPercent: 100 };
    }
  }
}

