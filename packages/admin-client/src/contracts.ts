export type ResourceMeta = {
  name: string;
  label: string;
  icon?: string;
  titleField?: string;
  permissions: Record<string, string>;
  fields: Record<
    string,
    {
      type: string;
      label?: string;
      list?: boolean;
      create?: boolean;
      edit?: boolean;
      required?: boolean;
      sortable?: boolean;
      searchable?: boolean;
      filterable?: boolean;
      sensitive?: boolean;
      resource?: string;
      displayField?: string;
      options?: string[];
    }
  >;
  actions?: Record<string, { label: string; variant?: string; confirm?: boolean; permission: string }>;
  i18n?: { defaultLocale?: string; locales?: readonly string[] };
  seo?: { public?: boolean; slugField?: string; pathPattern?: string; titleField?: string; descriptionField?: string };
};

