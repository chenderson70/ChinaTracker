import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const SERVER_ROOT = path.resolve(__dirname, '..');
const PRISMA_SCHEMA_ROOT = path.resolve(SERVER_ROOT, 'prisma');

dotenv.config({ path: path.resolve(SERVER_ROOT, '.env') });

if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = 'file:./prisma/prod.db';
}

function resolveSqlitePath(databaseUrl: string | undefined): string | null {
	if (!databaseUrl || !databaseUrl.startsWith('file:')) return null;
	const rawPath = databaseUrl.slice(5);
	if (!rawPath) return null;
	if (path.isAbsolute(rawPath)) return rawPath;
	return path.resolve(PRISMA_SCHEMA_ROOT, rawPath);
}

function bootstrapSqliteFileIfMissing(): void {
	const targetDbPath = resolveSqlitePath(process.env.DATABASE_URL);
	if (!targetDbPath) return;

	const seededDbPath = resolveSqlitePath('file:./prisma/prod.db');
	const targetDir = path.dirname(targetDbPath);
	fs.mkdirSync(targetDir, { recursive: true });

	if (!seededDbPath || !fs.existsSync(seededDbPath)) return;

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

const LEGACY_REPORT_ASSUMPTIONS = [
	'Location of exercise: Fort Hunter Liggett, CA',
	'Unit of Action execution costs to be mainly funded by the NAF',
	`Pay estimations for long tour orders include MAJ's & SMSGT's. Site visits and planning conferences used CAPT's`,
] as const;

async function hasSqliteTable(tableName: string): Promise<boolean> {
	const tableCheck = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
		tableName,
	);
	return Array.isArray(tableCheck) && tableCheck.length > 0;
}

async function hasSqliteColumn(tableName: string, columnName: string): Promise<boolean> {
	const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
		`PRAGMA table_info("${tableName}")`,
	);
	return Array.isArray(columns) && columns.some((column) => column.name === columnName);
}

async function ensureSqliteColumn(tableName: string, columnName: string, columnDefinition: string): Promise<void> {
	if (!await hasSqliteTable(tableName)) return;
	if (await hasSqliteColumn(tableName, columnName)) return;
	await prisma.$executeRawUnsafe(
		`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnDefinition}`,
	);
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

async function ensureSqliteCompatibilityColumns(): Promise<void> {
	await ensureSqliteColumn('unit_budgets', 'unit_display_name', 'TEXT');

	await ensureSqliteColumn('personnel_entries', 'note', 'TEXT');
	await ensureSqliteColumn('personnel_entries', 'row_order', 'REAL NOT NULL DEFAULT 0');
	await ensureSqliteColumn('personnel_entries', 'travel_only', 'BOOLEAN NOT NULL DEFAULT false');
	await ensureSqliteColumn('personnel_entries', 'rental_car_count', 'INTEGER NOT NULL DEFAULT 0');
	await ensureSqliteColumn('personnel_entries', 'long_term_a7_planner', 'BOOLEAN NOT NULL DEFAULT false');
	await ensureSqliteColumn('personnel_entries', 'start_date', 'DATETIME');
	await ensureSqliteColumn('personnel_entries', 'end_date', 'DATETIME');

	await ensureSqliteColumn('execution_cost_lines', 'start_date', 'DATETIME');
	await ensureSqliteColumn('execution_cost_lines', 'end_date', 'DATETIME');

	await ensureSqliteColumn('om_cost_lines', 'start_date', 'DATETIME');
	await ensureSqliteColumn('om_cost_lines', 'end_date', 'DATETIME');

	await ensureSqliteColumn(
		'exercises',
		'report_assumption_1',
		`TEXT NOT NULL DEFAULT ''`,
	);
	await ensureSqliteColumn(
		'exercises',
		'report_assumption_2',
		`TEXT NOT NULL DEFAULT ''`,
	);
	await ensureSqliteColumn(
		'exercises',
		'report_assumption_3',
		`TEXT NOT NULL DEFAULT ''`,
	);
	await ensureSqliteColumn('exercises', 'report_assumption_4', `TEXT NOT NULL DEFAULT ''`);
	await ensureSqliteColumn('exercises', 'report_limfac_1', `TEXT NOT NULL DEFAULT ''`);
	await ensureSqliteColumn('exercises', 'report_limfac_2', `TEXT NOT NULL DEFAULT ''`);
	await ensureSqliteColumn('exercises', 'report_limfac_3', `TEXT NOT NULL DEFAULT ''`);
	await ensureSqliteColumn('exercises', 'report_prepared_by', `TEXT NOT NULL DEFAULT ''`);
	await ensureSqliteColumn('exercises', 'refinements_json', `TEXT NOT NULL DEFAULT '[]'`);
	await ensureSqliteColumn('exercises', 'expense_narratives_json', `TEXT NOT NULL DEFAULT '[]'`);
	await ensureSqliteColumn('exercises', 'exercise_template', `TEXT NOT NULL DEFAULT 'PATRIOT_MEDIC'`);
	await ensureSqliteColumn('exercises', 'planning_conference_dates_json', `TEXT NOT NULL DEFAULT '{}'`);
	await ensureSqliteColumn('exercises', 'quarterly_snapshots_json', `TEXT NOT NULL DEFAULT '{}'`);
}

async function ensureSqliteSchema(): Promise<void> {
	const hasRankCpdRates = await hasSqliteTable('rank_cpd_rates');
	const hasAuthSessions = await hasSqliteTable('auth_sessions');

	if (!hasRankCpdRates) {
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
	}

	if (!hasAuthSessions) {
		await ensureAuthSessionsTable();
	}

	await ensureSqliteCompatibilityColumns();
}

async function clearLegacyReportDefaults(): Promise<void> {
	await prisma.exercise.updateMany({
		where: { reportAssumption1: LEGACY_REPORT_ASSUMPTIONS[0] },
		data: { reportAssumption1: '' },
	});
	await prisma.exercise.updateMany({
		where: { reportAssumption2: LEGACY_REPORT_ASSUMPTIONS[1] },
		data: { reportAssumption2: '' },
	});
	await prisma.exercise.updateMany({
		where: { reportAssumption3: LEGACY_REPORT_ASSUMPTIONS[2] },
		data: { reportAssumption3: '' },
	});
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
	{ location: 'FORT_HUNTER_LIGGETT', lodgingRate: 209, mieRate: 92 },
	{ location: 'WARNER_ROBINS', lodgingRate: 110, mieRate: 68 },
	{ location: 'MARIETTA', lodgingRate: 126, mieRate: 74 },
];
const PER_DIEM_BASELINE_INITIALIZED_KEY = 'PER_DIEM_BASELINE_INITIALIZED';

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

export async function ensureBaselineCpdRates(): Promise<void> {
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
}

export async function ensureBaselineData(): Promise<void> {
	await ensureSqliteSchema();
	await clearLegacyReportDefaults();

	await ensureBaselineCpdRates();

	const perDiemCount = await prisma.perDiemRate.count();
	const perDiemBaselineInitialized = await prisma.appConfig.findUnique({
		where: { key: PER_DIEM_BASELINE_INITIALIZED_KEY },
	});
	if (perDiemCount === 0 && !perDiemBaselineInitialized) {
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

	await prisma.appConfig.upsert({
		where: { key: PER_DIEM_BASELINE_INITIALIZED_KEY },
		update: { value: '1' },
		create: { key: PER_DIEM_BASELINE_INITIALIZED_KEY, value: '1' },
	});
}
