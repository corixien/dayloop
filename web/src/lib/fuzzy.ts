/** Lowercase, no diacritics: "Übung" matches "ubung". */
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replaceAll("ß", "ss");

/** Edit distance, capped: returns max+1 as soon as it is clear the words differ by more than max. */
function dist(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      low = Math.min(low, cur[j]);
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How well one typed word fits the words of a text: 1 prefix, .8 inside a word, .6 one typo (>= 4 letters), 0 none. */
function wordFit(q: string, words: string[]): number {
  let best = 0;
  for (const w of words) {
    if (w.startsWith(q)) return 1;
    if (w.includes(q)) best = Math.max(best, 0.8);
    else if (q.length >= 4 && dist(q, w.slice(0, q.length), 1) <= 1) best = Math.max(best, 0.6);
    else if (q.length >= 5 && dist(q, w, 2) <= 2) best = Math.max(best, 0.5);
  }
  return best;
}

/**
 * Typo-tolerant match of what the user typed against a text; 0 = no match, up to 100.
 * Whole-text hits score highest; otherwise every typed word must fit some word (prefix, substring, small typo),
 * and as a last resort the letters may appear in order ("kzm" -> "Klausur zusammenfassen").
 */
export function fuzzyScore(query: string, text: string): number {
  const q = norm(query).trim();
  if (!q) return 1;
  const t = norm(text);
  if (t === q) return 100;
  if (t.startsWith(q)) return 92;
  if (t.includes(` ${q}`)) return 85;
  if (t.includes(q)) return 72;
  const words = t.split(/[^a-z0-9]+/).filter(Boolean);
  const fits = q.split(/\s+/).map((w) => wordFit(w, words));
  if (fits.every((f) => f > 0)) return 50 + (fits.reduce((a, b) => a + b, 0) / fits.length) * 20;
  if (q.length >= 3 && !q.includes(" ")) {
    let at = -1, first = -1;
    for (const c of q) { at = t.indexOf(c, at + 1); if (at < 0) return 0; if (first < 0) first = at; }
    return 20 + 20 * (q.length / (at - first + 1));
  }
  return 0;
}
