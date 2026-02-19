import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // --- Rank CPD Rates (FY26 approximate) ---
  const cpdRates = [
    { rankCode: 'E-1', costPerDay: 117 },
    { rankCode: 'E-2', costPerDay: 131 },
    { rankCode: 'E-3', costPerDay: 138 },
    { rankCode: 'E-4', costPerDay: 153 },
    { rankCode: 'E-5', costPerDay: 169 },
    { rankCode: 'E-6', costPerDay: 185 },
    { rankCode: 'E-7', costPerDay: 214 },
    { rankCode: 'E-8', costPerDay: 245 },
    { rankCode: 'E-9', costPerDay: 280 },
    { rankCode: 'W-1', costPerDay: 198 },
    { rankCode: 'W-2', costPerDay: 226 },
    { rankCode: 'W-3', costPerDay: 256 },
    { rankCode: 'W-4', costPerDay: 280 },
    { rankCode: 'W-5', costPerDay: 310 },
    { rankCode: 'O-1', costPerDay: 175 },
    { rankCode: 'O-2', costPerDay: 202 },
    { rankCode: 'O-3', costPerDay: 240 },
    { rankCode: 'O-4', costPerDay: 275 },
    { rankCode: 'O-5', costPerDay: 320 },
    { rankCode: 'O-6', costPerDay: 370 },
    { rankCode: 'O-7', costPerDay: 420 },
    { rankCode: 'O-8', costPerDay: 480 },
    { rankCode: 'O-9', costPerDay: 540 },
    { rankCode: 'O-10', costPerDay: 600 },
  ];

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
