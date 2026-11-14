import type { Store } from './store.js';
import type { Billing, BillingProvider, BillingOptions } from './billing.js';

/** A lazy environment reference: resolved when billing is first built, never at import or build time. */
export interface EnvRef<N extends string = string> {
  readonly name: N;
  readonly fallback: string | undefined;
}
export function env<const N extends string>(name: N, fallback?: string): EnvRef<N>;
export namespace env {
  /** A lazy list: resolves to an array (comma or whitespace separated); unset is [], never an error. */
  function list<const N extends string>(name: N, fallback?: string): EnvRef<N> & { readonly list: true };
}
export function isEnv(v: unknown): v is EnvRef;
export function resolveEnv<T>(v: T | EnvRef, source?: Record<string, string | undefined>, where?: string): T | string | string[];
export function tryEnv<T>(v: T | EnvRef, source?: Record<string, string | undefined>): T | string | undefined;

export class BillingConfigError extends Error {
  code: 'invalid-config' | 'missing-env' | 'unsupported' | 'unknown-feature';
}

export type Interval = 'month' | 'year';
/** An amount in major units, or an amount with the price's own lookup key (used as given) and/or an existing price id. */
export type PriceInput = number | { amount: number; lookupKey?: string; id?: string | EnvRef };
export interface UsageTier {
  /** The last unit of this tier, or 'inf' for the final tier. */
  upTo: number | 'inf';
  /** Major units per unit (0.02 is two cents). */
  unitAmount?: number;
  /** A flat fee for the tier, major units. */
  flatAmount?: number;
}
export interface PlanInput {
  /** The text the pricing UI shows. */
  name: string;
  /** The provider's product id: a literal or env('PRODUCT_PRO'). `launchkit billing sync` creates the product and writes this variable. */
  product?: string | EnvRef;
  /** The name the provider shows for the product (default: `name`). An adopted product is only renamed to it by a normal sync. */
  productName?: string;
  /** Major units: 29 is $29, or { amount, lookupKey, id } to keep the price's own lookup key / id. Optional for a plan that is identified (priceIds / match / matchMetadata) or metered. */
  price?: { monthly?: PriceInput; yearly?: PriceInput };
  /** Optional explicit price ids (env refs); by default prices are found by lookup key lk_<plan>_<interval>. */
  priceId?: { monthly?: string | EnvRef; yearly?: string | EnvRef };
  /** The plan's lookup keys, used as given (never renamed): gatekeep_pro_base_v2. `usage` is the metered price, `seat` the seat price. */
  lookupKeys?: { monthly?: string; yearly?: string; usage?: string; seat?: string };
  /** Metered: a flat price per unit OR graduated/volume tiers; base is an optional flat monthly fee. Replaces `price`. */
  usage?: {
    meter: string | EnvRef;
    unitPrice?: number;
    tiers?: readonly UsageTier[];
    tiersMode?: 'graduated' | 'volume';
    base?: PriceInput;
    aggregation?: 'sum' | 'last' | 'max';
    /** The name the app passes to reportUsage({ meter }) when it is not the event name. */
    alias?: string;
    displayName?: string;
    lookupKey?: string;
  };
  features?: readonly string[];
  highlight?: boolean;
  trialDays?: number;
  /** true: the base price times a quantity. An object: a separate seat line item (its own price, product and fixed quantity) next to the base price. */
  perSeat?: boolean | { price: PriceInput; product?: string | EnvRef; productName?: string; quantity?: number; lookupKey?: string; id?: string | EnvRef };
  seats?: { min?: number; max?: number | ((orgId: string) => number | Promise<number>) };
  /** Price ids that mean this plan (matching only): env.list('STRIPE_PRO_PRICES'). */
  priceIds?: readonly string[] | (EnvRef & { readonly list: true });
  /** A subscription item belongs to this plan. Plans are tried in order; the first match wins. */
  match?: (item: any, ctx: { env: Record<string, string | undefined> }) => boolean;
  /** false: match by lookup key / price id only, not by `product`. */
  matchProduct?: boolean;
  /** Subscription metadata that identifies the plan (what an inline-priced checkout stamped on it). */
  matchMetadata?: Record<string, string>;
  /** false: existing subscribers are on auto-generated inline prices; sync never adopts or tags prices of this plan. */
  adoptPrices?: boolean;
  credits?: number;
  /** Passed to the runtime plan unchanged (hooks read it). */
  meta?: Record<string, unknown>;
  /** Lemon Squeezy: the variant's name, when it is not "<Plan> Monthly". */
  variantName?: { monthly?: string; yearly?: string };
}
export interface ItemInput {
  name: string;
  product?: string | EnvRef;
  productName?: string;
  price: PriceInput;
  priceId?: string | EnvRef;
  lookupKey?: string;
  credits?: number;
  meta?: Record<string, unknown>;
  match?: (item: any, ctx: { env: Record<string, string | undefined> }) => boolean;
  adoptPrices?: boolean;
}
export interface CheckoutContext {
  orgId: string;
  plan: string | null;
  planId: string | null;
  itemId: string | null;
  kind: 'subscription' | 'payment';
  interval: Interval | null;
  customerEmail: string | null;
  seats: number | null;
}
export interface HooksInput {
  onPeriod?: BillingOptions['onPeriod'];
  onPurchase?: BillingOptions['onPurchase'];
  onEvent?: BillingOptions['onEvent'];
  onUnclaimed?: BillingOptions['onUnclaimed'];
  canBind?: BillingOptions['canBind'];
  onConflict?: BillingOptions['onConflict'];
  orgExists?: BillingOptions['orgExists'];
  parseReference?: BillingOptions['parseReference'];
  entitlements?: { onChange?: (e: any) => unknown };
}

