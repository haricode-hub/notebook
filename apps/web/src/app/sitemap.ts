import type { MetadataRoute } from "next";

const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.hariinfo.xyz";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/privacy", "/terms", "/cookies", "/contact"].map((path) => ({ url: new URL(path, siteOrigin).toString() }));
}
