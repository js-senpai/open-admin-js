import type { Metadata } from "next";
import type { PublicRecord, PublicResourceConfig } from "./openadmin-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl).toString();
}

export function metadataForRecord(resource: PublicResourceConfig, record: PublicRecord): Metadata {
  const title = String(record[resource.titleField] ?? resource.label);
  const description = String((resource.descriptionField && record[resource.descriptionField]) || record.description || `${resource.label} page`);
  const slug = String(record[resource.slugField] ?? record.id);
  const canonical = absoluteUrl(`${resource.basePath}/${slug}`);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article"
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}

export function sitemapXml(urls: Array<{ loc: string; lastmod?: string }>): string {
  const items = urls
    .map((url) => {
      const lastmod = url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : "";
      return `<url><loc>${url.loc}</loc>${lastmod}</url>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`;
}
