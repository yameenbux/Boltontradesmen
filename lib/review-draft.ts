// The review form's draft, kept on the device (localStorage) so a half-written review survives a reload, a lost
// signal or signing in. Every helper swallows storage errors: private browsing or a full disk must never break
// the form.

export function draftKey(slug: string): string {
  return `bv-review-draft:${slug}`;
}

export function saveDraft(storage: Storage | undefined, slug: string, draft: Record<string, string>): void {
  try {
    storage?.setItem(draftKey(slug), JSON.stringify(draft));
  } catch {
    // Storage full or refused: the form still works, the draft just isn't kept.
  }
}

export function loadDraft(storage: Storage | undefined, slug: string): Record<string, string> | null {
  try {
    const raw = storage?.getItem(draftKey(slug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return null;
  }
}

export function clearDraft(storage: Storage | undefined, slug: string): void {
  try {
    storage?.removeItem(draftKey(slug));
  } catch {
    // Nothing to do: a draft we can't remove is harmless.
  }
}
