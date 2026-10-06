/*
 * Ranking transparency (T253, EU P2B Regulation 2019/1150, Art. 5). The facts behind the page "How suppliers are
 * ranked and priced", read from the engine's own constants (estimate.js, the T223 suggestion points and the
 * scorecard weights in sourcing.js, the T69 benchmark minimum) and the platform's price settings. The page draws
 * only these values, so its text cannot drift from the code.
 */
const { RANKING } = require("./estimate");
const { SUGGEST, SCORE_WEIGHTS } = require("./sourcing");
const { MIN_POINTS } = require("./benchmarks");

const pct = (share) => Math.round(share * 100);

function facts(settings = {}) {
  return {
    estimate: {
      scoreWeights: { ...SCORE_WEIGHTS },
      neutralQuality: RANKING.neutralQuality,
      badgeBonus: { ...RANKING.badgeBonus },
      kmPerPoint: RANKING.kmPerPoint,
      maxDistancePenalty: RANKING.maxDistancePenalty,
      unknownDistancePenalty: RANKING.unknownDistancePenalty,
      maxOpenTasks: RANKING.maxOpenTasks,
      hoursPerDay: RANKING.hoursPerDay,
      startDays: RANKING.startDays,
      splitCheaperPercent: pct(RANKING.splitCheaper),
      splitFasterPercent: pct(RANKING.splitFaster),
      splitQualityLead: RANKING.splitQualityLead,
      bandAbove: RANKING.bandAbove,
      bandBelowPercent: pct(RANKING.bandBelow),
      benchmarkMinPoints: MIN_POINTS,
    },
    suggestions: {
      category: SUGGEST.category,
      distance: SUGGEST.distance.map(([km, points]) => ({ km, points })),
      fartherOrUnknown: SUGGEST.fartherOrUnknown,
      scoreDivisor: SUGGEST.scoreDivisor,
      maxScorePoints: Math.round(100 / SUGGEST.scoreDivisor),
      noScore: SUGGEST.noScore,
      badge: { ...SUGGEST.badge },
      perOpenTask: SUGGEST.perOpenTask,
      maxOpenTasks: SUGGEST.maxOpenTasks,
      busy: SUGGEST.busy,
      workedBefore: SUGGEST.workedBefore,
    },
    prices: {
      platformFeePercent: Number(settings?.platformFeePercent ?? 3),
      brokerMarkupPercent: Math.max(0, Math.min(30, Number(settings?.brokerMarkupPercent) || 0)),
    },
  };
}

module.exports = { facts };
