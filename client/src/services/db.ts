import Dexie, { type Table } from 'dexie';

// ── Interfaces stored in IndexedDB ──
export interface ExerciseRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultDutyDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface UnitBudgetRow {
  id: string;
  exerciseId: string;
  unitCode: string;
}

export interface PersonnelGroupRow {
  id: string;
  unitBudgetId: string;
  role: string;
  fundingType: string;
  paxCount: number;
  dutyDays: number | null;
  location: string | null;
  isLongTour: boolean;
  avgCpdOverride: number | null;
}

export interface PersonnelEntryRow {
  id: string;
  personnelGroupId: string;
  rankCode: string;
  count: number;
}

export interface TravelConfigRow {
  id: string;
  exerciseId: string;
  airfarePerPerson: number;
  rentalCarDailyRate: number;
  rentalCarCount: number;
  rentalCarDays: number;
}

export interface ExecutionCostLineRow {
  id: string;
  unitBudgetId: string;
  fundingType: string;
  category: string;
  amount: number;
  notes: string | null;
}

export interface OmCostLineRow {
  id: string;
  exerciseId: string;
  category: string;
  label: string;
  amount: number;
  notes: string | null;
}

export interface RankCpdRateRow {
  id: string;
  rankCode: string;
  costPerDay: number;
  effectiveDate: string;
}

export interface PerDiemRateRow {
  id: string;
  location: string;
  lodgingRate: number;
  mieRate: number;
  effectiveDate: string;
}

export interface AppConfigRow {
  key: string;
  value: string;
}

// ── Database class ──
class ChinaTrackerDB extends Dexie {
  exercises!: Table<ExerciseRow, string>;
  unitBudgets!: Table<UnitBudgetRow, string>;
  personnelGroups!: Table<PersonnelGroupRow, string>;
  personnelEntries!: Table<PersonnelEntryRow, string>;
  travelConfigs!: Table<TravelConfigRow, string>;
  executionCostLines!: Table<ExecutionCostLineRow, string>;
  omCostLines!: Table<OmCostLineRow, string>;
  rankCpdRates!: Table<RankCpdRateRow, string>;
  perDiemRates!: Table<PerDiemRateRow, string>;
  appConfig!: Table<AppConfigRow, string>;

  constructor() {
    super('ChinaTrackerDB');
    this.version(1).stores({
      exercises: 'id',
      unitBudgets: 'id, exerciseId',
      personnelGroups: 'id, unitBudgetId',
      personnelEntries: 'id, personnelGroupId',
      travelConfigs: 'id, exerciseId',
      executionCostLines: 'id, unitBudgetId',
      omCostLines: 'id, exerciseId',
      rankCpdRates: 'id, rankCode',
      perDiemRates: 'id, location',
      appConfig: 'key',
    });

    // v2: clear old rate data so seedIfEmpty re-populates with AF rank codes
    this.version(2).stores({}).upgrade((tx) => {
      tx.table('rankCpdRates').clear();
      tx.table('perDiemRates').clear();
    });

    // v3: clear duplicate per diem rows
    this.version(3).stores({}).upgrade((tx) => {
      tx.table('perDiemRates').clear();
    });
  }
}

export const db = new ChinaTrackerDB();

// ── Seed default data on first load ──
export async function seedIfEmpty(): Promise<void> {
  const count = await db.rankCpdRates.count();
  if (count > 0) return; // already seeded

  const cpdRates: RankCpdRateRow[] = [
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
  ].map((r) => ({ ...r, id: crypto.randomUUID(), effectiveDate: '2025-10-01' }));

  await db.rankCpdRates.bulkAdd(cpdRates);

  const pdCount = await db.perDiemRates.count();
  if (pdCount === 0) {
    await db.perDiemRates.bulkAdd([
      { id: crypto.randomUUID(), location: 'GULFPORT', lodgingRate: 98, mieRate: 64, effectiveDate: '2025-10-01' },
      { id: crypto.randomUUID(), location: 'CAMP_SHELBY', lodgingRate: 96, mieRate: 59, effectiveDate: '2025-10-01' },
    ]);
  }

  await db.appConfig.bulkAdd([
    { key: 'BREAKFAST_COST', value: '14.00' },
    { key: 'LUNCH_MRE_COST', value: '15.91' },
    { key: 'DINNER_COST', value: '14.00' },
    { key: 'PLAYER_BILLETING_NIGHT', value: '27.00' },
    { key: 'DEFAULT_AIRFARE', value: '400.00' },
    { key: 'DEFAULT_RENTAL_CAR_DAILY', value: '50.00' },
  ]);
}
