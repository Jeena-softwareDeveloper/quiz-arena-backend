import { Server, Socket } from 'socket.io';
import { prisma } from '../prisma';
import { WalletService } from './walletService';
import { BotEngine } from './botEngine';
import { EmailService } from './emailService';
import { QuestionRotationService } from './questionRotationService';

interface ActivePlayer {
  socketId?: string;
  userId: string;
  name: string;
  isBot: boolean;
  score: number;
  correctCount: number;
  hasAnsweredCurrent: boolean;
  answerTimeMs: number;
}

interface ActiveRoomState {
  roomId: string;
  status: 'WAITING' | 'COUNTDOWN' | 'LIVE' | 'WAITING_RESULTS' | 'FINISHED';
  currentQuestionIndex: number;
  totalQuestions: number;
  questionIds: string[];
  endsAt: number;
  roundStartTime: number;
  currentCorrectIndex: number;
  currentExplanation: string;
  targetWinnerType: string;
  winnerStrategy: string;
  players: Map<string, ActivePlayer>;
  botTimeouts: NodeJS.Timeout[];
  timerHandle?: NodeJS.Timeout;
}

export class RoomEngine {
  private static instance: RoomEngine;
  private io: Server;
  private activeRooms = new Map<string, ActiveRoomState>();

  constructor(io: Server) {
    this.io = io;
    RoomEngine.instance = this;
    this.setupSocketHandlers();
  }

