import dayjs from 'dayjs';
import type { RateInputs } from '../services/calculationEngine';
import type {
  ExerciseDetail,
  ExecutionCostLine,
  FundingType,
  OmCostLine,
  PerDiemRate,
  PersonnelEntry,
  PersonnelGroup,
  RankCpdRate,
} from '../types';
import { calculateInclusiveDateRangeDays, formatDateRange, normalizeDateString } from './dateRanges';

export type QuarterlyBudgetCategoryKey =
  | 'omWrm'
  | 'omContracts'
  | 'omGpcPurchases'
  | 'omBilleting'
  | 'omTravel'
  | 'otherOm'
  | 'rpaMilPay'
  | 'rpaTravelAndPerDiem'
  | 'rpaMeals'
  | 'annualTour'
  | 'totalRpa'
  | 'totalOm';

export type QuarterlyBudgetCategoryTotals = Record<QuarterlyBudgetCategoryKey, number>;

export type FiscalQuarterBucket = {
  key: string;
  label: string;
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4;
  startDate: string;
  endDate: string;
  rangeLabel: string;
};

export type QuarterlyBudgetAllocationResult = {
  buckets: FiscalQuarterBucket[];
  totalsByBucket: Record<string, QuarterlyBudgetCategoryTotals>;
  fallbackDateUsage: {
    personnelEntries: number;
    executionCostLines: number;
    exerciseOmCostLines: number;
  };
};

type ResolvedDateRange = {
  startDate: string;
  endDate: string;
  totalDays: number;
  usedFallback: boolean;
};

export const QUARTERLY_BUDGET_ROW_META: Array<{
  key: QuarterlyBudgetCategoryKey;
  label: string;
  tone?: 'rpa' | 'om' | 'annualTour';
  alwaysShow?: boolean;
}> = [
  { key: 'omWrm', label: 'WRM', tone: 'om', alwaysShow: true },
  { key: 'omContracts', label: 'Contracts', tone: 'om', alwaysShow: true },
  { key: 'omGpcPurchases', label: 'GPC Purchases', tone: 'om', alwaysShow: true },
  { key: 'omBilleting', label: 'Billeting', tone: 'om', alwaysShow: true },
  { key: 'omTravel', label: 'Travel', tone: 'om', alwaysShow: true },
  { key: 'otherOm', label: 'Other O&M', tone: 'om' },
  { key: 'totalOm', label: 'Total O&M', tone: 'om', alwaysShow: true },
  { key: 'rpaMilPay', label: 'RPA Mil Pay', tone: 'rpa', alwaysShow: true },
  { key: 'rpaTravelAndPerDiem', label: 'RPA Travel & Per Diem', tone: 'rpa', alwaysShow: true },
  { key: 'rpaMeals', label: 'RPA Meals', tone: 'rpa', alwaysShow: true },
  { key: 'totalRpa', label: 'Total RPA', tone: 'rpa', alwaysShow: true },
  { key: 'annualTour', label: 'Annual Tour', tone: 'annualTour' },
];

export const QUARTERLY_BUDGET_SECTION_META: Array<{
  key: 'om' | 'rpa' | 'annualTour';
  label: string;
  tone: 'om' | 'rpa' | 'annualTour';
  rowKeys: QuarterlyBudgetCategoryKey[];
}> = [
  {
    key: 'om',
    label: 'O&M',
    tone: 'om',
    rowKeys: ['omWrm', 'omContracts', 'omGpcPurchases', 'omBilleting', 'omTravel', 'otherOm', 'totalOm'],
  },
  {
    key: 'rpa',
    label: 'RPA',
    tone: 'rpa',
    rowKeys: ['rpaMilPay', 'rpaTravelAndPerDiem', 'rpaMeals', 'totalRpa'],
  },
  {
    key: 'annualTour',
    label: 'Annual Tour',
    tone: 'annualTour',
    rowKeys: ['annualTour'],
  },
];

