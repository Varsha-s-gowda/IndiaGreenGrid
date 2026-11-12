export const METHOD_ORDER = [
  "EQUAL_SHARE",
  "CONSUMPTION_BASED",
  "OWNERSHIP_BASED",
];

export const METHOD_META = {
  EQUAL_SHARE: {
    key: "EQUAL_SHARE",
    label: "Equal share",
    shortLabel: "Equal",
    color: "#2d744c",
    lightColor: "#96cca9",
    tagline: "Every apartment gets the same weight.",
    description:
      "Available solar is offered to all eligible apartments in equal amounts, then capped at each flat's demand. Energy released by capped flats is redistributed equally until the available solar or total demand is exhausted.",
    weights: "Equal weight (1 / n) for every apartment with positive demand.",
    formula: "offerᵢ = available × (1 / n)",
    tradeoff:
      "Protects small households from being crowded out by high consumers, but low-consumption flats may receive more than they can use, so released energy is redistributed to the remaining flats.",
    bestFor:
      "Households where equal treatment of flats matters more than matching each flat's usage.",
  },
  CONSUMPTION_BASED: {
    key: "CONSUMPTION_BASED",
    label: "Consumption based",
    shortLabel: "Consumption",
    color: "#0e7490",
    lightColor: "#7dd3fc",
    tagline: "Benefit tracks each flat's demand.",
    description:
      "Available solar is offered in proportion to each apartment's consumption in the same hour. A flat that uses more electricity has a larger weight, but it can never receive more than it actually consumed.",
    weights: "Hourly apartment consumption, normalised across eligible flats.",
    formula: "offerᵢ = available × (demandᵢ / Σ demand)",
    tradeoff:
      "Aligns solar benefit with consumption, so coverage percentages tend to be more even. High-use flats receive larger absolute kWh, which can be perceived as rewarding higher consumption.",
    bestFor:
      "Societies that want solar benefit to follow actual electricity use rather than flat size or equal shares.",
  },
  OWNERSHIP_BASED: {
    key: "OWNERSHIP_BASED",
    label: "Ownership based",
    shortLabel: "Ownership",
    color: "#b45309",
    lightColor: "#fcd34d",
    tagline: "Benefit follows the shared-asset contribution.",
    description:
      "Available solar is offered in proportion to each apartment's documented ownership percentage in the shared rooftop asset. Caps still apply: a flat cannot receive more solar than it consumed in that hour.",
    weights:
      "Ownership percentage from the ownership ledger; the ledger must total exactly 100.000%.",
    formula: "offerᵢ = available × (ownershipᵢ / 100)",
    tradeoff:
      "Reflects capital contribution and is easy to audit, but flats with high ownership and low consumption may be capped, releasing energy to others. It is not automatically fairer than the other methods.",
    bestFor:
      "Societies that treat the rooftop system as a shared investment and want returns proportional to contribution.",
  },
};

export const METHOD_CAVEATS = [
  "No method is universally fairest. The better choice depends on the society's written policy, the ownership ledger and household needs.",
  "Jain's index is calculated over solar coverage percentages for apartments with positive demand. It measures how evenly coverage is shared, not whether the policy is morally or legally fair.",
  "Caps and redistribution are mandatory: no apartment can receive more solar than it consumed in the same interval.",
  "Common-area demand is served before apartments, and every kWh is counted once.",
];

export const RUN_STATUS_VARIANTS = {
  SAVED: "success",
  SAVED_WITH_GAPS: "warning",
  PREVIEW: "info",
  FAILED: "danger",
};

export const RUN_STATUS_LABELS = {
  SAVED: "Saved",
  SAVED_WITH_GAPS: "Saved with data gaps",
  PREVIEW: "Preview",
  FAILED: "Failed",
};

export const METHOD_STEPS = [
  "Common-area demand is served from solar first.",
  "Remaining solar is offered to apartments using the selected weights.",
  "Any offer above a flat's demand is capped and redistributed.",
  "Unused solar becomes surplus; unmet demand is imported from the grid.",
];

export function methodLabel(method) {
  return METHOD_META[method]?.label || method || "Unknown method";
}

export function methodColor(method) {
  return METHOD_META[method]?.color || "#64748b";
}

export function methodShortLabel(method) {
  return METHOD_META[method]?.shortLabel || methodLabel(method);
}

export function formatHash(hash) {
  if (!hash) return "—";
  return hash.length > 16 ? `${hash.slice(0, 12)}…${hash.slice(-4)}` : hash;
}

export function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function percentageOf(value, total) {
  const numericTotal = safeNumber(total);
  if (!numericTotal) return 0;
  return (safeNumber(value) / numericTotal) * 100;
}
