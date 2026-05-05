# Blog Admin

Blog-focused example using posts, categories, authors and publishing actions. Fits marketing sites and documentation hubs.

**Suggested resources:** `Post`, `Category`, `Author`, `Tag`, `Media`, `Redirect` (optional).

## Code in this folder

| Path | Purpose |
|------|---------|
| `prisma/models.fragment.prisma` | `Author`, `Tag`, `PostTag` — append to schema, then add `authorId`, `author`, `postTags` on your existing `Post` model (see comments in the fragment). |
| `src/resources/authors.resource.ts` | Authors admin resource. |
| `src/resources/tags.resource.ts` | Tags admin resource. |
| `src/index.ts` | `blogExampleResources` for merging into `registry.ts`. |

### Merge into your app

Follow the same steps as [basic-admin](../basic-admin/README.md#merge-into-your-app), using this folder’s Prisma fragment and resources. Extend your existing `posts.resource.ts` with `authorId` and optional tag relations once models exist.
