// TRIAL (branch trial/cloudflare-workers): OpenNext adapter config for Cloudflare Workers.
// No incremental cache override: fine for a local workerd trial, but every ISR/SSG page is then rendered on every
// request. Production would want R2 (or KV) here so ISR survives across isolates and cached pages skip rendering;
// see the OpenNext Cloudflare caching docs.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
