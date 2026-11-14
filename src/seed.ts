import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

async function main() {
  console.log('🌱 Starting Database Seeding...');

  // Clean existing data
  await prisma.userQuestionHistory.deleteMany();
  await prisma.roomParticipant.deleteMany();
  await prisma.quizRoom.deleteMany();
  await prisma.question.deleteMany();
  await prisma.walletLedger.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Admin User
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      phone: '9999999999',
      password: adminPassword,
      name: 'Super Admin',
      email: 'admin@quizarena.com',
      role: 'ADMIN',
      educationLevel: 'POST_GRADUATE',
      examInterests: 'TNPSC,GENERAL_GK,SCIENCE',
      walletBalance: 10000.0,
      skillRating: 1500,
    },
  });
  console.log(`✅ Admin created: ${admin.phone} (Password: admin123)`);

  // 2. Create Regular Demo Users
  const userPassword = await bcrypt.hash('user123', 10);

  const karthik = await prisma.user.create({
    data: {
      phone: '9876543210',
      password: userPassword,
      name: 'Karthik Raja',
      email: 'karthik@quizarena.com',
      educationLevel: 'DEGREE',
      examInterests: 'TNPSC,GENERAL_GK',
      walletBalance: 150.0,
      skillRating: 1120,
      languagePreference: 'TA',
    },
  });

  const priya = await prisma.user.create({
    data: {
      phone: '9876543211',
      password: userPassword,
      name: 'Priya Dharshini',
      email: 'priya@quizarena.com',
      educationLevel: 'TENTH_PLUS_TWO',
      examInterests: 'CINEMA,SPORTS',
      walletBalance: 100.0,
      skillRating: 1040,
      languagePreference: 'EN',
    },
  });

  const suresh = await prisma.user.create({
    data: {
      phone: '9876543212',
      password: userPassword,
      name: 'Suresh Kumar',
      email: 'suresh@quizarena.com',
      educationLevel: 'DIPLOMA',
      examInterests: 'SCIENCE,GENERAL_GK',
      walletBalance: 80.0,
      skillRating: 980,
      languagePreference: 'TA',
    },
  });

  // Create welcome bonuses for demo users
  for (const u of [karthik, priya, suresh]) {
    await prisma.walletLedger.create({
      data: {
        userId: u.id,
        type: 'CREDIT',
        category: 'WELCOME_BONUS',
        amount: 50.0,
        balanceAfter: u.walletBalance,
        description: 'Welcome Bonus Credited',
        referenceId: 'WELCOME',
      },
    });
  }

  // 3. Create Questions (TNPSC, Cinema, Science, GK, Sports)
  const questionsData = [
    // TNPSC
    {
      category: 'TNPSC',
      subCategory: 'History',
      difficulty: 'MEDIUM',
      targetEducation: 'GRADUATE',
      questionText: 'Who was the Chola king who built the Brihadeeswarar Temple in Thanjavur?',
      questionTextTamil: 'தஞ்சை பெரிய கோயிலை கட்டிய சோழ மன்னர் யார்?',
      options: ['Raja Raja Chola I', 'Rajendra Chola I', 'Karikala Cholan', 'Kulothunga Chola'],
      correctIndex: 0,
      explanation: 'Raja Raja Chola I built the Brihadeeswarar Temple between 1003 and 1010 CE.',
    },
    {
      category: 'TNPSC',
      subCategory: 'Language & Culture',
      difficulty: 'HARD',
      targetEducation: 'GRADUATE',
      questionText: 'In which year was Tamil officially declared the first Classical Language of India?',
      questionTextTamil: 'இந்தியாவின் முதல் செம்மொழியாக தமிழ் எந்த ஆண்டு அறிவிக்கப்பட்டது?',
      options: ['2001', '2004', '2008', '2010'],
      correctIndex: 1,
      explanation: 'Tamil was declared as the first Classical Language of India in 2004.',
    },
    {
      category: 'TNPSC',
      subCategory: 'Tamil Literature',
      difficulty: 'EASY',
      targetEducation: 'ALL',
      questionText: 'How many couplets (Kural) are there in Thirukkural?',
      questionTextTamil: 'திருக்குறளில் மொத்தம் எத்தனை குறள்கள் உள்ளன?',
      options: ['1000', '1250', '1330', '1500'],
      correctIndex: 2,
      explanation: 'Thirukkural contains 1,330 couplets divided into 133 chapters of 10 couplets each.',
    },
    {
      category: 'TNPSC',
      subCategory: 'Geography',
      difficulty: 'MEDIUM',
      targetEducation: 'ALL',
      questionText: 'What is the official state animal of Tamil Nadu?',
      questionTextTamil: 'தமிழ்நாட்டின் மாநில விலங்கு எது?',
      options: ['Elephant', 'Nilgiri Tahr (வரையாடு)', 'Bengal Tiger', 'Spotted Deer'],
      correctIndex: 1,
      explanation: 'The Nilgiri Tahr is the state animal of Tamil Nadu.',
    },
    {
      category: 'TNPSC',
      subCategory: 'History',
      difficulty: 'MEDIUM',
      targetEducation: 'GRADUATE',
      questionText: 'Which freedom fighter was celebrated as "Kappalottiya Thamizhan"?',
      questionTextTamil: '"கப்பலோட்டிய தமிழன்" என்று போற்றப்பட்ட சுதந்திர போராட்ட வீரர் யார்?',
      options: ['V. O. Chidambaram Pillai', 'Subramanya Bharathi', 'Veerapandiya Kattabomman', 'Tiruppur Kumaran'],
      correctIndex: 0,
      explanation: 'V.O. Chidambaram Pillai founded the Swadeshi Steam Navigation Company.',
    },
    {
      category: 'TNPSC',
      subCategory: 'Polity',
      difficulty: 'HARD',
      targetEducation: 'GRADUATE',
      questionText: 'Which Article of the Constitution deals with the High Courts for States?',
      questionTextTamil: 'மாநில உயர் நீதிமன்றங்கள் பற்றி குறிப்பிடும் இந்திய அரசியலமைப்பு விதி எது?',
      options: ['Article 214', 'Article 124', 'Article 324', 'Article 356'],
      correctIndex: 0,
      explanation: 'Article 214 of the Constitution provides that there shall be a High Court for each State.',
    },
    {
      category: 'TNPSC',
      subCategory: 'Geography',
      difficulty: 'EASY',
      targetEducation: 'ALL',
      questionText: 'Which district in Tamil Nadu is famously known as the "Granary of South India"?',
      questionTextTamil: 'தென்னிந்தியாவின் நெற்களஞ்சியம் என்று அழைக்கப்படும் தமிழக மாவட்டம் எது?',
      options: ['Thanjavur', 'Madurai', 'Tirunelveli', 'Coimbatore'],
      correctIndex: 0,
      explanation: 'Thanjavur is located in the fertile Cauvery Delta and known as the Granary of South India.',
    },

    // CINEMA
    {
      category: 'CINEMA',
      subCategory: 'Oscars & Music',
      difficulty: 'EASY',
      targetEducation: 'ALL',
      questionText: 'For which film did A. R. Rahman win two Academy Awards (Oscars)?',
      questionTextTamil: 'ஏ. ஆர். ரஹ்மான் எந்த திரைப்படத்திற்காக இரண்டு ஆஸ்கார் விருதுகளை வென்றார்?',
      options: ['Roja', 'Slumdog Millionaire', 'Lagaan', 'Enthiran'],
      correctIndex: 1,
      explanation: 'A. R. Rahman won two Oscars in 2009 for Slumdog Millionaire.',
    },
    {
      category: 'CINEMA',
      subCategory: 'Directors',
      difficulty: 'MEDIUM',
      targetEducation: 'ALL',
      questionText: 'Who directed the historical epic film "Ponniyin Selvan"?',
      questionTextTamil: '"பொன்னியின் செல்வன்" வரலாற்று காவியத் திரைப்படத்தை இயக்கியவர் யார்?',
      options: ['S. Shankar', 'Mani Ratnam', 'Vetri Maaran', 'Lokesh Kanagaraj'],
      correctIndex: 1,
      explanation: 'Mani Ratnam directed Ponniyin Selvan: I and II based on Kalki Krishnamurthy novel.',
    },
    {
      category: 'CINEMA',
      subCategory: 'Rajinikanth Classics',
      difficulty: 'EASY',
      targetEducation: 'ALL',
      questionText: 'In which iconic movie did Rajinikanth deliver the punchline "Naan oru thadava sonna, nooru thadava sonna maadhiri"?',
      questionTextTamil: '"நான் ஒரு தடவ சொன்னா, நூறு தடவ சொன்ன மாதிரி" என்ற வசனம் ரஜினிகாந்தின் எந்த படத்தில் இடம்பெற்றது?',
      options: ['Padayappa', 'Baashha', 'Muthu', 'Annamalai'],
      correctIndex: 1,
      explanation: 'This historic dialogue was delivered by Superstar Rajinikanth in Baashha (1995).',
    },
    {
      category: 'CINEMA',
      subCategory: 'Kamal Haasan',
      difficulty: 'MEDIUM',
      targetEducation: 'GRADUATE',
      questionText: 'In which movie did Kamal Haasan portray ten distinct characters?',
      questionTextTamil: 'கமல்ஹாசன் பத்து வெவ்வேறு கதாபாத்திரங்களில் நடித்த திரைப்படம் எது?',
      options: ['Apoorva Sagodharargal', 'Dasavathaaram', 'Michael Madana Kama Rajan', 'Uttama Villain'],
      correctIndex: 1,
      explanation: 'Kamal Haasan acted in 10 different roles in Dasavathaaram (2008).',
    },
    {
      category: 'CINEMA',
      subCategory: 'Classics',
      difficulty: 'HARD',
      targetEducation: 'GRADUATE',
      questionText: 'Which was the first Tamil sound (talkie) movie released in 1931?',
      questionTextTamil: '1931-ல் வெளியான முதல் தமிழ் பேசும் படம் எது?',
      options: ['Kalidas', 'Haridas', 'Keechaka Vadham', 'Chandralekha'],
      correctIndex: 0,
      explanation: 'Kalidas, directed by H.M. Reddy, was the first Tamil talkie film released on 31 October 1931.',
    },

    // SCIENCE
    {
      category: 'SCIENCE',
      subCategory: 'Physics',
      difficulty: 'MEDIUM',
      targetEducation: 'SCHOOL',
      questionText: 'What is the speed of light in vacuum?',
      questionTextTamil: 'வெற்றிடத்தில் ஒளியின் வேகம் என்ன?',
      options: ['3 × 10^8 m/s', '3 × 10^6 m/s', '1.5 × 10^8 m/s', '3 × 10^10 m/s'],
      correctIndex: 0,
      explanation: 'The speed of light in a vacuum is approximately 299,792,458 metres per second (3 × 10^8 m/s).',
    },
    {
      category: 'SCIENCE',
      subCategory: 'Nobel Laureates',
      difficulty: 'MEDIUM',
      targetEducation: 'GRADUATE',
      questionText: 'Sir C. V. Raman won the Nobel Prize in Physics in 1930 for the discovery of what phenomenon?',
      questionTextTamil: 'சர் சி. வி. ராமன் 1930-ல் எதைக் கண்டுபிடித்ததற்காக இயற்பியலுக்கான நோபல் பரிசை வென்றார்?',
      options: ['Raman Effect (Light Scattering)', 'Photoelectric Effect', 'Nuclear Fission', 'X-Ray Diffraction'],
      correctIndex: 0,
      explanation: 'Sir C.V. Raman discovered the Raman Effect (inelastic scattering of light), celebrated as National Science Day.',
    },
    {
      category: 'SCIENCE',
      subCategory: 'Astronomy',
      difficulty: 'EASY',
      targetEducation: 'ALL',
      questionText: 'Which planet in our solar system is known as the "Red Planet"?',
      questionTextTamil: 'நமது சூரிய குடும்பத்தில் "செந்நிறக் கோள்" என்று அழைக்கப்படும் கிரகம் எது?',
      options: ['Venus', 'Mars (செவ்வாய்)', 'Jupiter', 'Saturn'],
      correctIndex: 1,
      explanation: 'Mars appears reddish due to the prevalence of iron oxide on its surface.',
    },
    {
      category: 'SCIENCE',
      subCategory: 'Biology',
      difficulty: 'EASY',
      targetEducation: 'SCHOOL',
      questionText: 'What is known as the "Powerhouse of the Cell"?',
      questionTextTamil: 'செல்லின் "ஆற்றல் மையம்" (Powerhouse) என்று அழைக்கப்படுவது எது?',
      options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi Apparatus'],
      correctIndex: 1,
      explanation: 'Mitochondria produce ATP, the energy currency of cells.',
    },
    {
      category: 'SCIENCE',
      subCategory: 'Chemistry',
      difficulty: 'MEDIUM',
      targetEducation: 'SCHOOL',
      questionText: 'What is the chemical symbol for Gold?',
      questionTextTamil: 'தங்கத்தின் வேதியியல் குறியீடு என்ன?',
      options: ['Ag', 'Au', 'Fe', 'Cu'],
      correctIndex: 1,
      explanation: 'Au comes from the Latin word for gold, "Aurum".',
    },

    // GENERAL GK
    {
      category: 'GENERAL_GK',
      subCategory: 'Indian Geography',
      difficulty: 'EASY',
      targetEducation: 'ALL',
      questionText: 'Which is the longest river flowing entirely within India?',
      questionTextTamil: 'இந்தியாவில் பாயும் மிக நீளமான நதி எது?',
      options: ['Yamuna', 'Ganges (கங்கை)', 'Godavari', 'Cauvery'],
      correctIndex: 1,
      explanation: 'The Ganges flows for 2,525 km, making it the longest river in India.',
    },
    {
      category: 'GENERAL_GK',
      subCategory: 'Indian Icons',
      difficulty: 'EASY',
      targetEducation: 'ALL',
      questionText: 'Who is fondly remembered as the "Missile Man of India"?',
      questionTextTamil: 'இந்தியாவின் "ஏவுகணை மனிதர்" என்று அன்போடு போற்றப்பட்டவர் யார்?',
      options: ['Homi Bhabha', 'Vikram Sarabhai', 'Dr. A. P. J. Abdul Kalam', 'Satish Dhawan'],
      correctIndex: 2,
      explanation: 'Dr. A. P. J. Abdul Kalam led the development of India ballistic missile programmes.',
    },
    {
      category: 'GENERAL_GK',
      subCategory: 'Space & Tech',
      difficulty: 'MEDIUM',
      targetEducation: 'ALL',
      questionText: 'Where is the headquarters of ISRO located?',
      questionTextTamil: 'இஸ்ரோவின் (ISRO) தலைமையகம் எங்கு அமைந்துள்ளது?',
      options: ['Sriharikota', 'Bengaluru', 'New Delhi', 'Thiruvananthapuram'],
      correctIndex: 1,
      explanation: 'ISRO headquarters is situated in Antariksh Bhavan, Bengaluru, Karnataka.',
    },
    {
      category: 'GENERAL_GK',
      subCategory: 'National Symbols',
      difficulty: 'EASY',
      targetEducation: 'SCHOOL',
      questionText: 'How many spokes are present in the Ashoka Chakra of the Indian National Flag?',
      questionTextTamil: 'இந்திய தேசியக் கொடியின் அசோக சக்கரத்தில் உள்ள ஆரங்களின் எண்ணிக்கை எத்தனை?',
      options: ['18', '24', '32', '36'],
      correctIndex: 1,
      explanation: 'The Ashoka Chakra has 24 spokes representing 24 virtues in life.',
    },

    // SPORTS
    {
      category: 'SPORTS',
      subCategory: 'Cricket',
      difficulty: 'EASY',
      targetEducation: 'ALL',
      questionText: 'How many times has Chennai Super Kings (CSK) won the IPL Trophy?',
      questionTextTamil: 'சென்னை சூப்பர் கிங்ஸ் (CSK) அணி எத்தனை முறை ஐபிஎல் கோப்பையை வென்றுள்ளது?',
      options: ['3', '4', '5', '6'],
      correctIndex: 2,
      explanation: 'CSK won IPL titles in 2010, 2011, 2018, 2021, and 2023 under MS Dhoni.',
    },
    {
      category: 'SPORTS',
      subCategory: 'Chess',
      difficulty: 'MEDIUM',
      targetEducation: 'ALL',
      questionText: 'Who became India first Grandmaster in Chess in 1988?',
      questionTextTamil: '1988-ல் இந்தியாவின் முதல் செஸ் கிராண்ட்மாஸ்டர் ஆனவர் யார்?',
      options: ['Viswanathan Anand', 'R. Praggnanandhaa', 'D. Gukesh', 'Pentala Harikrishna'],
      correctIndex: 0,
      explanation: 'Viswanathan Anand from Tamil Nadu became India first chess Grandmaster in 1988.',
    },
  ];

  const createdQuestions = [];
  for (const q of questionsData) {
    const item = await prisma.question.create({
      data: {
        category: q.category,
        subCategory: q.subCategory,
        difficulty: q.difficulty,
        targetEducation: q.targetEducation,
        questionText: q.questionText,
        questionTextTamil: q.questionTextTamil,
        options: JSON.stringify(q.options),
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        timesUsed: 0,
      },
    });
    createdQuestions.push(item);
  }
  console.log(`✅ Seeded ${createdQuestions.length} Bilingual Questions across 5 Categories!`);

  // 4. Create Active Scheduled Quiz Rooms with Distinct Non-Repeating Questions
  const tnpscIds = createdQuestions.filter((q) => q.category === 'TNPSC').map((q) => q.id);
  const cinemaIds = createdQuestions.filter((q) => q.category === 'CINEMA').map((q) => q.id);
  const scienceIds = createdQuestions.filter((q) => q.category === 'SCIENCE').map((q) => q.id);
  const gkIds = createdQuestions.filter((q) => q.category === 'GENERAL_GK').map((q) => q.id);
  const sportsIds = createdQuestions.filter((q) => q.category === 'SPORTS').map((q) => q.id);

  // Scheduled start times (15m, 25m, 40m from now)
  const startTime1 = new Date(Date.now() + 15 * 60 * 1000);
  const startTime2 = new Date(Date.now() + 25 * 60 * 1000);
  const startTime3 = new Date(Date.now() + 40 * 60 * 1000);

  // Room 1: TNPSC Room
  await prisma.quizRoom.create({
    data: {
      title: 'TNPSC Group 4 & 2 Mega Arena',
      category: 'TNPSC',
      targetEducation: 'GRADUATE',
      entryFee: 10.0,
      prizePool: 80.0,
      maxPlayers: 20,
      totalQuestions: 5,
      questionIds: JSON.stringify(tnpscIds.slice(0, 5)),
      scheduledStartTime: startTime1,
      joinWindowMinutes: 10,
      botCount: 4,
      targetWinnerType: 'HUMAN',
      winnerStrategy: 'HUMAN_PRIORITY',
      status: 'SCHEDULED',
    },
  });

  // Room 2: Kollywood Cinema Room
  await prisma.quizRoom.create({
    data: {
      title: 'Kollywood 90s & 2000s Movie Master',
      category: 'CINEMA',
      targetEducation: 'ALL',
      entryFee: 5.0,
      prizePool: 45.0,
      maxPlayers: 15,
      totalQuestions: 4,
      questionIds: JSON.stringify(cinemaIds.slice(0, 4)),
      scheduledStartTime: startTime2,
      joinWindowMinutes: 10,
      botCount: 3,
      targetWinnerType: 'HUMAN',
      winnerStrategy: 'HUMAN_PRIORITY',
      status: 'SCHEDULED',
    },
  });

  // Room 3: Everyday Science & Tech Challenge
  await prisma.quizRoom.create({
    data: {
      title: 'Everyday Science & Tech Challenge',
      category: 'SCIENCE',
      targetEducation: 'SCHOOL',
      entryFee: 10.0,
      prizePool: 80.0,
      maxPlayers: 20,
      totalQuestions: 4,
      questionIds: JSON.stringify(scienceIds.slice(0, 4)),
      scheduledStartTime: startTime3,
      joinWindowMinutes: 10,
      botCount: 4,
      targetWinnerType: 'BOT',
      winnerStrategy: 'BOT_PRIORITY',
      status: 'SCHEDULED',
    },
  });

  // Room 4: General Knowledge Championship
  await prisma.quizRoom.create({
    data: {
      title: 'All India General Knowledge Blitz',
      category: 'GENERAL_GK',
      targetEducation: 'ALL',
      entryFee: 20.0,
      prizePool: 160.0,
      maxPlayers: 25,
      totalQuestions: 4,
      questionIds: JSON.stringify(gkIds.slice(0, 4)),
      scheduledStartTime: startTime1,
      joinWindowMinutes: 10,
      botCount: 5,
      targetWinnerType: 'HUMAN',
      winnerStrategy: 'HUMAN_PRIORITY',
      status: 'SCHEDULED',
    },
  });

  // Seed default onboarding slides if none exist
  const existingSlidesCount = await prisma.onboardingSlide.count();
  if (existingSlidesCount === 0) {
    await prisma.onboardingSlide.createMany({
      data: [
        {
          title: 'Predict Green or Red',
          subtitle: 'Guess the next price move and earn up to 90% profit',
          imageUrl: 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=800&q=80',
          order: 1,
          isActive: true,
        },
        {
          title: 'Instant 60s Payouts',
          subtitle: 'Fast 1-minute prediction rounds with lightning instant profit',
          imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80',
          order: 2,
          isActive: true,
        },
        {
          title: 'Claim ₹50 Free Bonus',
          subtitle: 'Start trading with zero risk and withdraw directly to UPI Bank',
          imageUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&q=80',
          order: 3,
          isActive: true,
        },
      ],
    });
    console.log('✅ Seeded 3 Default Onboarding Slides!');
  }

  console.log('✅ Seeded 4 Scheduled Tournaments with Pre-Registration & Timing!');


  console.log('✅ Seeded 4 Scheduled Tournaments with Pre-Registration & Timing!');
  console.log('🎉 Seeding Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