function createEmptyTotals(): QuarterlyBudgetCategoryTotals {
  return {
    omWrm: 0,
    omContracts: 0,
    omGpcPurchases: 0,
    omBilleting: 0,
    omTravel: 0,
    otherOm: 0,
    rpaMilPay: 0,
    rpaTravelAndPerDiem: 0,
    rpaMeals: 0,
    annualTour: 0,
    totalRpa: 0,
    totalOm: 0,
  };
}

function finalizeTotals(totals: QuarterlyBudgetCategoryTotals): QuarterlyBudgetCategoryTotals {
  const next = { ...totals };
  next.totalRpa = next.rpaMilPay + next.rpaTravelAndPerDiem + next.rpaMeals;
  next.totalOm = next.omWrm + next.omContracts + next.omGpcPurchases + next.omBilleting + next.omTravel + next.otherOm;
  return next;
}

function isLocalFlag(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'local';
  }
  return false;
}

function isTravelOnlyFlag(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'travel only' || normalized === 'travel_only';
  }
  return false;
}

function calcMilPay(
  group: Pick<PersonnelGroup, 'isLongTour' | 'avgCpdOverride' | 'paxCount'>,
  entry: { rankCode: string | null; count: number },
  rates: RateInputs,
  dutyDays: number,
): number {
  if (group.isLongTour) return 0;
  if (entry.rankCode) {
    const cpd = rates.cpdRates[entry.rankCode] || 0;
    return (entry.count || 0) * cpd * dutyDays;
  }
  const avgCpd = group.avgCpdOverride || 200;
  return (group.paxCount || 0) * avgCpd * dutyDays;
}

function getFiscalQuarterInfo(dateValue: string | dayjs.Dayjs): {
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4;
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
} {
  const date = typeof dateValue === 'string' ? dayjs(dateValue) : dateValue;
  const month = date.month();
  const year = date.year();

  if (month >= 9) {
    return {
      fiscalYear: year + 1,
      quarter: 1,
      start: dayjs(`${year}-10-01`),
      end: dayjs(`${year}-12-31`),
    };
  }

  if (month <= 2) {
    return {
      fiscalYear: year,
      quarter: 2,
      start: dayjs(`${year}-01-01`),
      end: dayjs(`${year}-03-31`),
    };
  }

  if (month <= 5) {
    return {
      fiscalYear: year,
      quarter: 3,
      start: dayjs(`${year}-04-01`),
      end: dayjs(`${year}-06-30`),
    };
  }

  return {
    fiscalYear: year,
    quarter: 4,
    start: dayjs(`${year}-07-01`),
    end: dayjs(`${year}-09-30`),
  };
}

function buildRange(startDate: string, endDate: string, usedFallback: boolean): ResolvedDateRange | null {
  const normalizedStart = normalizeDateString(startDate);
  const normalizedEnd = normalizeDateString(endDate);
  if (!normalizedStart || !normalizedEnd) return null;

  const start = dayjs(normalizedStart);
  const end = dayjs(normalizedEnd);
  if (!start.isValid() || !end.isValid() || end.isBefore(start, 'day')) return null;

  return {
    startDate: normalizedStart,
    endDate: normalizedEnd,
    totalDays: end.diff(start, 'day') + 1,
    usedFallback,
  };
}

function deriveEndDate(startDate: string, durationDays: number): string {
  return dayjs(startDate).add(Math.max(1, durationDays) - 1, 'day').format('YYYY-MM-DD');
}

function deriveStartDate(endDate: string, durationDays: number): string {
  return dayjs(endDate).subtract(Math.max(1, durationDays) - 1, 'day').format('YYYY-MM-DD');
}

function getExerciseDateContext(exercise: Pick<ExerciseDetail, 'startDate' | 'endDate'>): {
  startDate: string | null;
  endDate: string | null;
} {
  const startDate = normalizeDateString(exercise.startDate);
  const endDate = normalizeDateString(exercise.endDate);

  if (startDate && endDate && dayjs(endDate).isBefore(dayjs(startDate), 'day')) {
    return { startDate: endDate, endDate: startDate };
  }

  return { startDate, endDate };
}

