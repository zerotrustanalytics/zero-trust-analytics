import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'zta-jwt-secret-change-me';
const JWT_EXPIRY = '7d';

// Hash password
export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// Verify password
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Create JWT token
export function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// Verify JWT token
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Extract token from Authorization header
export function getTokenFromHeader(headers) {
  const auth = headers.authorization || headers.Authorization;
  if (!auth) return null;

  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
}

// Middleware helper - verify auth and return user
export function authenticateRequest(headers) {
  const token = getTokenFromHeader(headers);
  if (!token) {
    return { error: 'No token provided', status: 401 };
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return { error: 'Invalid token', status: 401 };
  }

  return { user: decoded };
}
