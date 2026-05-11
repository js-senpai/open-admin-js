import IntlMessageFormat from "intl-messageformat";

export type FieldType =
  | "id"
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "datetime"
  | "date"
  | "relation"
  | "image"
  | "file"
  | "richtext"
  | "json"
  | "password"
  | "email"
  | "url"
  | "money"
  | "slug"
  | "color"
  | "badge"
  | "markdown"
  | "code"
  | "hidden"
  | "computed";

export type PermissionMap = {
  read?: string;
  create?: string;
  update?: string;
  delete?: string;
  [action: string]: string | undefined;
};

export type FieldPermission = {
  read?: string;
  create?: string;
  update?: string;
};

/** Plain string or per-locale map (BCP-47 keys). */
export type LocalizedLabel = string | Record<string, string>;

export type ResourceI18nConfig = {
  defaultLocale?: string;
  locales?: readonly string[];
};

export type ListScopeConfig =
  | { type?: "none" }
  | {
      type: "userOwns";
      field: string;
      bypassPermissions?: readonly string[];
    };

export type ResourceSeoConfig = {
  public?: boolean;
  slugField?: string;
  pathPattern?: string;
  titleField?: string;
  descriptionField?: string;
  ogImageField?: string;
  alternateSlugFields?: Record<string, string>;
};

export type ResourceField = {
  type: FieldType;
  label?: LocalizedLabel;
  required?: boolean;
  list?: boolean;
  create?: boolean;
  edit?: boolean;
  detail?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  options?: readonly string[];
  /** For `relation` fields: the name of the related resource (e.g. "categories"). */
  resource?: string;
  /** For `relation` fields: which field of the related record to display as label. Defaults to "name". */
  displayField?: string;
  from?: string;
  permissions?: FieldPermission;
  sensitive?: boolean;
  defaultValue?: unknown;
  /** Minimum value for `number`/`money` fields. */
  min?: number;
  /** Maximum value for `number`/`money` fields. */
  max?: number;
  /** Minimum character length for string fields. */
  minLength?: number;
  /** Maximum character length for string fields. */
  maxLength?: number;
};

export type ResourceActionContext = {
  id: string;
  prisma: unknown;
  user: { id: string; email: string; permissions: string[] };
  input?: unknown;
};

export type ResourceAction = {
  label: LocalizedLabel;
  variant?: "default" | "primary" | "destructive";
  confirm?: boolean;
  permission: string;
  handler?: (context: ResourceActionContext) => Promise<unknown>;
};

export type ResourceConfig = {
  name: string;
  label: LocalizedLabel;
  model: string;
  titleField?: string;
  icon?: string;
  permissions: PermissionMap;
  fields: Record<string, ResourceField>;
  actions?: Record<string, ResourceAction>;
  i18n?: ResourceI18nConfig;
  seo?: ResourceSeoConfig;
  listScope?: ListScopeConfig;
};

export const sensitiveFieldPatterns = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "apiKey",
  "privateKey",
  "resetToken",
  "verificationToken",
  "otp",
  "twoFactorSecret"
] as const;

export function defineResource<TFields extends Record<string, ResourceField>>(
  config: Omit<ResourceConfig, "fields"> & { fields: TFields }
): ResourceConfig {
  validateResource(config);
  return withSafeFields(config);
}

export function isSensitiveField(name: string, field?: ResourceField): boolean {
  if (field?.sensitive || field?.type === "password" || field?.type === "hidden") return true;
  const lower = name.toLowerCase();
  return sensitiveFieldPatterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}

export function withSafeFields<TFields extends Record<string, ResourceField>>(
  config: Omit<ResourceConfig, "fields"> & { fields: TFields }
): ResourceConfig {
  const fields = Object.fromEntries(
    Object.entries(config.fields).map(([name, field]) => {
      if (!isSensitiveField(name, field)) return [name, field];
      return [
        name,
        {
          ...field,
          list: false,
          detail: false,
          create: field.type === "password" ? field.create : false,
          edit: field.type === "password" ? field.edit : false,
          sensitive: true
        }
      ];
    })
  );

  return { ...config, fields };
}

