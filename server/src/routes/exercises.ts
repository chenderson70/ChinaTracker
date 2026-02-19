import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { calculateBudget, RateInputs } from '../services/calculationEngine';
import * as XLSX from 'xlsx';

const router = Router();

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
  };
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

// Helper: seed default unit budgets and personnel groups for a new exercise
async function seedExerciseDefaults(exerciseId: string) {
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
          data: { unitBudgetId: ub.id, role: g.role, fundingType: g.fundingType, location: 'GULFPORT' },
        });
      }
    } else {
      const groups = [
        { role: 'PLAYER' as const, fundingType: 'RPA' as const },
        { role: 'PLAYER' as const, fundingType: 'OM' as const },
        { role: 'WHITE_CELL' as const, fundingType: 'RPA' as const },
        { role: 'WHITE_CELL' as const, fundingType: 'OM' as const },
      ];
      for (const g of groups) {
        await prisma.personnelGroup.create({
          data: { unitBudgetId: ub.id, role: g.role, fundingType: g.fundingType, location: 'GULFPORT' },
        });
      }
    }
  }

  // Default travel config
  await prisma.travelConfig.create({
    data: { exerciseId, airfarePerPerson: 400, rentalCarDailyRate: 50, rentalCarCount: 0, rentalCarDays: 0 },
  });
}

// ─── LIST EXERCISES ───
router.get('/', async (_req: Request, res: Response) => {
  try {
    const exercises = await prisma.exercise.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(exercises);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CREATE EXERCISE ───
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, startDate, endDate, defaultDutyDays } = req.body;
    const exercise = await prisma.exercise.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        defaultDutyDays: defaultDutyDays || 14,
      },
    });
    await seedExerciseDefaults(exercise.id);
    const full = await loadFullExercise(exercise.id);
    res.status(201).json(full);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET EXERCISE (full detail) ───
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const exercise = await loadFullExercise(req.params.id);
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
    res.json(exercise);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE EXERCISE ───
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, startDate, endDate, defaultDutyDays } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (defaultDutyDays !== undefined) data.defaultDutyDays = defaultDutyDays;
    const exercise = await prisma.exercise.update({ where: { id: req.params.id }, data });
    res.json(exercise);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE EXERCISE ───
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.exercise.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE TRAVEL CONFIG ───
router.put('/:id/travel', async (req: Request, res: Response) => {
  try {
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
    const exercise = await loadFullExercise(req.params.id);
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
    const exercise = await loadFullExercise(req.params.id);
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
    const rates = await loadRates();
    const budget = calculateBudget(exercise, rates);

    const wb = XLSX.utils.book_new();

    // Summary sheet
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
      ['RPA Travel-Only', budget.rpaTravel],
      ['WRM', budget.wrm],
      [''],
      ['Total PAX', budget.totalPax],
      ['Total Players', budget.totalPlayers],
      ['Total White Cell', budget.totalWhiteCell],
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
        ['Player O&M'],
        ['PAX', u.playerOm.paxCount, 'Days', u.playerOm.dutyDays],
        ['Billeting', u.playerOm.billeting],
        ['Subtotal', u.playerOm.subtotal],
        [''],
        ['Execution RPA', u.executionRpa],
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

export default router;
