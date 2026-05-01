import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { calculateBudget, RateInputs } from '../services/calculationEngine';
import { getRequestUserId } from '../services/auth';
import * as XLSX from 'xlsx';

const router = Router();

type RefinementStatus = 'IN_PROGRESS' | 'COMPLETE';

type RefinementItem = {
  id: string;
  improvementNote: string;
  requestor: string;
  status: RefinementStatus;
  statusNote: string;
};

type ExpenseNarrativeItem = {
  expenseKey: string;
  expenseLabel: string;
  justification: string;
  impact: string;
};

type QuarterlySnapshotDates = {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
};

type PlanningConferenceKey = 'initial' | 'mid' | 'final';

type PlanningConferenceDateRange = {
  startDate: string;
  endDate: string;
};

type PlanningConferenceDates = Record<PlanningConferenceKey, PlanningConferenceDateRange>;

type ExerciseTemplate = 'PATRIOT_MEDIC' | 'PATRIOT_PHOENIX' | 'PATRIOT_FORGE';

const DEFAULT_EXERCISE_TEMPLATE: ExerciseTemplate = 'PATRIOT_MEDIC';
const VALID_EXERCISE_TEMPLATES = new Set<ExerciseTemplate>([
  'PATRIOT_MEDIC',
  'PATRIOT_PHOENIX',
  'PATRIOT_FORGE',
]);

const EMPTY_QUARTERLY_SNAPSHOTS: QuarterlySnapshotDates = {
  q1: '',
  q2: '',
  q3: '',
  q4: '',
};

const EMPTY_PLANNING_CONFERENCE_DATES: PlanningConferenceDates = {
  initial: { startDate: '', endDate: '' },
  mid: { startDate: '', endDate: '' },
  final: { startDate: '', endDate: '' },
};

function normalizeExerciseTemplate(value: unknown): ExerciseTemplate {
  const normalized = String(value || '').trim().toUpperCase() as ExerciseTemplate;
  return VALID_EXERCISE_TEMPLATES.has(normalized) ? normalized : DEFAULT_EXERCISE_TEMPLATE;
}

function normalizeQuarterlySnapshotsInput(value: unknown): QuarterlySnapshotDates {
  const candidate = value && typeof value === 'object' ? value as Partial<Record<keyof QuarterlySnapshotDates, unknown>> : {};

  return {
    q1: String(candidate.q1 ?? '').trim(),
    q2: String(candidate.q2 ?? '').trim(),
    q3: String(candidate.q3 ?? '').trim(),
    q4: String(candidate.q4 ?? '').trim(),
  };
}

function normalizePlanningConferenceDateRangeInput(value: unknown): PlanningConferenceDateRange {
  const candidate = value && typeof value === 'object'
    ? value as Partial<Record<keyof PlanningConferenceDateRange, unknown>>
    : {};

  return {
    startDate: String(candidate.startDate ?? '').trim(),
    endDate: String(candidate.endDate ?? '').trim(),
  };
}

function normalizePlanningConferenceDatesInput(value: unknown): PlanningConferenceDates {
  const candidate = value && typeof value === 'object'
    ? value as Partial<Record<PlanningConferenceKey, unknown>>
    : {};

  return {
    initial: normalizePlanningConferenceDateRangeInput(candidate.initial),
    mid: normalizePlanningConferenceDateRangeInput(candidate.mid),
    final: normalizePlanningConferenceDateRangeInput(candidate.final),
  };
}

function parseQuarterlySnapshotsJson(value: unknown): QuarterlySnapshotDates {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ...EMPTY_QUARTERLY_SNAPSHOTS };
  }

  try {
    return normalizeQuarterlySnapshotsInput(JSON.parse(value));
  } catch {
    return { ...EMPTY_QUARTERLY_SNAPSHOTS };
  }
}

function parsePlanningConferenceDatesJson(value: unknown): PlanningConferenceDates {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      initial: { ...EMPTY_PLANNING_CONFERENCE_DATES.initial },
      mid: { ...EMPTY_PLANNING_CONFERENCE_DATES.mid },
      final: { ...EMPTY_PLANNING_CONFERENCE_DATES.final },
    };
  }

  try {
    return normalizePlanningConferenceDatesInput(JSON.parse(value));
  } catch {
    return {
      initial: { ...EMPTY_PLANNING_CONFERENCE_DATES.initial },
      mid: { ...EMPTY_PLANNING_CONFERENCE_DATES.mid },
      final: { ...EMPTY_PLANNING_CONFERENCE_DATES.final },
    };
  }
}