export function validateResource(config: ResourceConfig): void {
  if (!config.name || !/^[a-z][a-z0-9-]*$/.test(config.name)) {
    throw new Error(`Invalid resource name "${config.name}". Use kebab-case.`);
  }
  if (!config.model || !/^[A-Za-z][A-Za-z0-9_]*$/.test(config.model)) {
    throw new Error(`Invalid Prisma model name for resource "${config.name}".`);
  }
  if (!config.permissions.read) {
    throw new Error(`Resource "${config.name}" must define permissions.read.`);
  }
  if (!Object.keys(config.fields).length) {
    throw new Error(`Resource "${config.name}" must define at least one field.`);
  }
  const ls = config.listScope;
  if (ls && "field" in ls && ls.type === "userOwns") {
    if (!ls.field?.trim()) {
      throw new Error(`Resource "${config.name}" listScope.userOwns requires a non-empty field.`);
    }
  }
}

export function visibleFields(
  resource: ResourceConfig,
  mode: "list" | "create" | "edit" | "detail",
  permissions: readonly string[]
): Record<string, ResourceField> {
  return Object.fromEntries(
    Object.entries(resource.fields).filter(([name, field]) => {
      if (isSensitiveField(name, field)) return false;
      if (field[mode] === false) return false;
      const permissionKey = mode === "detail" || mode === "list" ? "read" : mode === "edit" ? "update" : "create";
      const permission = field.permissions?.[permissionKey];
      return permission ? permissions.includes(permission) : true;
    })
  );
}

export function pickLocalizedLabel(label: LocalizedLabel | undefined, locale: string, fallbackLocale = "en"): string {
  if (label == null || label === "") return "";
  if (typeof label === "string") return label;
  return label[locale] ?? label[fallbackLocale] ?? Object.values(label)[0] ?? "";
}

/** ICU-style plural categories for `Intl.PluralRules` (locales like `en`, `ru`). */
export type PluralFormBundle = {
  zero?: string;
  one: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};

/**
 * Picks the correct plural template for `count` in `locale`, then replaces `{count}`.
 * Use in resource `i18n.translations` blocks for list summaries, pagination, etc.
 */
export function formatPlural(locale: string, count: number, forms: PluralFormBundle): string {
  const pr = new Intl.PluralRules(locale);
  const cat = pr.select(count);
  const raw =
    (cat === "zero" && forms.zero) ||
    (cat === "one" && forms.one) ||
    (cat === "two" && forms.two) ||
    (cat === "few" && forms.few) ||
    (cat === "many" && forms.many) ||
    forms.other ||
    forms.one;
  return raw.replace(/\{count\}/g, String(count));
}

/**
 * Full ICU MessageFormat strings (plural/select/rich text per Unicode TR35).
 * Example: `"{n, plural, one {# item} other {# items}}"`.
 */
export function formatIcuMessage(
  locale: string,
  pattern: string,
  values?: Record<string, string | number | boolean | Date | null | undefined>
): string {
  try {
    return new IntlMessageFormat(pattern, locale).format(values ?? {}) as string;
  } catch {
    return pattern;
  }
}

export type IcuMessageValues = Record<string, string | number | boolean | Date | null | undefined>;

/**
 * Resolve localized ICU template then render it with `intl-messageformat`.
 * Useful for translation blocks where each locale has its own ICU string.
 */
export function formatLocalizedIcuMessage(
  label: LocalizedLabel | undefined,
  locale: string,
  values?: IcuMessageValues,
  fallbackLocale = "en"
): string {
  const pattern = pickLocalizedLabel(label, locale, fallbackLocale);
  if (!pattern) return "";
  return formatIcuMessage(locale, pattern, values);
}

export function effectiveLocale(resource: ResourceConfig, requested: string | undefined): string {
  const fb = resource.i18n?.defaultLocale ?? "en";
  const locales = resource.i18n?.locales;
  if (!requested) return fb;
  if (!locales?.length) return requested;
  return locales.includes(requested) ? requested : fb;
}

