/** PascalCase model name → kebab segment used for `*.resource.ts` file base. */
export function modelNameToResourceSlug(modelName: string): string {
  return modelName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
