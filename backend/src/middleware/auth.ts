import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// JWT payload shape issued by the backend on Google OAuth callback
// ─────────────────────────────────────────────────────────────────────────────
export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

// Extend Express Request to carry the decoded user
declare global {
  namespace Express {
    // Override the User type used by passport/express
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends JwtPayload {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// requireAuth middleware
// Validates the Bearer JWT in Authorization header using NEXTAUTH_SECRET.
// Returns 401 on missing/invalid/expired token.
// ─────────────────────────────────────────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: missing Bearer token' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.NEXTAUTH_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Unauthorized: token expired' });
    } else {
      res.status(401).json({ error: 'Unauthorized: invalid token' });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: sign a JWT for a user (called after Google OAuth success)
// ─────────────────────────────────────────────────────────────────────────────
export function signUserToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.NEXTAUTH_SECRET, { expiresIn: '7d' });
}