  public static getInstance(): RoomEngine {
    return RoomEngine.instance;
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      // User joins a room
      socket.on('JOIN_ROOM', async (data: { roomId: string; userId: string }) => {
        try {
          await this.handlePlayerJoin(socket, data.roomId, data.userId);
        } catch (err: any) {
          socket.emit('ERROR', { message: err.message });
        }
      });

      // User submits an answer
      socket.on('SUBMIT_ANSWER', async (data: { roomId: string; userId: string; selectedOption: number }) => {
        try {
          await this.handleAnswerSubmission(socket, data.roomId, data.userId, data.selectedOption);
        } catch (err: any) {
          socket.emit('ERROR', { message: err.message });
        }
      });

      // User manual start room (for demo or when scheduled start triggers)
      socket.on('START_ROOM', async (data: { roomId: string }) => {
        await this.startCountdown(data.roomId);
      });

      socket.on('disconnect', () => {
        // Player disconnected from socket
      });
    });
  }

  /**
   * Handle player joining a room
   */
  private async handlePlayerJoin(socket: Socket, roomId: string, userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const room = await prisma.quizRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: { user: true },
        },
      },
    });
    if (!room) throw new Error('Room not found');

    if (room.status === 'FINISHED') throw new Error('This tournament has already ended');

    // Get or initialize active room in memory
    let roomState = this.activeRooms.get(roomId);
    if (!roomState) {
      let qIds: string[] = [];
      try {
        qIds = JSON.parse(room.questionIds);
      } catch (e) {
        qIds = [];
      }

      roomState = {
        roomId,
        status: (room.status as any) || 'WAITING',
        currentQuestionIndex: 0,
        totalQuestions: qIds.length || room.totalQuestions,
        questionIds: qIds,
        endsAt: 0,
        roundStartTime: 0,
        currentCorrectIndex: 0,
        currentExplanation: '',
        targetWinnerType: room.targetWinnerType || 'HUMAN',
        winnerStrategy: room.winnerStrategy || 'HUMAN_PRIORITY',
        players: new Map(),
        botTimeouts: [],
      };

      // Load existing pre-registered participants and bots into roomState
      for (const p of room.participants) {
        roomState.players.set(p.userId, {
          userId: p.userId,
          name: p.user.name,
          isBot: p.isBot || p.user.isBot,
          score: p.score || 0,
          correctCount: p.correctAnswers || 0,
          hasAnsweredCurrent: false,
          answerTimeMs: p.totalAnswerTimeMs || 0,
        });
      }

      this.activeRooms.set(roomId, roomState);
    }

    // Join Socket room
    socket.join(roomId);

    // Register / update this active human player
    const existing = roomState.players.get(userId);
    if (existing) {
      existing.socketId = socket.id;
    } else {
      roomState.players.set(userId, {
        socketId: socket.id,
        userId,
        name: user.name,
        isBot: user.isBot,
        score: 0,
        correctCount: 0,
        hasAnsweredCurrent: false,
        answerTimeMs: 0,
      });

      // Mark participant as having joined arena in DB
      await prisma.roomParticipant.upsert({
        where: { roomId_userId: { roomId, userId } },
        update: { hasJoinedArena: true },
        create: { roomId, userId, hasJoinedArena: true },
      });
    }

    // Populate bots if room has few players
    if (room.botCount > 0 && Array.from(roomState.players.values()).filter((p) => p.isBot).length === 0) {
      const bots = await BotEngine.populateRoomWithBots(roomId, room.botCount);
      for (const bot of bots) {
        if (!roomState.players.has(bot.id)) {
          roomState.players.set(bot.id, {
            userId: bot.id,
            name: bot.name,
            isBot: true,
            score: 0,
            correctCount: 0,
            hasAnsweredCurrent: false,
            answerTimeMs: 0,
          });
        }
      }
    }

    // Notify room of player update
    const playerList = Array.from(roomState.players.values()).map((p) => ({
      userId: p.userId,
      name: p.name,
      isBot: p.isBot,
      score: p.score,
    }));

    this.io.to(roomId).emit('ROOM_UPDATE', {
      roomId,
      status: roomState.status,
      playerCount: playerList.length,
      players: playerList,
      title: room.title,
      entryFee: room.entryFee,
      prizePool: room.prizePool,
    });

    console.log(`[RoomEngine] ${user.name} entered Arena ${roomId}. Total: ${playerList.length} (Bots: ${playerList.filter(p=>p.isBot).length})`);

    // If room is already in WAITING_RESULTS, send the waiting event to new connector
    if (roomState.status === 'WAITING_RESULTS') {
      socket.emit('TOURNAMENT_WAITING_RESULTS', {
        roomId,
        status: 'WAITING_RESULTS',
        title: room.title,
        message: 'Tournament rounds completed! Results under review by Tournament Master.',
        leaderboard: Array.from(roomState.players.values()).map((p, idx) => ({
          rank: idx + 1,
          name: p.name,
          score: p.score,
          isBot: p.isBot,
        })),
      });
    }
  }

  /**
   * Start 3-second countdown before round 1
   */
  public async startCountdown(roomId: string) {
    const roomState = this.activeRooms.get(roomId);
    if (!roomState || roomState.status === 'LIVE' || roomState.status === 'WAITING_RESULTS') return;

    roomState.status = 'COUNTDOWN';
    await prisma.quizRoom.update({
      where: { id: roomId },
      data: { status: 'COUNTDOWN' },
    });

    let count = 3;
    this.io.to(roomId).emit('COUNTDOWN_START', { countdown: count });

    const interval = setInterval(async () => {
      count--;
      if (count > 0) {
        this.io.to(roomId).emit('COUNTDOWN_TICK', { countdown: count });
      } else {
        clearInterval(interval);
        await this.startQuestionRound(roomId, 0);
      }
    }, 1000);
  }

  /**
   * Start a specific question round
   */
  private async startQuestionRound(roomId: string, questionIndex: number) {
    const roomState = this.activeRooms.get(roomId);
    if (!roomState) return;

    // Clear previous bot timeouts
    roomState.botTimeouts.forEach((t) => clearTimeout(t));
    roomState.botTimeouts = [];

    if (questionIndex >= roomState.questionIds.length) {
      await this.setRoomWaitingForResults(roomId);
      return;
    }

    roomState.status = 'LIVE';
    roomState.currentQuestionIndex = questionIndex;

    const questionId = roomState.questionIds[questionIndex];
    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      await this.setRoomWaitingForResults(roomId);
      return;
    }

    const durationSec = 10;
    const now = Date.now();
    roomState.roundStartTime = now;
    roomState.endsAt = now + durationSec * 1000;
    roomState.currentCorrectIndex = question.correctIndex;
    roomState.currentExplanation = question.explanation || '';

    // Reset player answer states for this round
    roomState.players.forEach((p) => {
      p.hasAnsweredCurrent = false;
    });

    await prisma.quizRoom.update({
      where: { id: roomId },
      data: { status: 'LIVE' },
    });

    // Broadcast question to players
    this.io.to(roomId).emit('QUESTION_START', {
      questionId: question.id,
      roundIndex: questionIndex + 1,
      totalQuestions: roomState.totalQuestions,
      questionText: question.questionText,
      questionTextTamil: question.questionTextTamil,
      options: JSON.parse(question.options),
      durationSec,
      endsAt: roomState.endsAt,
    });

    // Simulate bot answers
    this.triggerBotAnswersForRound(roomId, question.correctIndex);

    // Synchronized round timeout
    roomState.timerHandle = setTimeout(async () => {
      await this.endQuestionRound(
        roomId,
        questionIndex,
        question.correctIndex,
        question.explanation || ''
      );
    }, durationSec * 1000);
  }

  /**
   * Trigger simulated bot answers during the 10-second window
   */
  private triggerBotAnswersForRound(roomId: string, correctIndex: number) {
    const roomState = this.activeRooms.get(roomId);
    if (!roomState) return;

    const bots = Array.from(roomState.players.values()).filter((p) => p.isBot);
    // Designate first bot as the lead bot
    bots.forEach((bot, idx) => {
      const isLeadBot = idx === 0;
      const botAnswer = BotEngine.calculateBotAnswer(
        correctIndex,
        roomState.targetWinnerType,
        isLeadBot
      );

      const timeout = setTimeout(() => {
        if (roomState.status !== 'LIVE') return;
        if (bot.hasAnsweredCurrent) return;

        bot.hasAnsweredCurrent = true;
        bot.answerTimeMs += botAnswer.delayMs;

        if (botAnswer.isCorrect) {
          bot.correctCount++;
          const remainingSec = Math.max(0, (10000 - botAnswer.delayMs) / 1000);
          const speedBonus = Math.round(remainingSec * 10);
          bot.score += 100 + speedBonus;
        }

        // Check if all players answered
        const allAnswered = Array.from(roomState.players.values()).every(
          (p) => p.hasAnsweredCurrent
        );
        if (allAnswered && roomState.timerHandle) {
          clearTimeout(roomState.timerHandle);
          this.endQuestionRound(
            roomId,
            roomState.currentQuestionIndex,
            roomState.currentCorrectIndex,
            roomState.currentExplanation
          );
        }
      }, botAnswer.delayMs);

      roomState.botTimeouts.push(timeout);
    });
  }

  /**
   * Handle human player answer submission
   */
  private async handleAnswerSubmission(
    socket: Socket,
    roomId: string,
    userId: string,
    selectedOption: number
  ) {
    const roomState = this.activeRooms.get(roomId);
    if (!roomState || roomState.status !== 'LIVE') return;

    const player = roomState.players.get(userId);
    if (!player || player.hasAnsweredCurrent) return;

    const now = Date.now();
    if (now > roomState.endsAt) return; // Answer arrived after time expired

    player.hasAnsweredCurrent = true;
    const answerTime = now - roomState.roundStartTime;
    player.answerTimeMs += answerTime;

    const questionId = roomState.questionIds[roomState.currentQuestionIndex];
    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) return;

    const isCorrect = selectedOption === question.correctIndex;

    // Log user answer history to prevent repeated questions in future tournaments
    if (!player.isBot) {
      await QuestionRotationService.recordUserAnswer(userId, questionId, roomId, isCorrect);
    }

    let pointsEarned = 0;
    if (isCorrect) {
      player.correctCount++;
      const remainingSeconds = Math.max(0, (roomState.endsAt - now) / 1000);
      const speedBonus = Math.round(remainingSeconds * 10);
      pointsEarned = 100 + speedBonus;
      player.score += pointsEarned;
    }

    socket.emit('ANSWER_CONFIRMATION', {
      isCorrect,
      pointsEarned,
      currentTotalScore: player.score,
    });

    // Check if all players in the room have answered
    const allAnswered = Array.from(roomState.players.values()).every((p) => p.hasAnsweredCurrent);
    if (allAnswered && roomState.timerHandle) {
      clearTimeout(roomState.timerHandle);
      await this.endQuestionRound(
        roomId,
        roomState.currentQuestionIndex,
        question.correctIndex,
        question.explanation || ''
      );
    }
  }

  /**
   * End current question round and show round results
   */
  private async endQuestionRound(
    roomId: string,
    questionIndex: number,
    correctIndex: number,
    explanation: string
  ) {
    const roomState = this.activeRooms.get(roomId);
    if (!roomState) return;

    // Leaderboard sorted by score desc, then by least answer time
    const leaderboard = Array.from(roomState.players.values())
      .sort((a, b) => b.score - a.score || a.answerTimeMs - b.answerTimeMs)
      .map((p, idx) => ({
        rank: idx + 1,
        userId: p.userId,
        name: p.name,
        isBot: p.isBot,
        score: p.score,
        correctCount: p.correctCount,
      }));

    this.io.to(roomId).emit('ROUND_RESULT', {
      roundIndex: questionIndex + 1,
      correctIndex,
      explanation,
      leaderboard,
    });

    // Wait 3.5 seconds for users to see round feedback, then proceed
    setTimeout(async () => {
      await this.startQuestionRound(roomId, questionIndex + 1);
    }, 3500);
  }

  /**
   * Transition room to WAITING_RESULTS state (Controlled release by Admin)
   */
  private async setRoomWaitingForResults(roomId: string) {
    const roomState = this.activeRooms.get(roomId);
    if (!roomState) return;

    roomState.status = 'WAITING_RESULTS';

    const room = await prisma.quizRoom.findUnique({ where: { id: roomId } });
    if (!room) return;

    // Sort players by tentative rank
    const sortedPlayers = Array.from(roomState.players.values()).sort(
      (a, b) => b.score - a.score || a.answerTimeMs - b.answerTimeMs
    );

    // Save tentative scores & ranks in DB
    for (let i = 0; i < sortedPlayers.length; i++) {
      const p = sortedPlayers[i];
      const rank = i + 1;

      await prisma.roomParticipant.upsert({
        where: { roomId_userId: { roomId, userId: p.userId } },
        update: {
          score: p.score,
          correctAnswers: p.correctCount,
          totalAnswerTimeMs: p.answerTimeMs,
          rank,
          isBot: p.isBot,
        },
        create: {
          roomId,
          userId: p.userId,
          score: p.score,
          correctAnswers: p.correctCount,
          totalAnswerTimeMs: p.answerTimeMs,
          rank,
          isBot: p.isBot,
        },
      });
    }

    await prisma.quizRoom.update({
      where: { id: roomId },
      data: { status: 'WAITING_RESULTS' },
    });

    const pendingLeaderboard = sortedPlayers.map((p, idx) => ({
      rank: idx + 1,
      userId: p.userId,
      name: p.name,
      isBot: p.isBot,
      score: p.score,
    }));

    // Broadcast Waiting for Results to all participants in mobile app
    this.io.to(roomId).emit('TOURNAMENT_WAITING_RESULTS', {
      roomId,
      status: 'WAITING_RESULTS',
      title: room.title,
      prizePool: room.prizePool,
      message: 'Tournament completed! Results are currently under review by the Tournament Master.',
      leaderboard: pendingLeaderboard,
    });

    console.log(`[RoomEngine] Room ${roomId} is now WAITING_RESULTS for Admin release!`);
  }

  /**
   * Admin officially approves and releases final tournament results
   */
  public async releaseResults(roomId: string, designatedWinnerId?: string) {
    const room = await prisma.quizRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: { user: true },
        },
      },
    });

    if (!room) throw new Error('Room not found');
    if (room.status === 'FINISHED' && room.resultsReleased) {
      throw new Error('Results have already been released for this tournament');
    }

    let participants = [...room.participants];

    // If Admin designated a specific winner, put them at rank 1
    if (designatedWinnerId) {
      const winnerIndex = participants.findIndex((p) => p.userId === designatedWinnerId);
      if (winnerIndex > -1) {
        const winner = participants.splice(winnerIndex, 1)[0];
        participants.unshift(winner);
      }
    } else {
      // Sort by score desc, then answer time
      participants.sort(
        (a, b) => b.score - a.score || a.totalAnswerTimeMs - b.totalAnswerTimeMs
      );
    }

    const prizePool = room.prizePool;
    const prizePercentages = [0.5, 0.3, 0.2]; // 1st: 50%, 2nd: 30%, 3rd: 20%
    const finalLeaderboard = [];

    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const rank = i + 1;
      let prizeWon = 0;

      if (i < prizePercentages.length) {
        prizeWon = Math.round(prizePool * prizePercentages[i]);
        // Credit to wallet only for human users
        if (!p.isBot && !p.user.isBot && prizeWon > 0) {
          await WalletService.creditPrize(p.userId, roomId, prizeWon, rank);
          // Send result notification email to human
          await EmailService.sendResultsReleasedNotification(
            p.user.email || 'user@quizarena.com',
            p.user.name,
            room.title,
            rank,
            prizeWon
          );
        }
      }

      // Update skill rating
      if (!p.isBot && !p.user.isBot) {
        const ratingDelta = rank <= Math.ceil(participants.length / 2) ? 25 : -5;
        await prisma.user.update({
          where: { id: p.userId },
          data: { skillRating: { increment: ratingDelta } },
        });
      }

      // Save finalized participant record
      await prisma.roomParticipant.update({
        where: { id: p.id },
        data: {
          rank,
          prizeWon,
        },
      });

      finalLeaderboard.push({
        rank,
        userId: p.userId,
        name: p.user.name,
        isBot: p.isBot || p.user.isBot,
        score: p.score,
        correctCount: p.correctAnswers,
        prizeWon,
      });
    }

    // Update room in DB
    await prisma.quizRoom.update({
      where: { id: roomId },
      data: {
        status: 'FINISHED',
        resultsReleased: true,
        resultsReleasedAt: new Date(),
        designatedWinnerId: designatedWinnerId || participants[0]?.userId,
      },
    });

    // Broadcast RESULTS_RELEASED to room
    this.io.to(roomId).emit('RESULTS_RELEASED', {
      roomId,
      title: room.title,
      prizePool: room.prizePool,
      winner: finalLeaderboard[0],
      leaderboard: finalLeaderboard,
    });

    console.log(`[RoomEngine] Results officially released for Room ${roomId}. Winner: ${finalLeaderboard[0]?.name}`);
    this.activeRooms.delete(roomId);

    return {
      success: true,
      roomId,
      leaderboard: finalLeaderboard,
    };
  }
}
