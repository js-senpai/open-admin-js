import { afterEach, describe, expect, it, vi } from "vitest";

describe("seo helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("builds absolute URLs from NEXT_PUBLIC_SITE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    const { absoluteUrl } = await import("./seo");
    expect(absoluteUrl("/posts/hello")).toBe("https://example.com/posts/hello");
  });

  it("metadataForRecord fills canonical and OpenGraph", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    const { metadataForRecord } = await import("./seo");
    const meta = metadataForRecord(
      {
        name: "posts",
        label: "Posts",
        basePath: "/posts",
        titleField: "title",
        slugField: "slug",
        fields: {}
      },
      { id: "1", title: "Hi", slug: "hi", description: "d" }
    );
    expect(meta.title).toBe("Hi");
    expect(meta.alternates?.canonical).toBe("https://example.com/posts/hi");
    expect(meta.openGraph?.url).toBe("https://example.com/posts/hi");
  });

  it("sitemapXml renders url entries", async () => {
    const { sitemapXml } = await import("./seo");
    const xml = sitemapXml([{ loc: "https://example.com/a", lastmod: "2024-01-01" }]);
    expect(xml).toContain("<loc>https://example.com/a</loc>");
    expect(xml).toContain("<lastmod>2024-01-01</lastmod>");
    expect(xml).toContain("<urlset");
  });
});
