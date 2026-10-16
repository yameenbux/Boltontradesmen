import { revalidatePath } from "next/cache";
import { PLATFORM_BASE } from "@/lib/paths";
import { badgePath } from "@/lib/share";

/**
 * Refresh the cached public pages after a write that changes what they show (provider edits, status changes,
 * reviews, replies, moderation). With a slug, that provider's profile is refreshed by its exact path too, and so
 * are its website badges (a badge earned or lost, a new name), which otherwise refresh within the hour.
 */
export function revalidatePublicPages(slug?: string): void {
  revalidatePath(`${PLATFORM_BASE}/p/[slug]`, "page");
  revalidatePath(`${PLATFORM_BASE}/c/[category]`, "page");
  revalidatePath(PLATFORM_BASE);
  if (slug) {
    revalidatePath(`${PLATFORM_BASE}/p/${encodeURIComponent(slug)}`);
    revalidatePath(badgePath(slug, "svg"));
    revalidatePath(badgePath(slug, "png"));
  }
}

/**
 * Refresh the cached community question pages after a question or answer is posted, approved or removed: the Ask list,
 * the directory home (its Ask Bolton card shows the latest questions) and, with an id, that question's page.
 */
export function revalidateQuestionPages(questionId?: string): void {
  revalidatePath(`${PLATFORM_BASE}/ask`);
  revalidatePath(PLATFORM_BASE);
  if (questionId) revalidatePath(`${PLATFORM_BASE}/ask/${encodeURIComponent(questionId)}`);
}
