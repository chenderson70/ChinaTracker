import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { createAuthToken, requireAuth } from '../services/auth';

const router = Router();
const userClient = (prisma as any).user;

function sanitizeUsername(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

function isValidUsername(username: string): boolean {
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return false;
  if (/^[._-]|[._-]$/.test(username)) return false;
  if (/[._-]{2,}/.test(username)) return false;
  return true;
}

function sanitizeName(raw: unknown): string {
  return String(raw || '').trim();
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const username = sanitizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const name = sanitizeName(req.body?.name) || username;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Username must be 3-30 chars, start/end with letter or number, and cannot contain consecutive symbols' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await userClient.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: 'Username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userClient.create({
      data: {
        username,
        name,
        passwordHash,
      },
    });

    const authUser = { id: user.id, username: user.username, name: user.name };
    const token = createAuthToken(authUser);

    res.status(201).json({ token, user: authUser });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const username = sanitizeUsername(req.body?.username);
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await userClient.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const authUser = { id: user.id, username: user.username, name: user.name };
    const token = createAuthToken(authUser);

    res.json({ token, user: authUser });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const user = await userClient.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
