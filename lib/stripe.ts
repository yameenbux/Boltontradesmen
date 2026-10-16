import "server-only";
import Stripe from "stripe";
import type { StripeConfig } from "@/lib/pro";

// The Stripe client, made only when Pro is configured (lib/pro.ts stripeConfig) and only on the server. The secret
// key never reaches a browser and is never logged.
let cached: { key: string; client: Stripe } | null = null;

export function stripeClient(cfg: Pick<StripeConfig, "secretKey">): Stripe {
  if (cached?.key !== cfg.secretKey) {
    cached = { key: cfg.secretKey, client: new Stripe(cfg.secretKey, { maxNetworkRetries: 2, timeout: 20_000 }) };
  }
  return cached.client;
}

/** Signature checks need no key; a client with a dummy one does them without ever calling Stripe. */
export function stripeVerifier(): Stripe {
  return stripeClient({ secretKey: process.env.STRIPE_SECRET_KEY?.trim() || "sk_unset_signature_checks_only" });
}
