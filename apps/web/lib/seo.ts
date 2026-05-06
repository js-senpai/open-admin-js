import { buildSeoPagePayload } from "@openadminjs/core";
import type { Metadata } from "next";
import type { PublicRecord, PublicResourceConfig } from "./openadmin-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl).toString();
}

export function metadataForRecord(resource: PublicResourceConfig, record: PublicRecord): Metadata {
  const payload = buildSeoPagePayload({
    siteUrl,
    basePath: resource.basePath,
    seo: resource.seo,
    record: record as Record<string, unknown>,
    resourceLabel: resource.label
  });

  const ogImages = payload.openGraph.images?.map((img) => img.url).filter(Boolean);

  return {
    title: payload.title,
    description: payload.description,
    alternates: {
      canonical: payload.canonicalUrl,
      ...(payload.alternates?.languages ? { languages: payload.alternates.languages } : {})
    },
    openGraph: {
      title: payload.openGraph.title,
      description: payload.openGraph.description,
      url: payload.openGraph.url,
      type: payload.openGraph.type as "article",
      ...(ogImages?.length ? { images: ogImages } : {})
    },
    twitter: {
      card: "summary_large_image",
      title: payload.title,
      description: payload.description,
      ...(ogImages?.[0] ? { images: [ogImages[0]] } : {})
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
