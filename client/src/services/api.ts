// Local data service — replaces server API calls with IndexedDB (Dexie) operations.
// Each function mirrors the old api.ts signature so page components need minimal changes.

import { db } from './db';
import { calculateBudget as calcEngine, type RateInputs } from './calculationEngine';
import type {
  Exercise,
  ExerciseDetail,
  BudgetResult,
  RankCpdRate,
  PerDiemRate,
  PersonnelGroup,
  PersonnelEntry,
  ExecutionCostLine,
  OmCostLine,
  TravelConfig,
  UnitBudget,
} from '../types';

const UNIT_CODES = ['SG', 'AE', 'CAB', 'A7'] as const;
const ROLES_BY_UNIT: Record<string, string[]> = {
  SG: ['PLAYER', 'WHITE_CELL'],
  AE: ['PLAYER', 'WHITE_CELL'],
  CAB: ['PLAYER', 'WHITE_CELL'],
  A7: ['PLANNING', 'SUPPORT'],
};
const FUNDING_TYPES = ['RPA', 'OM'] as const;

// ── helpers ──
function uid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// ── Exercises ──
export async function getExercises(): Promise<Exercise[]> {
  return db.exercises.toArray();
}

export async function getExercise(id: string): Promise<ExerciseDetail> {
  const ex = await db.exercises.get(id);
  if (!ex) throw new Error('Exercise not found');

  const unitBudgets = await db.unitBudgets.where('exerciseId').equals(id).toArray();
  const ubDetails: UnitBudget[] = [];

  for (const ub of unitBudgets) {
    const groups = await db.personnelGroups.where('unitBudgetId').equals(ub.id).toArray();
    const pgs: PersonnelGroup[] = [];
    for (const g of groups) {
      const entries = await db.personnelEntries.where('personnelGroupId').equals(g.id).toArray();
      pgs.push({ ...g, personnelEntries: entries } as PersonnelGroup);
    }
    const execLines = await db.executionCostLines.where('unitBudgetId').equals(ub.id).toArray();
    ubDetails.push({
      ...ub,
      personnelGroups: pgs,
      executionCostLines: execLines,
    } as UnitBudget);
  }

  const travelConfig = (await db.travelConfigs.where('exerciseId').equals(id).first()) || null;
  const omCostLines = await db.omCostLines.where('exerciseId').equals(id).toArray();

  return {
    ...ex,
    unitBudgets: ubDetails,
    travelConfig: travelConfig as TravelConfig | null,
    omCostLines: omCostLines as OmCostLine[],
  };
}

export async function createExercise(data: {
  name: string;
  startDate: string;
  endDate: string;
  defaultDutyDays: number;
}): Promise<ExerciseDetail> {
  const ts = now();
  const exerciseId = uid();
  await db.exercises.add({
    id: exerciseId,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    defaultDutyDays: data.defaultDutyDays,
    createdAt: ts,
    updatedAt: ts,
  });

  // Create 4 unit budgets each with 4 personnel groups
  for (const unitCode of UNIT_CODES) {
    const ubId = uid();
    await db.unitBudgets.add({ id: ubId, exerciseId, unitCode });
    const roles = ROLES_BY_UNIT[unitCode];
    for (const role of roles) {
      for (const ft of FUNDING_TYPES) {
        await db.personnelGroups.add({
          id: uid(),
          unitBudgetId: ubId,
          role,
          fundingType: ft,
          paxCount: 0,
          dutyDays: null,
          location: null,
          isLongTour: false,
          avgCpdOverride: null,
        });
      }
    }
  }

  // Create default travel config
  await db.travelConfigs.add({
    id: uid(),
    exerciseId,
    airfarePerPerson: 400,
    rentalCarDailyRate: 50,
    rentalCarCount: 0,
    rentalCarDays: 0,
  });

  return getExercise(exerciseId);
}

export async function updateExercise(id: string, data: Partial<Exercise>): Promise<Exercise> {
  await db.exercises.update(id, { ...data, updatedAt: now() });
  return (await db.exercises.get(id))!;
}

