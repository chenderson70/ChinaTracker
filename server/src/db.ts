import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

function resolveSqlitePath(databaseUrl: string | undefined): string | null {
	if (!databaseUrl || !databaseUrl.startsWith('file:')) return null;
	const rawPath = databaseUrl.slice(5);
	if (!rawPath) return null;
	if (path.isAbsolute(rawPath)) return rawPath;
	return path.resolve(process.cwd(), rawPath);
}

function bootstrapSqliteFileIfMissing(): void {
	const targetDbPath = resolveSqlitePath(process.env.DATABASE_URL);
	if (!targetDbPath) return;

	const seededDbPath = path.resolve(process.cwd(), 'prisma', 'prod.db');
	const targetDir = path.dirname(targetDbPath);
	fs.mkdirSync(targetDir, { recursive: true });

	if (!fs.existsSync(seededDbPath)) return;

	const samePath = path.resolve(targetDbPath) === path.resolve(seededDbPath);
	if (samePath) return;

	if (!fs.existsSync(targetDbPath)) {
		fs.copyFileSync(seededDbPath, targetDbPath);
		return;
	}

	const targetSize = fs.statSync(targetDbPath).size;
	const minHealthyDbSizeBytes = 32 * 1024;
	if (targetSize < minHealthyDbSizeBytes) {
		fs.copyFileSync(seededDbPath, targetDbPath);
	}
}

bootstrapSqliteFileIfMissing();

export const prisma = new PrismaClient();

async function ensureSqliteSchema(): Promise<void> {
	const tableCheck = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rank_cpd_rates'",
	);
	if (Array.isArray(tableCheck) && tableCheck.length > 0) {
		return;
	}

	const migrationsRoot = path.resolve(process.cwd(), 'prisma', 'migrations');
	if (!fs.existsSync(migrationsRoot)) return;

	const migrationDirs = fs
		.readdirSync(migrationsRoot)
		.map((entry) => path.join(migrationsRoot, entry))
		.filter((entryPath) => fs.statSync(entryPath).isDirectory())
		.sort((a, b) => a.localeCompare(b));

	for (const migrationDir of migrationDirs) {
		const sqlPath = path.join(migrationDir, 'migration.sql');
		if (!fs.existsSync(sqlPath)) continue;

		const sql = fs.readFileSync(sqlPath, 'utf8');
		const statements = sql
			.split(';')
			.map((statement) => statement.trim())
			.filter(Boolean);

		for (const statement of statements) {
			try {
				await prisma.$executeRawUnsafe(statement);
			} catch (error: any) {
				const message = String(error?.message || '').toLowerCase();
				const ignorable =
					message.includes('already exists') ||
					message.includes('duplicate column name') ||
					message.includes('unique constraint failed');

				if (!ignorable) {
					throw error;
				}
			}

			const verifyTable = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rank_cpd_rates'",
			);
			if (!Array.isArray(verifyTable) || verifyTable.length === 0) {
				throw new Error('Unable to initialize SQLite schema');
			}
		}
	}
}

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
	await ensureSqliteSchema();

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
