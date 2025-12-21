/**
 * Comprehensive TDD Test Suite for Session Management
 *
 * This test suite covers session management functionality:
 * - Session creation and storage
 * - Session retrieval and validation
 * - Session expiration and cleanup
 * - Session security and multi-device support
 *
 * Total: 30 test cases
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock session utilities - these would be implemented in src/lib/auth/session.ts
interface Session {
  id: string;
  userId: string;
  email: string;
  role?: string;
  createdAt: number;
  expiresAt: number;
  lastAccessedAt: number;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  refreshToken?: string;
}

interface SessionCreateOptions {
  userId: string;
  email: string;
  role?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  expiresIn?: number; // in milliseconds
}

interface SessionValidationResult {
  valid: boolean;
  session?: Session;
  error?: string;
  reason?: 'expired' | 'not_found' | 'invalid';
}

interface SessionStore {
  [sessionId: string]: Session;
}

// Mock session storage (in-memory for testing)
let mockSessionStore: SessionStore = {};

const DEFAULT_SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const MAX_SESSIONS_PER_USER = 5;

const mockSessionUtils = {
  createSession: async (options: SessionCreateOptions): Promise<Session> => {
    if (!options.userId) {
      throw new Error('userId is required');
    }

    if (!options.email) {
      throw new Error('email is required');
    }

    const now = Date.now();
    const sessionId = `session-${options.userId}-${now}-${Math.random().toString(36).substring(7)}`;
    const expiresIn = options.expiresIn || DEFAULT_SESSION_EXPIRY;

    const session: Session = {
      id: sessionId,
      userId: options.userId,
      email: options.email,
      role: options.role,
      createdAt: now,
      expiresAt: now + expiresIn,
      lastAccessedAt: now,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      deviceId: options.deviceId,
    };

    mockSessionStore[sessionId] = session;

    // Cleanup old sessions for this user
    await mockSessionUtils.cleanupUserSessions(options.userId);

    return session;
  },

  getSession: async (sessionId: string): Promise<Session | null> => {
    if (!sessionId) {
      return null;
    }

    const session = mockSessionStore[sessionId];

    if (!session) {
      return null;
    }

    // Update last accessed time
    session.lastAccessedAt = Date.now();
    mockSessionStore[sessionId] = session;

    return session;
  },

  validateSession: async (sessionId: string): Promise<SessionValidationResult> => {
    if (!sessionId) {
      return { valid: false, error: 'Session ID is required', reason: 'invalid' };
    }

    const session = mockSessionStore[sessionId];

    if (!session) {
      return { valid: false, error: 'Session not found', reason: 'not_found' };
    }

    const now = Date.now();

    if (session.expiresAt < now) {
      // Clean up expired session
      delete mockSessionStore[sessionId];
      return { valid: false, error: 'Session expired', reason: 'expired' };
    }

    // Update last accessed time
    session.lastAccessedAt = now;
    mockSessionStore[sessionId] = session;

    return { valid: true, session };
  },

  deleteSession: async (sessionId: string): Promise<boolean> => {
    if (!sessionId || !mockSessionStore[sessionId]) {
      return false;
    }

    delete mockSessionStore[sessionId];
    return true;
  },

  deleteUserSessions: async (userId: string): Promise<number> => {
    if (!userId) {
      return 0;
    }

    const sessionIds = Object.keys(mockSessionStore).filter(
      (id) => mockSessionStore[id].userId === userId
    );

    sessionIds.forEach((id) => delete mockSessionStore[id]);

    return sessionIds.length;
  },

  deleteAllSessionsExcept: async (userId: string, currentSessionId: string): Promise<number> => {
    if (!userId) {
      return 0;
    }

    const sessionIds = Object.keys(mockSessionStore).filter(
      (id) => mockSessionStore[id].userId === userId && id !== currentSessionId
    );

    sessionIds.forEach((id) => delete mockSessionStore[id]);

    return sessionIds.length;
  },

  getUserSessions: async (userId: string): Promise<Session[]> => {
    if (!userId) {
      return [];
    }

    return Object.values(mockSessionStore)
      .filter((session) => session.userId === userId)
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  },

  cleanupExpiredSessions: async (): Promise<number> => {
    const now = Date.now();
    const expiredSessionIds = Object.keys(mockSessionStore).filter(
      (id) => mockSessionStore[id].expiresAt < now
    );

    expiredSessionIds.forEach((id) => delete mockSessionStore[id]);

    return expiredSessionIds.length;
  },

  cleanupUserSessions: async (userId: string): Promise<number> => {
    const userSessions = await mockSessionUtils.getUserSessions(userId);

    if (userSessions.length <= MAX_SESSIONS_PER_USER) {
      return 0;
    }

    // Sort by last accessed time and remove oldest sessions
    const sessionsToRemove = userSessions
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
      .slice(0, userSessions.length - MAX_SESSIONS_PER_USER);

    sessionsToRemove.forEach((session) => delete mockSessionStore[session.id]);

    return sessionsToRemove.length;
  },

  extendSession: async (sessionId: string, additionalTime: number): Promise<Session | null> => {
    const session = mockSessionStore[sessionId];

    if (!session) {
      return null;
    }

    session.expiresAt += additionalTime;
    mockSessionStore[sessionId] = session;

    return session;
  },

  refreshSession: async (sessionId: string): Promise<Session | null> => {
    const session = mockSessionStore[sessionId];

    if (!session) {
      return null;
    }

    const now = Date.now();

    if (session.expiresAt < now) {
      delete mockSessionStore[sessionId];
      return null;
    }

    session.expiresAt = now + DEFAULT_SESSION_EXPIRY;
    session.lastAccessedAt = now;
    mockSessionStore[sessionId] = session;

    return session;
  },

  getSessionCount: async (userId: string): Promise<number> => {
    return Object.values(mockSessionStore).filter((session) => session.userId === userId).length;
  },

  isSessionActive: async (sessionId: string): Promise<boolean> => {
    const validation = await mockSessionUtils.validateSession(sessionId);
    return validation.valid;
  },

  updateSessionMetadata: async (
    sessionId: string,
    metadata: { ipAddress?: string; userAgent?: string; deviceId?: string }
  ): Promise<Session | null> => {
    const session = mockSessionStore[sessionId];

    if (!session) {
      return null;
    }

    if (metadata.ipAddress) session.ipAddress = metadata.ipAddress;
    if (metadata.userAgent) session.userAgent = metadata.userAgent;
    if (metadata.deviceId) session.deviceId = metadata.deviceId;

    mockSessionStore[sessionId] = session;

    return session;
  },

  getActiveSessions: async (userId: string): Promise<Session[]> => {
    const now = Date.now();
    return Object.values(mockSessionStore)
      .filter((session) => session.userId === userId && session.expiresAt > now)
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  },
};

describe('Session Management - Creation', () => {
  beforeEach(() => {
    mockSessionStore = {};
  });

  describe('createSession', () => {
    it('should create a new session with required fields', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-123');
      expect(session.email).toBe('test@example.com');
    });

    it('should set createdAt timestamp', async () => {
      const before = Date.now();
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });
      const after = Date.now();

      expect(session.createdAt).toBeGreaterThanOrEqual(before);
      expect(session.createdAt).toBeLessThanOrEqual(after);
    });

    it('should set expiresAt timestamp', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      expect(session.expiresAt).toBeDefined();
      expect(session.expiresAt).toBeGreaterThan(session.createdAt);
    });

    it('should set lastAccessedAt to creation time', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      expect(session.lastAccessedAt).toBe(session.createdAt);
    });

    it('should include optional role when provided', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      });

      expect(session.role).toBe('admin');
    });

    it('should include optional metadata when provided', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        deviceId: 'device-123',
      });

      expect(session.ipAddress).toBe('192.168.1.1');
      expect(session.userAgent).toBe('Mozilla/5.0');
      expect(session.deviceId).toBe('device-123');
    });

    it('should use custom expiry time when provided', async () => {
      const customExpiry = 2 * 60 * 60 * 1000; // 2 hours
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
        expiresIn: customExpiry,
      });

      const expectedExpiry = session.createdAt + customExpiry;
      expect(session.expiresAt).toBe(expectedExpiry);
    });

    it('should throw error when userId is missing', async () => {
      await expect(
        mockSessionUtils.createSession({
          userId: '',
          email: 'test@example.com',
        })
      ).rejects.toThrow('userId is required');
    });

    it('should throw error when email is missing', async () => {
      await expect(
        mockSessionUtils.createSession({
          userId: 'user-123',
          email: '',
        })
      ).rejects.toThrow('email is required');
    });

    it('should generate unique session IDs', async () => {
      const session1 = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      const session2 = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      expect(session1.id).not.toBe(session2.id);
    });
  });
});

describe('Session Management - Retrieval & Validation', () => {
  beforeEach(() => {
    mockSessionStore = {};
  });

  describe('getSession', () => {
    it('should retrieve existing session', async () => {
      const created = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      const retrieved = await mockSessionUtils.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.userId).toBe('user-123');
    });

    it('should update lastAccessedAt when retrieving session', async () => {
      const created = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const retrieved = await mockSessionUtils.getSession(created.id);

      expect(retrieved?.lastAccessedAt).toBeGreaterThan(created.lastAccessedAt);
    });

    it('should return null for non-existent session', async () => {
      const retrieved = await mockSessionUtils.getSession('non-existent-id');

      expect(retrieved).toBeNull();
    });

    it('should return null for empty session ID', async () => {
      const retrieved = await mockSessionUtils.getSession('');

      expect(retrieved).toBeNull();
    });
  });

  describe('validateSession', () => {
    it('should validate active session', async () => {
      const created = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      const validation = await mockSessionUtils.validateSession(created.id);

      expect(validation.valid).toBe(true);
      expect(validation.session).toBeDefined();
      expect(validation.error).toBeUndefined();
    });

    it('should reject expired session', async () => {
      const created = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
        expiresIn: 10, // 10ms
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      const validation = await mockSessionUtils.validateSession(created.id);

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Session expired');
      expect(validation.reason).toBe('expired');
    });

    it('should reject non-existent session', async () => {
      const validation = await mockSessionUtils.validateSession('non-existent-id');

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Session not found');
      expect(validation.reason).toBe('not_found');
    });

    it('should reject empty session ID', async () => {
      const validation = await mockSessionUtils.validateSession('');

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Session ID is required');
      expect(validation.reason).toBe('invalid');
    });

    it('should clean up expired session during validation', async () => {
      const created = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
        expiresIn: 10,
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      await mockSessionUtils.validateSession(created.id);

      const retrieved = await mockSessionUtils.getSession(created.id);
      expect(retrieved).toBeNull();
    });
  });
});

describe('Session Management - Deletion', () => {
  beforeEach(() => {
    mockSessionStore = {};
  });

  describe('deleteSession', () => {
    it('should delete existing session', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      const deleted = await mockSessionUtils.deleteSession(session.id);

      expect(deleted).toBe(true);

      const retrieved = await mockSessionUtils.getSession(session.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent session', async () => {
      const deleted = await mockSessionUtils.deleteSession('non-existent-id');

      expect(deleted).toBe(false);
    });

    it('should return false for empty session ID', async () => {
      const deleted = await mockSessionUtils.deleteSession('');

      expect(deleted).toBe(false);
    });
  });

  describe('deleteUserSessions', () => {
    it('should delete all sessions for a user', async () => {
      await mockSessionUtils.createSession({ userId: 'user-123', email: 'test@example.com' });
      await mockSessionUtils.createSession({ userId: 'user-123', email: 'test@example.com' });
      await mockSessionUtils.createSession({ userId: 'user-456', email: 'other@example.com' });

      const deletedCount = await mockSessionUtils.deleteUserSessions('user-123');

      expect(deletedCount).toBe(2);

      const remainingSessions = await mockSessionUtils.getUserSessions('user-123');
      expect(remainingSessions).toHaveLength(0);

      const otherUserSessions = await mockSessionUtils.getUserSessions('user-456');
      expect(otherUserSessions).toHaveLength(1);
    });

    it('should return 0 when user has no sessions', async () => {
      const deletedCount = await mockSessionUtils.deleteUserSessions('user-123');

      expect(deletedCount).toBe(0);
    });

    it('should return 0 for empty user ID', async () => {
      const deletedCount = await mockSessionUtils.deleteUserSessions('');

      expect(deletedCount).toBe(0);
    });
  });

  describe('deleteAllSessionsExcept', () => {
    it('should delete all user sessions except current', async () => {
      const session1 = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });
      await mockSessionUtils.createSession({ userId: 'user-123', email: 'test@example.com' });
      await mockSessionUtils.createSession({ userId: 'user-123', email: 'test@example.com' });

      const deletedCount = await mockSessionUtils.deleteAllSessionsExcept('user-123', session1.id);

      expect(deletedCount).toBe(2);

      const remainingSessions = await mockSessionUtils.getUserSessions('user-123');
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].id).toBe(session1.id);
    });
  });
});

describe('Session Management - Multi-Session Support', () => {
  beforeEach(() => {
    mockSessionStore = {};
  });

  describe('getUserSessions', () => {
    it('should return all sessions for a user', async () => {
      await mockSessionUtils.createSession({ userId: 'user-123', email: 'test@example.com' });
      await mockSessionUtils.createSession({ userId: 'user-123', email: 'test@example.com' });

      const sessions = await mockSessionUtils.getUserSessions('user-123');

      expect(sessions).toHaveLength(2);
      expect(sessions[0].userId).toBe('user-123');
      expect(sessions[1].userId).toBe('user-123');
    });

    it('should sort sessions by last accessed time (most recent first)', async () => {
      const session1 = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const session2 = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      const sessions = await mockSessionUtils.getUserSessions('user-123');

      expect(sessions[0].id).toBe(session2.id);
      expect(sessions[1].id).toBe(session1.id);
    });

    it('should return empty array when user has no sessions', async () => {
      const sessions = await mockSessionUtils.getUserSessions('user-123');

      expect(sessions).toHaveLength(0);
    });
  });

  describe('getActiveSessions', () => {
    it('should return only active (non-expired) sessions', async () => {
      await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
        expiresIn: 10, // Will expire soon
      });

      const session2 = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      const activeSessions = await mockSessionUtils.getActiveSessions('user-123');

      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].id).toBe(session2.id);
    });
  });

  describe('cleanupUserSessions', () => {
    it('should remove oldest sessions when limit exceeded', async () => {
      // Create more than MAX_SESSIONS_PER_USER sessions
      for (let i = 0; i < MAX_SESSIONS_PER_USER + 2; i++) {
        await mockSessionUtils.createSession({
          userId: 'user-123',
          email: 'test@example.com',
        });
        await new Promise((resolve) => setTimeout(resolve, 5)); // Ensure different timestamps
      }

      const sessions = await mockSessionUtils.getUserSessions('user-123');

      expect(sessions.length).toBeLessThanOrEqual(MAX_SESSIONS_PER_USER);
    });
  });
});

describe('Session Management - Advanced Operations', () => {
  beforeEach(() => {
    mockSessionStore = {};
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove all expired sessions', async () => {
      await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
        expiresIn: 10,
      });

      await mockSessionUtils.createSession({
        userId: 'user-456',
        email: 'other@example.com',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      const cleanedUp = await mockSessionUtils.cleanupExpiredSessions();

      expect(cleanedUp).toBe(1);
    });
  });

  describe('extendSession', () => {
    it('should extend session expiry time', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      const originalExpiry = session.expiresAt;
      const additionalTime = 60 * 60 * 1000; // 1 hour

      const extended = await mockSessionUtils.extendSession(session.id, additionalTime);

      expect(extended?.expiresAt).toBe(originalExpiry + additionalTime);
    });

    it('should return null for non-existent session', async () => {
      const extended = await mockSessionUtils.extendSession('non-existent', 1000);

      expect(extended).toBeNull();
    });
  });

  describe('refreshSession', () => {
    it('should refresh session with new expiry time', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
        expiresIn: 1000,
      });

      const originalExpiry = session.expiresAt;

      await new Promise((resolve) => setTimeout(resolve, 100));

      const refreshed = await mockSessionUtils.refreshSession(session.id);

      expect(refreshed).toBeDefined();
      expect(refreshed?.expiresAt).toBeGreaterThan(originalExpiry);
    });

    it('should return null for expired session', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
        expiresIn: 10,
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      const refreshed = await mockSessionUtils.refreshSession(session.id);

      expect(refreshed).toBeNull();
    });
  });

  describe('updateSessionMetadata', () => {
    it('should update session metadata', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      const updated = await mockSessionUtils.updateSessionMetadata(session.id, {
        ipAddress: '10.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-999',
      });

      expect(updated?.ipAddress).toBe('10.0.0.1');
      expect(updated?.userAgent).toBe('Chrome');
      expect(updated?.deviceId).toBe('device-999');
    });
  });

  describe('getSessionCount', () => {
    it('should return correct session count for user', async () => {
      await mockSessionUtils.createSession({ userId: 'user-123', email: 'test@example.com' });
      await mockSessionUtils.createSession({ userId: 'user-123', email: 'test@example.com' });
      await mockSessionUtils.createSession({ userId: 'user-456', email: 'other@example.com' });

      const count = await mockSessionUtils.getSessionCount('user-123');

      expect(count).toBe(2);
    });
  });

  describe('isSessionActive', () => {
    it('should return true for active session', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
      });

      const isActive = await mockSessionUtils.isSessionActive(session.id);

      expect(isActive).toBe(true);
    });

    it('should return false for expired session', async () => {
      const session = await mockSessionUtils.createSession({
        userId: 'user-123',
        email: 'test@example.com',
        expiresIn: 10,
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      const isActive = await mockSessionUtils.isSessionActive(session.id);

      expect(isActive).toBe(false);
    });
  });
});
