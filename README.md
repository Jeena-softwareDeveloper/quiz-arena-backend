# quiz-arena-backend

High-performance real-time backend service for the **Set Quick Trade** multi-tier skill tournament platform. Built with Node.js, Express, TypeScript, Prisma ORM, and Socket.IO.

## 🚀 Features

- **Authentication & Profiling**: OTP-ready phone auth, JWT sessions, educational tier matchmaking, and ELO ratings.
- **Dynamic Tournament Arenas**: Categorized rooms (TNPSC, Cinema, General GK, Science, Tech), entry fees, prize pools, and live join windows.
- **Bilingual Question Bank**: English and Tamil multi-choice questions with difficulty grading and education level targeting.
- **Double-Entry Financial Ledger**: Wallet balances, entry fee deductions, instant winning payouts, transaction audit trail, and mock UPI gateways.
- **Hero Promotional Banners**: Dynamic banner carousel API with image upload, custom CTA, target routing, and bilingual copy.
- **Admin Management API**: Tournament scheduling, question uploading (CSV/Excel), banner publishing, player auditing, and ledger reporting.

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+ / 20+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database & ORM**: SQLite / PostgreSQL via Prisma ORM
- **Real-Time**: Socket.IO
- **Security**: JWT, bcryptjs, CORS

## 📦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

### 3. Initialize Database
```bash
npx prisma db push
npx prisma generate
```

### 4. Build and Run
```bash
# Development
npm run dev

# Production Build
npm run build
npm start
```