function getExerciseRangeDutyDays(exercise: Pick<ExerciseDetail, 'startDate' | 'endDate'>): number | null {
  const exerciseDates = getExerciseDateContext(exercise);
  if (!exerciseDates.startDate || !exerciseDates.endDate) return null;
  return calculateInclusiveDateRangeDays(exerciseDates.startDate, exerciseDates.endDate);
}

function resolvePersonnelDutyDays(
  exercise: Pick<ExerciseDetail, 'startDate' | 'endDate'>,
  group: Pick<PersonnelGroup, 'role' | 'dutyDays'>,
  entry: Pick<PersonnelEntry, 'startDate' | 'endDate' | 'dutyDays'>,
  defaultDays: number,
): number {
  const entryStartDate = normalizeDateString(entry.startDate);
  const entryEndDate = normalizeDateString(entry.endDate);

  if (group.role === 'PLAYER' && !entryStartDate && !entryEndDate) {
    return Math.max(1, getExerciseRangeDutyDays(exercise) ?? defaultDays);
  }

  return Math.max(1, Math.round(Number((entry.dutyDays ?? group.dutyDays ?? defaultDays) || 1)));
}

function resolvePersonnelDateRange(
  exercise: Pick<ExerciseDetail, 'startDate' | 'endDate'>,
  group: Pick<PersonnelGroup, 'role' | 'dutyDays'>,
  entry: Pick<PersonnelEntry, 'startDate' | 'endDate' | 'dutyDays'>,
  defaultDays: number,
): ResolvedDateRange | null {
  const entryStartDate = normalizeDateString(entry.startDate);
  const entryEndDate = normalizeDateString(entry.endDate);
  const durationDays = resolvePersonnelDutyDays(exercise, group, entry, defaultDays);
  const exerciseDates = getExerciseDateContext(exercise);

  if (entryStartDate && entryEndDate) {
    return buildRange(entryStartDate, entryEndDate, false);
  }
  if (entryStartDate) {
    return buildRange(entryStartDate, deriveEndDate(entryStartDate, durationDays), true);
  }
  if (entryEndDate) {
    return buildRange(deriveStartDate(entryEndDate, durationDays), entryEndDate, true);
  }
  if (group.role === 'PLAYER' && exerciseDates.startDate && exerciseDates.endDate) {
    return buildRange(exerciseDates.startDate, exerciseDates.endDate, true);
  }
  if (exerciseDates.startDate) {
    return buildRange(exerciseDates.startDate, deriveEndDate(exerciseDates.startDate, durationDays), true);
  }
  if (exerciseDates.endDate) {
    return buildRange(deriveStartDate(exerciseDates.endDate, durationDays), exerciseDates.endDate, true);
  }

  return null;
}

function resolveCostLineDateRange(
  line: Pick<ExecutionCostLine | OmCostLine, 'startDate' | 'endDate'>,
  exercise: Pick<ExerciseDetail, 'startDate' | 'endDate'>,
): ResolvedDateRange | null {
  const lineStartDate = normalizeDateString(line.startDate);
  const lineEndDate = normalizeDateString(line.endDate);
  const exerciseDates = getExerciseDateContext(exercise);

  if (lineStartDate && lineEndDate) {
    return buildRange(lineStartDate, lineEndDate, false);
  }
  if (lineStartDate) {
    return buildRange(lineStartDate, exerciseDates.endDate || lineStartDate, true);
  }
  if (lineEndDate) {
    return buildRange(exerciseDates.startDate || lineEndDate, lineEndDate, true);
  }
  if (exerciseDates.startDate && exerciseDates.endDate) {
    return buildRange(exerciseDates.startDate, exerciseDates.endDate, true);
  }
  if (exerciseDates.startDate) {
    return buildRange(exerciseDates.startDate, exerciseDates.startDate, true);
  }
  if (exerciseDates.endDate) {
    return buildRange(exerciseDates.endDate, exerciseDates.endDate, true);
  }

  return null;
}

