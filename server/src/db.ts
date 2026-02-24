import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const SERVER_ROOT = path.resolve(__dirname, '..');

function resolveSqlitePath(databaseUrl: string | undefined): string | null {
	if (!databaseUrl || !databaseUrl.startsWith('file:')) return null;
	const rawPath = databaseUrl.slice(5);
	if (!rawPath) return null;
	if (path.isAbsolute(rawPath)) return rawPath;
	return path.resolve(SERVER_ROOT, rawPath);
}

function bootstrapSqliteFileIfMissing(): void {
	const targetDbPath = resolveSqlitePath(process.env.DATABASE_URL);
	if (!targetDbPath) return;

	const seededDbPath = path.resolve(SERVER_ROOT, 'prisma', 'prod.db');
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

async function hasSqliteTable(tableName: string): Promise<boolean> {
	const tableCheck = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
		tableName,
	);
	return Array.isArray(tableCheck) && tableCheck.length > 0;
}

async function ensureAuthSessionsTable(): Promise<void> {
	await prisma.$executeRawUnsafe(`
		CREATE TABLE IF NOT EXISTS "auth_sessions" (
			"id" TEXT NOT NULL PRIMARY KEY,
			"user_id" TEXT NOT NULL,
			"refresh_token_hash" TEXT NOT NULL,
			"user_agent" TEXT,
			"ip_address" TEXT,
			"expires_at" DATETIME NOT NULL,
			"revoked_at" DATETIME,
			"created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updated_at" DATETIME NOT NULL,
			CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
		)
	`);

	await prisma.$executeRawUnsafe(
		'CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_expires_at_idx" ON "auth_sessions"("user_id", "expires_at")',
	);

	await prisma.$executeRawUnsafe(
		'CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash")',
	);
}

async function ensureSqliteSchema(): Promise<void> {
	const hasRankCpdRates = await hasSqliteTable('rank_cpd_rates');
	const hasAuthSessions = await hasSqliteTable('auth_sessions');

	if (hasRankCpdRates && hasAuthSessions) {
		return;
	}

	if (hasRankCpdRates && !hasAuthSessions) {
		await ensureAuthSessionsTable();
		return;
	}

	const migrationsRoot = path.resolve(SERVER_ROOT, 'prisma', 'migrations');
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

		}
	}

	const verifyHasRankCpdRates = await hasSqliteTable('rank_cpd_rates');
	if (!verifyHasRankCpdRates) {
		throw new Error('Unable to initialize SQLite schema');
	}

	const verifyHasAuthSessions = await hasSqliteTable('auth_sessions');
	if (!verifyHasAuthSessions) {
		await ensureAuthSessionsTable();
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
	{ rankCode: 'CIV', costPerDay: 0 },
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
	{ key: 'PLAYER_PER_DIEM_PER_DAY', value: '5.00' },
	{ key: 'FIELD_CONDITIONS_PER_DIEM', value: '5.00' },
	{ key: 'DEFAULT_AIRFARE', value: '400.00' },
	{ key: 'DEFAULT_RENTAL_CAR_DAILY', value: '50.00' },
	{ key: 'BUDGET_TARGET_RPA', value: '0.00' },
	{ key: 'BUDGET_TARGET_OM', value: '0.00' },
];

export async function ensureBaselineData(): Promise<void> {
	await ensureSqliteSchema();

	for (const rate of BASE_CPD_RATES) {
		await prisma.rankCpdRate.upsert({
			where: { rankCode: rate.rankCode },
			update: {},
			create: {
				rankCode: rate.rankCode,
				costPerDay: rate.costPerDay,
				effectiveDate: new Date('2025-10-01'),
			},
		});
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
