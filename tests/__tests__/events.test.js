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
// Responses are cached per site and period, so each test uses its own site.
let siteNumber = 1;
const nextSite = () => `site_events${String(siteNumber++).padStart(8, '0')}`;
const get = (siteId = SITE, period = '7d', extra = '', headers = {}) =>
  handler(new Request(`http://localhost/api/events?siteId=${siteId}&period=${period}${extra}`, { headers }), {});

describe('/api/events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticateRequest.mockResolvedValue({ user: { id: 'user1' } });
    getUserSites.mockResolvedValue([SITE]);
    getUserById.mockResolvedValue({ id: 'user1', plan: 'starter' });
    getCustomEvents.mockResolvedValue({ events: [], truncated: false });
  });

  it('requires a signed-in user', async () => {
    authenticateRequest.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    expect((await get()).status).toBe(401);
    expect(getCustomEvents).not.toHaveBeenCalled();
  });

  it('refuses a site the user does not own', async () => {
    getUserSites.mockResolvedValue(['site_someoneelse0001']);
    const res = await get();
    expect(res.status).toBe(403);
    expect((await res.json()).code).not.toBe('PLAN_REQUIRED');
    expect(getCustomEvents).not.toHaveBeenCalled();
  });

  it('respects the customEvents plan feature', async () => {
    getUserById.mockResolvedValue({ id: 'user1', plan: 'free' });
    const res = await get();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PLAN_REQUIRED');
    expect(getCustomEvents).not.toHaveBeenCalled();
  });

  it('returns events for the period', async () => {
    const site = nextSite();
    getUserSites.mockResolvedValue([site]);
    getCustomEvents.mockResolvedValue({ events: [{ name: 'chat_opened', count: 2 }], truncated: false });
    const res = await get(site, '30d');
    expect(res.status).toBe(200);
    expect((await res.json()).events[0].name).toBe('chat_opened');
    const [siteId, start, end, prefix] = getCustomEvents.mock.calls[0];
    expect(siteId).toBe(site);
    expect(prefix).toBe('');
    expect(Math.round((new Date(`${end}Z`) - new Date(`${start}Z`)) / 86400000)).toBe(30);
  });

  it('caps long ranges at the default instead of scanning a year', async () => {
    const site = nextSite();
    getUserSites.mockResolvedValue([site]);
    await get(site, '365d');
    const [, start, end] = getCustomEvents.mock.calls[0];
    expect(Math.round((new Date(`${end}Z`) - new Date(`${start}Z`)) / 86400000)).toBe(7);
  });

  it('only accepts known name prefixes', async () => {
    const site = nextSite();
    getUserSites.mockResolvedValue([site]);
    await get(site, '7d', '&prefix=chat_');
    expect(getCustomEvents.mock.calls[0][3]).toBe('chat_');
    const other = nextSite();
    getUserSites.mockResolvedValue([other]);
    await get(other, '7d', '&prefix=%25');
    expect(getCustomEvents.mock.calls[1][3]).toBe('');
  });

  it('serves repeat views from the cache', async () => {
    const site = nextSite();
    getUserSites.mockResolvedValue([site]);
    await get(site);
    await get(site);
    expect(getCustomEvents).toHaveBeenCalledTimes(1);
  });

  it('only allows GET', async () => {
    const res = await handler(new Request(`http://localhost/api/events?siteId=${SITE}`, { method: 'POST' }), {});
    expect(res.status).toBe(405);
  });
});
