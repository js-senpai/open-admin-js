export {
  buildSeoPagePayload,
  defineResource,
  effectiveLocale,
  isSensitiveField,
  listScopeWhereClause,
  mergeWhereClauses,
  pickLocalizedLabel,
  resolveResourceForLocale,
  sensitiveFieldPatterns,
  shouldApplyListScope,
  validateResource,
  visibleFields,
  withSafeFields
} from "@openadminjs/resource";
export type {
  FieldPermission,
  FieldType,
  ListScopeConfig,
  LocalizedLabel,
  PermissionMap,
  ResourceAction,
  ResourceActionContext,
  ResourceConfig,
  ResourceField,
  ResourceI18nConfig,
  ResourceSeoConfig,
  SeoPagePayload
} from "@openadminjs/resource";

export type OpenAdminUser = {
  id: string;
  email: string;
  name?: string | null;
  roles: string[];
  permissions: string[];
};

export type AdminListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  filter?: Record<string, string | string[]>;
};

export type PaginatedResult<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

export type OpenAdminError = {
  message: string;
  code?: string;
  details?: unknown;
};
