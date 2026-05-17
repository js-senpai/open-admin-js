/**
 * NestJS GraphQL reads `design:paramtypes` before applying explicit `@Args({ type })`.
 * Toolchains that do not emit decorator metadata (e.g. `tsx watch`) leave it undefined and
 * `@nestjs/graphql` crashes in `extractTypeIfArray`. Define metadata at runtime when missing.
 */
export function ensureGqlParamTypes(
  prototype: object,
  methodName: string,
  paramTypes: unknown[]
): void {
  const key = "design:paramtypes";
  const existing = Reflect.getMetadata(key, prototype, methodName) as unknown[] | undefined;
  if (Array.isArray(existing) && existing.length >= paramTypes.length) return;
  Reflect.defineMetadata(key, paramTypes, prototype, methodName);
}

/**
 * `@Field(() => Type)` is still resolved through lazy metadata that expects
 * `design:type` to exist. Define the property metadata when `tsx watch` did not emit it.
 */
export function ensureGqlFieldTypes(
  prototype: object,
  fieldTypes: Record<string, unknown>
): void {
  const key = "design:type";
  for (const [fieldName, fieldType] of Object.entries(fieldTypes)) {
    if (Reflect.hasMetadata(key, prototype, fieldName)) continue;
    Reflect.defineMetadata(key, fieldType, prototype, fieldName);
  }
}