export async function deleteExercise(id: string): Promise<void> {
  const ubs = await db.unitBudgets.where('exerciseId').equals(id).toArray();
  for (const ub of ubs) {
    const groups = await db.personnelGroups.where('unitBudgetId').equals(ub.id).toArray();
    for (const g of groups) {
      await db.personnelEntries.where('personnelGroupId').equals(g.id).delete();
    }
    await db.personnelGroups.where('unitBudgetId').equals(ub.id).delete();
    await db.executionCostLines.where('unitBudgetId').equals(ub.id).delete();
  }
  await db.unitBudgets.where('exerciseId').equals(id).delete();
  await db.travelConfigs.where('exerciseId').equals(id).delete();
  await db.omCostLines.where('exerciseId').equals(id).delete();
  await db.exercises.delete(id);
}

// ── Travel Config ──
export async function updateTravelConfig(exerciseId: string, data: Partial<TravelConfig>): Promise<TravelConfig> {
  const tc = await db.travelConfigs.where('exerciseId').equals(exerciseId).first();
  if (tc) {
    await db.travelConfigs.update(tc.id, data);
    return (await db.travelConfigs.get(tc.id))! as TravelConfig;
  }
  const newTc = { id: uid(), exerciseId, airfarePerPerson: 400, rentalCarDailyRate: 50, rentalCarCount: 0, rentalCarDays: 0, ...data };
  await db.travelConfigs.add(newTc);
  return newTc as TravelConfig;
}

// ── Calculate budget ──
export async function getRateInputs(): Promise<RateInputs> {
  const cpdRows = await db.rankCpdRates.toArray();
  const cpdRates: Record<string, number> = {};
  for (const r of cpdRows) cpdRates[r.rankCode] = r.costPerDay;

  const pdRows = await db.perDiemRates.toArray();
  const perDiemRates: Record<string, { lodging: number; mie: number }> = {};
  for (const r of pdRows) perDiemRates[r.location] = { lodging: r.lodgingRate, mie: r.mieRate };

  const cfgMap = await getAppConfig();
  return {
    cpdRates,
    perDiemRates,
    mealRates: {
      breakfast: parseFloat(cfgMap['BREAKFAST_COST'] || '14'),
      lunchMre: parseFloat(cfgMap['LUNCH_MRE_COST'] || '15.91'),
      dinner: parseFloat(cfgMap['DINNER_COST'] || '14'),
    },
    playerBilletingPerNight: parseFloat(cfgMap['PLAYER_BILLETING_NIGHT'] || '27'),
  };
}

export async function calculateBudget(exerciseId: string): Promise<BudgetResult> {
  const ex = await getExercise(exerciseId);
  const rates = await getRateInputs();
  return calcEngine(ex, rates);
}

// ── Personnel Groups ──
export async function updatePersonnelGroup(groupId: string, data: Partial<PersonnelGroup>): Promise<PersonnelGroup> {
  await db.personnelGroups.update(groupId, data);
  const row = await db.personnelGroups.get(groupId);
  const entries = await db.personnelEntries.where('personnelGroupId').equals(groupId).toArray();
  return { ...row!, personnelEntries: entries } as PersonnelGroup;
}

// ── Personnel Entries ──
export async function addPersonnelEntry(groupId: string, data: { rankCode: string; count: number }): Promise<PersonnelEntry> {
  const entry = { id: uid(), personnelGroupId: groupId, ...data };
  await db.personnelEntries.add(entry);
  return entry as PersonnelEntry;
}

export async function deletePersonnelEntry(entryId: string): Promise<void> {
  await db.personnelEntries.delete(entryId);
}

// ── Execution Cost Lines ──
export async function addExecutionCost(
  unitId: string,
  data: { fundingType: string; category: string; amount: number; notes?: string | null },
): Promise<ExecutionCostLine> {
  const line = { id: uid(), unitBudgetId: unitId, notes: null, ...data };
  await db.executionCostLines.add(line);
  return line as ExecutionCostLine;
}

export async function deleteExecutionCost(lineId: string): Promise<void> {
  await db.executionCostLines.delete(lineId);
}

// ── O&M Cost Lines ──
export async function addOmCost(
  exerciseId: string,
  data: { category: string; label: string; amount: number; notes?: string | null },
): Promise<OmCostLine> {
  const line = { id: uid(), exerciseId, notes: null, ...data };
  await db.omCostLines.add(line);
  return line as OmCostLine;
}

