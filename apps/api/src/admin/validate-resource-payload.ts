import { UnprocessableEntityException } from "@nestjs/common";
import type { ResourceConfig, ResourceField } from "@openadminjs/core";
import { z } from "zod";

function fieldSchema(field: ResourceField, mode: "create" | "edit"): z.ZodTypeAny {
  const required = Boolean(field.required && mode === "create");
  const optionalize = <T extends z.ZodTypeAny>(schema: T) => (required ? schema : schema.optional()) as z.ZodTypeAny;

  switch (field.type) {
    case "number":
    case "money": {
      let num = z.coerce.number();
      if (typeof field.min === "number") num = num.min(field.min, `Must be ≥ ${field.min}`);
      if (typeof field.max === "number") num = num.max(field.max, `Must be ≤ ${field.max}`);
      return optionalize(num);
    }

    case "boolean":
      if (required && mode === "create") return z.boolean();
      return z.boolean().optional();

    case "json":
      return z.unknown().optional();

    case "multiselect":
      return optionalize(
        z.union([
          z.array(z.string()),
          z.string().transform((s) =>
            s
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          )
        ])
      );

    case "select":
    case "badge":
      if (field.options?.length === 1) {
        return optionalize(z.literal(field.options[0]!));
      }
      if (field.options && field.options.length >= 2) {
        return optionalize(z.enum(field.options as [string, string, ...string[]]));
      }
      return optionalize(z.coerce.string());

    case "datetime":
    case "date":
      return optionalize(z.union([z.coerce.date(), z.string()]));

    case "email": {
      let email = z.string().email("Invalid email address");
      if (typeof field.maxLength === "number") email = email.max(field.maxLength, `Max ${field.maxLength} characters`);
      return optionalize(email);
    }

    case "url": {
      let url = z.string().url("Invalid URL");
      if (typeof field.maxLength === "number") url = url.max(field.maxLength, `Max ${field.maxLength} characters`);
      return optionalize(url);
    }

    case "slug": {
      let slug = z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens");
      if (typeof field.maxLength === "number") slug = slug.max(field.maxLength);
      return optionalize(required ? slug.min(1, "Required") : slug);
    }

    default: {
      let str = z.string();
      if (typeof field.minLength === "number") str = str.min(field.minLength, `Min ${field.minLength} characters`);
      if (typeof field.maxLength === "number") str = str.max(field.maxLength, `Max ${field.maxLength} characters`);
      if (required) return str.min(1, "Required");
      return str.optional();
    }
  }
}

export function buildWriteSchema(resource: ResourceConfig, mode: "create" | "edit"): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const flag = mode === "create" ? "create" : "edit";
  for (const [name, field] of Object.entries(resource.fields)) {
    if (field[flag] === false || field.sensitive || field.type === "id" || field.type === "computed") continue;
    shape[name] = fieldSchema(field, mode);
  }
  return z.object(shape).strict();
}

export function parseWritePayload(resource: ResourceConfig, mode: "create" | "edit", data: Record<string, unknown>): Record<string, unknown> {
  const schema = buildWriteSchema(resource, mode);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new UnprocessableEntityException({
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      issues: parsed.error.flatten()
    });
  }
  return parsed.data as Record<string, unknown>;
}