function getOverlapRatio(range: ResolvedDateRange, bucket: FiscalQuarterBucket): number {
  const overlapStart = dayjs(range.startDate).isAfter(dayjs(bucket.startDate), 'day')
    ? dayjs(range.startDate)
    : dayjs(bucket.startDate);
  const overlapEnd = dayjs(range.endDate).isBefore(dayjs(bucket.endDate), 'day')
    ? dayjs(range.endDate)
    : dayjs(bucket.endDate);

  if (overlapEnd.isBefore(overlapStart, 'day')) return 0;

  const overlapDays = overlapEnd.diff(overlapStart, 'day') + 1;
  return overlapDays / Math.max(1, range.totalDays);
}

function allocateAmount(
  totalsByBucket: Record<string, QuarterlyBudgetCategoryTotals>,
  buckets: FiscalQuarterBucket[],
  range: ResolvedDateRange | null,
  key: QuarterlyBudgetCategoryKey,
  amount: number,
): void {
  if (!range || !Number.isFinite(amount) || Math.abs(amount) < 0.000001) return;

  for (const bucket of buckets) {
    const ratio = getOverlapRatio(range, bucket);
    if (ratio <= 0) continue;
    totalsByBucket[bucket.key][key] += amount * ratio;
  }
}

function getBucketLabel(fiscalYear: number, quarter: number): string {
  return `FY${String(fiscalYear).slice(-2)} Q${quarter}`;
}

export function getFiscalQuarterBucketsForExercise(
  exercise: Pick<ExerciseDetail, 'startDate' | 'endDate'>,
): FiscalQuarterBucket[] {
  const exerciseDates = getExerciseDateContext(exercise);
  const referenceStart = exerciseDates.startDate || exerciseDates.endDate || dayjs().format('YYYY-MM-DD');
  const referenceEnd = exerciseDates.endDate || exerciseDates.startDate || referenceStart;
  const normalizedStart = dayjs(referenceStart);
  const normalizedEnd = dayjs(referenceEnd);
  const startDate = normalizedStart.isBefore(normalizedEnd, 'day') ? normalizedStart : normalizedEnd;
  const endDate = normalizedEnd.isAfter(normalizedStart, 'day') ? normalizedEnd : normalizedStart;

  const buckets: FiscalQuarterBucket[] = [];
  let currentStart = getFiscalQuarterInfo(startDate).start;

  while (currentStart.isBefore(endDate, 'day') || currentStart.isSame(endDate, 'day')) {
    const info = getFiscalQuarterInfo(currentStart);
    const bucketStart = info.start.format('YYYY-MM-DD');
    const bucketEnd = info.end.format('YYYY-MM-DD');
    buckets.push({
      key: `FY${info.fiscalYear}_Q${info.quarter}`,
      label: getBucketLabel(info.fiscalYear, info.quarter),
      fiscalYear: info.fiscalYear,
      quarter: info.quarter,
      startDate: bucketStart,
      endDate: bucketEnd,
      rangeLabel: formatDateRange(bucketStart, bucketEnd),
    });
    currentStart = info.start.add(3, 'month');
  }

  return buckets;
}

export function buildQuarterlyBudgetRateInputs(params: {
  cpdRates: RankCpdRate[];
  perDiemRates: PerDiemRate[];
  appConfig: Record<string, string>;
}): RateInputs {
  return {
    cpdRates: Object.fromEntries(params.cpdRates.map((rate) => [rate.rankCode, rate.costPerDay])),
    perDiemRates: Object.fromEntries(params.perDiemRates.map((rate) => [rate.location, { lodging: rate.lodgingRate, mie: rate.mieRate }])),
    mealRates: {
      breakfast: Number(params.appConfig.BREAKFAST_COST ?? 14),
      lunchMre: Number(params.appConfig.LUNCH_MRE_COST ?? 15.91),
      dinner: Number(params.appConfig.DINNER_COST ?? 14),
    },
    playerBilletingPerNight: Number(params.appConfig.PLAYER_BILLETING_NIGHT ?? 27),
    playerPerDiemPerDay: Number(params.appConfig.PLAYER_PER_DIEM_PER_DAY ?? params.appConfig.FIELD_CONDITIONS_PER_DIEM ?? 5),
    defaultAirfare: Number(params.appConfig.DEFAULT_AIRFARE ?? 400),
    defaultRentalCarDailyRate: Number(params.appConfig.DEFAULT_RENTAL_CAR_DAILY ?? 50),
  };
}

