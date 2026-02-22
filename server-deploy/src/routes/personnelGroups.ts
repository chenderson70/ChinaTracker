import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { getRequestUserId } from '../services/auth';

const router = Router();

// ─── UPDATE PERSONNEL GROUP ───
router.put('/personnel-groups/:groupId', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.personnelGroup.findUnique({
      where: { id: req.params.groupId },
      include: {
        unitBudget: {
          include: {
            exercise: true,
          },
        },
      },
    });
    if (!existing || (existing.unitBudget.exercise as any).ownerUserId !== userId) {
      return res.status(404).json({ error: 'Personnel group not found' });
    }

    const {
      paxCount,
      dutyDays,
      location,
      isLongTour,
      isLocal,
      airfarePerPerson,
      rentalCarCount,
      rentalCarDaily,
      rentalCarDays,
      avgCpdOverride,
    } = req.body;
    const data: any = {};
    if (paxCount !== undefined) data.paxCount = paxCount;
    if (dutyDays !== undefined) data.dutyDays = dutyDays;
    if (location !== undefined) data.location = location;
    if (isLongTour !== undefined) data.isLongTour = isLongTour;
    if (isLocal !== undefined) data.isLocal = isLocal;
    if (airfarePerPerson !== undefined) data.airfarePerPerson = airfarePerPerson;
    if (rentalCarCount !== undefined) data.rentalCarCount = rentalCarCount;
    if (rentalCarDaily !== undefined) data.rentalCarDaily = rentalCarDaily;
    if (rentalCarDays !== undefined) data.rentalCarDays = rentalCarDays;
    if (avgCpdOverride !== undefined) data.avgCpdOverride = avgCpdOverride;

    const group = await prisma.personnelGroup.update({
      where: { id: req.params.groupId },
      data,
      include: { personnelEntries: true },
    });
    res.json(group);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADD RANK ENTRY ───
router.post('/personnel-groups/:groupId/entries', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const group = await prisma.personnelGroup.findUnique({
      where: { id: req.params.groupId },
      include: {
        unitBudget: {
          include: {
            exercise: true,
          },
        },
      },
    });
    if (!group || (group.unitBudget.exercise as any).ownerUserId !== userId) {
      return res.status(404).json({ error: 'Personnel group not found' });
    }

    const { rankCode, count, dutyDays, location, isLocal } = req.body;
    const entry = await prisma.personnelEntry.create({
      data: {
        personnelGroupId: req.params.groupId,
        rankCode,
        count,
        dutyDays,
        location,
        isLocal,
      },
    });

    const updatedGroup = await prisma.personnelGroup.findUnique({
      where: { id: req.params.groupId },
      include: { personnelEntries: true },
    });
    if (updatedGroup) {
      const totalPax = updatedGroup.personnelEntries.reduce((sum, item) => sum + (item.count || 0), 0);
      await prisma.personnelGroup.update({ where: { id: req.params.groupId }, data: { paxCount: totalPax } });
    }

    res.status(201).json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE RANK ENTRY ───
router.put('/personnel-entries/:entryId', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.personnelEntry.findUnique({
      where: { id: req.params.entryId },
      include: {
        personnelGroup: {
          include: {
            unitBudget: {
              include: {
                exercise: true,
              },
            },
          },
        },
      },
    });
    if (!existing || (existing.personnelGroup.unitBudget.exercise as any).ownerUserId !== userId) {
      return res.status(404).json({ error: 'Personnel entry not found' });
    }

    const entry = await prisma.personnelEntry.update({
      where: { id: req.params.entryId },
      data: req.body,
    });

    if (req.body?.count !== undefined) {
      const updatedGroup = await prisma.personnelGroup.findUnique({
        where: { id: existing.personnelGroupId },
        include: { personnelEntries: true },
      });
      if (updatedGroup) {
        const totalPax = updatedGroup.personnelEntries.reduce((sum, item) => sum + (item.count || 0), 0);
        await prisma.personnelGroup.update({ where: { id: existing.personnelGroupId }, data: { paxCount: totalPax } });
      }
    }

    res.json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE RANK ENTRY ───
router.delete('/personnel-entries/:entryId', async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    const existing = await prisma.personnelEntry.findUnique({
      where: { id: req.params.entryId },
      include: {
        personnelGroup: {
          include: {
            unitBudget: {
              include: {
                exercise: true,
              },
            },
          },
        },
      },
    });
    if (!existing || (existing.personnelGroup.unitBudget.exercise as any).ownerUserId !== userId) {
      return res.status(404).json({ error: 'Personnel entry not found' });
    }

    await prisma.personnelEntry.delete({ where: { id: req.params.entryId } });
    const updatedGroup = await prisma.personnelGroup.findUnique({
      where: { id: existing.personnelGroupId },
      include: { personnelEntries: true },
    });
    if (updatedGroup) {
      const totalPax = updatedGroup.personnelEntries.reduce((sum, item) => sum + (item.count || 0), 0);
      await prisma.personnelGroup.update({ where: { id: existing.personnelGroupId }, data: { paxCount: totalPax } });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
