import { Item } from '../models/Item.js';

// Deterministic, explainable matching between LOST and FOUND reports.
// No machine learning: the same two reports always produce the same score and
// the same list of reasons, which makes results easy to test and to explain to
// users. Results are always presented as *potential* matches.
//
// Score (0-100):
//   category      30  (required: different categories never match)
//   keywords   up to 40  (8 per keyword shared between titles, 4 per other shared keyword)
//   date       up to 20  (found within 2 / 7 / 30 days after the loss)
//   location   up to 10  (shared words in the location text)

export const MIN_MATCH_SCORE = 45;
export const NOTIFY_MATCH_SCORE = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const STOPWORDS = new Set(
  `a an and are as at be but by for from has have i in is it its my near of on or our the this to was were
   with without found lost left some very next behind inside outside around about item`.split(/\s+/),
);

// Lowercase, remove accents, split into words, drop stopwords and very short
// words, and apply a tiny plural stemmer ("keys" -> "key", "glasses" -> "glass").
export function tokenize(text = '') {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/);

  const tokens = new Set();
  for (const word of words) {
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    tokens.add(stem(word));
  }
  return tokens;
}

function stem(word) {
  if (word.length > 4 && word.endsWith('es') && /(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

const intersect = (a, b) => [...a].filter((x) => b.has(x));

/**
 * Score how likely `a` and `b` describe the same object.
 * Returns { score, reasons } and is symmetric: scoreMatch(a, b) equals scoreMatch(b, a).
 */
export function scoreMatch(a, b) {
  const none = { score: 0, reasons: [] };
  if (!a || !b || a.type === b.type) return none;
  if (a.category !== b.category) return none;

  const lost = a.type === 'lost' ? a : b;
  const found = a.type === 'found' ? a : b;
  const reasons = [];
  let score = 30;
  reasons.push(`Same category (${lost.category})`);

  // Date: an item cannot be found long before it was lost (1 day tolerance for
  // time zones and imprecise reports).
  const diffDays = (new Date(found.date) - new Date(lost.date)) / DAY_MS;
  if (diffDays < -1) return none;
  const absDays = Math.abs(diffDays);
  if (absDays <= 2) {
    score += 20;
    reasons.push('Reported within 2 days of each other');
  } else if (absDays <= 7) {
    score += 14;
    reasons.push('Reported within a week of each other');
  } else if (absDays <= 30) {
    score += 6;
    reasons.push('Reported within a month of each other');
  }

  // Keywords: shared title words are stronger evidence than description words.
  const titleShared = intersect(tokenize(lost.title), tokenize(found.title));
  const allShared = intersect(
    tokenize(`${lost.title} ${lost.description}`),
    tokenize(`${found.title} ${found.description}`),
  );
  const otherShared = allShared.filter((w) => !titleShared.includes(w));
  const keywordScore = Math.min(40, titleShared.length * 8 + otherShared.length * 4);
  if (keywordScore > 0) {
    score += keywordScore;
    reasons.push(`Shared keywords: ${allShared.slice(0, 8).join(', ')}`);
  }

  // Location: shared words such as "station" or "library".
  const locationShared = intersect(tokenize(lost.location), tokenize(found.location));
  if (locationShared.length > 0) {
    score += Math.min(10, locationShared.length * 5);
    reasons.push(`Similar location: ${locationShared.join(', ')}`);
  }

  return { score: Math.min(100, score), reasons };
}

/**
 * Find open reports of the opposite type that may match `item`.
 * Candidates are pre-filtered in MongoDB (category, date window, not the same
 * owner) and then scored in JavaScript.
 */
export async function findMatches(item, { limit = 10, minScore = MIN_MATCH_SCORE } = {}) {
  const date = new Date(item.date);
  const dateRange =
    item.type === 'lost'
      ? { $gte: new Date(date.getTime() - DAY_MS), $lte: new Date(date.getTime() + 90 * DAY_MS) }
      : { $gte: new Date(date.getTime() - 90 * DAY_MS), $lte: new Date(date.getTime() + DAY_MS) };

  const candidates = await Item.find({
    _id: { $ne: item._id },
    type: item.type === 'lost' ? 'found' : 'lost',
    category: item.category,
    status: 'open',
    removed: false,
    owner: { $ne: item.owner?._id ?? item.owner },
    date: dateRange,
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('owner', 'name')
    .lean();

  return candidates
    .map((candidate) => ({ item: candidate, ...scoreMatch(item, candidate) }))
    .filter((m) => m.score >= minScore)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
