import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'super_secure_quiz_arena_jwt_production_secret_key_987654321_tamilnadu_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  QUESTION_TIMER_SEC: process.env.QUESTION_TIMER_SEC ? parseInt(process.env.QUESTION_TIMER_SEC, 10) : 10,
  PLATFORM_COMMISSION_PERCENT: process.env.PLATFORM_COMMISSION_PERCENT ? parseInt(process.env.PLATFORM_COMMISSION_PERCENT, 10) : 15,
  MIN_WITHDRAWAL_AMOUNT: process.env.MIN_WITHDRAWAL_AMOUNT ? parseFloat(process.env.MIN_WITHDRAWAL_AMOUNT) : 20,
  WELCOME_BONUS_AMOUNT: process.env.WELCOME_BONUS_AMOUNT ? parseFloat(process.env.WELCOME_BONUS_AMOUNT) : 50,
};