export async function deleteOmCost(lineId: string): Promise<void> {
  await db.omCostLines.delete(lineId);
}

// ── Rates ──
const RANK_ORDER = ['AB','AMN','A1C','SRA','SSGT','TSGT','MSGT','SMSGT','CMSGT','2LT','1LT','CAPT','MAJ','LTCOL','COL','BG','MG'];

export async function getCpdRates(): Promise<RankCpdRate[]> {
  const rates = await db.rankCpdRates.toArray() as RankCpdRate[];
  rates.sort((a, b) => {
    const ai = RANK_ORDER.indexOf(a.rankCode);
    const bi = RANK_ORDER.indexOf(b.rankCode);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return rates;
}

export async function updateCpdRates(rates: { rankCode: string; costPerDay: number }[]): Promise<RankCpdRate[]> {
  for (const r of rates) {
    const existing = await db.rankCpdRates.where('rankCode').equals(r.rankCode).first();
    if (existing) {
      await db.rankCpdRates.update(existing.id, { costPerDay: r.costPerDay });
    }
  }
  return getCpdRates();
}

export async function getPerDiemRates(): Promise<PerDiemRate[]> {
  return db.perDiemRates.toArray() as Promise<PerDiemRate[]>;
}

export async function updatePerDiemRates(rates: { location: string; lodgingRate: number; mieRate: number }[]): Promise<PerDiemRate[]> {
  for (const r of rates) {
    const existing = await db.perDiemRates.where('location').equals(r.location).first();
    if (existing) {
      await db.perDiemRates.update(existing.id, { lodgingRate: r.lodgingRate, mieRate: r.mieRate });
    }
  }
  return getPerDiemRates();
}

export async function addPerDiemRate(location: string, lodgingRate: number, mieRate: number): Promise<PerDiemRate[]> {
  await db.perDiemRates.add({
    id: crypto.randomUUID(),
    location,
    lodgingRate,
    mieRate,
    effectiveDate: new Date().toISOString().slice(0, 10),
  });
  return getPerDiemRates();
}

export async function deletePerDiemRate(id: string): Promise<PerDiemRate[]> {
  await db.perDiemRates.delete(id);
  return getPerDiemRates();
}

export async function getAppConfig(): Promise<Record<string, string>> {
  const rows = await db.appConfig.toArray();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function updateAppConfig(config: Record<string, string>): Promise<Record<string, string>> {
  for (const [key, value] of Object.entries(config)) {
    await db.appConfig.put({ key, value });
  }
  return getAppConfig();
}

// ── Excel Export (client-side) ──
export async function exportExcel(exerciseId: string): Promise<void> {
  const { utils, writeFile } = await import('xlsx');
  const ex = await getExercise(exerciseId);
  const rates = await getRateInputs();
  const budget = calcEngine(ex, rates);

  const wb = utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Exercise', ex.name],
    ['Start Date', ex.startDate],
    ['End Date', ex.endDate],
    ['Duty Days', ex.defaultDutyDays],
    [],
    ['Unit', 'RPA', 'O&M', 'Total'],
    ...Object.values(budget.units).map((u) => [u.unitCode, u.unitTotalRpa, u.unitTotalOm, u.unitTotal]),
    [],
    ['Grand Total', budget.grandTotal],
    ['Total RPA', budget.totalRpa],
    ['Total O&M', budget.totalOm],
    ['Total PAX', budget.totalPax],
  ];
  utils.book_append_sheet(wb, utils.aoa_to_sheet(summaryData), 'Summary');

  // Unit sheets
  for (const ub of ex.unitBudgets) {
    const uc = budget.units[ub.unitCode];
    if (!uc) continue;
    const rows = [
      ['Category', 'PAX', 'Days', 'Mil Pay', 'Per Diem', 'Meals', 'Travel', 'Billeting', 'Subtotal'],
      ['WC RPA', uc.whiteCellRpa.paxCount, uc.whiteCellRpa.dutyDays, uc.whiteCellRpa.milPay, uc.whiteCellRpa.perDiem, uc.whiteCellRpa.meals, uc.whiteCellRpa.travel, uc.whiteCellRpa.billeting, uc.whiteCellRpa.subtotal],
      ['WC O&M', uc.whiteCellOm.paxCount, uc.whiteCellOm.dutyDays, uc.whiteCellOm.milPay, uc.whiteCellOm.perDiem, uc.whiteCellOm.meals, uc.whiteCellOm.travel, uc.whiteCellOm.billeting, uc.whiteCellOm.subtotal],
      ['Player RPA', uc.playerRpa.paxCount, uc.playerRpa.dutyDays, uc.playerRpa.milPay, uc.playerRpa.perDiem, uc.playerRpa.meals, uc.playerRpa.travel, uc.playerRpa.billeting, uc.playerRpa.subtotal],
      ['Player O&M', uc.playerOm.paxCount, uc.playerOm.dutyDays, uc.playerOm.milPay, uc.playerOm.perDiem, uc.playerOm.meals, uc.playerOm.travel, uc.playerOm.billeting, uc.playerOm.subtotal],
      [],
      ['Exec RPA', uc.executionRpa],
      ['Exec O&M', uc.executionOm],
      ['Unit Total RPA', uc.unitTotalRpa],
      ['Unit Total O&M', uc.unitTotalOm],
      ['Unit Total', uc.unitTotal],
    ];
    utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), ub.unitCode);
  }

  // O&M Detail sheet
  const omRows = [['Category', 'Label', 'Amount', 'Notes'], ...ex.omCostLines.map((l) => [l.category, l.label, l.amount, l.notes || ''])];
  utils.book_append_sheet(wb, utils.aoa_to_sheet(omRows), 'O&M Detail');

  writeFile(wb, `${ex.name.replace(/[^a-zA-Z0-9]/g, '_')}_Budget.xlsx`);
}

