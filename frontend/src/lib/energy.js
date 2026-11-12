export const COMMON_CATEGORIES = [
  {
    key: "lifts",
    label: "Lifts",
    shortLabel: "Lifts",
    color: "#2d744c",
    description: "Passenger lift motors, controllers and lighting.",
  },
  {
    key: "water_pumps",
    label: "Water pumps",
    shortLabel: "Pumps",
    color: "#3d8f60",
    description: "Domestic water pumping and pressure systems.",
  },
  {
    key: "corridor_lights",
    label: "Corridor lighting",
    shortLabel: "Corridors",
    color: "#62ae80",
    description: "Common corridor, lobby and stairwell lighting.",
  },
  {
    key: "security_systems",
    label: "Security systems",
    shortLabel: "Security",
    color: "#96cca9",
    description: "CCTV, access control and perimeter security.",
  },
];

export const PROFILE_LABELS = {
  LOW: "Low usage",
  MEDIUM: "Medium usage",
  HIGH: "High usage",
  WORK_FROM_HOME: "Work from home",
  NIGHT_HEAVY: "Night heavy",
};

export const PROFILE_COLORS = {
  LOW: "#96cca9",
  MEDIUM: "#3d8f60",
  HIGH: "#1f4a33",
  WORK_FROM_HOME: "#0ea5e9",
  NIGHT_HEAVY: "#f59e0b",
};

export function round(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 10 ** digits) / 10 ** digits;
}

export function sumItems(items = [], selector) {
  return items.reduce((total, item) => {
    const value = Number(selector ? selector(item) : item);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function utcDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function weekStartKey(period) {
  const date = new Date(`${period}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return period;
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function aggregateByPeriod(items = [], valueSelector, periodSelector) {
  const buckets = new Map();
  items.forEach((item) => {
    const period = periodSelector
      ? periodSelector(item)
      : utcDateKey(item.reading_time);
    if (!period) return;
    const value = Number(valueSelector(item)) || 0;
    buckets.set(period, (buckets.get(period) || 0) + value);
  });
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, value]) => ({ period, value: round(value, 4) }));
}

export function hourlyAverageProfile(items = [], valueSelector) {
  const totals = Array.from({ length: 24 }, () => 0);
  const days = new Set();

  items.forEach((item) => {
    const date = new Date(item.reading_time);
    if (Number.isNaN(date.getTime())) return;
    days.add(date.toISOString().slice(0, 10));
    totals[date.getUTCHours()] += Number(valueSelector(item)) || 0;
  });

  const dayCount = days.size || 1;
  return totals.map((total, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    value: round(total / dayCount, 4),
  }));
}

export function groupRowsByWeek(rows = []) {
  const buckets = new Map();

  rows.forEach((row) => {
    const period = weekStartKey(row.period);
    const bucket = buckets.get(period) || { period };
    Object.entries(row).forEach(([field, value]) => {
      if (field === "period" || typeof value !== "number") return;
      bucket[field] = (bucket[field] || 0) + value;
    });
    buckets.set(period, bucket);
  });

  return [...buckets.values()].sort((left, right) =>
    left.period.localeCompare(right.period)
  );
}

export function consumptionByFlat(items = []) {
  const buckets = new Map();

  items.forEach((item) => {
    const key = item.flat_number || `Apartment ${item.apartment_id}`;
    const bucket =
      buckets.get(key) || {
        flat_number: key,
        apartment_id: item.apartment_id,
        consumption_kwh: 0,
      };
    bucket.consumption_kwh += Number(item.consumption_kwh) || 0;
    buckets.set(key, bucket);
  });

  return [...buckets.values()]
    .map((row) => ({ ...row, consumption_kwh: round(row.consumption_kwh, 2) }))
    .sort((left, right) => right.consumption_kwh - left.consumption_kwh);
}

export function commonDailySeries(items = []) {
  const buckets = new Map();

  items.forEach((item) => {
    const period = utcDateKey(item.reading_time);
    if (!period) return;
    const bucket = buckets.get(period) || { period };
    const category = item.category;
    bucket[category] =
      (bucket[category] || 0) + (Number(item.consumption_kwh) || 0);
    bucket.total = (bucket.total || 0) + (Number(item.consumption_kwh) || 0);
    buckets.set(period, bucket);
  });

  return [...buckets.values()]
    .sort((left, right) => left.period.localeCompare(right.period))
    .map((row) => {
      const rounded = { ...row };
      COMMON_CATEGORIES.forEach((category) => {
        rounded[category.key] = round(rounded[category.key] || 0, 4);
      });
      rounded.total = round(rounded.total || 0, 4);
      return rounded;
    });
}

export function commonHourlySeries(items = []) {
  const buckets = new Map();

  items.forEach((item) => {
    const key = item.reading_time;
    const bucket = buckets.get(key) || { reading_time: key, total: 0 };
    bucket[item.category] =
      (bucket[item.category] || 0) + (Number(item.consumption_kwh) || 0);
    bucket.total = (bucket.total || 0) + (Number(item.consumption_kwh) || 0);
    buckets.set(key, bucket);
  });

  return [...buckets.values()]
    .sort((left, right) =>
      String(left.reading_time).localeCompare(String(right.reading_time))
    )
    .map((row) => {
      const rounded = { ...row };
      COMMON_CATEGORIES.forEach((category) => {
        rounded[category.key] = round(rounded[category.key] || 0, 4);
      });
      rounded.total = round(rounded.total || 0, 4);
      return rounded;
    });
}

export function commonCategoryRows(commonByCategory = {}) {
  const total = COMMON_CATEGORIES.reduce(
    (sum, category) => sum + (Number(commonByCategory[category.key]) || 0),
    0
  );

  return COMMON_CATEGORIES.map((category) => {
    const value = Number(commonByCategory[category.key]) || 0;
    return {
      ...category,
      value: round(value, 4),
      share: total ? round((value / total) * 100, 2) : 0,
    };
  });
}

export function profileConsumption(flatRows = [], apartments = []) {
  const profiles = new Map(
    apartments.map((apartment) => [apartment.flat_number, apartment.consumption_profile])
  );
  const buckets = new Map();

  flatRows.forEach((row) => {
    const profile = profiles.get(row.flat_number) || "MEDIUM";
    const bucket = buckets.get(profile) || { profile, consumption_kwh: 0, apartments: 0 };
    bucket.consumption_kwh += Number(row.consumption_kwh) || 0;
    bucket.apartments += 1;
    buckets.set(profile, bucket);
  });

  return [...buckets.values()]
    .map((row) => ({
      ...row,
      label: PROFILE_LABELS[row.profile] || row.profile,
      color: PROFILE_COLORS[row.profile] || "#3d8f60",
      consumption_kwh: round(row.consumption_kwh, 2),
    }))
    .sort((left, right) => right.consumption_kwh - left.consumption_kwh);
}

export function dailyDateInput(daysAgo = 0, reference = new Date()) {
  const date = new Date(reference);
  date.setDate(date.getDate() - daysAgo);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
