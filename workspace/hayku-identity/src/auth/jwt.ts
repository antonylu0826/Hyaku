import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface JwtPayload {
  sub: string;        // user id
  email: string;
  isSuperAdmin: boolean;
}

export function signToken(payload: JwtPayload): string {
  // expiresIn expects number (seconds) or ms-style string like "7d"
  return jwt.sign(
    { ...payload },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions,
  );
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}
