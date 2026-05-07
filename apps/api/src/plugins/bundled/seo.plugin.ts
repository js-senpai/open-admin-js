import type { OpenAdminPlugin } from "@openadminjs/plugin-sdk";

export const seoBundledPlugin: OpenAdminPlugin = {
  id: "io.openadminjs.seo",
  version: "0.1.0",
  displayName: "SEO metadata + sitemap demo",
  register({ registerSurface }) {
    registerSurface({
      seo: {
        metadata({ resourceName, record }) {
          if (resourceName !== "posts") return {};
          return {
            title: record.title ?? "Untitled",
            description: record.excerpt ?? "",
            canonical: record.slug ? `/posts/${record.slug}` : undefined
          };
        },
        sitemapEntry({ resourceName, record }) {
          if (resourceName !== "posts" || !record.slug) return null;
          return { url: `/posts/${record.slug}`, lastModified: typeof record.updatedAt === "string" ? record.updatedAt : undefined };
        }
      }
    });
  }
};