// ── JSON Import / Export (for data portability) ──
export async function exportAllData(): Promise<string> {
  const data = {
    exercises: await db.exercises.toArray(),
    unitBudgets: await db.unitBudgets.toArray(),
    personnelGroups: await db.personnelGroups.toArray(),
    personnelEntries: await db.personnelEntries.toArray(),
    travelConfigs: await db.travelConfigs.toArray(),
    executionCostLines: await db.executionCostLines.toArray(),
    omCostLines: await db.omCostLines.toArray(),
    rankCpdRates: await db.rankCpdRates.toArray(),
    perDiemRates: await db.perDiemRates.toArray(),
    appConfig: await db.appConfig.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

export async function importAllData(json: string): Promise<void> {
  const data = JSON.parse(json);

  await db.transaction('rw',
    [db.exercises, db.unitBudgets, db.personnelGroups, db.personnelEntries,
    db.travelConfigs, db.executionCostLines, db.omCostLines,
    db.rankCpdRates, db.perDiemRates, db.appConfig],
    async () => {
      // Clear everything
      await db.exercises.clear();
      await db.unitBudgets.clear();
      await db.personnelGroups.clear();
      await db.personnelEntries.clear();
      await db.travelConfigs.clear();
      await db.executionCostLines.clear();
      await db.omCostLines.clear();
      await db.rankCpdRates.clear();
      await db.perDiemRates.clear();
      await db.appConfig.clear();

      // Bulk insert
      if (data.exercises?.length) await db.exercises.bulkAdd(data.exercises);
      if (data.unitBudgets?.length) await db.unitBudgets.bulkAdd(data.unitBudgets);
      if (data.personnelGroups?.length) await db.personnelGroups.bulkAdd(data.personnelGroups);
      if (data.personnelEntries?.length) await db.personnelEntries.bulkAdd(data.personnelEntries);
      if (data.travelConfigs?.length) await db.travelConfigs.bulkAdd(data.travelConfigs);
      if (data.executionCostLines?.length) await db.executionCostLines.bulkAdd(data.executionCostLines);
      if (data.omCostLines?.length) await db.omCostLines.bulkAdd(data.omCostLines);
      if (data.rankCpdRates?.length) await db.rankCpdRates.bulkAdd(data.rankCpdRates);
      if (data.perDiemRates?.length) await db.perDiemRates.bulkAdd(data.perDiemRates);
      if (data.appConfig?.length) await db.appConfig.bulkAdd(data.appConfig);
    },
  );
}
