import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as realAuth from '../../netlify/functions/lib/auth.js';
import * as realStorage from '../../netlify/functions/lib/storage.js';
import * as realTurso from '../../netlify/functions/lib/turso.js';

const getUserById = jest.fn();
const getUserSites = jest.fn();
const getCustomEvents = jest.fn();
const authenticateRequest = jest.fn();

jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({ ...realAuth, authenticateRequest }));
jest.unstable_mockModule('../../netlify/functions/lib/storage.js', () => ({ ...realStorage, getUserById, getUserSites }));
jest.unstable_mockModule('../../netlify/functions/lib/turso.js', () => ({ ...realTurso, getCustomEvents }));

const { default: handler } = await import('../../netlify/functions/events.js');

const SITE = 'site_events00000001';
const get = (siteId = SITE, period = '7d') =>
  handler(new Request(`http://localhost/api/events?siteId=${siteId}&period=${period}`), {});

describe('/api/events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticateRequest.mockResolvedValue({ user: { id: 'user1' } });
    getUserSites.mockResolvedValue([SITE]);
    getUserById.mockResolvedValue({ id: 'user1', plan: 'starter' });
    getCustomEvents.mockResolvedValue({ events: [], daily: [] });
  });

  it('requires a signed-in user', async () => {
    authenticateRequest.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    expect((await get()).status).toBe(401);
    expect(getCustomEvents).not.toHaveBeenCalled();
  });

  it('refuses a site the user does not own', async () => {
    getUserSites.mockResolvedValue(['site_someoneelse0001']);
    expect((await get()).status).toBe(403);
    expect(getCustomEvents).not.toHaveBeenCalled();
  });

  it('respects the customEvents plan feature', async () => {
    getUserById.mockResolvedValue({ id: 'user1', plan: 'free' });
    expect((await get()).status).toBe(403);
    expect(getCustomEvents).not.toHaveBeenCalled();
  });

  it('returns events for the period', async () => {
    getCustomEvents.mockResolvedValue({ events: [{ name: 'chat_opened', count: 2 }], daily: [] });
    const res = await get(SITE, '30d');
    expect(res.status).toBe(200);
    expect((await res.json()).events[0].name).toBe('chat_opened');
    const [siteId, start, end] = getCustomEvents.mock.calls[0];
    expect(siteId).toBe(SITE);
    const days = (new Date(`${end}Z`) - new Date(`${start}Z`)) / 86400000;
    expect(Math.round(days)).toBe(30);
  });

  it('only allows GET', async () => {
    const res = await handler(new Request(`http://localhost/api/events?siteId=${SITE}`, { method: 'POST' }), {});
    expect(res.status).toBe(405);
  });
});
