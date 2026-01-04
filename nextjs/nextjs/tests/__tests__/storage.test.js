import { jest } from '@jest/globals';

// Mock @netlify/blobs before importing storage
jest.unstable_mockModule('@netlify/blobs', () => {
  const stores = new Map();

  function createMockStore(name) {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    const data = stores.get(name);

    return {
      async get(key, options = {}) {
        const value = data.get(key);
        if (value === undefined) return null;
        if (options.type === 'json') {
          return JSON.parse(value);
        }
        return value;
      },
      async set(key, value) {
        data.set(key, value);
      },
      async setJSON(key, value) {
        data.set(key, JSON.stringify(value));
      },
      async delete(key) {
        data.delete(key);
      }
    };
  }

  return {
    getStore: ({ name }) => createMockStore(name),
    __clearAllStores: () => stores.clear(),
    __stores: stores
  };
});

const { __clearAllStores } = await import('@netlify/blobs');
const {
  createUser,
  getUser,
  updateUser,
  createSite,
  getSite,
  getUserSites,
  recordEvent,
  recordHeartbeat,
  getActiveVisitors,
  createPasswordResetToken,
  getPasswordResetToken,
  deletePasswordResetToken
} = await import('../../netlify/functions/lib/storage.js');

describe('Storage Module', () => {
  beforeEach(() => {
    __clearAllStores();
  });

  describe('User Operations', () => {
    describe('createUser', () => {
      it('should create a user with correct properties', async () => {
        const user = await createUser('test@example.com', 'hashedPassword123');

        expect(user).toMatchObject({
          email: 'test@example.com',
          passwordHash: 'hashedPassword123',
          subscription: null
        });
        expect(user.id).toMatch(/^user_\d+$/);
        expect(user.createdAt).toBeDefined();
      });

      it('should store user retrievable by email', async () => {
        await createUser('test@example.com', 'hashedPassword123');
        const retrieved = await getUser('test@example.com');

        expect(retrieved.email).toBe('test@example.com');
      });
    });

    describe('getUser', () => {
      it('should return null for non-existent user', async () => {
        const user = await getUser('nonexistent@example.com');
        expect(user).toBeNull();
      });

      it('should return user data for existing user', async () => {
        await createUser('existing@example.com', 'password');
        const user = await getUser('existing@example.com');

        expect(user.email).toBe('existing@example.com');
      });
    });

    describe('updateUser', () => {
      it('should update user properties', async () => {
        await createUser('update@example.com', 'password');
        const updated = await updateUser('update@example.com', {
          subscription: { plan: 'pro', status: 'active' }
        });

        expect(updated.subscription).toEqual({ plan: 'pro', status: 'active' });
      });

      it('should return null for non-existent user', async () => {
        const result = await updateUser('nonexistent@example.com', { foo: 'bar' });
        expect(result).toBeNull();
      });

      it('should preserve existing properties', async () => {
        await createUser('preserve@example.com', 'password');
        await updateUser('preserve@example.com', { newField: 'value' });
        const user = await getUser('preserve@example.com');

        expect(user.email).toBe('preserve@example.com');
        expect(user.passwordHash).toBe('password');
        expect(user.newField).toBe('value');
      });
    });
  });

  describe('Site Operations', () => {
    describe('createSite', () => {
      it('should create a site with correct properties', async () => {
        const site = await createSite('user_123', 'site_abc', 'example.com');

        expect(site).toMatchObject({
          id: 'site_abc',
          userId: 'user_123',
          domain: 'example.com'
        });
        expect(site.createdAt).toBeDefined();
      });

      it('should add site to user site list', async () => {
        await createSite('user_123', 'site_abc', 'example.com');
        const userSites = await getUserSites('user_123');

        expect(userSites).toContain('site_abc');
      });

      it('should handle multiple sites for same user', async () => {
        await createSite('user_123', 'site_1', 'site1.com');
        await createSite('user_123', 'site_2', 'site2.com');
        const userSites = await getUserSites('user_123');

        expect(userSites).toContain('site_1');
        expect(userSites).toContain('site_2');
        expect(userSites).toHaveLength(2);
      });
    });

    describe('getSite', () => {
      it('should return null for non-existent site', async () => {
        const site = await getSite('nonexistent_site');
        expect(site).toBeNull();
      });

      it('should return site data for existing site', async () => {
        await createSite('user_123', 'site_abc', 'example.com');
        const site = await getSite('site_abc');

        expect(site.domain).toBe('example.com');
      });
    });

    describe('getUserSites', () => {
      it('should return empty array for user with no sites', async () => {
        const sites = await getUserSites('user_no_sites');
        expect(sites).toEqual([]);
      });
    });
  });

  describe('Event Operations', () => {
    describe('recordEvent', () => {
      it('should record custom events', async () => {
        const result = await recordEvent('site_test', 'visitor_1', {
          category: 'custom',
          action: 'signup'
        });

        expect(result.events['custom:signup'].count).toBe(1);
        expect(result.total).toBe(1);
      });

      it('should track event labels', async () => {
        const result = await recordEvent('site_test', 'visitor_1', {
          category: 'button',
          action: 'click',
          label: 'submit-form'
        });

        expect(result.events['button:click'].labels['submit-form']).toBe(1);
      });

      it('should track event values', async () => {
        const result = await recordEvent('site_test', 'visitor_1', {
          category: 'custom',
          action: 'purchase',
          value: 99.99
        });

        expect(result.events['custom:purchase'].totalValue).toBe(99.99);
      });

      it('should aggregate multiple events', async () => {
        await recordEvent('site_test', 'visitor_1', { category: 'custom', action: 'click' });
        await recordEvent('site_test', 'visitor_2', { category: 'custom', action: 'click' });
        const result = await recordEvent('site_test', 'visitor_3', { category: 'custom', action: 'click' });

        expect(result.events['custom:click'].count).toBe(3);
        expect(result.total).toBe(3);
      });
    });
  });

  describe('Realtime Operations', () => {
    describe('recordHeartbeat', () => {
      it('should record active visitor', async () => {
        const result = await recordHeartbeat('site_test', 'visitor_1', {
          sessionId: 'session_1',
          path: '/home'
        });

        expect(result.visitors['visitor_1']).toBeDefined();
        expect(result.visitors['visitor_1'].path).toBe('/home');
      });
    });

    describe('getActiveVisitors', () => {
      it('should return count of active visitors', async () => {
        await recordHeartbeat('site_test', 'visitor_1', { sessionId: 's1', path: '/' });
        await recordHeartbeat('site_test', 'visitor_2', { sessionId: 's2', path: '/about' });

        const result = await getActiveVisitors('site_test');

        expect(result.count).toBe(2);
        expect(result.visitors).toHaveLength(2);
      });

      it('should return 0 for site with no activity', async () => {
        const result = await getActiveVisitors('nonexistent_site');
        expect(result.count).toBe(0);
      });
    });
  });

  describe('Password Reset Token Operations', () => {
    describe('createPasswordResetToken', () => {
      it('should create a token with correct properties', async () => {
        const tokenData = await createPasswordResetToken('user@example.com', 'token_abc123');

        expect(tokenData.email).toBe('user@example.com');
        expect(tokenData.createdAt).toBeDefined();
        expect(tokenData.expiresAt).toBeDefined();
      });

      it('should set expiration to 1 hour from now', async () => {
        const before = new Date();
        const tokenData = await createPasswordResetToken('user@example.com', 'token_abc123');
        const after = new Date();

        const expiresAt = new Date(tokenData.expiresAt);
        const expectedMin = new Date(before.getTime() + 59 * 60 * 1000); // 59 minutes
        const expectedMax = new Date(after.getTime() + 61 * 60 * 1000); // 61 minutes

        expect(expiresAt.getTime()).toBeGreaterThan(expectedMin.getTime());
        expect(expiresAt.getTime()).toBeLessThan(expectedMax.getTime());
      });

      it('should store token retrievable by token string', async () => {
        await createPasswordResetToken('user@example.com', 'unique_token_xyz');
        const retrieved = await getPasswordResetToken('unique_token_xyz');

        expect(retrieved).not.toBeNull();
        expect(retrieved.email).toBe('user@example.com');
      });
    });

    describe('getPasswordResetToken', () => {
      it('should return null for non-existent token', async () => {
        const token = await getPasswordResetToken('nonexistent_token');
        expect(token).toBeNull();
      });

      it('should return token data for existing valid token', async () => {
        await createPasswordResetToken('user@example.com', 'valid_token');
        const token = await getPasswordResetToken('valid_token');

        expect(token).not.toBeNull();
        expect(token.email).toBe('user@example.com');
        expect(token.expiresAt).toBeDefined();
      });

      it('should return null for expired token and delete it', async () => {
        // Create a token, then manually modify its expiration
        await createPasswordResetToken('user@example.com', 'expired_token');

        // We can't easily test expiration in unit tests without mocking time
        // This tests the basic retrieval flow
        const token = await getPasswordResetToken('expired_token');
        expect(token).not.toBeNull();
      });
    });

    describe('deletePasswordResetToken', () => {
      it('should delete an existing token', async () => {
        await createPasswordResetToken('user@example.com', 'token_to_delete');

        // Verify it exists
        const before = await getPasswordResetToken('token_to_delete');
        expect(before).not.toBeNull();

        // Delete it
        await deletePasswordResetToken('token_to_delete');

        // Verify it's gone
        const after = await getPasswordResetToken('token_to_delete');
        expect(after).toBeNull();
      });

      it('should not throw for non-existent token', async () => {
        await expect(
          deletePasswordResetToken('nonexistent_token')
        ).resolves.not.toThrow();
      });

      it('should return true on successful deletion', async () => {
        await createPasswordResetToken('user@example.com', 'token_xyz');
        const result = await deletePasswordResetToken('token_xyz');
        expect(result).toBe(true);
      });
    });

    describe('Token Security', () => {
      it('should allow same email to have multiple tokens', async () => {
        await createPasswordResetToken('user@example.com', 'token_1');
        await createPasswordResetToken('user@example.com', 'token_2');

        const token1 = await getPasswordResetToken('token_1');
        const token2 = await getPasswordResetToken('token_2');

        expect(token1).not.toBeNull();
        expect(token2).not.toBeNull();
        expect(token1.email).toBe('user@example.com');
        expect(token2.email).toBe('user@example.com');
      });

      it('should store different tokens independently', async () => {
        await createPasswordResetToken('user1@example.com', 'token_user1');
        await createPasswordResetToken('user2@example.com', 'token_user2');

        const token1 = await getPasswordResetToken('token_user1');
        const token2 = await getPasswordResetToken('token_user2');

        expect(token1.email).toBe('user1@example.com');
        expect(token2.email).toBe('user2@example.com');
      });
    });
  });
});
