import { describe, expect, it, vi } from "vitest";
import { AdminResourcesResolver } from "./admin-resources.resolver";

describe("AdminResourcesResolver", () => {
  it("maps GraphQL filter input to REST-style filter query keys", async () => {
    const adminResources = {
      list: vi.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, pages: 1 } })
    };
    const resolver = new AdminResourcesResolver(adminResources as never);
    const user = { id: "u1", permissions: ["*"] };

    await resolver.adminResourceList(
      {
        name: "posts",
        page: 2,
        limit: 15,
        search: "hello",
        sort: "createdAt:desc",
        locale: "en",
        filter: {
          status: { eq: "published" },
          views: { gte: 10, lte: 100 },
          authorId: "u1"
        }
      },
      { req: { user } } as never
    );

    expect(adminResources.list).toHaveBeenCalledWith(
      "posts",
      {
        page: 2,
        limit: 15,
        search: "hello",
        sort: "createdAt:desc",
        locale: "en",
        "filter[status][eq]": "published",
        "filter[views][gte]": 10,
        "filter[views][lte]": 100,
        "filter[authorId]": "u1"
      },
      user
    );
  });
});
