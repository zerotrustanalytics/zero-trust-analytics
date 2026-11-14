#!/usr/bin/env node
/**
 * One-off: copy every user's stored Stripe subscription (user.subscription) into launchkit/billing's store.
 * The Stripe functions do this on first use anyway; run it to do it up front, or again after a rollback window
 * (a customer who subscribed through the old code in between). Idempotent: an account that already has a billing
 * record is left alone, and user records are never changed.
 *
 *   node scripts/migrate-billing.js        (same env as the functions: TURSO_DATABASE_URL, SELF_HOSTED, ...)
 */
import { migrateUsers, blobKv } from '../netlify/functions/lib/billing.js';

const kv = blobKv();
const done = await migrateUsers({ kv });
await kv.set('meta/users-migrated', { at: Date.now(), count: done.length });
console.log(`Migrated ${done.length} account(s) into billing${done.length ? ': ' + done.join(', ') : ''}.`);
