import type { Billing, CatalogEntry } from './billing.js';

export type BillingAuth = (req: Request) => string | { orgId: string; email?: string } | null | undefined | false | Promise<string | { orgId: string; email?: string } | null | undefined | false>;
type UrlOpt = string | ((req: Request) => string | Promise<string>);
export interface BillingRoutesOptions {
  /** The signed-in org (or { orgId, email }) for this request, or null for "not signed in" (401). Never called for /webhook. */
  auth: BillingAuth;
  /** Where the browser lands after checkout (default "/"). Relative URLs resolve against `origin`. */
  successUrl?: UrlOpt;
  cancelUrl?: UrlOpt;
  /** Where the customer portal sends people back to. */
  returnUrl?: UrlOpt;
  basePath?: string;
  /** Public origin, for hosts that sit behind a proxy ("https://app.example.com"). Default: the request's own. */
  origin?: string | ((req: Request) => string | Promise<string>) | null;
  /** Override the plan list returned by GET /status. */
  plans?: { plans: CatalogEntry[]; items: CatalogEntry[] };
}
export function billingRoutes(billing: Billing, options: BillingRoutesOptions): (req: Request) => Promise<Response>;
export function errorResponse(e: unknown): Response;
