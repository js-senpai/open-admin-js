/** PascalCase model name → kebab segment used for `*.resource.ts` file base. */
export function modelNameToResourceSlug(modelName: string): string {
  return modelName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function pluralResourceSlug(slug: string): string {
  if (/(?:[^aeiou])y$/i.test(slug)) return slug.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/i.test(slug)) return slug + "es";
  return slug + "s";
}
