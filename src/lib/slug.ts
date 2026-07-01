/**
 * App id rules (mirrors the backend): a lowercase slug of 2–63 chars that starts
 * with an alphanumeric and otherwise allows `[a-z0-9-]`.
 */
export const APP_ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

/** Whether a string is a valid app id. */
export function isValidId(id: string): boolean {
  return APP_ID_RE.test(id);
}

/**
 * Derive a slug from a human-friendly name: strip accents, lowercase, collapse
 * any run of non-alphanumeric characters into a single hyphen, trim hyphens and
 * cap at 63 chars. Very short results are padded so the slug always satisfies
 * {@link APP_ID_RE}.
 */
export function slugifyName(name: string): string {
  let slug = name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  if (slug.length < 2) slug = `${slug}app`.slice(0, 63);
  return slug;
}

/**
 * Derive an app id from a name, avoiding ids already in `taken`. On collision it
 * appends a numeric suffix (`-2`, `-3`, …), trimming the base if needed so the
 * result stays within 63 chars and valid.
 */
export function deriveUniqueId(name: string, taken: ReadonlySet<string>): string {
  const base = slugifyName(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = base.slice(0, 63 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}
