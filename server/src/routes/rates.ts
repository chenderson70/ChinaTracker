import { Router, Request, Response } from 'express';
import { prisma } from '../db';

const router = Router();

function normalizePerDiemRates(input: unknown): Array<{ location: string; lodgingRate: number; mieRate: number }> {
  return Array.isArray(input)
    ? input
      .map((rate) => ({
        location: String((rate as any)?.location || '').trim(),
        lodgingRate: Number((rate as any)?.lodgingRate || 0),
        mieRate: Number((rate as any)?.mieRate || 0),
      }))
      .filter((rate) => rate.location.length > 0)
    : [];
}

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
    const rates = await prisma.perDiemRate.findMany({ orderBy: { location: 'asc' } });
    res.json(rates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/per-diem', async (req: Request, res: Response) => {
  try {
    const { rates } = req.body; // Array of { location, lodgingRate, mieRate }
    const normalizedRates = normalizePerDiemRates(rates);

    const all = await prisma.$transaction(async (tx) => {
      const locationsToKeep = normalizedRates.map((rate) => rate.location);

      await tx.perDiemRate.deleteMany({
        where: locationsToKeep.length > 0
          ? { location: { notIn: locationsToKeep } }
          : {},
      });

      for (const rate of normalizedRates) {
        await tx.perDiemRate.upsert({
          where: { location: rate.location },
          update: { lodgingRate: rate.lodgingRate, mieRate: rate.mieRate },
          create: {
            location: rate.location,
            lodgingRate: rate.lodgingRate,
            mieRate: rate.mieRate,
            effectiveDate: new Date(),
          },
        });
      }

      return tx.perDiemRate.findMany({ orderBy: { location: 'asc' } });
    });

    res.json(all);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/per-diem', async (req: Request, res: Response) => {
  try {
    const normalizedRates = normalizePerDiemRates(req.body?.rates);

    const all = await prisma.$transaction(async (tx) => {
      for (const rate of normalizedRates) {
        await tx.perDiemRate.upsert({
          where: { location: rate.location },
          update: { lodgingRate: rate.lodgingRate, mieRate: rate.mieRate },
          create: {
            location: rate.location,
            lodgingRate: rate.lodgingRate,
            mieRate: rate.mieRate,
            effectiveDate: new Date(),
          },
        });
      }

      return tx.perDiemRate.findMany({ orderBy: { location: 'asc' } });
    });

    res.json(all);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/per-diem/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const all = await prisma.$transaction(async (tx) => {
      await tx.perDiemRate.deleteMany({ where: { id } });
      return tx.perDiemRate.findMany({ orderBy: { location: 'asc' } });
    });

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