function parseOptionalDateField(value: unknown): Date | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeUnitCodeInput(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function normalizeUnitDisplayNameInput(value: unknown): string | null {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized ? normalized : null;
}

function createFallbackRefinementId(index: number): string {
  return `refinement-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeRefinementsInput(value: unknown): RefinementItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const improvementNote = String(candidate.improvementNote ?? '');
      const requestor = String(candidate.requestor ?? '');
      const statusNote = String(candidate.statusNote ?? '');

      const rawId = String(candidate.id || '').trim();
      return {
        id: rawId || createFallbackRefinementId(index),
        improvementNote,
        requestor,
        status: String(candidate.status || '').toUpperCase() === 'COMPLETE' ? 'COMPLETE' : 'IN_PROGRESS',
        statusNote,
      } satisfies RefinementItem;
    })
    .filter((item): item is RefinementItem => item !== null);
}

function parseRefinementsJson(value: unknown): RefinementItem[] {
  if (typeof value !== 'string' || value.trim().length === 0) return [];

  try {
    return normalizeRefinementsInput(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizeExpenseNarrativesInput(value: unknown): ExpenseNarrativeItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const expenseKey = String(candidate.expenseKey ?? '').trim();
      if (!expenseKey) return null;

      return {
        expenseKey,
        expenseLabel: String(candidate.expenseLabel ?? expenseKey).trim(),
        justification: String(candidate.justification ?? ''),
        impact: String(candidate.impact ?? ''),
      } satisfies ExpenseNarrativeItem;
    })
    .filter((item): item is ExpenseNarrativeItem => item !== null);
}

function parseExpenseNarrativesJson(value: unknown): ExpenseNarrativeItem[] {
  if (typeof value !== 'string' || value.trim().length === 0) return [];

  try {
    return normalizeExpenseNarrativesInput(JSON.parse(value));
  } catch {
    return [];
  }
}

function serializeExercise<T extends { refinementsJson?: string | null }>(exercise: T | null) {
  if (!exercise) return exercise;

  const { refinementsJson, expenseNarrativesJson, planningConferenceDatesJson, quarterlySnapshotsJson, ...rest } = exercise as T & {
    refinementsJson?: string | null;
    expenseNarrativesJson?: string | null;
    planningConferenceDatesJson?: string | null;
    quarterlySnapshotsJson?: string | null;
  };
  return {
    ...rest,
    refinements: parseRefinementsJson(refinementsJson),
    expenseNarratives: parseExpenseNarrativesJson(expenseNarrativesJson),
    planningConferenceDates: parsePlanningConferenceDatesJson(planningConferenceDatesJson),
    quarterlySnapshots: parseQuarterlySnapshotsJson(quarterlySnapshotsJson),
  };
}

// Helper: load rates from DB
async function loadRates(): Promise<RateInputs> {
  const cpdRows = await prisma.rankCpdRate.findMany();
  const pdRows = await prisma.perDiemRate.findMany();
  const configs = await prisma.appConfig.findMany();
  const cfg = Object.fromEntries(configs.map((c) => [c.key, parseFloat(c.value)]));

  return {
    cpdRates: Object.fromEntries(cpdRows.map((r) => [r.rankCode, r.costPerDay])),
    perDiemRates: Object.fromEntries(pdRows.map((r) => [r.location, { lodging: r.lodgingRate, mie: r.mieRate }])),
    mealRates: {
      breakfast: cfg['BREAKFAST_COST'] || 14,
      lunchMre: cfg['LUNCH_MRE_COST'] || 15.91,
      dinner: cfg['DINNER_COST'] || 14,
    },
    playerBilletingPerNight: cfg['PLAYER_BILLETING_NIGHT'] || 27,
    playerPerDiemPerDay: cfg['PLAYER_PER_DIEM_PER_DAY'] || cfg['FIELD_CONDITIONS_PER_DIEM'] || 5,
    defaultAirfare: cfg['DEFAULT_AIRFARE'] || 400,
    defaultRentalCarDailyRate: cfg['DEFAULT_RENTAL_CAR_DAILY'] || 50,
  };
}

async function loadTravelDefaults(): Promise<{ airfarePerPerson: number; rentalCarDailyRate: number }> {
  const configs = await prisma.appConfig.findMany({
    where: {
      key: {
        in: ['DEFAULT_AIRFARE', 'DEFAULT_RENTAL_CAR_DAILY'],
      },
    },
  });
  const cfg = Object.fromEntries(configs.map((c) => [c.key, parseFloat(c.value)]));
  return {
    airfarePerPerson: cfg['DEFAULT_AIRFARE'] || 400,
    rentalCarDailyRate: cfg['DEFAULT_RENTAL_CAR_DAILY'] || 50,
  };
}

function shouldCreateAnnualTourGroup(unitCode: string): boolean {
  return ['SG', 'AE', 'CAB'].includes(String(unitCode || '').trim().toUpperCase());
}

async function consolidateAnnualTourGroups(groups: Array<{
  id: string;
  paxCount: number;
}>): Promise<void> {
  if (groups.length <= 1) return;

  const [primaryGroup, ...duplicateGroups] = groups;
  const duplicateGroupIds = duplicateGroups.map((group) => group.id);
  if (duplicateGroupIds.length === 0) return;

  const fallbackPaxCount = groups.reduce((sum, group) => sum + (group.paxCount || 0), 0);

  await prisma.$transaction(async (tx) => {
    await tx.personnelEntry.updateMany({
      where: {
        personnelGroupId: {
          in: duplicateGroupIds,
        },
      },
      data: {
        personnelGroupId: primaryGroup.id,
      },
    });

    const mergedEntryCounts = await tx.personnelEntry.aggregate({
      where: { personnelGroupId: primaryGroup.id },
      _sum: { count: true },
    });

    await tx.personnelGroup.update({
      where: { id: primaryGroup.id },
      data: {
        paxCount: mergedEntryCounts._sum.count ?? fallbackPaxCount,
      },
    });

    await tx.personnelGroup.deleteMany({
      where: {
        id: {
          in: duplicateGroupIds,
        },
      },
    });
  });
}

// Helper: load full exercise with all relations
async function loadFullExercise(id: string) {
  return prisma.exercise.findUnique({
    where: { id },
    include: {
      unitBudgets: {
        include: {
          personnelGroups: { include: { personnelEntries: true } },
          executionCostLines: true,
        },
      },
      travelConfig: true,
      omCostLines: true,
    },
  });
}

async function loadOwnedExercise(id: string, ownerUserId: string) {
  await ensurePlanningGroups(id);
  const exercise = await loadFullExercise(id);
  if (!exercise) return null;
  if (exercise.ownerUserId !== ownerUserId) return null;
  return exercise;
}

async function ensurePlanningGroups(exerciseId: string): Promise<void> {
  const unitBudgets = await prisma.unitBudget.findMany({
    where: { exerciseId },
    include: { personnelGroups: true },
  });

  for (const unitBudget of unitBudgets) {
    const normalizedUnitCode = String(unitBudget.unitCode || '').trim().toUpperCase();
    const hasPlanningRpa = unitBudget.personnelGroups.some((group) => group.role === 'PLANNING' && group.fundingType === 'RPA');
    const hasPlanningOm = unitBudget.personnelGroups.some((group) => group.role === 'PLANNING' && group.fundingType === 'OM');
    const annualTourGroups = unitBudget.personnelGroups.filter((group) => group.role === 'ANNUAL_TOUR' && group.fundingType === 'RPA');
    const hasAnnualTourRpa = annualTourGroups.length > 0;

    if (annualTourGroups.length > 1) {
      await consolidateAnnualTourGroups(annualTourGroups);
    }

    if (!hasPlanningRpa) {
      await prisma.personnelGroup.create({
        data: {
          unitBudgetId: unitBudget.id,
          role: 'PLANNING',
          fundingType: 'RPA',
          location: 'FORT_HUNTER_LIGGETT',
        },
      });
    }

    if (!hasPlanningOm) {
      await prisma.personnelGroup.create({
        data: {
          unitBudgetId: unitBudget.id,
          role: 'PLANNING',
          fundingType: 'OM',
          location: 'FORT_HUNTER_LIGGETT',
        },
      });
    }

    if (shouldCreateAnnualTourGroup(normalizedUnitCode) && !hasAnnualTourRpa) {
      await prisma.personnelGroup.create({
        data: {
          unitBudgetId: unitBudget.id,
          role: 'ANNUAL_TOUR',
          fundingType: 'RPA',
          location: 'FORT_HUNTER_LIGGETT',
        },
      });
    }
  }
}

// Helper: seed default unit budgets and personnel groups for a new exercise
async function seedExerciseDefaults(exerciseId: string) {
  const travelDefaults = await loadTravelDefaults();
  const units: Array<{ code: 'SG' | 'AE' | 'CAB' | 'A7' }> = [
    { code: 'SG' },
    { code: 'AE' },
    { code: 'CAB' },
    { code: 'A7' },
  ];

  for (const u of units) {
    const ub = await prisma.unitBudget.create({
      data: { exerciseId, unitCode: u.code },
    });

    if (u.code === 'A7') {
      // A7 gets Planning + Support instead of Player + WhiteCell
      const groups = [
        { role: 'PLANNING' as const, fundingType: 'RPA' as const },
        { role: 'PLANNING' as const, fundingType: 'OM' as const },
        { role: 'SUPPORT' as const, fundingType: 'RPA' as const },
        { role: 'SUPPORT' as const, fundingType: 'OM' as const },
      ];
      for (const g of groups) {
        await prisma.personnelGroup.create({
          data: { unitBudgetId: ub.id, role: g.role, fundingType: g.fundingType, location: 'FORT_HUNTER_LIGGETT' },
        });
      }
    } else {
      const groups = [
        { role: 'PLANNING' as const, fundingType: 'RPA' as const },
        { role: 'PLANNING' as const, fundingType: 'OM' as const },
        { role: 'PLAYER' as const, fundingType: 'RPA' as const },
        { role: 'PLAYER' as const, fundingType: 'OM' as const },
        { role: 'WHITE_CELL' as const, fundingType: 'RPA' as const },
        { role: 'WHITE_CELL' as const, fundingType: 'OM' as const },
        ...(shouldCreateAnnualTourGroup(u.code)
          ? [{ role: 'ANNUAL_TOUR' as const, fundingType: 'RPA' as const }]
          : []),
      ];
      for (const g of groups) {
        await prisma.personnelGroup.create({
          data: { unitBudgetId: ub.id, role: g.role, fundingType: g.fundingType, location: 'FORT_HUNTER_LIGGETT' },
        });
      }
    }
  }

  // Default travel config
  await prisma.travelConfig.create({
    data: {
      exerciseId,
      airfarePerPerson: travelDefaults.airfarePerPerson,
      rentalCarDailyRate: travelDefaults.rentalCarDailyRate,
      rentalCarCount: 0,
      rentalCarDays: 0,
    },
  });
}

// ─── LIST EXERCISES ───
router.get('/', async (_req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(_req);
    const exercises = await prisma.exercise.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(exercises.map((exercise) => serializeExercise(exercise)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CREATE EXERCISE ───
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const {
      name,
      startDate,
      endDate,
      defaultDutyDays,
      totalBudget,
      exerciseTemplate,
      planningConferenceDates,
      quarterlySnapshots,
      reportAssumption1,
      reportAssumption2,
      reportAssumption3,
      reportAssumption4,
      reportLimfac1,
      reportLimfac2,
      reportLimfac3,
      reportPreparedBy,
      refinements,
      expenseNarratives,
    } = req.body;
    const parsedTotalBudget = Number(totalBudget);
    const exercise = await prisma.exercise.create({
      data: {
        ownerUserId: userId,
        name,
        exerciseTemplate: normalizeExerciseTemplate(exerciseTemplate),
        planningConferenceDatesJson: JSON.stringify(normalizePlanningConferenceDatesInput(planningConferenceDates)),
        quarterlySnapshotsJson: JSON.stringify(normalizeQuarterlySnapshotsInput(quarterlySnapshots)),
        totalBudget: Number.isFinite(parsedTotalBudget) ? parsedTotalBudget : 0,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        defaultDutyDays: defaultDutyDays || 14,
        reportAssumption1: String(reportAssumption1 ?? ''),
        reportAssumption2: String(reportAssumption2 ?? ''),
        reportAssumption3: String(reportAssumption3 ?? ''),
        reportAssumption4: String(reportAssumption4 ?? ''),
        reportLimfac1: String(reportLimfac1 ?? ''),
        reportLimfac2: String(reportLimfac2 ?? ''),
        reportLimfac3: String(reportLimfac3 ?? ''),
        reportPreparedBy: String(reportPreparedBy ?? ''),
        ...(refinements !== undefined ? { refinementsJson: JSON.stringify(normalizeRefinementsInput(refinements)) } : {}),
        ...(expenseNarratives !== undefined ? { expenseNarrativesJson: JSON.stringify(normalizeExpenseNarrativesInput(expenseNarratives)) } : {}),
      },
    });
    await seedExerciseDefaults(exercise.id);
    const full = await loadFullExercise(exercise.id);
    res.status(201).json(serializeExercise(full));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET EXERCISE (full detail) ───
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const exercise = await loadOwnedExercise(req.params.id, userId);
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
    res.json(serializeExercise(exercise));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE EXERCISE ───
router.post('/:id/copy', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const sourceExercise = await loadOwnedExercise(req.params.id, userId);
    if (!sourceExercise) return res.status(404).json({ error: 'Exercise not found' });

    const copiedExercise = await prisma.$transaction(async (tx) => {
      const createdExercise = await tx.exercise.create({
        data: {
          ownerUserId: userId,
          name: `${sourceExercise.name}_Copy`,
          exerciseTemplate: normalizeExerciseTemplate(sourceExercise.exerciseTemplate),
          planningConferenceDatesJson: String(sourceExercise.planningConferenceDatesJson ?? '{}'),
          quarterlySnapshotsJson: String(sourceExercise.quarterlySnapshotsJson ?? '{}'),
          totalBudget: Number(sourceExercise.totalBudget || 0),
          startDate: sourceExercise.startDate,
          endDate: sourceExercise.endDate,
          defaultDutyDays: Math.max(1, Number(sourceExercise.defaultDutyDays || 1)),
          reportAssumption1: String(sourceExercise.reportAssumption1 ?? ''),
          reportAssumption2: String(sourceExercise.reportAssumption2 ?? ''),
          reportAssumption3: String(sourceExercise.reportAssumption3 ?? ''),
          reportAssumption4: String(sourceExercise.reportAssumption4 ?? ''),
          reportLimfac1: String(sourceExercise.reportLimfac1 ?? ''),
          reportLimfac2: String(sourceExercise.reportLimfac2 ?? ''),
          reportLimfac3: String(sourceExercise.reportLimfac3 ?? ''),
          reportPreparedBy: String(sourceExercise.reportPreparedBy ?? ''),
          refinementsJson: String(sourceExercise.refinementsJson ?? '[]'),
          expenseNarrativesJson: String(sourceExercise.expenseNarrativesJson ?? '[]'),
        },
      });

      for (const unitBudget of sourceExercise.unitBudgets || []) {
        await tx.unitBudget.create({
          data: {
            exerciseId: createdExercise.id,
            unitCode: unitBudget.unitCode,
            unitDisplayName: normalizeUnitDisplayNameInput(unitBudget.unitDisplayName),
            executionCostLines: {
              create: (unitBudget.executionCostLines || []).map((line) => ({
                fundingType: line.fundingType,
                category: line.category,
                amount: Number(line.amount || 0),
                startDate: line.startDate == null ? null : line.startDate,
                endDate: line.endDate == null ? null : line.endDate,
                notes: line.notes,
              })),
            },
            personnelGroups: {
              create: (unitBudget.personnelGroups || []).map((group) => ({
                role: group.role,
                fundingType: group.fundingType,
                paxCount: Math.max(0, Number(group.paxCount || 0)),
                dutyDays: group.dutyDays == null ? null : Math.max(0, Number(group.dutyDays || 0)),
                location: group.location,
                isLongTour: !!group.isLongTour,
                isLocal: !!group.isLocal,
                airfarePerPerson: group.airfarePerPerson == null ? null : Number(group.airfarePerPerson),
                rentalCarCount: Math.max(0, Number(group.rentalCarCount || 0)),
                rentalCarDaily: group.rentalCarDaily == null ? null : Number(group.rentalCarDaily),
                rentalCarDays: Math.max(0, Number(group.rentalCarDays || 0)),
                avgCpdOverride: group.avgCpdOverride == null ? null : Number(group.avgCpdOverride),
                personnelEntries: {
                  create: (group.personnelEntries || []).map((entry) => ({
                    rankCode: entry.rankCode,
                    count: Math.max(0, Number(entry.count || 0)),
                    dutyDays: entry.dutyDays == null ? null : Math.max(0, Number(entry.dutyDays || 0)),
                    startDate: entry.startDate == null ? null : entry.startDate,
                    endDate: entry.endDate == null ? null : entry.endDate,
                    rentalCarCount: Math.max(0, Number(entry.rentalCarCount || 0)),
                    location: entry.location,
                    isLocal: !!entry.isLocal,
                    note: entry.note,
                    travelOnly: !!entry.travelOnly,
                    longTermA7Planner: !!entry.longTermA7Planner,
                  })),
                },
              })),
            },
          },
        });
      }

      if (sourceExercise.travelConfig) {
        await tx.travelConfig.create({
          data: {
            exerciseId: createdExercise.id,
            airfarePerPerson: Number(sourceExercise.travelConfig.airfarePerPerson || 0),
            rentalCarDailyRate: Number(sourceExercise.travelConfig.rentalCarDailyRate || 0),
            rentalCarCount: Math.max(0, Number(sourceExercise.travelConfig.rentalCarCount || 0)),
            rentalCarDays: Math.max(0, Number(sourceExercise.travelConfig.rentalCarDays || 0)),
          },
        });
      }

      if ((sourceExercise.omCostLines || []).length > 0) {
        await tx.omCostLine.createMany({
          data: sourceExercise.omCostLines.map((line) => ({
            exerciseId: createdExercise.id,
            category: line.category,
            label: line.label,
            amount: Number(line.amount || 0),
            startDate: line.startDate == null ? null : line.startDate,
            endDate: line.endDate == null ? null : line.endDate,
            notes: line.notes,
          })),
        });
      }

      return createdExercise;
    });

    const full = await loadFullExercise(copiedExercise.id);
    res.status(201).json(serializeExercise(full));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerUserId: userId } });
    if (!existing) return res.status(404).json({ error: 'Exercise not found' });

    const {
      name,
      startDate,
      endDate,
      defaultDutyDays,
      totalBudget,
      exerciseTemplate,
      planningConferenceDates,
      quarterlySnapshots,
      reportAssumption1,
      reportAssumption2,
      reportAssumption3,
      reportAssumption4,
      reportLimfac1,
      reportLimfac2,
      reportLimfac3,
      reportPreparedBy,
      refinements,
      expenseNarratives,
    } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (exerciseTemplate !== undefined) data.exerciseTemplate = normalizeExerciseTemplate(exerciseTemplate);
    if (planningConferenceDates !== undefined) data.planningConferenceDatesJson = JSON.stringify(normalizePlanningConferenceDatesInput(planningConferenceDates));
    if (quarterlySnapshots !== undefined) data.quarterlySnapshotsJson = JSON.stringify(normalizeQuarterlySnapshotsInput(quarterlySnapshots));
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (defaultDutyDays !== undefined) data.defaultDutyDays = defaultDutyDays;
    if (reportAssumption1 !== undefined) data.reportAssumption1 = String(reportAssumption1);
    if (reportAssumption2 !== undefined) data.reportAssumption2 = String(reportAssumption2);
    if (reportAssumption3 !== undefined) data.reportAssumption3 = String(reportAssumption3);
    if (reportAssumption4 !== undefined) data.reportAssumption4 = String(reportAssumption4);
    if (reportLimfac1 !== undefined) data.reportLimfac1 = String(reportLimfac1);
    if (reportLimfac2 !== undefined) data.reportLimfac2 = String(reportLimfac2);
    if (reportLimfac3 !== undefined) data.reportLimfac3 = String(reportLimfac3);
    if (reportPreparedBy !== undefined) data.reportPreparedBy = String(reportPreparedBy);
    if (refinements !== undefined) data.refinementsJson = JSON.stringify(normalizeRefinementsInput(refinements));
    if (expenseNarratives !== undefined) data.expenseNarrativesJson = JSON.stringify(normalizeExpenseNarrativesInput(expenseNarratives));
    if (totalBudget !== undefined) {
      const parsedTotalBudget = Number(totalBudget);
      if (!Number.isFinite(parsedTotalBudget)) {
        return res.status(400).json({ error: 'Total budget must be a valid number' });
      }
      data.totalBudget = parsedTotalBudget;
    }
    const exercise = await prisma.exercise.update({ where: { id: req.params.id }, data });
    res.json(serializeExercise(exercise));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE EXERCISE ───
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerUserId: userId } });
    if (!existing) return res.status(404).json({ error: 'Exercise not found' });
    await prisma.exercise.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE TRAVEL CONFIG ───
router.put('/:id/restore', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerUserId: userId } });
    if (!existing) return res.status(404).json({ error: 'Exercise not found' });

    const snapshot = req.body as {
      exercise?: Record<string, unknown>;
      budgetTargets?: Record<string, unknown>;
    };
    const sourceExercise = snapshot?.exercise;
    if (!sourceExercise || typeof sourceExercise !== 'object') {
      return res.status(400).json({ error: 'Exercise snapshot is required' });
    }

    const sourceUnitBudgets = Array.isArray(sourceExercise.unitBudgets) ? sourceExercise.unitBudgets as Array<Record<string, unknown>> : [];
    const sourceOmCostLines = Array.isArray(sourceExercise.omCostLines) ? sourceExercise.omCostLines as Array<Record<string, unknown>> : [];
    const sourceTravelConfig = sourceExercise.travelConfig && typeof sourceExercise.travelConfig === 'object'
      ? sourceExercise.travelConfig as Record<string, unknown>
      : null;
    const budgetTargets = snapshot?.budgetTargets && typeof snapshot.budgetTargets === 'object'
      ? snapshot.budgetTargets
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.exercise.update({
        where: { id: req.params.id },
        data: {
          name: String(sourceExercise.name || existing.name),
          exerciseTemplate: normalizeExerciseTemplate(sourceExercise.exerciseTemplate),
          planningConferenceDatesJson: JSON.stringify(normalizePlanningConferenceDatesInput(sourceExercise.planningConferenceDates)),
          quarterlySnapshotsJson: JSON.stringify(normalizeQuarterlySnapshotsInput(sourceExercise.quarterlySnapshots)),
          totalBudget: Number.isFinite(Number(sourceExercise.totalBudget)) ? Number(sourceExercise.totalBudget) : 0,
          startDate: new Date(String(sourceExercise.startDate || existing.startDate)),
          endDate: new Date(String(sourceExercise.endDate || existing.endDate)),
          defaultDutyDays: Math.max(1, Number(sourceExercise.defaultDutyDays || existing.defaultDutyDays || 1)),
          reportAssumption1: String(sourceExercise.reportAssumption1 ?? ''),
          reportAssumption2: String(sourceExercise.reportAssumption2 ?? ''),
          reportAssumption3: String(sourceExercise.reportAssumption3 ?? ''),
          reportAssumption4: String(sourceExercise.reportAssumption4 ?? ''),
          reportLimfac1: String(sourceExercise.reportLimfac1 ?? ''),
          reportLimfac2: String(sourceExercise.reportLimfac2 ?? ''),
          reportLimfac3: String(sourceExercise.reportLimfac3 ?? ''),
          reportPreparedBy: String(sourceExercise.reportPreparedBy ?? ''),
          refinementsJson: JSON.stringify(normalizeRefinementsInput(sourceExercise.refinements)),
          expenseNarrativesJson: JSON.stringify(normalizeExpenseNarrativesInput(sourceExercise.expenseNarratives)),
        },
      });

      await tx.omCostLine.deleteMany({ where: { exerciseId: req.params.id } });
      await tx.travelConfig.deleteMany({ where: { exerciseId: req.params.id } });
      await tx.unitBudget.deleteMany({ where: { exerciseId: req.params.id } });

      for (const sourceUnitBudget of sourceUnitBudgets) {
        const createdUnitBudget = await tx.unitBudget.create({
          data: {
            exerciseId: req.params.id,
            unitCode: String(sourceUnitBudget.unitCode || '').trim().toUpperCase(),
            unitDisplayName: normalizeUnitDisplayNameInput(sourceUnitBudget.unitDisplayName),
          },
        });

        const sourcePersonnelGroups = Array.isArray(sourceUnitBudget.personnelGroups)
          ? sourceUnitBudget.personnelGroups as Array<Record<string, unknown>>
          : [];
        const sourceExecutionCostLines = Array.isArray(sourceUnitBudget.executionCostLines)
          ? sourceUnitBudget.executionCostLines as Array<Record<string, unknown>>
          : [];

        for (const sourcePersonnelGroup of sourcePersonnelGroups) {
          const createdPersonnelGroup = await tx.personnelGroup.create({
            data: {
              unitBudgetId: createdUnitBudget.id,
              role: String(sourcePersonnelGroup.role || ''),
              fundingType: String(sourcePersonnelGroup.fundingType || ''),
              paxCount: Math.max(0, Number(sourcePersonnelGroup.paxCount || 0)),
              dutyDays: sourcePersonnelGroup.dutyDays == null ? null : Math.max(0, Number(sourcePersonnelGroup.dutyDays || 0)),
              location: sourcePersonnelGroup.location == null ? null : String(sourcePersonnelGroup.location || ''),
              isLongTour: !!sourcePersonnelGroup.isLongTour,
              isLocal: !!sourcePersonnelGroup.isLocal,
              airfarePerPerson: sourcePersonnelGroup.airfarePerPerson == null ? null : Number(sourcePersonnelGroup.airfarePerPerson),
              rentalCarCount: Math.max(0, Number(sourcePersonnelGroup.rentalCarCount || 0)),
              rentalCarDaily: sourcePersonnelGroup.rentalCarDaily == null ? null : Number(sourcePersonnelGroup.rentalCarDaily),
              rentalCarDays: Math.max(0, Number(sourcePersonnelGroup.rentalCarDays || 0)),
              avgCpdOverride: sourcePersonnelGroup.avgCpdOverride == null ? null : Number(sourcePersonnelGroup.avgCpdOverride),
            },
          });

          const sourcePersonnelEntries = Array.isArray(sourcePersonnelGroup.personnelEntries)
            ? sourcePersonnelGroup.personnelEntries as Array<Record<string, unknown>>
            : [];

          for (const sourcePersonnelEntry of sourcePersonnelEntries) {
            await tx.personnelEntry.create({
              data: {
                personnelGroupId: createdPersonnelGroup.id,
                rankCode: String(sourcePersonnelEntry.rankCode || ''),
                count: Math.max(0, Number(sourcePersonnelEntry.count || 0)),
                dutyDays: sourcePersonnelEntry.dutyDays == null ? null : Math.max(0, Number(sourcePersonnelEntry.dutyDays || 0)),
                startDate: parseOptionalDateField(sourcePersonnelEntry.startDate),
                endDate: parseOptionalDateField(sourcePersonnelEntry.endDate),
                rentalCarCount: Math.max(0, Number(sourcePersonnelEntry.rentalCarCount || 0)),
                location: sourcePersonnelEntry.location == null ? null : String(sourcePersonnelEntry.location || ''),
                isLocal: !!sourcePersonnelEntry.isLocal,
                note: sourcePersonnelEntry.note == null ? null : String(sourcePersonnelEntry.note || ''),
                travelOnly: !!sourcePersonnelEntry.travelOnly,
                longTermA7Planner: !!sourcePersonnelEntry.longTermA7Planner,
              },
            });
          }
        }

        for (const sourceExecutionCostLine of sourceExecutionCostLines) {
          await tx.executionCostLine.create({
            data: {
              unitBudgetId: createdUnitBudget.id,
              fundingType: String(sourceExecutionCostLine.fundingType || ''),
              category: String(sourceExecutionCostLine.category || ''),
              amount: Number(sourceExecutionCostLine.amount || 0),
              startDate: parseOptionalDateField(sourceExecutionCostLine.startDate),
              endDate: parseOptionalDateField(sourceExecutionCostLine.endDate),
              notes: sourceExecutionCostLine.notes == null ? null : String(sourceExecutionCostLine.notes || ''),
            },
          });
        }
      }

      if (sourceTravelConfig) {
        await tx.travelConfig.create({
          data: {
            exerciseId: req.params.id,
            airfarePerPerson: Number(sourceTravelConfig.airfarePerPerson || 0),
            rentalCarDailyRate: Number(sourceTravelConfig.rentalCarDailyRate || 0),
            rentalCarCount: Math.max(0, Number(sourceTravelConfig.rentalCarCount || 0)),
            rentalCarDays: Math.max(0, Number(sourceTravelConfig.rentalCarDays || 0)),
          },
        });
      }

      for (const sourceOmCostLine of sourceOmCostLines) {
        await tx.omCostLine.create({
          data: {
            exerciseId: req.params.id,
            category: String(sourceOmCostLine.category || ''),
            label: String(sourceOmCostLine.label || ''),
            amount: Number(sourceOmCostLine.amount || 0),
            startDate: parseOptionalDateField(sourceOmCostLine.startDate),
            endDate: parseOptionalDateField(sourceOmCostLine.endDate),
            notes: sourceOmCostLine.notes == null ? null : String(sourceOmCostLine.notes || ''),
          },
        });
      }

      if (budgetTargets) {
        const pairs: Array<[string, unknown]> = [
          ['BUDGET_TARGET_RPA', budgetTargets.rpaBudgetTarget],
          ['BUDGET_TARGET_OM', budgetTargets.omBudgetTarget],
        ];

        for (const [key, value] of pairs) {
          if (value === undefined) continue;
          await tx.appConfig.upsert({
            where: { key },
            update: { value: String(value) },
            create: { key, value: String(value) },
          });
        }
      }
    });

    const full = await loadFullExercise(req.params.id);
    return res.json(serializeExercise(full));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/:id/travel', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerUserId: userId } });
    if (!existing) return res.status(404).json({ error: 'Exercise not found' });

    const config = await prisma.travelConfig.upsert({
      where: { exerciseId: req.params.id },
      update: req.body,
      create: { exerciseId: req.params.id, ...req.body },
    });
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CALCULATE BUDGET ───
router.get('/:id/calculate', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const exercise = await loadOwnedExercise(req.params.id, userId);
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
    const rates = await loadRates();
    const budget = calculateBudget(exercise, rates);
    res.json(budget);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXPORT TO EXCEL ───
router.get('/:id/export', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const exercise = await loadOwnedExercise(req.params.id, userId);
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
    const rates = await loadRates();
    const budget = calculateBudget(exercise, rates);
    const planningRpaTotal = Object.values(budget.units)
      .reduce((sum, unit) => sum + (unit.planningRpa?.subtotal || 0), 0);
    const playerRpaTotal = Object.values(budget.units)
      .reduce((sum, unit) => sum + Math.max(0, (unit.playerRpa?.subtotal || 0) - (unit.playerRpa?.meals || 0)), 0);
    const annualTourTotal = Object.values(budget.units)
      .reduce((sum, unit) => sum + (unit.annualTourRpa?.meals || 0), 0);
    const executionRpaTotal = Object.values(budget.units)
      .reduce(
        (sum, unit) => sum + (unit.whiteCellRpa?.subtotal || 0) + (unit.executionRpa || 0) + (unit.playerRpa?.meals || 0),
        0,
      );

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const rpaPerDiemTotal = Object.values(budget.units).reduce(
      (sum, unit) =>
        sum +
        (unit.planningRpa.perDiem || 0) +
        (unit.whiteCellRpa.perDiem || 0) +
        (unit.playerRpa.perDiem || 0),
      0,
    );
    const rpaTravelAndPerDiemTotal = budget.rpaTravel + rpaPerDiemTotal + Object.values(budget.units).reduce((sum, unit) => sum + (unit.executionRpa || 0), 0);

    const summaryData = [
      ['China Tracker – Budget Summary'],
      ['Exercise', exercise.name],
      ['Period', `${exercise.startDate.toISOString().slice(0,10)} to ${exercise.endDate.toISOString().slice(0,10)}`],
      ['Duty Days', exercise.defaultDutyDays],
      [''],
      ['Category', 'Amount'],
      ['Total RPA', budget.totalRpa],
      ['Total O&M', budget.totalOm],
      ['Grand Total', budget.grandTotal],
      ['RPA Travel & Per Diem', rpaTravelAndPerDiemTotal],
      ['WRM', budget.wrm],
      [''],
      ['Total PAX', budget.totalPax],
      ['Total Players', budget.totalPlayers],
      ['Total White Cell', budget.totalWhiteCell],
      ['Total Annual Tour', budget.totalAnnualTour],
      [''],
      ['A7 RPA Funding Responsibility', 'A7 pays the exercise-wide RPA requirement for projection purposes; unit rows still show where costs occur.'],
      ['A7 Paid RPA Total', budget.totalRpa],
      ['Planning RPA', planningRpaTotal],
      ['Player RPA', playerRpaTotal],
      ['AT Meals', annualTourTotal],
      ['Exercise Support RPA', executionRpaTotal],
      [''],
      ['Unit', 'RPA', 'O&M', 'Total'],
      ...Object.values(budget.units).map((u) => [u.unitCode, u.unitTotalRpa, u.unitTotalOm, u.unitTotal]),
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // Unit detail sheets
    for (const [code, u] of Object.entries(budget.units)) {
      const data = [
        [`${code} – Unit Budget Detail`],
        [''],
        ['White Cell RPA'],
        ['PAX', u.whiteCellRpa.paxCount, 'Days', u.whiteCellRpa.dutyDays],
        ['Mil Pay', u.whiteCellRpa.milPay],
        ['Per Diem', u.whiteCellRpa.perDiem],
        ['Travel', u.whiteCellRpa.travel],
        ['Subtotal', u.whiteCellRpa.subtotal],
        [''],
        ['White Cell O&M'],
        ['PAX', u.whiteCellOm.paxCount, 'Days', u.whiteCellOm.dutyDays],
        ['Per Diem', u.whiteCellOm.perDiem],
        ['Travel', u.whiteCellOm.travel],
        ['Subtotal', u.whiteCellOm.subtotal],
        [''],
        ['Player RPA'],
        ['PAX', u.playerRpa.paxCount, 'Days', u.playerRpa.dutyDays],
        ['Mil Pay', u.playerRpa.milPay],
        ['Meals', u.playerRpa.meals],
        ['Travel', u.playerRpa.travel],
        ['Subtotal', u.playerRpa.subtotal],
        [''],
        ['Annual Tour'],
        ['PAX', u.annualTourRpa.paxCount, 'Days', u.annualTourRpa.dutyDays],
        ['Mil Pay', u.annualTourRpa.milPay],
        ['Per Diem', u.annualTourRpa.perDiem],
        ['Meals', u.annualTourRpa.meals],
        ['Travel', u.annualTourRpa.travel],
        ['Subtotal', u.annualTourRpa.subtotal],
        [''],
        ['Player O&M'],
        ['PAX', u.playerOm.paxCount, 'Days', u.playerOm.dutyDays],
        ['Billeting', u.playerOm.billeting],
        ['Subtotal', u.playerOm.subtotal],
        [''],
        ['Other RPA Costs', u.executionRpa],
        ['Execution O&M', u.executionOm],
        [''],
        ['Unit Total RPA', u.unitTotalRpa],
        ['Unit Total O&M', u.unitTotalOm],
        ['Unit Grand Total', u.unitTotal],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), code);
    }

    // O&M sheet
    const omData = [
      ['Exercise-Level O&M Costs'],
      ['Category', 'Amount'],
      ...Object.entries(budget.exerciseOmCosts).map(([k, v]) => [k, v]),
      ['', ''],
      ['Total', budget.exerciseOmTotal],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(omData), 'O&M Detail');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exercise.name.replace(/\s/g, '_')}_Budget.xlsx"`);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/units', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const exercise = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerUserId: userId } });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const unitCodeRaw = normalizeUnitCodeInput(req.body?.unitCode);
    if (!unitCodeRaw) return res.status(400).json({ error: 'Unit code is required' });

    const existing = await prisma.unitBudget.findFirst({ where: { exerciseId: req.params.id, unitCode: unitCodeRaw } });
    if (existing) return res.status(409).json({ error: 'Unit already exists for this exercise' });

    const ub = await prisma.unitBudget.create({ data: { exerciseId: req.params.id, unitCode: unitCodeRaw } });
    const template = String(req.body?.template || 'STANDARD').toUpperCase();
    const roles = template === 'A7' ? ['PLANNING', 'SUPPORT'] : ['PLANNING', 'PLAYER', 'WHITE_CELL'];
    const fundingTypes = ['RPA', 'OM'];

    for (const role of roles) {
      for (const fundingType of fundingTypes) {
        await prisma.personnelGroup.create({
          data: {
            unitBudgetId: ub.id,
            role,
            fundingType,
            location: 'FORT_HUNTER_LIGGETT',
          },
        });
      }
    }

    if (template !== 'A7' && shouldCreateAnnualTourGroup(unitCodeRaw)) {
      await prisma.personnelGroup.create({
        data: {
          unitBudgetId: ub.id,
          role: 'ANNUAL_TOUR',
          fundingType: 'RPA',
          location: 'FORT_HUNTER_LIGGETT',
        },
      });
    }

    const full = await loadFullExercise(req.params.id);
    res.status(201).json(serializeExercise(full));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/units/:unitCode', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const exercise = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerUserId: userId } });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const unitCode = String(req.params.unitCode || '').trim().toUpperCase();
    if (!unitCode) return res.status(400).json({ error: 'Unit code is required' });

    const ub = await prisma.unitBudget.findFirst({ where: { exerciseId: req.params.id, unitCode } });
    if (!ub) return res.status(404).json({ error: 'Unit not found' });

    await prisma.unitBudget.delete({ where: { id: ub.id } });
    const full = await loadFullExercise(req.params.id);
    res.json(serializeExercise(full));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/units/:unitBudgetId', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const exercise = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerUserId: userId } });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const unitBudgetId = String(req.params.unitBudgetId || '').trim();
    if (!unitBudgetId) return res.status(400).json({ error: 'Unit id is required' });

    const unitBudget = await prisma.unitBudget.findFirst({
      where: {
        id: unitBudgetId,
        exerciseId: req.params.id,
      },
    });
    if (!unitBudget) return res.status(404).json({ error: 'Unit not found' });

    await prisma.unitBudget.update({
      where: { id: unitBudget.id },
      data: {
        unitDisplayName: normalizeUnitDisplayNameInput(req.body?.unitDisplayName),
      },
    });

    const full = await loadFullExercise(req.params.id);
    res.json(serializeExercise(full));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
