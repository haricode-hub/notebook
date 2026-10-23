import type { MetadataRoute } from "next";

const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.hariinfo.xyz";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/notebooks", "/workspace/", "/settings", "/admin", "/share/"] },
    sitemap: new URL("/sitemap.xml", siteOrigin).toString(),
  };
}
