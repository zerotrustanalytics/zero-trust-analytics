import { isMeteredEvent } from '../../netlify/functions/lib/turso.js';

// What counts as a billable "event" on the monthly quota (track.js meters with
// this; recountMonthlyUsage rebuilds counters with the same rule).
describe('isMeteredEvent', () => {
  it('does not meter automatic beacons or pageviews (pageviews are metered separately)', () => {
    expect(isMeteredEvent('pageview')).toBe(false);
    expect(isMeteredEvent('engagement')).toBe(false);
    expect(isMeteredEvent('heartbeat')).toBe(false);
  });

  it('meters custom and auto-tracked interaction events', () => {
    expect(isMeteredEvent('signup')).toBe(true);
    expect(isMeteredEvent('click')).toBe(true); // outbound links
    expect(isMeteredEvent('custom_engagement')).toBe(true); // user event named "engagement"
  });
});
