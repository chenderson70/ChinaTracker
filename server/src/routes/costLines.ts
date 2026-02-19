import { Router, Request, Response } from 'express';
import { prisma } from '../index';

const router = Router();

// ─── EXECUTION COST LINES ───

router.get('/units/:unitId/execution-costs', async (req: Request, res: Response) => {
  try {
    const lines = await prisma.executionCostLine.findMany({ where: { unitBudgetId: req.params.unitId } });
    res.json(lines);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/units/:unitId/execution-costs', async (req: Request, res: Response) => {
  try {
    const { fundingType, category, amount, notes } = req.body;
    const line = await prisma.executionCostLine.create({
      data: { unitBudgetId: req.params.unitId, fundingType, category, amount, notes },
    });
    res.status(201).json(line);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/execution-costs/:lineId', async (req: Request, res: Response) => {
  try {
    const line = await prisma.executionCostLine.update({
      where: { id: req.params.lineId },
      data: req.body,
    });
    res.json(line);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/execution-costs/:lineId', async (req: Request, res: Response) => {
  try {
    await prisma.executionCostLine.delete({ where: { id: req.params.lineId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── O&M COST LINES ───

router.get('/exercises/:id/om-costs', async (req: Request, res: Response) => {
  try {
    const lines = await prisma.omCostLine.findMany({ where: { exerciseId: req.params.id } });
    res.json(lines);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/exercises/:id/om-costs', async (req: Request, res: Response) => {
  try {
    const { category, label, amount, notes } = req.body;
    const line = await prisma.omCostLine.create({
      data: { exerciseId: req.params.id, category, label, amount, notes },
    });
    res.status(201).json(line);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/om-costs/:lineId', async (req: Request, res: Response) => {
  try {
    const line = await prisma.omCostLine.update({
      where: { id: req.params.lineId },
      data: req.body,
    });
    res.json(line);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/om-costs/:lineId', async (req: Request, res: Response) => {
  try {
    await prisma.omCostLine.delete({ where: { id: req.params.lineId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
