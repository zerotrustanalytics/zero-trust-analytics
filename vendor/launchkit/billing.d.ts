import type { Store } from './store.js';

export class BillingError extends Error {
  constructor(message: string, code: string, status?: number);
  code: string;
  status: number;
}

/** A plan or one-time item. Exactly one of priceId / variantId / productId / lookupKey / match identifies it. Other fields pass through to hooks. */
export interface PlanConfig {
  priceId?: string | string[];
  variantId?: string | string[];
  productId?: string | string[];
  lookupKey?: string | string[];
  match?: (item: any) => boolean;
  seats?: number;
  perSeat?: boolean;
  minSeats?: number;
  maxSeats?: number | ((orgId: string) => number | Promise<number>);
  credits?: number;
  name?: string;
  trialDays?: number;
  /** Shown by the pricing UI and returned by GET /status: { name, price, interval, features, highlight }. */
  display?: { name?: string; price?: string | number; interval?: string; features?: string[]; highlight?: boolean };
  inlinePrice?: { currency?: string; unitAmount: number; name?: string; productId?: string; interval?: string };
  lineItems?: any[];
  [extra: string]: any;
}

export type BillingStatusName = 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';
export interface BillingStatus {
  plan: string | null;
  status: BillingStatusName;
  seats: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}
export interface BillingStatusDetail extends BillingStatus {
  endsAt: number | null;
  trialEndsAt: number | null;
  portalUrl: string | null;
  items: { role: string; quantity: number; ref: string }[];
}
export interface EntitlementChange {
  orgId: string;
  before: BillingStatusDetail;
  after: BillingStatusDetail;
  customerRef: string | null;
  subscriptionRef: string | null;
  plan: string | null;
  status: BillingStatusName;
  items: BillingStatusDetail['items'];
}
export interface BillingProvider {
  name: string;
  [method: string]: any;
}
export interface BillingOptions {
  store: Store;
  provider?: BillingProvider;
  stripe?: any;
  seats?: any;
  plans?: Record<string, PlanConfig>;
  items?: Record<string, PlanConfig>;
  onPeriod?: (e: { key: string; orgId: string; planId: string; plan: PlanConfig; subscriptionId: string; period: { start: number; end: number } }) => unknown;
  onPurchase?: (e: { key: string; orgId: string; itemId: string; item: PlanConfig; session: any }) => unknown;
  entitlements?: { onChange?: (e: EntitlementChange) => unknown };
  orgExists?: (orgId: string) => unknown;
  parseReference?: (ref: string) => string | null;
  onUnclaimed?: (e: { event: any; email: string | null }) => unknown;
  onEvent?: (e: any) => unknown;
  canBind?: (e: any) => unknown;
  onConflict?: (e: any) => unknown;
  bindingSecret?: string | null;
  meters?: Record<string, string>;
  usage?: { retries?: number; sleep?: (ms: number) => Promise<void> };
  webhookSecret?: string | null;
  toleranceSec?: number;
  graceMs?: number;
  now?: () => number;
}
export interface CatalogEntry {
  id: string;
  [field: string]: any;
}
export interface Billing {
  checkout(orgId: string, args: { planId?: string; itemId?: string; seats?: number; quantity?: number; successUrl: string; cancelUrl: string; customerEmail?: string; extra?: any; trialDays?: number }): Promise<string>;
  portal(orgId: string, args: { returnUrl: string }): Promise<string>;
  handleWebhook(rawBody: string | Uint8Array | ArrayBuffer, signature: string | null): Promise<{ ok: true; type?: string; handled: boolean; duplicate?: boolean; ignored?: string }>;
  changePlan(orgId: string, planId: string, opts?: { proration?: string }): Promise<any>;
  setQuantity(orgId: string, role: string, n: number, opts?: { proration?: string }): Promise<any>;
  reportUsage(orgId: string, args: { meter: string; value: number; timestamp?: number; idempotencyKey?: string }): Promise<any>;
  usage: { flush(): Promise<{ sent: number; failed: number; pending: number }> };
  adopt(orgId: string, args: any): Promise<any>;
  claim(orgId: string, args: { email: string }): Promise<{ claimed: number; events: string[] }>;
  sync(orgId: string): Promise<{ status: BillingStatus; applied: any }>;
  syncAll(): Promise<{ synced: string[]; failed: { orgId: string; error: string }[] }>;
  confirm(orgId: string, checkoutSessionId: string): Promise<{ status: BillingStatus; applied: boolean }>;
  /** What can be bought, with every provider id removed (for a pricing UI). */
  catalog(): { plans: CatalogEntry[]; items: CatalogEntry[] };
  status(orgId: string): Promise<BillingStatus>;
  status(orgId: string, opts: { detail: true }): Promise<BillingStatusDetail>;
  status(orgId: string, opts?: { detail?: boolean }): Promise<BillingStatus | BillingStatusDetail>;
  canUse(orgId: string): Promise<boolean>;
}
export function createBilling(options: BillingOptions): Billing;
export function createStripeRest(options?: { secretKey?: string; webhookOnly?: boolean; fetch?: typeof fetch; baseUrl?: string; apiVersion?: string | null; timeoutMs?: number; portalConfiguration?: string | null }): BillingProvider & Record<string, any>;
export function createLemonSqueezy(options?: { apiKey?: string; storeId?: string | number; webhookSecret?: string | null; webhookOnly?: boolean; fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number; testMode?: boolean; licenseKeys?: boolean }): BillingProvider & Record<string, any>;
export function stripeProvider(stripe?: any): BillingProvider;
export function verifySignature(rawBody: string | Uint8Array | ArrayBuffer, header: string, secret: string, opts?: { toleranceSec?: number; nowSec?: number }): Promise<void>;
export function signWebhook(rawBody: string | Uint8Array | ArrayBuffer, secret: string, t?: number): Promise<string>;
export function signLemonSqueezy(rawBody: string | Uint8Array | ArrayBuffer, secret: string): Promise<string>;
/** The events billing acts on; a webhook endpoint subscribes to exactly these. */
export const STRIPE_WEBHOOK_EVENTS: readonly string[];
export const LEMONSQUEEZY_WEBHOOK_EVENTS: readonly string[];
