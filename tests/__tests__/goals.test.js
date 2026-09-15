import { jest } from '@jest/globals';
import { createHeaders } from './helpers.js';

// Mock @netlify/blobs
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
      async setJSON(key, value) {
        data.set(key, JSON.stringify(value));
      },
      async set(key, value) {
        data.set(key, value);
      },
      async list() {
        return {
          blobs: Array.from(data.keys()).map(key => ({ key }))
        };
      },
      async delete(key) {
        data.delete(key);
      }
    };
  }

  return {
    getStore: ({ name }) => createMockStore(name),
    __clearAllStores: () => stores.clear()
  };
});

// Mock jsonwebtoken
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    verify: jest.fn((token) => {
      if (token === 'valid_token') {
        return { id: 'user_123', email: 'user@example.com' };
      }
      throw new Error('Invalid token');
    })
  }
}));

// Mock turso database for stats
jest.unstable_mockModule('../../netlify/functions/lib/turso.js', () => ({
  getStats: jest.fn(() => Promise.resolve({
    pageviews: 1500,
    uniqueVisitors: 450,
    sessions: 500,
    bounces: 100,
    bounceRate: 20,
    avgTimeOnPage: 120,
    pages: { '/': 800, '/about': 400, '/contact': 300 },
    referrers: { 'google.com': 600, 'twitter.com': 200 },
    devices: { desktop: 1000, mobile: 400, tablet: 100 },
    browsers: { Chrome: 900, Firefox: 400, Safari: 200 },
    operatingSystems: { Windows: 700, macOS: 500, Linux: 300 },
    countries: { US: 900, UK: 300, CA: 300 }
  }))
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Goals Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';

    // Create test user
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('user@example.com', {
      id: 'user_123',
      email: 'user@example.com'
    });

    // Create test site
    const sitesStore = getStore({ name: 'sites' });
    await sitesStore.setJSON('site_test', {
      id: 'site_test',
      userId: 'user_123',
      domain: 'example.com'
    });
    await sitesStore.setJSON('user_sites_user_123', ['site_test']);

    // Create another site for access control testing
    await sitesStore.setJSON('site_other', {
      id: 'site_other',
      userId: 'user_456',
      domain: 'other.com'
    });
  });

  describe('OPTIONS /api/goals', () => {
    it('should handle CORS preflight requests', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const req = {
        method: 'OPTIONS',
        headers: createHeaders({}),
        url: 'https://example.com/api/goals'
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });
  });

  describe('GET /api/goals', () => {
    it('should return empty list when no goals exist', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals?siteId=site_test');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.goals).toEqual([]);
      expect(data.metrics).toBeDefined();
      expect(data.periods).toBeDefined();
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should return goals with current progress', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      // Create pageview data for stats calculation
      const pageviewsStore = getStore({ name: 'pageviews' });
      const today = new Date().toISOString().split('T')[0];
      await pageviewsStore.setJSON(`site_test:${today}`, {
        siteId: 'site_test',
        date: today,
        pageviews: 1500,
        uniqueVisitors: 450,
        uniqueSessions: 500,
        bounces: 100,
        bounceRate: 20
      });

      // Create a goal
      const goalsStore = getStore({ name: 'goals' });
      const goal = {
        id: 'goal_1',
        siteId: 'site_test',
        userId: 'user_123',
        name: 'Reach 1000 pageviews',
        metric: 'pageviews',
        target: 1000,
        period: 'monthly',
        comparison: 'gte',
        currentValue: 0,
        notifyOnComplete: true,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await goalsStore.setJSON('goal_1', goal);
      await goalsStore.setJSON('site_goals_site_test', ['goal_1']);

      const url = new URL('https://example.com/api/goals?siteId=site_test');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.goals).toHaveLength(1);
      expect(data.goals[0].id).toBe('goal_1');
      expect(data.goals[0].name).toBe('Reach 1000 pageviews');
      expect(data.goals[0].currentValue).toBeGreaterThan(0);
      expect(data.goals[0].progress).toBeDefined();
      expect(data.goals[0].isComplete).toBeDefined();
      expect(data.goals[0].dateRange).toBeDefined();
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals?siteId=site_test');

      const req = {
        method: 'GET',
        headers: createHeaders({}),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should require siteId parameter', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID required');
    });

    it('should deny access to sites user does not own', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals?siteId=site_other');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });

    it('should calculate completion status correctly for gte comparison', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      // Create pageview data for stats calculation
      const pageviewsStore = getStore({ name: 'pageviews' });
      const today = new Date().toISOString().split('T')[0];
      await pageviewsStore.setJSON(`site_test:${today}`, {
        siteId: 'site_test',
        date: today,
        pageviews: 1500,
        uniqueVisitors: 450,
        uniqueSessions: 500,
        bounces: 100,
        bounceRate: 20
      });

      const goalsStore = getStore({ name: 'goals' });
      const goal = {
        id: 'goal_2',
        siteId: 'site_test',
        userId: 'user_123',
        name: 'Reach 1000 pageviews',
        metric: 'pageviews',
        target: 1000,
        period: 'monthly',
        comparison: 'gte',
        currentValue: 0,
        notifyOnComplete: false,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await goalsStore.setJSON('goal_2', goal);
      await goalsStore.setJSON('site_goals_site_test', ['goal_2']);

      const url = new URL('https://example.com/api/goals?siteId=site_test');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.goals[0].isComplete).toBe(true); // 1500 >= 1000
    });

    it('should calculate completion status correctly for lte comparison', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const goalsStore = getStore({ name: 'goals' });
      const goal = {
        id: 'goal_3',
        siteId: 'site_test',
        userId: 'user_123',
        name: 'Keep bounce rate under 30%',
        metric: 'bounceRate',
        target: 30,
        period: 'monthly',
        comparison: 'lte',
        currentValue: 0,
        notifyOnComplete: false,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await goalsStore.setJSON('goal_3', goal);
      await goalsStore.setJSON('site_goals_site_test', ['goal_3']);

      const url = new URL('https://example.com/api/goals?siteId=site_test');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.goals[0].isComplete).toBe(true); // 20 <= 30
    });
  });

  describe('POST /api/goals', () => {
    it('should create a new goal', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          siteId: 'site_test',
          name: 'New Goal',
          metric: 'pageviews',
          target: 2000,
          period: 'weekly',
          comparison: 'gte',
          notifyOnComplete: true
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.goal).toBeDefined();
      expect(data.goal.name).toBe('New Goal');
      expect(data.goal.metric).toBe('pageviews');
      expect(data.goal.target).toBe(2000);
      expect(data.goal.period).toBe('weekly');
      expect(data.goal.comparison).toBe('gte');
      expect(data.goal.notifyOnComplete).toBe(true);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'POST',
        headers: createHeaders({ 'content-type': 'application/json' }),
        url: url.toString(),
        json: async () => ({
          siteId: 'site_test',
          name: 'New Goal',
          metric: 'pageviews',
          target: 2000
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should require siteId', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          name: 'New Goal',
          metric: 'pageviews',
          target: 2000
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID required');
    });

    it('should deny access to sites user does not own', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          siteId: 'site_other',
          name: 'New Goal',
          metric: 'pageviews',
          target: 2000
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });

    it('should validate metric values', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          siteId: 'site_test',
          name: 'Invalid Goal',
          metric: 'invalid_metric',
          target: 2000
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid metric');
    });

    it('should validate period values', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          siteId: 'site_test',
          name: 'Invalid Goal',
          metric: 'pageviews',
          target: 2000,
          period: 'invalid_period'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid period');
    });

    it('should use default values when optional fields are missing', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          siteId: 'site_test',
          name: 'Minimal Goal'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.goal.target).toBeGreaterThan(0);
      expect(data.goal.comparison).toBe('gte');
    });

    it('should ensure minimum target value of 1', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          siteId: 'site_test',
          name: 'Low Target Goal',
          target: -100
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.goal.target).toBe(1);
    });
  });

  describe('PATCH /api/goals', () => {
    it('should update an existing goal', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      // Create a goal first
      const goalsStore = getStore({ name: 'goals' });
      const goal = {
        id: 'goal_update',
        siteId: 'site_test',
        userId: 'user_123',
        name: 'Original Name',
        metric: 'pageviews',
        target: 1000,
        period: 'monthly',
        comparison: 'gte',
        currentValue: 500,
        notifyOnComplete: false,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await goalsStore.setJSON('goal_update', goal);

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'PATCH',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          goalId: 'goal_update',
          name: 'Updated Name',
          target: 2000,
          notifyOnComplete: true
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.goal).toBeDefined();
      expect(data.goal.name).toBe('Updated Name');
      expect(data.goal.target).toBe(2000);
      expect(data.goal.notifyOnComplete).toBe(true);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'PATCH',
        headers: createHeaders({ 'content-type': 'application/json' }),
        url: url.toString(),
        json: async () => ({
          goalId: 'goal_update',
          name: 'Updated Name'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should require goalId', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'PATCH',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          name: 'Updated Name'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Goal ID required');
    });

    it('should return 404 for non-existent goal', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'PATCH',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          goalId: 'nonexistent_goal',
          name: 'Updated Name'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('Goal not found');
    });
  });

  describe('DELETE /api/goals', () => {
    it('should delete an existing goal', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      // Create a goal first
      const goalsStore = getStore({ name: 'goals' });
      const goal = {
        id: 'goal_delete',
        siteId: 'site_test',
        userId: 'user_123',
        name: 'Goal to Delete',
        metric: 'pageviews',
        target: 1000,
        period: 'monthly',
        comparison: 'gte',
        currentValue: 500,
        notifyOnComplete: false,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await goalsStore.setJSON('goal_delete', goal);
      await goalsStore.setJSON('site_goals_site_test', ['goal_delete']);

      const url = new URL('https://example.com/api/goals?goalId=goal_delete');

      const req = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals?goalId=goal_delete');

      const req = {
        method: 'DELETE',
        headers: createHeaders({}),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should require goalId parameter', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Goal ID required');
    });

    it('should return 404 for non-existent goal', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals?goalId=nonexistent_goal');

      const req = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('Goal not found');
    });
  });

  describe('Invalid HTTP Methods', () => {
    it('should reject PUT requests', async () => {
      const { default: handler } = await import('../../netlify/functions/goals.js');

      const url = new URL('https://example.com/api/goals');

      const req = {
        method: 'PUT',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toContain('Method not allowed');
    });
  });
});
