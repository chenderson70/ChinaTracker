import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../db';
import { createAuthToken, createRefreshToken, requireAuth, verifyRefreshToken } from '../services/auth';

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

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getRequestIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function getRefreshExpiryDate(): Date {
  const now = Date.now();
  const days = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 30);
  return new Date(now + days * 24 * 60 * 60 * 1000);
}

async function issueSession(req: Request, user: { id: string; username: string; name: string }) {
  await (prisma as any).authSession.deleteMany({
    where: {
      userId: user.id,
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
    },
  });

  const session = await (prisma as any).authSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: '',
      userAgent: String(req.headers['user-agent'] || ''),
      ipAddress: getRequestIp(req),
      expiresAt: getRefreshExpiryDate(),
    },
  });

  const accessToken = createAuthToken(user);
  const refreshToken = createRefreshToken(user.id, session.id);

  await (prisma as any).authSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: tokenHash(refreshToken) },
  });

  return {
    token: accessToken,
    refreshToken,
    user,
  };
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
    const session = await issueSession(req, authUser);

    res.status(201).json(session);
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
    const session = await issueSession(req, authUser);

    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const username = sanitizeUsername(req.body?.username);
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Username, current password, and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const user = await userClient.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await userClient.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await (prisma as any).authSession.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const authUser = { id: user.id, username: user.username, name: user.name };
    const session = await issueSession(req, authUser);

    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '');
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    let payload: { sub: string; sid: string; type: 'refresh' };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    if (payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const session = await (prisma as any).authSession.findUnique({
      where: { id: payload.sid },
    });

    if (!session || session.userId !== payload.sub) {
      return res.status(401).json({ error: 'Session not found' });
    }

    if (session.revokedAt || new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'Session expired' });
    }

    if (session.refreshTokenHash !== tokenHash(refreshToken)) {
      await (prisma as any).authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return res.status(401).json({ error: 'Session invalidated' });
    }

    const user = await userClient.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, name: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const nextRefreshToken = createRefreshToken(user.id, session.id);
    await (prisma as any).authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: tokenHash(nextRefreshToken),
        userAgent: String(req.headers['user-agent'] || ''),
        ipAddress: getRequestIp(req),
        expiresAt: getRefreshExpiryDate(),
      },
    });

    const accessToken = createAuthToken(user);
    res.json({ token: accessToken, refreshToken: nextRefreshToken, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '');
    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        await (prisma as any).authSession.updateMany({
          where: {
            id: payload.sid,
            userId: payload.sub,
            refreshTokenHash: tokenHash(refreshToken),
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      } catch {
        // noop
      }
    }

    res.status(204).send();
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
