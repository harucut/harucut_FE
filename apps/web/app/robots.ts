import type { MetadataRoute } from "next";
import { PROTECTED_PATHS } from "@/lib/protectedPaths";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PROTECTED_PATHS, "/api/", "/oauth2/"],
    },
    sitemap: "https://www.harucut.com/sitemap.xml",
  };
}
