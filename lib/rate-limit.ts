import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * One event against a limit of `limit` per `windowSeconds` for (bucket, key), counted in the database
 * (public.rate_allow), so it holds across server restarts and instances. `key` should already be a hash (ipHash),
 * never a raw IP or address. If the database can't be reached, `failOpen` decides: true for things people need
 * (calling a trader), false for things only an attacker needs in bulk (admin sign-in attempts).
 */
export async function rateAllow(
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number,
  failOpen: boolean,
): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().rpc("rate_allow", {
      p_bucket: bucket,
      p_key: key,
      p_limit: limit,
      p_window: `${windowSeconds} seconds`,
    });
    if (error) throw new Error(error.message);
    return data === true;
  } catch (e) {
    console.error(`rate limit ${bucket}: check failed`, e instanceof Error ? e.message : e);
    return failOpen;
  }
}

/** Whether (bucket, key) has had `limit` failures in the last `windowSeconds`. Unreachable database: `failOpen`. */
export async function tooManyFailures(
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number,
  failOpen: boolean,
): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().rpc("rate_failures", {
      p_bucket: bucket,
      p_key: key,
      p_window: `${windowSeconds} seconds`,
    });
    if (error) throw new Error(error.message);
    return typeof data === "number" && data >= limit;
  } catch (e) {
    console.error(`rate limit ${bucket}: check failed`, e instanceof Error ? e.message : e);
    return !failOpen;
  }
}

/** Records one failure (a wrong password or code) against (bucket, key). */
export async function recordFailure(bucket: string, key: string): Promise<void> {
  const { error } = await createServiceClient().rpc("rate_fail", { p_bucket: bucket, p_key: key });
  if (error) console.error(`rate limit ${bucket}: couldn't record a failure`, error.message);
}
