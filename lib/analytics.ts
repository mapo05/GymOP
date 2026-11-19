import { TIME_NAMES, type UploadRow } from "./story1";

export type AnalyticsOptions = {
  weekendView: "same" | "separate";
  weekCount: number;
  limits: Record<string, number>;
  today?: string;
};

export type Result = {
  equipmentName: string;
  timeOfDay: string;
  dayCategory: "same" | "weekday" | "weekend";
  weeksIncluded: number;
  peoplePerHour: number;
  minutesPerPerson: number;
  points: number;
  limit: number;
  numberOwned: number;
  status: "Backed up" | "Not backed up";
  rank: number;
  extraMachines: number | null;
  recommendation: string | null;
  isStale: boolean;
};

type DailySummary = {
  people: number;
  minutes: number;
  owned: number;
  days: Set<string>;
};

function machineKey(name: string) {
  return name.trim().toLowerCase();
}

function dayCount(value: DailySummary) {
  return Math.max(value.days.size, 1);
}

function dateDifferenceDays(date: string, today: string) {
  const start = new Date(`${date}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  return Math.floor((now - start) / 86400000);
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function calculateResults(rows: UploadRow[], options: AnalyticsOptions): Result[] {
  const weeks = [...new Set(rows.map((row) => row.weekStartDate))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, Math.max(1, Math.floor(options.weekCount)));
  if (!weeks.length) return [];

  const selectedRows = rows.filter((row) => weeks.includes(row.weekStartDate));
  const weekly = new Map<string, Map<string, Map<string, DailySummary>>>();
  const machineNames = new Map<string, string>();
  const timeNames = new Map<string, string>();

  for (const row of selectedRows) {
    const equipment = machineKey(row.equipmentName);
    const time = row.timeOfDay.toLowerCase();
    const week = row.weekStartDate;
    const key = `${equipment}|${time}`;
    machineNames.set(equipment, row.equipmentName);
    timeNames.set(time, row.timeOfDay);

    if (!weekly.has(week)) weekly.set(week, new Map());
    const weekData = weekly.get(week)!;
    if (!weekData.has(key)) weekData.set(key, new Map());
    const buckets = weekData.get(key)!;
    const category = row.dayCategory;
    if (!buckets.has(category)) {
      buckets.set(category, { people: 0, minutes: 0, owned: 0, days: new Set() });
    }
    const summary = buckets.get(category)!;
    summary.people += row.totalPeople;
    summary.minutes += row.totalMinutes;
    summary.owned += row.numberOwned;
    summary.days.add(row.dayType);
  }

  const keys = new Set<string>();
  for (const weekData of weekly.values()) {
    for (const key of weekData.keys()) keys.add(key);
  }

  const rawResults: Omit<Result, "rank">[] = [];
  for (const key of keys) {
    const [equipmentKey, timeKey] = key.split("|");
    const categories: Array<"same" | "weekday" | "weekend"> =
      options.weekendView === "separate" ? ["weekday", "weekend"] : ["same"];

    for (const category of categories) {
      const weeklyPeople: number[] = [];
      const weeklyMinutes: number[] = [];
      const weeklyOwned: number[] = [];
      const weekDates: string[] = [];

      for (const week of weeks) {
        const buckets = weekly.get(week)?.get(key);
        const weekday = buckets?.get("weekday");
        const weekend = buckets?.get("weekend");
        let chosen: { people: number; minutes: number; owned: number } | null;
        if (category === "same") {
          chosen = combineCategories(weekday, weekend);
        } else {
          const daily = category === "weekday" ? weekday : weekend;
          chosen = daily
            ? {
                people: daily.people / dayCount(daily),
                minutes: daily.minutes / dayCount(daily),
                owned: daily.owned / dayCount(daily),
              }
            : null;
        }
        if (!chosen) continue;

        weeklyPeople.push(chosen.people);
        weeklyMinutes.push(chosen.minutes);
        weeklyOwned.push(chosen.owned);
        weekDates.push(week);
      }

      if (!weekDates.length) continue;
      const people = average(weeklyPeople);
      const minutes = average(weeklyMinutes);
      const owned = average(weeklyOwned);
      const minutesPerPerson = people > 0 ? minutes / people : 0;
      const hours = hoursFor(timeNames.get(timeKey) ?? "");
      const peoplePerHour = people / hours;
      const points = (minutesPerPerson / 5) * peoplePerHour / owned;
      const limit = options.limits[equipmentKey] ?? 12;
      const backedUp = points > limit;
      const extraMachines = backedUp
        ? Math.max(0, Math.ceil(((minutesPerPerson / 5) * peoplePerHour) / limit) - Math.floor(owned))
        : null;
      const formattedCategory =
        category === "same" ? "" : ` (${category === "weekday" ? "Weekday" : "Weekend"})`;

      rawResults.push({
        equipmentName: machineNames.get(equipmentKey) ?? equipmentKey,
        timeOfDay: timeNames.get(timeKey) ?? timeKey,
        dayCategory: category,
        weeksIncluded: weekDates.length,
        peoplePerHour,
        minutesPerPerson,
        points,
        limit,
        numberOwned: owned,
        status: backedUp ? "Backed up" : "Not backed up",
        extraMachines,
        recommendation: backedUp
          ? `Add capacity for ${machineNames.get(equipmentKey) ?? equipmentKey} during ${timeNames.get(timeKey) ?? timeKey}${formattedCategory}.`
          : null,
        isStale: dateDifferenceDays(
          [...new Set(rows.map((row) => row.weekStartDate))].sort().at(-1) ?? weekDates[0],
          options.today ?? new Date().toISOString().slice(0, 10),
        ) > 14,
      });
    }
  }

  rawResults.sort((a, b) => {
    const timeDifference =
      TIME_NAMES.indexOf(a.timeOfDay as (typeof TIME_NAMES)[number]) -
      TIME_NAMES.indexOf(b.timeOfDay as (typeof TIME_NAMES)[number]);
    if (timeDifference !== 0) return timeDifference;
    if (a.dayCategory !== b.dayCategory) {
      return a.dayCategory === "weekday" ? -1 : b.dayCategory === "weekday" ? 1 : 0;
    }
    return b.points - a.points;
  });

  const ranks = new Map<string, number>();
  return rawResults.map((result) => {
    const group = `${result.timeOfDay}|${result.dayCategory}`;
    const rank = (ranks.get(group) ?? 0) + 1;
    ranks.set(group, rank);
    return { ...result, rank };
  });
}

function combineCategories(
  weekday?: DailySummary,
  weekend?: DailySummary,
): { people: number; minutes: number; owned: number } | null {
  const averages: Array<{ people: number; minutes: number; owned: number; weight: number }> = [];
  if (weekday) {
    const days = dayCount(weekday);
    averages.push({
      people: weekday.people / days,
      minutes: weekday.minutes / days,
      owned: weekday.owned / days,
      weight: 4,
    });
  }
  if (weekend) {
    const days = dayCount(weekend);
    averages.push({
      people: weekend.people / days,
      minutes: weekend.minutes / days,
      owned: weekend.owned / days,
      weight: 3,
    });
  }
  if (!averages.length) return null;

  const totalWeight = averages.reduce((total, item) => total + item.weight, 0);
  return {
    people: averages.reduce((total, item) => total + item.people * item.weight, 0) / totalWeight,
    minutes: averages.reduce((total, item) => total + item.minutes * item.weight, 0) / totalWeight,
    owned: averages.reduce((total, item) => total + item.owned * item.weight, 0) / totalWeight,
  };
}

function hoursFor(time: string) {
  return time === "Mid-day" ? 4 : 3;
}