export function resolveResourceForLocale(resource: ResourceConfig, locale: string | undefined): ResourceConfig {
  const fb = resource.i18n?.defaultLocale ?? "en";
  const loc = effectiveLocale(resource, locale);
  const fields: Record<string, ResourceField> = Object.fromEntries(
    Object.entries(resource.fields).map(([key, field]) => [
      key,
      {
        ...field,
        label: pickLocalizedLabel(field.label, loc, fb) || field.label
      }
    ])
  );

  const actions: Record<string, ResourceAction> | undefined = resource.actions
    ? Object.fromEntries(
        Object.entries(resource.actions).map(([key, action]) => [
          key,
          {
            ...action,
            label: pickLocalizedLabel(action.label, loc, fb) || action.label
          }
        ])
      )
    : undefined;

  return {
    ...resource,
    label: pickLocalizedLabel(resource.label, loc, fb),
    fields,
    actions
  };
}

export function shouldApplyListScope(resource: ResourceConfig, userPermissions: readonly string[]): boolean {
  const ls = resource.listScope;
  if (!ls || ls.type === "none" || !("field" in ls)) return false;
  if (userPermissions.includes("*")) return false;
  for (const p of ls.bypassPermissions ?? []) {
    if (userPermissions.includes(p)) return false;
  }
  return true;
}

export function listScopeWhereClause(resource: ResourceConfig, userId: string): Record<string, unknown> | undefined {
  const ls = resource.listScope;
  if (!ls || ls.type === "none" || !("field" in ls)) return undefined;
  return { [ls.field]: userId };
}

export function mergeWhereClauses(...parts: (Record<string, unknown> | undefined)[]): Record<string, unknown> | undefined {
  const clauses = parts.filter(Boolean) as Record<string, unknown>[];
  if (!clauses.length) return undefined;
  if (clauses.length === 1) return clauses[0];
  return { AND: clauses };
}

export type SeoPagePayload = {
  title: string;
  description: string;
  canonicalUrl: string;
  openGraph: {
    title: string;
    description: string;
    url: string;
    type: string;
    images?: { url: string }[];
  };
  alternates?: { languages?: Record<string, string> };
};

export function buildSeoPagePayload(opts: {
  siteUrl: string;
  basePath: string;
  seo?: ResourceSeoConfig;
  record: Record<string, unknown>;
  resourceLabel: string;
}): SeoPagePayload {
  const { siteUrl, basePath, seo, record, resourceLabel } = opts;
  const titleField = seo?.titleField ?? "title";
  const descField = seo?.descriptionField ?? "description";
  const slugField = seo?.slugField ?? "slug";
  const title = String(record[titleField] ?? resourceLabel);
  const description = String(record[descField] ?? record["excerpt"] ?? `${resourceLabel} page`);
  const slug = String(record[slugField] ?? record["id"]);
  const path = (seo?.pathPattern ?? `${basePath}/:slug`).replace(":slug", encodeURIComponent(slug));
  const canonicalUrl = new URL(path.startsWith("/") ? path : `/${path}`, siteUrl).toString();

  const ogImageField = seo?.ogImageField;
  const imageUrl =
    ogImageField && record[ogImageField] ? String(record[ogImageField]) : undefined;

  const languages: Record<string, string> = {};
  if (seo?.alternateSlugFields) {
    for (const [loc, field] of Object.entries(seo.alternateSlugFields)) {
      const altSlug = record[field];
      if (altSlug != null && String(altSlug)) {
        const altPath = (seo.pathPattern ?? `${basePath}/:slug`).replace(":slug", encodeURIComponent(String(altSlug)));
        languages[loc] = new URL(altPath.startsWith("/") ? altPath : `/${altPath}`, siteUrl).toString();
      }
    }
  }

  return {
    title,
    description,
    canonicalUrl,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "article",
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {})
    },
    ...(Object.keys(languages).length ? { alternates: { languages } } : {})
  };
}
