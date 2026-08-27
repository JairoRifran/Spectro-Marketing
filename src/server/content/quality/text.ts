// Deterministic text utilities. No embeddings and no model calls: similarity here is a
// lexical signal used to raise a warning, never a semantic judgement and never a gate that
// silently rewrites anything.

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string) {
  const normalized = normalize(text);
  return normalized ? normalized.split(" ") : [];
}

/** Token-set overlap. Insensitive to word order, which is what catches a light reshuffle. */
export function jaccardSimilarity(a: string, b: string) {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function trigrams(text: string) {
  const normalized = normalize(text).replace(/\s/g, "");
  const grams = new Set<string>();
  for (let index = 0; index + 3 <= normalized.length; index += 1) grams.add(normalized.slice(index, index + 3));
  return grams;
}

/** Character-level overlap. Catches near-identical phrasing that token sets round away. */
export function trigramSimilarity(a: string, b: string) {
  const left = trigrams(a);
  const right = trigrams(b);
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * Combined lexical similarity in [0,1]. The two measures disagree in useful ways: token
 * overlap survives reordering, trigram overlap survives synonym-free edits, and taking the
 * higher of the two makes the check harder to game by shuffling clauses.
 */
export function textSimilarity(a: string, b: string) {
  return Math.max(jaccardSimilarity(a, b), trigramSimilarity(a, b));
}

/** Whole-word, accent-insensitive match. Used for brand vocabulary rules. */
export function containsTerm(haystack: string, term: string) {
  const words = tokenize(haystack);
  const needle = tokenize(term);
  if (!needle.length) return false;
  for (let index = 0; index + needle.length <= words.length; index += 1) {
    if (needle.every((word, offset) => words[index + offset] === word)) return true;
  }
  return false;
}

export function wordCount(text: string) {
  return tokenize(text).length;
}
