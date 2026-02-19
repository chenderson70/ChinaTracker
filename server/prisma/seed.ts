import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // --- Rank CPD Rates (FY26 approximate) ---
  const cpdRates = [
    { rankCode: 'AB', costPerDay: 191 },
    { rankCode: 'AMN', costPerDay: 185 },
    { rankCode: 'A1C', costPerDay: 194 },
    { rankCode: 'SRA', costPerDay: 209 },
    { rankCode: 'SSGT', costPerDay: 253 },
    { rankCode: 'TSGT', costPerDay: 300 },
    { rankCode: 'MSGT', costPerDay: 350 },
    { rankCode: 'SMSGT', costPerDay: 401 },
    { rankCode: 'CMSGT', costPerDay: 476 },
    { rankCode: '2LT', costPerDay: 332 },
    { rankCode: '1LT', costPerDay: 386 },
    { rankCode: 'CAPT', costPerDay: 457 },
    { rankCode: 'MAJ', costPerDay: 545 },
    { rankCode: 'LTCOL', costPerDay: 635 },
    { rankCode: 'COL', costPerDay: 744 },
    { rankCode: 'BG', costPerDay: 861 },
    { rankCode: 'MG', costPerDay: 960 },
  ];

  // Remove legacy grade-format rows so the UI/rate tables remain consistent.
  await prisma.rankCpdRate.deleteMany({
    where: {
      rankCode: {
        in: [
          'E-1', 'E-2', 'E-3', 'E-4', 'E-5', 'E-6', 'E-7', 'E-8', 'E-9',
          'W-1', 'W-2', 'W-3', 'W-4', 'W-5',
          'O-1', 'O-2', 'O-3', 'O-4', 'O-5', 'O-6', 'O-7', 'O-8', 'O-9', 'O-10',
        ],
      },
    },
  });

  for (const rate of cpdRates) {
    await prisma.rankCpdRate.upsert({
      where: { rankCode: rate.rankCode },
      update: { costPerDay: rate.costPerDay },
      create: {
        rankCode: rate.rankCode,
        costPerDay: rate.costPerDay,
        effectiveDate: new Date('2025-10-01'),
      },
    });
  }
  console.log(`  ✓ ${cpdRates.length} rank CPD rates seeded`);

  // --- Per Diem Rates ---
  await prisma.perDiemRate.upsert({
    where: { location: 'GULFPORT' },
    update: {},
    create: {
      location: 'GULFPORT',
      lodgingRate: 98,
      mieRate: 64,
      effectiveDate: new Date('2025-10-01'),
    },
  });
  await prisma.perDiemRate.upsert({
    where: { location: 'CAMP_SHELBY' },
    update: {},
    create: {
      location: 'CAMP_SHELBY',
      lodgingRate: 96,
      mieRate: 59,
      effectiveDate: new Date('2025-10-01'),
    },
  });
  console.log('  ✓ Per diem rates seeded (Gulfport & Camp Shelby)');

  // --- App Config (meal rates, billeting) ---
  const configs = [
    { key: 'BREAKFAST_COST', value: '14.00' },
    { key: 'LUNCH_MRE_COST', value: '15.91' },
    { key: 'DINNER_COST', value: '14.00' },
    { key: 'PLAYER_BILLETING_NIGHT', value: '27.00' },
    { key: 'DEFAULT_AIRFARE', value: '400.00' },
    { key: 'DEFAULT_RENTAL_CAR_DAILY', value: '50.00' },
  ];

  for (const cfg of configs) {
    await prisma.appConfig.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value },
      create: cfg,
    });
  }
  console.log('  ✓ App config seeded');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
