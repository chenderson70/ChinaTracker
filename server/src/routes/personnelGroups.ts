import { Router, Request, Response } from 'express';
import { prisma } from '../index';

const router = Router();

// ─── UPDATE PERSONNEL GROUP ───
router.put('/personnel-groups/:groupId', async (req: Request, res: Response) => {
  try {
    const { paxCount, dutyDays, location, isLongTour, avgCpdOverride } = req.body;
    const data: any = {};
    if (paxCount !== undefined) data.paxCount = paxCount;
    if (dutyDays !== undefined) data.dutyDays = dutyDays;
    if (location !== undefined) data.location = location;
    if (isLongTour !== undefined) data.isLongTour = isLongTour;
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
    const { rankCode, count } = req.body;
    const entry = await prisma.personnelEntry.create({
      data: { personnelGroupId: req.params.groupId, rankCode, count },
    });
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE RANK ENTRY ───
router.put('/personnel-entries/:entryId', async (req: Request, res: Response) => {
  try {
    const entry = await prisma.personnelEntry.update({
      where: { id: req.params.entryId },
      data: req.body,
    });
    res.json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE RANK ENTRY ───
router.delete('/personnel-entries/:entryId', async (req: Request, res: Response) => {
  try {
    await prisma.personnelEntry.delete({ where: { id: req.params.entryId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
