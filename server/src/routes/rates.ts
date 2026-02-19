import { Router, Request, Response } from 'express';
import { prisma } from '../index';

const router = Router();

// ─── CPD RATES ───

router.get('/cpd', async (_req: Request, res: Response) => {
  try {
    const rates = await prisma.rankCpdRate.findMany({ orderBy: { rankCode: 'asc' } });
    res.json(rates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/cpd', async (req: Request, res: Response) => {
  try {
    const { rates } = req.body; // Array of { rankCode, costPerDay }
    for (const r of rates) {
      await prisma.rankCpdRate.upsert({
        where: { rankCode: r.rankCode },
        update: { costPerDay: r.costPerDay },
        create: { rankCode: r.rankCode, costPerDay: r.costPerDay, effectiveDate: new Date() },
      });
    }
    const all = await prisma.rankCpdRate.findMany({ orderBy: { rankCode: 'asc' } });
    res.json(all);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PER DIEM RATES ───

router.get('/per-diem', async (_req: Request, res: Response) => {
  try {
    const rates = await prisma.perDiemRate.findMany();
    res.json(rates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/per-diem', async (req: Request, res: Response) => {
  try {
    const { rates } = req.body; // Array of { location, lodgingRate, mieRate }
    for (const r of rates) {
      await prisma.perDiemRate.upsert({
        where: { location: r.location },
        update: { lodgingRate: r.lodgingRate, mieRate: r.mieRate },
        create: { location: r.location, lodgingRate: r.lodgingRate, mieRate: r.mieRate, effectiveDate: new Date() },
      });
    }
    const all = await prisma.perDiemRate.findMany();
    res.json(all);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── APP CONFIG (meal rates, billeting) ───

router.get('/config', async (_req: Request, res: Response) => {
  try {
    const configs = await prisma.appConfig.findMany();
    const obj = Object.fromEntries(configs.map((c) => [c.key, c.value]));
    res.json(obj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', async (req: Request, res: Response) => {
  try {
    const entries = Object.entries(req.body) as [string, string][];
    for (const [key, value] of entries) {
      await prisma.appConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    const configs = await prisma.appConfig.findMany();
    const obj = Object.fromEntries(configs.map((c) => [c.key, c.value]));
    res.json(obj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
