import { prisma } from '../prisma';

export const BOT_PLAYERS = [
  { name: 'Senthil Kumar', phone: 'BOT_001', educationLevel: 'DEGREE' },
  { name: 'Kavitha Rajan', phone: 'BOT_002', educationLevel: 'POST_GRADUATE' },
  { name: 'Anand Murugan', phone: 'BOT_003', educationLevel: 'TENTH_PLUS_TWO' },
  { name: 'Divya Bharathi', phone: 'BOT_004', educationLevel: 'DEGREE' },
  { name: 'Saravanan M', phone: 'BOT_005', educationLevel: 'DIPLOMA' },
  { name: 'Meenakshi Sundaram', phone: 'BOT_006', educationLevel: 'DEGREE' },
  { name: 'Vigneshwaran P', phone: 'BOT_007', educationLevel: 'BELOW_10TH' },
  { name: 'Nandhini G', phone: 'BOT_008', educationLevel: 'DEGREE' },
  { name: 'Deepak Raj', phone: 'BOT_009', educationLevel: 'TENTH_PLUS_TWO' },
  { name: 'Pooja Krishnan', phone: 'BOT_010', educationLevel: 'DEGREE' },
];

export class BotEngine {
  private static botsInitialized = false;

  /**
   * Ensure standard bot accounts exist in the database
   */
  public static async ensureBotsExist() {
    if (this.botsInitialized) return;

    for (const b of BOT_PLAYERS) {
      await prisma.user.upsert({
        where: { phone: b.phone },
        update: {
          name: b.name,
          educationLevel: b.educationLevel,
          isBot: true,
          role: 'BOT',
        },
        create: {
          phone: b.phone,
          name: b.name,
          email: `${b.phone.toLowerCase()}@quizbot.internal`,
          password: 'bot_no_login_allowed',
          role: 'BOT',
          isBot: true,
          educationLevel: b.educationLevel,
          examInterests: 'TNPSC,GENERAL_GK,SCIENCE,CINEMA',
          skillRating: 1100 + Math.floor(Math.random() * 200),
          walletBalance: 1000.0,
        },
      });
    }

    this.botsInitialized = true;
  }

  /**
   * Populate a tournament room with realistic simulated bots
   */
  public static async populateRoomWithBots(roomId: string, count: number = 4) {
    await this.ensureBotsExist();

    const availableBots = await prisma.user.findMany({
      where: { isBot: true },
      take: Math.min(count, BOT_PLAYERS.length),
    });

    for (const bot of availableBots) {
      await prisma.roomParticipant.upsert({
        where: { roomId_userId: { roomId, userId: bot.id } },
        update: {
          isBot: true,
          botName: bot.name,
          hasJoinedArena: true,
        },
        create: {
          roomId,
          userId: bot.id,
          isBot: true,
          botName: bot.name,
          hasJoinedArena: true,
        },
      });
    }

    return availableBots;
  }

  /**
   * Calculate simulated answer, response time, and correctness for a bot
   */
  public static calculateBotAnswer(
    correctIndex: number,
    targetWinnerType: string,
    isLeaderBot: boolean
  ): { selectedOption: number; isCorrect: boolean; delayMs: number } {
    let willBeCorrect = false;
    let delayMs = 3000;

    if (targetWinnerType === 'BOT' && isLeaderBot) {
      // Leader bot destined to win: 100% accuracy, lightning fast answer (1.2s to 2.2s)
      willBeCorrect = true;
      delayMs = 1200 + Math.floor(Math.random() * 1000);
    } else if (targetWinnerType === 'HUMAN') {
      // Human win priority: bots make mistakes or answer slightly slower
      // Even the top bot gets ~65-75% accuracy and moderate speed (2.8s to 5.5s)
      const threshold = isLeaderBot ? 0.75 : 0.55;
      willBeCorrect = Math.random() < threshold;
      delayMs = 2800 + Math.floor(Math.random() * 2800);
    } else {
      // Merit / Balanced
      willBeCorrect = Math.random() < 0.70;
      delayMs = 2000 + Math.floor(Math.random() * 3000);
    }

    let selectedOption = correctIndex;
    if (!willBeCorrect) {
      // Pick a random wrong option
      const wrongOptions = [0, 1, 2, 3].filter((idx) => idx !== correctIndex);
      selectedOption = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    }

    return {
      selectedOption,
      isCorrect: willBeCorrect,
      delayMs,
    };
  }
}