export interface ChangeEvent<P extends string = string> {
  orgId: string;
  /** The plan id from your config ('pro'), also for yearly subscribers. */
  plan: P | null;
  /** The id billing uses internally ('pro_yearly'). */
  planId: string | null;
  interval: Interval | null;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';
  before: any;
  after: any;
  [more: string]: any;
}

export interface BillingInput<P extends Record<string, PlanInput>, F extends Record<string, readonly (keyof P & string)[]>> {
  provider?: 'stripe' | 'lemonsqueezy' | EnvRef;
  /** 'webhook-only': no secret key at runtime (Payment Links); 'auto': webhook-only while the provider key is missing. */
  mode?: 'api' | 'webhook-only' | 'auto';
  /** Lemon Squeezy store id (default env LEMONSQUEEZY_STORE_ID). */
  storeId?: number | string | EnvRef;
  apiVersion?: string | EnvRef;
  /** One-time purchases: checkout(orgId, { itemId }), onPurchase({ item }). */
  items?: Record<string, ItemInput>;
  webhook?: { path?: string; extraEvents?: readonly string[] };
  /** false: sync leaves the customer portal alone. */
  portal?: boolean;
  hooks?: HooksInput;
  graceMs?: number;
  /** Defaults merged under every checkout's own `extra`. */
  checkout?: { extra?: Record<string, any> | ((ctx: CheckoutContext) => Record<string, any> | Promise<Record<string, any>>) };
  plans: P & { [K in keyof P]: { [X in Exclude<keyof P[K], keyof PlanInput>]: never } };
  /** feature name -> the plans that include it. A typo in a plan id is a compile error. */
  features?: F;
  currency?: string;
  onChange?: (e: ChangeEvent<keyof P & string>) => unknown;
}

