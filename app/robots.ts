import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seo";

// Read per request: the pre-launch lock (SITE_LOCK_PASSWORD) can be switched off without a rebuild.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
