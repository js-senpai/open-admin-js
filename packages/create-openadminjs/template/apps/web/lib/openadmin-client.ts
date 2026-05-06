export type PublicFieldConfig = {
  type: string;
  label?: string;
  public?: boolean;
  seo?: "title" | "description" | "image" | "slug" | "canonical";
};

export type PublicResourceConfig = {
  name: string;
  label: string;
  basePath: string;
  titleField: string;
  descriptionField?: string;
  slugField: string;
  fields: Record<string, PublicFieldConfig>;
};

export type PublicRecord = Record<string, unknown> & {
  id: string;
  slug?: string;
  title?: string;
  description?: string;
  updatedAt?: string;
};

export const publicResources: PublicResourceConfig[] = [
  {
    name: "posts",
    label: "Posts",
    basePath: "/posts",
    titleField: "title",
    descriptionField: "excerpt",
    slugField: "slug",
    fields: {
      title: { type: "text", label: "Title", public: true, seo: "title" },
      slug: { type: "slug", label: "Slug", public: false, seo: "slug" },
      excerpt: { type: "textarea", label: "Excerpt", public: true, seo: "description" },
      content: { type: "richtext", label: "Content", public: true },
      status: { type: "badge", label: "Status", public: false },
      updatedAt: { type: "datetime", label: "Updated", public: true }
    }
  }
];

const demoPosts: PublicRecord[] = [
  {
    id: "welcome",
    slug: "welcome-to-openadminjs",
    title: "Welcome to OpenAdminJS",
    excerpt: "Public resource pages can be generated from the same metadata as admin resources.",
    content:
      "OpenAdminJS keeps API, admin and public web concerns connected through resource metadata while still letting you write custom frontend pages.",
    updatedAt: new Date("2026-04-29T00:00:00.000Z").toISOString()
  }
];

export function getPublicResource(name: string): PublicResourceConfig {
  const resource = publicResources.find((item) => item.name === name);
  if (!resource) throw new Error(`Unknown public resource: ${name}`);
  return resource;
}

export async function listPublicRecords(resourceName: string): Promise<PublicRecord[]> {
  if (resourceName === "posts") return demoPosts;
  return [];
}

export async function getPublicRecord(resourceName: string, slug: string): Promise<PublicRecord | undefined> {
  const records = await listPublicRecords(resourceName);
  return records.find((record) => record.slug === slug || record.id === slug);
}
