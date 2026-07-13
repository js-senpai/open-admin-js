import { relative, resolve, isAbsolute } from "node:path";

/**
 * Reserved Windows device names that must never be used as file/dir names.
 * Rejected case-insensitively, with or without an extension.
 */
const RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9"
]);

/**
 * TypeScript reserved words / keywords that would break generated identifiers
 * if used verbatim as class or variable names.
 */
const RESERVED_IDENTIFIERS = new Set([
  "class",
  "function",
  "const",
  "let",
  "var",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "new",
  "delete",
  "typeof",
  "instanceof",
  "void",
  "this",
  "super",
  "extends",
  "implements",
  "interface",
  "enum",
  "export",
  "import",
  "package",
  "private",
  "protected",
  "public",
  "static",
  "yield",
  "await",
  "async",
  "null",
  "true",
  "false",
  "undefined"
]);

export class InvalidNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNameError";
  }
}

/**
 * Documented valid input format:
 *   - must start with a letter
 *   - may contain letters, numbers, spaces, hyphens and underscores
 *   - separators are collapsed when converting to Pascal/camel/kebab case
 */
export const VALID_NAME_DESCRIPTION =
  "Names must start with a letter and contain only letters, numbers, spaces, hyphens or underscores.";

function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function toPascalCase(input: string): string {
  return splitWords(input)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

export function toCamelCase(input: string): string {
  const pascal = toPascalCase(input);
  return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : "";
}

export function toKebabCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join("-");
}

/**
 * Validates a user-supplied resource/plugin/field name. Throws InvalidNameError
 * on any unsafe or invalid input. Returns the trimmed raw value on success.
 *
 * Rejects: empty, `.`/`..`, path separators, absolute paths, null bytes,
 * control characters, shell metacharacters, reserved OS names, reserved
 * identifiers, and names that normalize to an empty string.
 */
export function validateName(raw: string | undefined, kind = "name"): string {
  if (raw == null) throw new InvalidNameError(`A ${kind} is required.`);
  const value = String(raw).trim();

  if (!value) throw new InvalidNameError(`A ${kind} is required.`);
  if (value === "." || value === "..") {
    throw new InvalidNameError(`"${value}" is not a valid ${kind}.`);
  }
  if (value.includes("\0")) {
    throw new InvalidNameError(`${kind} must not contain null bytes.`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new InvalidNameError(`${kind} must not contain control characters.`);
  }
  if (/[/\\]/.test(value)) {
    throw new InvalidNameError(`${kind} must not contain path separators ("/" or "\\").`);
  }
  if (isAbsolute(value)) {
    throw new InvalidNameError(`${kind} must not be an absolute path.`);
  }
  if (/[;&|`$(){}<>*?!"'\[\]#~]/.test(value)) {
    throw new InvalidNameError(`${kind} must not contain shell metacharacters.`);
  }
  if (!/^[A-Za-z]/.test(value)) {
    throw new InvalidNameError(`${kind} must start with a letter. ${VALID_NAME_DESCRIPTION}`);
  }
  if (!/^[A-Za-z0-9 _-]+$/.test(value)) {
    throw new InvalidNameError(`${kind} contains invalid characters. ${VALID_NAME_DESCRIPTION}`);
  }

  const base = value.toLowerCase().split(".")[0] ?? "";
  if (RESERVED_NAMES.has(base)) {
    throw new InvalidNameError(`"${value}" is a reserved operating-system name.`);
  }
  if (RESERVED_IDENTIFIERS.has(value.toLowerCase())) {
    throw new InvalidNameError(`"${value}" is a reserved keyword and cannot be used as a ${kind}.`);
  }

  if (!toPascalCase(value)) {
    throw new InvalidNameError(`"${value}" cannot be converted into a valid identifier.`);
  }

  return value;
}

/**
 * Validates a plugin id. Plugin ids follow reverse-DNS style and may contain
 * dots (e.g. `com.example.my-plugin`), but must not enable path traversal or
 * shell injection. Returns the trimmed value on success.
 */
export function validatePluginId(raw: string | undefined): string {
  if (raw == null) throw new InvalidNameError("A plugin id is required.");
  const value = String(raw).trim();
  if (!value) throw new InvalidNameError("A plugin id is required.");
  if (value.includes("\0")) throw new InvalidNameError("plugin id must not contain null bytes.");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new InvalidNameError("plugin id must not contain control characters.");
  if (/[/\\]/.test(value)) throw new InvalidNameError('plugin id must not contain path separators ("/" or "\\").');
  if (isAbsolute(value)) throw new InvalidNameError("plugin id must not be an absolute path.");
  if (value.includes("..")) throw new InvalidNameError("plugin id must not contain consecutive dots.");
  if (/[;&|`$(){}<>*?!"'\[\]#~]/.test(value)) throw new InvalidNameError("plugin id must not contain shell metacharacters.");
  if (!/^[A-Za-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*$/.test(value)) {
    throw new InvalidNameError(
      "plugin id must start with a letter and use only letters, numbers, dots and hyphens (e.g. com.example.my-plugin)."
    );
  }
  return value;
}

/**
 * Resolves `child` against `baseDir` and guarantees the result stays inside
 * `baseDir`. Throws on any traversal attempt. Returns the resolved path.
 */
export function assertInsideDir(baseDir: string, child: string): string {
  const base = resolve(baseDir);
  const target = resolve(base, child);
  const rel = relative(base, target);
  if (rel === "" || rel === "." ) return target;
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new InvalidNameError(`Refusing to write outside the project directory: ${target}`);
  }
  return target;
}