export interface NormalizedPlan {
  readonly key: string;
  readonly name: string;
  readonly product?: string | EnvRef;
  readonly productName?: string;
  readonly price: { readonly monthly?: number; readonly yearly?: number };
  readonly priceId?: { readonly monthly?: string | EnvRef; readonly yearly?: string | EnvRef };
  readonly lookupKeys?: { readonly monthly?: string; readonly yearly?: string; readonly usage?: string; readonly seat?: string };
  readonly usage?: { readonly meter: string | EnvRef; readonly unitPrice?: number; readonly tiers?: readonly UsageTier[]; readonly tiersMode?: 'graduated' | 'volume'; readonly base?: number; readonly aggregation: 'sum' | 'last' | 'max'; readonly alias?: string; readonly displayName?: string };
  readonly features: readonly string[];
  readonly highlight: boolean;
  readonly trialDays?: number;
  readonly perSeat: boolean;
  readonly seat?: { readonly amount: number; readonly quantity: number; readonly product?: string | EnvRef; readonly productName?: string; readonly id?: string | EnvRef };
  readonly seats?: { readonly min?: number; readonly max?: number | ((orgId: string) => number | Promise<number>) };
  readonly priceIds?: readonly string[] | EnvRef;
  readonly match?: PlanInput['match'];
  readonly matchProduct: boolean;
  readonly matchMetadata?: Readonly<Record<string, string>>;
  readonly adoptPrices: boolean;
  readonly credits?: number;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly variantName?: { readonly monthly?: string; readonly yearly?: string };
}
export interface NormalizedItem {
  readonly id: string;
  readonly name: string;
  readonly product?: string | EnvRef;
  readonly productName?: string;
  readonly amount: number;
  readonly lookupKey: string;
  readonly priceId?: string | EnvRef;
  readonly adoptPrices: boolean;
  readonly credits?: number;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** What defineBilling returns: frozen, and typed with the literal plan ids and feature names. */
export interface BillingDefinition<P extends Record<string, PlanInput> = Record<string, PlanInput>, F extends Record<string, readonly string[]> = Record<string, readonly string[]>> {
  readonly provider: 'stripe' | 'lemonsqueezy' | EnvRef;
  readonly mode: 'api' | 'webhook-only' | 'auto';
  readonly currency: string;
  readonly plans: { readonly [K in keyof P]: NormalizedPlan };
  readonly items: { readonly [id: string]: NormalizedItem };
  readonly storeId?: number | string | EnvRef;
  readonly apiVersion?: string | EnvRef;
  readonly webhook: { readonly path?: string; readonly extraEvents?: readonly string[] };
  readonly portal: boolean;
  readonly hooks?: HooksInput;
  readonly graceMs?: number;
  readonly checkout?: BillingInput<any, any>['checkout'];
  readonly features: { readonly [K in keyof F]: readonly (keyof P & string)[] };
  readonly onChange?: (e: ChangeEvent<keyof P & string>) => unknown;
}

export function defineBilling<const P extends Record<string, PlanInput>, const F extends Record<string, readonly (keyof P & string)[]> = {}>(config: BillingInput<P, F>): BillingDefinition<P, F>;

/** 'starter' | 'pro' | 'team': the plan ids of a definition (or of the billing built from it). */
export type PlanKey<D> = D extends { readonly plans: infer P } ? keyof P & string : never;
/** 'exports' | 'api': the feature names of a definition. */
export type FeatureName<D> = D extends { readonly features: infer F } ? keyof F & string : never;
/** The definition behind a configured billing (typeof billing). */
export type DefinitionOf<B> = B extends { readonly def: infer D } ? D : never;

type CheckoutArgs = Parameters<Billing['checkout']>[1];
export interface ConfiguredBilling<D> extends Omit<Billing, 'checkout' | 'changePlan' | 'canUse'> {
  readonly def: D;
  readonly provider: 'stripe' | 'lemonsqueezy';
  /** The config plan id for a billing plan id ('pro_yearly' -> 'pro'), or null. */
  planKey(id: string | null): PlanKey<D> | null;
  checkout(orgId: string, args: Omit<CheckoutArgs, 'planId'> & { plan: PlanKey<D>; interval?: Interval | 'monthly' | 'yearly' }): Promise<string>;
  checkout(orgId: string, args: Omit<CheckoutArgs, 'planId' | 'itemId'> & { itemId: string }): Promise<string>;
  changePlan(orgId: string, plan: PlanKey<D>, opts?: { interval?: Interval | 'monthly' | 'yearly'; proration?: string }): Promise<any>;
  /** canUse(orgId): is the subscription live? canUse(orgId, 'exports'): live AND on a plan that lists the feature. */
  canUse(orgId: string): Promise<boolean>;
  canUse(orgId: string, feature: FeatureName<D>): Promise<boolean>;
  /** Web-standard (Request) => Response for /api/billing/*; needs `auth`. */
  handler(req: Request): Promise<Response>;
}

export interface FromConfigOptions extends Omit<BillingOptions, 'plans' | 'items' | 'store' | 'stripe' | 'provider' | 'webhookSecret' | 'bindingSecret'> {
  /** The fetch the provider built from the environment uses (tests, Netlify). */
  fetch?: typeof fetch;
  store: Store;
  /** The signed-in org id (or { orgId, email }), or null. Required to use `.handler`. */
  auth?: (req: Request) => string | { orgId: string; email?: string } | null | Promise<string | { orgId: string; email?: string } | null>;
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Replace the provider built from the environment (tests, custom adapters). */
  provider?: BillingProvider;
  providerName?: 'stripe' | 'lemonsqueezy';
  webhookSecret?: string;
  bindingSecret?: string;
  successUrl?: string | ((req: Request) => string);
  cancelUrl?: string | ((req: Request) => string);
  returnUrl?: string | ((req: Request) => string);
  origin?: string | ((req: Request) => string);
  basePath?: string;
  [more: string]: any;
}
export function createBillingFromConfig<D extends BillingDefinition<any, any>>(def: D, options: FromConfigOptions): ConfiguredBilling<D>;

/** Events a webhook endpoint must subscribe to, derived from what billing.js handles. */
export const REQUIRED_EVENTS: { readonly stripe: readonly string[]; readonly lemonsqueezy: readonly string[] };

export interface Sellable {
  id: string;
  plan: string;
  kind: 'monthly' | 'yearly';
  interval: Interval;
  amount: number | undefined;
  lookupKey: string;
  flat: boolean;
  /** A plan that is identified (priceIds / match) but has nothing to sell. */
  priceless?: boolean;
}
export function sellables(def: BillingDefinition<any, any>): Sellable[];
export const lookupKeyFor: (plan: string, interval: 'monthly' | 'yearly' | 'usage' | 'seat') => string;
export const itemLookupKey: (id: string) => string;
/** The lookup key of one of a plan's prices: the config's own key as given, else lk_<plan>_<kind>. */
export const priceKey: (plan: NormalizedPlan, kind: 'monthly' | 'yearly' | 'usage' | 'seat') => string;
export function seatPrices(def: BillingDefinition<any, any>): { plan: string; kind: 'seat'; interval: Interval; amount: number; lookupKey: string; quantity: number }[];
export function itemPrices(def: BillingDefinition<any, any>): { id: string; kind: 'item'; interval: null; amount: number; lookupKey: string }[];
export const usageLookupKey: (plan: string) => string;
export const variantEnvName: (plan: string, interval: 'monthly' | 'yearly') => string;
export const cents: (major: number) => number;
export const centsDecimal: (major: number) => string;

/**
 * Typed UI: pass the React module (`import * as ui from './vendor/launchkit/ui/react.jsx'`) and get it back with
 * <Upgrade plan="pro"> restricted to your plan ids.
 */
export function typedUi<D, M extends { Upgrade: (props: any) => any }>(
  def: D,
  ui: M,
): Omit<M, 'Upgrade'> & { Upgrade: (props: Omit<Parameters<M['Upgrade']>[0], 'plan'> & { plan: PlanKey<D> }) => ReturnType<M['Upgrade']> };
/** Props for the <lk-upgrade> element in HTML/JSX, typed to your plans. */
export interface LkUpgradeAttributes<D> {
  plan: PlanKey<D>;
  quantity?: number;
}