function createFallbackEntry(
  group: Pick<PersonnelGroup, 'paxCount' | 'dutyDays' | 'location' | 'isLocal'>,
): PersonnelEntry {
  return {
    id: '__fallback__',
    personnelGroupId: '__fallback__',
    rankCode: '',
    count: Number(group.paxCount || 0),
    dutyDays: group.dutyDays ?? null,
    startDate: null,
    endDate: null,
    rentalCarCount: 0,
    location: group.location ?? null,
    isLocal: !!group.isLocal,
    note: null,
    travelOnly: false,
    longTermA7Planner: false,
  };
}

function resolveGroupDateRange(
  exercise: Pick<ExerciseDetail, 'startDate' | 'endDate'>,
  group: Pick<PersonnelGroup, 'role' | 'dutyDays' | 'personnelEntries'>,
  defaultDays: number,
): ResolvedDateRange | null {
  const ranges = (group.personnelEntries || [])
    .map((entry) => resolvePersonnelDateRange(exercise, group, entry, defaultDays))
    .filter((range): range is ResolvedDateRange => !!range);

  if (ranges.length > 0) {
    const startDate = ranges
      .map((range) => range.startDate)
      .sort()[0];
    const endDate = ranges
      .map((range) => range.endDate)
      .sort()
      .slice(-1)[0];

    if (startDate && endDate) {
      return buildRange(startDate, endDate, ranges.some((range) => range.usedFallback));
    }
  }

  return resolvePersonnelDateRange(
    exercise,
    group,
    { startDate: null, endDate: null, dutyDays: group.dutyDays ?? defaultDays },
    defaultDays,
  );
}

function addLegacyRentalAllocation(params: {
  exercise: ExerciseDetail;
  group: PersonnelGroup;
  buckets: FiscalQuarterBucket[];
  totalsByBucket: Record<string, QuarterlyBudgetCategoryTotals>;
  defaultDays: number;
  categoryKey: QuarterlyBudgetCategoryKey;
  amount: number;
}) {
  const { exercise, group, buckets, totalsByBucket, defaultDays, categoryKey, amount } = params;
  const range = resolveGroupDateRange(exercise, group, defaultDays);
  allocateAmount(totalsByBucket, buckets, range, categoryKey, amount);
}

function isPlanningRole(role: string): boolean {
  return role === 'PLANNING';
}

function isSupportRole(role: string): boolean {
  return role === 'SUPPORT';
}

function isWhiteCellRole(role: string): boolean {
  return role === 'WHITE_CELL' || isSupportRole(role);
}

function isPlayerRole(role: string): boolean {
  return role === 'PLAYER';
}

function isAnnualTourRole(role: string): boolean {
  return role === 'ANNUAL_TOUR';
}

function isPlayerLikeRole(role: string): boolean {
  return isPlayerRole(role) || isAnnualTourRole(role);
}

function getFundingType(value: FundingType | string): FundingType {
  return String(value || '').toUpperCase() === 'OM' ? 'OM' : 'RPA';
}

function getExecutionOmCategoryKey(category: string | null | undefined): QuarterlyBudgetCategoryKey {
  const normalized = String(category || '').trim().toUpperCase();

  if (normalized === 'WRM' || normalized === 'UFR') return 'omWrm';
  if (normalized === 'TITLE_CONTRACTS') return 'omContracts';
  if (normalized === 'GPC_PURCHASES') return 'omGpcPurchases';

  return 'otherOm';
}

function getExerciseOmCategoryKey(category: string | null | undefined): QuarterlyBudgetCategoryKey {
  const normalized = String(category || '').trim().toUpperCase();

  if (normalized === 'WRM') return 'omWrm';
  if (normalized === 'CONTRACT') return 'omContracts';
  if (normalized === 'GPC_PURCHASES') return 'omGpcPurchases';
  if (normalized === 'BILLETING') return 'omBilleting';
  if (normalized === 'TRANSPORTATION') return 'omTravel';

  return 'otherOm';
}

