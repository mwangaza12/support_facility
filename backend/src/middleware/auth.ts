import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../db/schema';
import 'dotenv/config';

const SECRET = process.env.JWT_SECRET || 'default';

// ── Extend Express Request ────────────────────────────────────────
// Matches the JWT payload shape from authService.login()

declare global {
  namespace Express {
    interface Request {
      user: {
        userId:     string;
        email:      string;
        role:       UserRole;
        facilityId: string;
      };
    }
  }
}

// ── Middleware ────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Authentication required' });
    try {
        const payload = jwt.verify(auth.slice(7), SECRET) as Request['user'];
        console.log('✅ Token payload:', payload);
        req.user = payload;
        next();
    } catch (err: any) {
        console.error('❌ Token verify failed:', err.message, '| SECRET starts with:', SECRET.slice(0, 6));
        res.status(401).json({ error: 'Invalid or expired token', detail: err.message });
    }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin')
        return res.status(403).json({ error: 'Admin role required' });
        next();
    });
}

export function requireRole(...roles: UserRole[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        requireAuth(req, res, () => {
            if (!roles.includes(req.user.role))
                return res.status(403).json({ error: `Required role: ${roles.join(' or ')}` });
            next();
        });
    };
}

// ── Token signing ─────────────────────────────────────────────────
// Matches the payload shape used in authService.login()

export function signToken(user: {
  id:         string;
  email:      string;
  role:       UserRole;
  facilityId: string;
}) {
  return jwt.sign(
    {
      userId:     user.id,
      email:      user.email,
      role:       user.role,
      facilityId: user.facilityId,
    },
    SECRET,
    { expiresIn: '24h' }
  );
}