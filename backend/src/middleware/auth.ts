import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthUser } from '../types';

export const AUTH_COOKIE = 'rb_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signSession(user: AuthUser): string {
  return jwt.sign(user, env.jwtSecret, { expiresIn: '7d' });
}

export function readSession(req: Request): AuthUser | null {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, env.jwtSecret) as AuthUser;
  } catch {
    return null;
  }
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const user = readSession(req);
  if (user) req.user = user;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  next();
}

export function cookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: env.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}
