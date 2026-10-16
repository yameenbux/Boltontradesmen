import { BL_DISTRICTS } from "@/lib/districts";
import { PHONE_IN_TEXT } from "@/lib/review-form";

// The trader's own listing edits (bio and areas) and the pause / withdraw messages. Client-safe: the form and its
// server actions share it. The database (update_my_listing, migration 000029) applies the same rules again and is
// the authority. Categories stay with the admin: a category can need a Gas Safe or DVSA check.

export const BIO_MAX = 300;

// Web and email addresses (same pattern as the database): customers get in touch through the page's buttons.
export const LINK_IN_TEXT = /(https?:\/\/|www\.|@|[a-z0-9-]\.(co\.uk|org\.uk|com|uk|net|org|info|biz|io|me)\b)/i;

export const LISTING_ERRORS: Record<string, { field?: "bio" | "areas"; message: string }> = {
  bio_too_long: { field: "bio", message: `Keep your description to ${BIO_MAX} characters.` },
  bio_has_phone: {
    field: "bio",
    message: "Please leave phone numbers out. Customers call you with the button on your page.",
  },
  bio_has_link: {
    field: "bio",
    message: "Please leave out web and email addresses. Customers get in touch with the buttons on your page.",
  },
  areas_required: { field: "areas", message: "Choose at least one area you cover." },
  bad_area: { field: "areas", message: "Choose areas from the list." },
  blocked: { message: "Your account can't make changes. Contact us if you think that's wrong." },
  not_your_listing: { message: "That listing isn't linked to your account." },
  not_live: { message: "Your listing isn't live, so there's nothing to pause." },
  not_paused: { message: "Your listing isn't paused." },
  paused_by_admin: { message: "We paused your listing, so only we can unpause it. Contact us and we'll sort it out." },
  not_withdrawable: { message: "This listing can't be withdrawn. Contact us." },
};

export type ListingEdit = { bio: string | null; areas: string[] };
export type ListingEditResult =
  | { ok: true; value: ListingEdit }
  | { ok: false; errors: Partial<Record<"bio" | "areas", string>> };

/** Reads and checks the edit form: a trimmed bio (none when empty) and areas in the list's order. */
export function parseListingEdit(fd: FormData): ListingEditResult {
  const raw = fd.get("bio");
  const bio = (typeof raw === "string" ? raw : "").trim();
  const picked = new Set(
    fd
      .getAll("areas")
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean),
  );
  const errors: Partial<Record<"bio" | "areas", string>> = {};
  if ([...bio].length > BIO_MAX) errors.bio = LISTING_ERRORS.bio_too_long.message;
  else if (PHONE_IN_TEXT.test(bio)) errors.bio = LISTING_ERRORS.bio_has_phone.message;
  else if (LINK_IN_TEXT.test(bio)) errors.bio = LISTING_ERRORS.bio_has_link.message;
  if (picked.size === 0) errors.areas = LISTING_ERRORS.areas_required.message;
  else if ([...picked].some((a) => !BL_DISTRICTS.includes(a))) errors.areas = LISTING_ERRORS.bad_area.message;
  if (errors.bio || errors.areas) return { ok: false, errors };
  return { ok: true, value: { bio: bio || null, areas: BL_DISTRICTS.filter((d) => picked.has(d)) } };
}
