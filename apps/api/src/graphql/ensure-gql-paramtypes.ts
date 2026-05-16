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
