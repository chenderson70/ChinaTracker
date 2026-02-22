import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

const BASE_CPD_RATES = [
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

const BASE_PER_DIEM = [
	{ location: 'GULFPORT', lodgingRate: 98, mieRate: 64 },
	{ location: 'CAMP_SHELBY', lodgingRate: 96, mieRate: 59 },
];

const BASE_CONFIG: Array<{ key: string; value: string }> = [
	{ key: 'BREAKFAST_COST', value: '14.00' },
	{ key: 'LUNCH_MRE_COST', value: '15.91' },
	{ key: 'DINNER_COST', value: '14.00' },
	{ key: 'PLAYER_BILLETING_NIGHT', value: '27.00' },
	{ key: 'DEFAULT_AIRFARE', value: '400.00' },
	{ key: 'DEFAULT_RENTAL_CAR_DAILY', value: '50.00' },
	{ key: 'BUDGET_TARGET_RPA', value: '0.00' },
	{ key: 'BUDGET_TARGET_OM', value: '0.00' },
];

export async function ensureBaselineData(): Promise<void> {
	const cpdCount = await prisma.rankCpdRate.count();
	if (cpdCount === 0) {
		for (const rate of BASE_CPD_RATES) {
			await prisma.rankCpdRate.create({
				data: {
					rankCode: rate.rankCode,
					costPerDay: rate.costPerDay,
					effectiveDate: new Date('2025-10-01'),
				},
			});
		}
	}

	const perDiemCount = await prisma.perDiemRate.count();
	if (perDiemCount === 0) {
		for (const rate of BASE_PER_DIEM) {
			await prisma.perDiemRate.create({
				data: {
					location: rate.location,
					lodgingRate: rate.lodgingRate,
					mieRate: rate.mieRate,
					effectiveDate: new Date('2025-10-01'),
				},
			});
		}
	}

	for (const item of BASE_CONFIG) {
		await prisma.appConfig.upsert({
			where: { key: item.key },
			update: { value: item.value },
			create: { key: item.key, value: item.value },
		});
	}
}
