import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { getRequestUserId } from '../services/auth';

const router = Router();

function parseOptionalDateField(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ─── EXECUTION COST LINES ───

router.get('/units/:unitId/execution-costs', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const unit = await prisma.unitBudget.findUnique({
      where: { id: req.params.unitId },
      include: { exercise: true },
    });
    if (!unit || unit.exercise.ownerUserId !== userId) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const lines = await prisma.executionCostLine.findMany({ where: { unitBudgetId: req.params.unitId } });
    res.json(lines);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/units/:unitId/execution-costs', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const unit = await prisma.unitBudget.findUnique({
      where: { id: req.params.unitId },
      include: { exercise: true },
    });
    if (!unit || unit.exercise.ownerUserId !== userId) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const { fundingType, category, amount, startDate, endDate, notes } = req.body;
    const line = await prisma.executionCostLine.create({
      data: {
        unitBudgetId: req.params.unitId,
        fundingType,
        category,
        amount,
        startDate: parseOptionalDateField(startDate),
        endDate: parseOptionalDateField(endDate),
        notes,
      },
    });
    res.status(201).json(line);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/units/:unitId/clear', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const unit = await prisma.unitBudget.findUnique({
      where: { id: req.params.unitId },
      include: {
        exercise: true,
        personnelGroups: {
          select: { id: true },
        },
      },
    });
    if (!unit || unit.exercise.ownerUserId !== userId) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const groupIds = unit.personnelGroups.map((group) => group.id);

    await prisma.$transaction([
      prisma.personnelEntry.deleteMany({
        where: { personnelGroupId: { in: groupIds } },
      }),
      prisma.executionCostLine.deleteMany({
        where: { unitBudgetId: req.params.unitId },
      }),
      prisma.personnelGroup.updateMany({
        where: { unitBudgetId: req.params.unitId },
        data: {
          paxCount: 0,
          dutyDays: null,
          location: 'FORT_HUNTER_LIGGETT',
          isLongTour: false,
          isLocal: false,
          airfarePerPerson: null,
          rentalCarCount: 0,
          rentalCarDaily: null,
          rentalCarDays: 0,
          avgCpdOverride: null,
        },
      }),
    ]);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/execution-costs/:lineId', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.executionCostLine.findUnique({
      where: { id: req.params.lineId },
      include: {
        unitBudget: { include: { exercise: true } },
      },
    });
    if (!existing || existing.unitBudget.exercise.ownerUserId !== userId) {
      return res.status(404).json({ error: 'Execution cost not found' });
    }

    const updateData = { ...req.body } as Record<string, unknown>;
    if (req.body?.startDate !== undefined) updateData.startDate = parseOptionalDateField(req.body.startDate);
    if (req.body?.endDate !== undefined) updateData.endDate = parseOptionalDateField(req.body.endDate);

    const line = await prisma.executionCostLine.update({
      where: { id: req.params.lineId },
      data: updateData,
    });
    res.json(line);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/execution-costs/:lineId', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.executionCostLine.findUnique({
      where: { id: req.params.lineId },
      include: {
        unitBudget: { include: { exercise: true } },
      },
    });
    if (!existing || existing.unitBudget.exercise.ownerUserId !== userId) {
      return res.status(404).json({ error: 'Execution cost not found' });
    }

    await prisma.executionCostLine.delete({ where: { id: req.params.lineId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── O&M COST LINES ───

router.get('/exercises/:id/om-costs', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const exercise = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerUserId: userId } });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const lines = await prisma.omCostLine.findMany({ where: { exerciseId: req.params.id } });
    res.json(lines);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/exercises/:id/om-costs', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const exercise = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerUserId: userId } });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const { category, label, amount, startDate, endDate, notes } = req.body;
    const line = await prisma.omCostLine.create({
      data: {
        exerciseId: req.params.id,
        category,
        label,
        amount,
        startDate: parseOptionalDateField(startDate),
        endDate: parseOptionalDateField(endDate),
        notes,
      },
    });
    res.status(201).json(line);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/om-costs/:lineId', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.omCostLine.findUnique({
      where: { id: req.params.lineId },
      include: { exercise: true },
    });
    if (!existing || existing.exercise.ownerUserId !== userId) {
      return res.status(404).json({ error: 'O&M cost not found' });
    }

    const updateData = { ...req.body } as Record<string, unknown>;
    if (req.body?.startDate !== undefined) updateData.startDate = parseOptionalDateField(req.body.startDate);
    if (req.body?.endDate !== undefined) updateData.endDate = parseOptionalDateField(req.body.endDate);

    const line = await prisma.omCostLine.update({
      where: { id: req.params.lineId },
      data: updateData,
    });
    res.json(line);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/om-costs/:lineId', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.omCostLine.findUnique({
      where: { id: req.params.lineId },
      include: { exercise: true },
    });
    if (!existing || existing.exercise.ownerUserId !== userId) {
      return res.status(404).json({ error: 'O&M cost not found' });
    }

    await prisma.omCostLine.delete({ where: { id: req.params.lineId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
