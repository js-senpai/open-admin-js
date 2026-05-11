import { describe, expect, it } from "vitest";
import {
  defineResource,
  formatIcuMessage,
  formatLocalizedIcuMessage,
  formatPlural,
  isSensitiveField,
  resolveResourceForLocale,
  validateResource,
  visibleFields,
  withSafeFields
} from "./index";

describe("formatPlural", () => {
  it("replaces {count} using English plural rules", () => {
    expect(
      formatPlural("en", 1, { one: "{count} item", other: "{count} items" })
    ).toBe("1 item");
    expect(
      formatPlural("en", 42, { one: "{count} item", other: "{count} items" })
    ).toBe("42 items");
  });
});

describe("formatIcuMessage", () => {
  it("formats ICU plural rules", () => {
    expect(
      formatIcuMessage("en", "{count, plural, one {# file} other {# files}}", { count: 1 })
    ).toBe("1 file");
    expect(
      formatIcuMessage("en", "{count, plural, one {# file} other {# files}}", { count: 5 })
    ).toBe("5 files");
  });

  it("formats select/plural complex ICU patterns", () => {
    const output = formatIcuMessage(
      "en",
      "{gender, select, male {{count, plural, one {He has # alert} other {He has # alerts}}} female {{count, plural, one {She has # alert} other {She has # alerts}}} other {{count, plural, one {They have # alert} other {They have # alerts}}}}",
      { gender: "female", count: 3 }
    );
    expect(output).toBe("She has 3 alerts");
  });
});

describe("formatLocalizedIcuMessage", () => {
  it("resolves locale map and renders ICU", () => {
    const label = {
      en: "{count, plural, one {# draft} other {# drafts}}",
      ru: "{count, plural, one {# черновик} few {# черновика} many {# черновиков} other {# черновика}}"
    };
    expect(formatLocalizedIcuMessage(label, "en", { count: 2 })).toBe("2 drafts");
    expect(formatLocalizedIcuMessage(label, "ru", { count: 5 })).toContain("5 ");
  });
});

describe("defineResource", () => {
  it("hides sensitive fields by default", () => {
    const resource = defineResource({
      name: "users",
      label: "Users",
      model: "User",
      permissions: { read: "users.read" },
      fields: {
        id: { type: "id" },
        email: { type: "email" },
        passwordHash: { type: "text" }
      }
    });

    expect(isSensitiveField("passwordHash", resource.fields.passwordHash)).toBe(true);
    expect(visibleFields(resource, "list", [])).not.toHaveProperty("passwordHash");
  });

  it("requires read permission", () => {
    expect(() =>
      defineResource({
        name: "posts",
        label: "Posts",
        model: "Post",
        permissions: {},
        fields: { id: { type: "id" } }
      })
    ).toThrow("permissions.read");
  });

  it("rejects invalid resource names", () => {
    expect(() =>
      defineResource({
        name: "BadName",
        label: "X",
        model: "X",
        permissions: { read: "x.read" },
        fields: { id: { type: "id" } }
      })
    ).toThrow("Invalid resource name");
  });

  it("rejects invalid prisma model names", () => {
    expect(() =>
      defineResource({
        name: "items",
        label: "Items",
        model: "9bad",
        permissions: { read: "items.read" },
        fields: { id: { type: "id" } }
      })
    ).toThrow("Invalid Prisma model name");
  });

  it("rejects empty fields", () => {
    expect(() =>
      validateResource({
        name: "items",
        label: "Items",
        model: "Item",
        permissions: { read: "items.read" },
        fields: {}
      })
    ).toThrow("at least one field");
  });
});

describe("visibleFields", () => {
  it("respects field-level read permission", () => {
    const resource = defineResource({
      name: "posts",
      label: "Posts",
      model: "Post",
      permissions: { read: "posts.read" },
      fields: {
        id: { type: "id", list: true },
        title: { type: "text", list: true, permissions: { read: "posts.title" } },
        body: { type: "textarea", list: true }
      }
    });

    const list = visibleFields(resource, "list", ["posts.read"]);
    expect(list).toHaveProperty("id");
    expect(list).not.toHaveProperty("title");
    expect(list).toHaveProperty("body");

    const withTitle = visibleFields(resource, "list", ["posts.read", "posts.title"]);
    expect(withTitle).toHaveProperty("title");
  });

  it("hides fields with list: false", () => {
    const resource = defineResource({
      name: "posts",
      label: "Posts",
      model: "Post",
      permissions: { read: "posts.read" },
      fields: {
        id: { type: "id", list: true },
        secret: { type: "text", list: false }
      }
    });
    expect(visibleFields(resource, "list", ["posts.read"])).not.toHaveProperty("secret");
  });
});

describe("resolveResourceForLocale", () => {
  it("resolves labels for requested locale", () => {
    const resource = defineResource({
      name: "items",
      label: { en: "Items", ru: "Элементы" },
      model: "Item",
      i18n: { defaultLocale: "en", locales: ["en", "ru"] },
      permissions: { read: "items.read" },
      fields: {
        id: { type: "id", list: true },
        title: { type: "text", list: true, label: { en: "Title", ru: "Название" } }
      }
    });
    const ru = resolveResourceForLocale(resource, "ru");
    expect(ru.label).toBe("Элементы");
    expect(ru.fields.title?.label).toBe("Название");
  });
});

describe("withSafeFields", () => {
  it("strips list/detail for sensitive fields but keeps password fields configurable", () => {
    const raw = {
      name: "users",
      label: "Users",
      model: "User",
      permissions: { read: "users.read" },
      fields: {
        id: { type: "id" },
        password: { type: "password", create: true, edit: true }
      }
    } satisfies Parameters<typeof withSafeFields>[0];
    const safe = withSafeFields(raw);
    expect(safe.fields.password?.list).toBe(false);
    expect(safe.fields.password?.detail).toBe(false);
  });
});
