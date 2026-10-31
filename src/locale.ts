/** The learner's locales as the host sends them: a chain, or a start / locale switch (`locale`, then `fallback`). */
export type LocaleChain = readonly string[] | { readonly locale: string; readonly fallback?: readonly string[] };

/** The locale a tool shows: the first entry of the host's chain the tool declares, the exact tag before its base
 *  language (`ja-JP` → `ja`), case-insensitively, in the tool's own spelling. None: `fallback`, else `declared[0]`
 *  (a manifest's `locales` lists its default first; a manifest without `locales` is an English tool).
 *  `pickLocale(tool.start, manifest.locales)`; on a switch, `pickLocale(message, manifest.locales)`. */
export function pickLocale<L extends string>(chain: LocaleChain, declared: readonly L[], fallback?: L): L;
export function pickLocale(chain: LocaleChain, declared: readonly string[] | undefined, fallback?: string): string;
export function pickLocale(chain: LocaleChain, declared: readonly string[] | undefined, fallback?: string): string {
  const tools = declared ?? ["en"];
  const tags = "locale" in chain ? [chain.locale, ...(chain.fallback ?? [])] : chain;
  const byTag = new Map(tools.map((l) => [l.toLowerCase(), l]));
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    const found = byTag.get(lower) ?? byTag.get(lower.split("-")[0] ?? lower);
    if (found) return found;
  }
  const otherwise = fallback ?? tools[0];
  if (otherwise === undefined) throw new Error("pickLocale: no locale to fall back to (declared is empty and no fallback given)");
  return otherwise;
}
