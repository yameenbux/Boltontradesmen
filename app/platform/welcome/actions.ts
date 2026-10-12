"use server";

import { redirect } from "next/navigation";
import { GROUP_CODE_ERROR, GROUP_CODE_LIMIT_WELCOME, signInPath } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { formatDisplayName, InvalidNameError } from "@/lib/display-name";
import { isDistrictChoice } from "@/lib/districts";
import { safeNext } from "@/lib/safe-next";
import { createServerAuthClient } from "@/lib/supabase/server";

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

/** Welcome: first name + surname (stored only as "Sarah K."), area, optional group code. */
export async function completeOnboarding(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = {
    first_name: field(fd, "first_name"),
    surname: field(fd, "surname"),
    district: field(fd, "district"),
    group_code: field(fd, "group_code"),
    next: field(fd, "next"),
  };
  const next = safeNext(values.next);

  const supabase = await createServerAuthClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(signInPath(next));

  const errors: Record<string, string> = {};
  let displayName = "";
  try {
    displayName = formatDisplayName(values.first_name, values.surname);
  } catch (err) {
    const msg = err instanceof InvalidNameError ? err.message : "Enter your first name and surname";
    if (/surname/i.test(msg)) errors.surname = msg;
    else errors.first_name = msg;
  }
  if (!isDistrictChoice(values.district)) errors.district = "Choose your area";
  if (Object.keys(errors).length) return { errors, values };

  const { data, error } = await supabase.rpc("complete_onboarding", {
    p_display_name: displayName,
    p_district: values.district,
    p_group_code: values.group_code,
  });
  if (error) {
    if (error.message === "bad_group_code") return { errors: { group_code: GROUP_CODE_ERROR }, values };
    if (error.code === "23514" && /display_name/.test(error.message)) {
      return { errors: { first_name: "Use letters only in your name, please." }, values };
    }
    console.error("welcome: complete_onboarding failed:", error.message);
    return { message: "Something went wrong saving your details. Please try again.", values };
  }
  // A wrong or locked group code comes back as data, so the database keeps its record of the wrong try.
  const refused = (data as { error?: unknown } | null)?.error;
  if (refused === "group_code_limit") return { errors: { group_code: GROUP_CODE_LIMIT_WELCOME }, values };
  if (refused === "bad_group_code") return { errors: { group_code: GROUP_CODE_ERROR }, values };
  if (refused) {
    console.error("welcome: complete_onboarding refused:", refused);
    return { message: "Something went wrong saving your details. Please try again.", values };
  }
  redirect(next);
}
