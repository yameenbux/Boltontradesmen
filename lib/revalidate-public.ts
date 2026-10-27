import { revalidatePath } from "next/cache";
import { PLATFORM_BASE } from "@/lib/paths";
import { badgePath } from "@/lib/share";

// Route patterns (with [segments]) name the folder, route group included (app/(platform)/…); literal paths are URLs.
const GROUP = "/(platform)";

/**
 * Refresh the cached public pages after a write that changes what they show (provider edits, status changes,
 * reviews, replies, moderation), and the price guides. With a slug, that provider's profile is refreshed by its exact path too, and so
 * are its website badges (a badge earned or lost, a new name), which otherwise refresh within the hour.
 */
export function revalidatePublicPages(slug?: string): void {
  revalidatePath(`${GROUP}/p/[slug]`, "page");
  revalidatePath(`${GROUP}/c/[category]`, "page");
  revalidatePath("/");
  revalidatePath(`${PLATFORM_BASE}/trades`);
  // A review posted, edited or removed can publish or withdraw a price guide (otherwise refreshed hourly).
  revalidatePath(`${GROUP}/prices/[category]`, "page");
  revalidatePath(`${PLATFORM_BASE}/prices`);
  if (slug) {
    revalidatePath(`${PLATFORM_BASE}/p/${encodeURIComponent(slug)}`);
    revalidatePath(badgePath(slug, "svg"));
    revalidatePath(badgePath(slug, "png"));
  }
}

/**
 * Refresh the cached community question pages after a question or answer is posted, approved or removed: the Ask list
 * and, with an id, that question's page.
 */
export function revalidateQuestionPages(questionId?: string): void {
  revalidatePath(`${PLATFORM_BASE}/ask`);
  if (questionId) revalidatePath(`${PLATFORM_BASE}/ask/${encodeURIComponent(questionId)}`);
}
