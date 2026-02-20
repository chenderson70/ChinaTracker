import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

type AuthTokenPayload = {
  sub: string;
  username: string;
  name: string;
};

export type AuthUser = {
  id: string;
  username: string;
  name: string;
};

const JWT_SECRET = process.env.JWT_SECRET || 'china-tracker-dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      username?: string;
      userName?: string;
    }
  }
}

export function createAuthToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
}

function parseBearerToken(req: Request): string | null {
  const authHeader = req.header('authorization');
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = parseBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    req.userId = payload.sub;
    req.username = payload.username;
    req.userName = payload.name;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function getRequestUserId(req: Request): string {
  return req.userId || '';
}
