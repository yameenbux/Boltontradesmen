import { revalidatePath } from "next/cache";
import { PLATFORM_BASE } from "@/lib/paths";

/**
 * Refresh the cached public pages after a write that changes what they show (provider edits, status changes,
 * reviews, replies, moderation). With a slug, that provider's profile is refreshed by its exact path too.
 */
export function revalidatePublicPages(slug?: string): void {
  revalidatePath(`${PLATFORM_BASE}/p/[slug]`, "page");
  revalidatePath(`${PLATFORM_BASE}/c/[category]`, "page");
  revalidatePath(PLATFORM_BASE);
  if (slug) revalidatePath(`${PLATFORM_BASE}/p/${encodeURIComponent(slug)}`);
}
