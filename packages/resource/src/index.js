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
];
export function defineResource(config) {
    validateResource(config);
    return withSafeFields(config);
}
export function isSensitiveField(name, field) {
    if (field?.sensitive || field?.type === "password" || field?.type === "hidden")
        return true;
    const lower = name.toLowerCase();
    return sensitiveFieldPatterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}
export function withSafeFields(config) {
    const fields = Object.fromEntries(Object.entries(config.fields).map(([name, field]) => {
        if (!isSensitiveField(name, field))
            return [name, field];
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
    }));
    return { ...config, fields };
}
export function validateResource(config) {
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
export function visibleFields(resource, mode, permissions) {
    return Object.fromEntries(Object.entries(resource.fields).filter(([name, field]) => {
        if (isSensitiveField(name, field))
            return false;
        if (field[mode] === false)
            return false;
        const permissionKey = mode === "detail" || mode === "list" ? "read" : mode === "edit" ? "update" : "create";
        const permission = field.permissions?.[permissionKey];
        return permission ? permissions.includes(permission) : true;
    }));
}
export function pickLocalizedLabel(label, locale, fallbackLocale = "en") {
    if (label == null || label === "")
        return "";
    if (typeof label === "string")
        return label;
    return label[locale] ?? label[fallbackLocale] ?? Object.values(label)[0] ?? "";
}
export function effectiveLocale(resource, requested) {
    const fb = resource.i18n?.defaultLocale ?? "en";
    const locales = resource.i18n?.locales;
    if (!requested)
        return fb;
    if (!locales?.length)
        return requested;
    return locales.includes(requested) ? requested : fb;
}
export function resolveResourceForLocale(resource, locale) {
    const fb = resource.i18n?.defaultLocale ?? "en";
    const loc = effectiveLocale(resource, locale);
    const fields = Object.fromEntries(Object.entries(resource.fields).map(([key, field]) => [
        key,
        {
            ...field,
            label: pickLocalizedLabel(field.label, loc, fb) || field.label
        }
    ]));
    const actions = resource.actions
        ? Object.fromEntries(Object.entries(resource.actions).map(([key, action]) => [
            key,
            {
                ...action,
                label: pickLocalizedLabel(action.label, loc, fb) || action.label
            }
        ]))
        : undefined;
    return {
        ...resource,
        label: pickLocalizedLabel(resource.label, loc, fb),
        fields,
        actions
    };
}
export function shouldApplyListScope(resource, userPermissions) {
    const ls = resource.listScope;
    if (!ls || ls.type === "none" || !("field" in ls))
        return false;
    if (userPermissions.includes("*"))
        return false;
    for (const p of ls.bypassPermissions ?? []) {
        if (userPermissions.includes(p))
            return false;
    }
    return true;
}
export function listScopeWhereClause(resource, userId) {
    const ls = resource.listScope;
    if (!ls || ls.type === "none" || !("field" in ls))
        return undefined;
    return { [ls.field]: userId };
}
export function mergeWhereClauses(...parts) {
    const clauses = parts.filter(Boolean);
    if (!clauses.length)
        return undefined;
    if (clauses.length === 1)
        return clauses[0];
    return { AND: clauses };
}
export function buildSeoPagePayload(opts) {
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
    const imageUrl = ogImageField && record[ogImageField] ? String(record[ogImageField]) : undefined;
    const languages = {};
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