export function buildQuarterlyBudgetAllocation(
  exercise: ExerciseDetail,
  rates: RateInputs,
): QuarterlyBudgetAllocationResult {
  const buckets = getFiscalQuarterBucketsForExercise(exercise);
  const totalsByBucket = Object.fromEntries(
    buckets.map((bucket) => [bucket.key, createEmptyTotals()]),
  ) as Record<string, QuarterlyBudgetCategoryTotals>;
  const fallbackDateUsage = {
    personnelEntries: 0,
    executionCostLines: 0,
    exerciseOmCostLines: 0,
  };

  const defaultDays = exercise.defaultDutyDays || 1;
  const travel = exercise.travelConfig || {
    airfarePerPerson: rates.defaultAirfare,
    rentalCarDailyRate: rates.defaultRentalCarDailyRate,
    rentalCarCount: 0,
    rentalCarDays: 0,
  };
  const mealsPerDay = rates.mealRates.breakfast + rates.mealRates.lunchMre + rates.mealRates.dinner;

  for (const unitBudget of exercise.unitBudgets || []) {
    for (const group of unitBudget.personnelGroups || []) {
      const entries = (group.personnelEntries || []).length > 0
        ? group.personnelEntries
        : [createFallbackEntry(group)];

      const fundingType = getFundingType(group.fundingType);
      const isPlanningGroup = isPlanningRole(group.role);
      const isWhiteCellGroup = isWhiteCellRole(group.role);
      const isPlayerGroup = isPlayerRole(group.role);
      const isAnnualTourGroup = isAnnualTourRole(group.role);
      const isPlayerLikeGroup = isPlayerLikeRole(group.role);
      const usesLocationPerDiemRates = isPlanningGroup || isWhiteCellGroup;
      const usesPlayerPerDiemRates = isPlayerLikeGroup;
      const allowsTravelOnly = isPlanningGroup || isSupportRole(group.role);
      const usesEntryLevelRental = (isPlanningGroup || isWhiteCellGroup) && (group.personnelEntries || []).length > 0;
      const hasLegacyGroupRental = (group.rentalCarCount || 0) > 0 || (group.rentalCarDays || 0) > 0;
      const groupRentalCost = (group.rentalCarCount || 0) * travel.rentalCarDailyRate * (group.rentalCarDays || 0);

      for (const entry of entries) {
        const entryCount = Number(entry.count || 0);
        if (entryCount <= 0) continue;

        const entryDays = resolvePersonnelDutyDays(exercise, group, entry, defaultDays);
        const entryLocation = String(entry.location ?? group.location ?? 'FORT_HUNTER_LIGGETT').trim() || 'FORT_HUNTER_LIGGETT';
        const entryIsLocal = isLocalFlag(entry.isLocal) || isLocalFlag(group.isLocal);
        const entryTravelOnly = allowsTravelOnly && isTravelOnlyFlag(entry.travelOnly);
        const entryRentalCarCount = isPlanningGroup
          ? (Math.max(0, Number(entry.rentalCarCount || 0)) > 0 ? 1 : 0)
          : Math.max(0, Number(entry.rentalCarCount || 0));
        const perDiemRates = rates.perDiemRates[entryLocation] || { lodging: 0, mie: 0 };
        const resolvedRange = resolvePersonnelDateRange(exercise, group, entry, defaultDays);
        if (resolvedRange?.usedFallback) {
          fallbackDateUsage.personnelEntries += 1;
        }

        const milPay = !entryTravelOnly
          ? calcMilPay(group, { rankCode: entry.rankCode || null, count: entryCount }, rates, entryDays)
          : 0;
        const locationPerDiem = (!entryIsLocal && usesLocationPerDiemRates)
          ? entryCount * (perDiemRates.lodging + perDiemRates.mie) * entryDays
          : 0;
        const playerPerDiem = (!entryIsLocal && usesPlayerPerDiemRates)
          ? entryCount * rates.playerPerDiemPerDay * entryDays
          : 0;
        const airfare = !entryIsLocal ? entryCount * travel.airfarePerPerson : 0;
        const rental = entryRentalCarCount > 0 ? entryRentalCarCount * travel.rentalCarDailyRate * entryDays : 0;
        const meals = (fundingType === 'RPA' && isPlayerLikeGroup)
          ? entryCount * mealsPerDay * entryDays
          : 0;
        const billeting = (!entryIsLocal && isPlayerLikeGroup)
          ? entryCount * rates.playerBilletingPerNight * entryDays
          : 0;

        if (fundingType === 'RPA' && (isPlanningGroup || isWhiteCellGroup || isPlayerGroup)) {
          allocateAmount(totalsByBucket, buckets, resolvedRange, 'rpaMilPay', milPay);
          allocateAmount(
            totalsByBucket,
            buckets,
            resolvedRange,
            'rpaTravelAndPerDiem',
            locationPerDiem + playerPerDiem + airfare + rental,
          );
          if (isPlayerGroup) {
            allocateAmount(totalsByBucket, buckets, resolvedRange, 'rpaMeals', meals);
            allocateAmount(totalsByBucket, buckets, resolvedRange, 'omBilleting', billeting);
          }
        } else if (fundingType === 'RPA' && isAnnualTourGroup) {
          allocateAmount(
            totalsByBucket,
            buckets,
            resolvedRange,
            'annualTour',
            milPay + playerPerDiem + airfare,
          );
          allocateAmount(totalsByBucket, buckets, resolvedRange, 'rpaMeals', meals);
          allocateAmount(totalsByBucket, buckets, resolvedRange, 'omBilleting', billeting);
        } else if (fundingType === 'OM' && isPlanningGroup) {
          allocateAmount(
            totalsByBucket,
            buckets,
            resolvedRange,
            'omTravel',
            locationPerDiem + airfare + rental,
          );
        } else if (fundingType === 'OM' && isWhiteCellGroup) {
          allocateAmount(
            totalsByBucket,
            buckets,
            resolvedRange,
            'omTravel',
            locationPerDiem + airfare + rental,
          );
        } else if (fundingType === 'OM' && isPlayerLikeGroup) {
          allocateAmount(
            totalsByBucket,
            buckets,
            resolvedRange,
            'omTravel',
            playerPerDiem + airfare,
          );
          allocateAmount(totalsByBucket, buckets, resolvedRange, 'omBilleting', billeting);
        }
      }

      if (hasLegacyGroupRental && !usesEntryLevelRental) {
        const legacyRentalCategoryKey = fundingType === 'OM'
          ? 'omTravel'
          : 'rpaTravelAndPerDiem';

        const shouldAllocateLegacyRental = fundingType === 'OM'
          ? true
          : entries.some((entry) => !isLocalFlag(entry.isLocal) && (fundingType === 'RPA'));

        if (shouldAllocateLegacyRental && groupRentalCost > 0) {
          addLegacyRentalAllocation({
            exercise,
            group,
            buckets,
            totalsByBucket,
            defaultDays,
            categoryKey: legacyRentalCategoryKey,
            amount: groupRentalCost,
          });
        }
      }
    }

    for (const line of unitBudget.executionCostLines || []) {
      const resolvedRange = resolveCostLineDateRange(line, exercise);
      if (resolvedRange?.usedFallback) {
        fallbackDateUsage.executionCostLines += 1;
      }

      allocateAmount(
        totalsByBucket,
        buckets,
        resolvedRange,
        getFundingType(line.fundingType) === 'RPA'
          ? 'rpaTravelAndPerDiem'
          : getExecutionOmCategoryKey(line.category),
        Number(line.amount || 0),
      );
    }
  }

  for (const line of exercise.omCostLines || []) {
    const resolvedRange = resolveCostLineDateRange(line, exercise);
    if (resolvedRange?.usedFallback) {
      fallbackDateUsage.exerciseOmCostLines += 1;
    }
    allocateAmount(
      totalsByBucket,
      buckets,
      resolvedRange,
      getExerciseOmCategoryKey(line.category),
      Number(line.amount || 0),
    );
  }

  for (const bucket of buckets) {
    totalsByBucket[bucket.key] = finalizeTotals(totalsByBucket[bucket.key]);
  }

  return {
    buckets,
    totalsByBucket,
    fallbackDateUsage,
  };
}
