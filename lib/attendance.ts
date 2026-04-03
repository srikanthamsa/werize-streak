import type { AttendanceDay, LeaderboardEntry, MonthSummary, StreakData } from "@/lib/types";

const MINUTES_IN_HOUR = 60;
export const DAILY_TARGET_MINUTES = 9 * MINUTES_IN_HOUR;
export const HALF_DAY_MINUTES = 4.5 * MINUTES_IN_HOUR;
export const STREAK_GRACE_BUFFER_MINUTES = 30;
export const STREAK_RECOVERY_BONUS_MINUTES = 60;

function parseTime(value: string) {
  return new Date(value);
}

function toLocalDateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function toLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number) {
  const date = toLocalDateFromKey(value);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

function isWeekend(dateKey: string) {
  const weekday = toLocalDateFromKey(dateKey).getDay();
  return weekday === 0 || weekday === 6;
}

function getWeekKey(dateKey: string) {
  const date = toLocalDateFromKey(dateKey);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return toLocalDateKey(date);
}

export function calculateWorkedMinutes(swipes: string[]) {
  if (swipes.length < 2) {
    return 0;
  }

  const first = parseTime(swipes[0]).getTime();
  const last = parseTime(swipes[swipes.length - 1]).getTime();
  return Math.max(0, Math.round((last - first) / 60000));
}

export function calculateTargetExitTime(swipes: string[]) {
  if (swipes.length === 0) {
    return null;
  }

  const first = parseTime(swipes[0]);
  const target = new Date(first.getTime() + DAILY_TARGET_MINUTES * 60000);
  return target.toISOString();
}

export function formatMinutes(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / MINUTES_IN_HOUR);
  const remainingMinutes = absolute % MINUTES_IN_HOUR;
  return `${sign}${hours}h ${remainingMinutes}m`;
}

export function toClockLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parseTime(value));
}

export function toShortDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(parseTime(value));
}

export function calculateMonthSummary(
  entries: AttendanceDay[],
  totalWorkingDays: number,
) {
  const leavesCount = entries.filter((entry) => entry.status === "leave").length;
  const effectiveTotalWorkingDays = Math.max(0, totalWorkingDays - leavesCount);

  const completedOrInProgress = entries.filter((entry) => entry.status !== "leave" && entry.swipes.length > 0);
  const actualMinutesToDate = completedOrInProgress.reduce((total, entry) => {
    return total + calculateWorkedMinutes(entry.swipes);
  }, 0);
  const workingDaysElapsed = completedOrInProgress.length;
  const targetMinutesToDate = workingDaysElapsed * DAILY_TARGET_MINUTES;
  const balanceMinutes = actualMinutesToDate - targetMinutesToDate;
  const remainingDays = Math.max(1, effectiveTotalWorkingDays - workingDaysElapsed);
  const remainingTargetMinutes = effectiveTotalWorkingDays * DAILY_TARGET_MINUTES - actualMinutesToDate;
  const recommendedDailyAverageMinutes = Math.max(
    0,
    Math.round(remainingTargetMinutes / remainingDays),
  );

  return {
    workingDaysElapsed,
    totalWorkingDays: effectiveTotalWorkingDays,
    targetMinutesToDate,
    actualMinutesToDate,
    balanceMinutes,
    recommendedDailyAverageMinutes,
  } satisfies MonthSummary;
}

export function getDailyStatusMessage(entry: AttendanceDay) {
  if (entry.status === "missing_swipe") {
    return "Missed Swipe - Please check greytHR.";
  }

  if (entry.status === "done") {
    return `You logged ${formatMinutes(calculateWorkedMinutes(entry.swipes))} today.`;
  }

  const targetExit = calculateTargetExitTime(entry.swipes);
  if (!targetExit) {
    return "No swipe data synced yet.";
  }

  return `If you keep the day clean, you can leave at ${toClockLabel(targetExit)}.`;
}

export function getProgressPercent(entry: AttendanceDay) {
  const worked = calculateWorkedMinutes(entry.swipes);
  return Math.min(100, Math.round((worked / DAILY_TARGET_MINUTES) * 100));
}

export function getMinutesRemaining(swipes: string[]) {
  return Math.max(0, DAILY_TARGET_MINUTES - calculateWorkedMinutes(swipes));
}

function getWorkingDayKeys(startDate: string, endDate: string) {
  const keys: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    if (!isWeekend(cursor)) {
      keys.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return keys;
}

export function calculateStreakData(entries: AttendanceDay[], todayDateKey = toLocalDateKey()): StreakData {
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sortedEntries[0]?.date ?? todayDateKey;
  const workingDayKeys = getWorkingDayKeys(firstDate, todayDateKey);
  const entryMap = new Map(sortedEntries.map((entry) => [entry.date, entry]));
  const forgivenessByWeek = new Set<string>();

  let currentStreak = 0;
  let longestStreak = 0;
  let lastValidDate: string | null = null;
  let pendingBreak: { date: string; streak: number } | null = null;
  let recoveredToday = false;

  for (const dateKey of workingDayKeys) {
    const entry = entryMap.get(dateKey) ?? {
      date: dateKey,
      swipes: [],
      status: "missing_swipe" as const,
    };
    const workedMinutes = calculateWorkedMinutes(entry.swipes);
    const isToday = dateKey === todayDateKey;
    const isValid = workedMinutes >= DAILY_TARGET_MINUTES - STREAK_GRACE_BUFFER_MINUTES;
    const weekKey = getWeekKey(dateKey);

    if (isToday) {
      if (isValid) {
        if (
          pendingBreak &&
          pendingBreak.date === addDays(dateKey, -1) &&
          workedMinutes >= DAILY_TARGET_MINUTES + STREAK_RECOVERY_BONUS_MINUTES
        ) {
          currentStreak = Math.max(currentStreak, pendingBreak.streak);
          recoveredToday = true;
          pendingBreak = null;
        } else {
          currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        }
        longestStreak = Math.max(longestStreak, currentStreak);
        lastValidDate = dateKey;
      }
      break;
    }

    if (isValid) {
      if (
        pendingBreak &&
        pendingBreak.date === addDays(dateKey, -1) &&
        workedMinutes >= DAILY_TARGET_MINUTES + STREAK_RECOVERY_BONUS_MINUTES
      ) {
        currentStreak = Math.max(currentStreak, pendingBreak.streak);
        pendingBreak = null;
      } else {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      }
      longestStreak = Math.max(longestStreak, currentStreak);
      lastValidDate = dateKey;
      continue;
    }

    if (!forgivenessByWeek.has(weekKey)) {
      forgivenessByWeek.add(weekKey);
      continue;
    }

    pendingBreak = {
      date: dateKey,
      streak: currentStreak,
    };
    currentStreak = 0;
  }

  const todayEntry = entryMap.get(todayDateKey) ?? {
    date: todayDateKey,
    swipes: [],
    status: "missing_swipe" as const,
  };
  const workedToday = calculateWorkedMinutes(todayEntry.swipes);
  const remainingMinutes = Math.max(0, DAILY_TARGET_MINUTES - workedToday);
  const realTimeStatus = remainingMinutes <= 0 ? "safe" : remainingMinutes <= 120 ? "risk" : "danger";
  const streakStatus = currentStreak === 0 && remainingMinutes > 0 ? "broken" : realTimeStatus === "safe" ? "safe" : "risk";
  const currentWeekKey = getWeekKey(todayDateKey);
  const weeklyForgivenessUsed = forgivenessByWeek.has(currentWeekKey);

  const message = !todayEntry.swipes.length
    ? currentStreak > 0
      ? "Clock in to protect the streak."
      : "Clock in to start the streak."
    : realTimeStatus === "safe"
    ? "Day completed cleanly."
    : realTimeStatus === "risk"
    ? "Keep going to secure the day."
    : currentStreak > 0
    ? `You’re ${formatMinutes(remainingMinutes)} short. Streak will break.`
    : `You’re ${formatMinutes(remainingMinutes)} short. Clear the day to start your streak.`;

  const banner = !todayEntry.swipes.length
    ? null
    : realTimeStatus === "safe"
    ? null
    : `You are ${formatMinutes(remainingMinutes)} short. Your streak is at risk.`;

  const endOfDayFeedback = recoveredToday
    ? "Clutched it. Streak saved."
    : realTimeStatus === "safe"
    ? "Streak continued"
    : streakStatus === "broken" && currentStreak > 0
    ? "Streak broken. Start again."
    : currentStreak > 0
    ? "Streak at risk 👀"
    : "First streak is waiting.";

  return {
    currentStreak,
    longestStreak,
    lastValidDate,
    streakStatus,
    realTimeStatus,
    remainingMinutes,
    graceUsedThisWeek: weeklyForgivenessUsed,
    weeklyForgivenessUsed,
    message,
    banner,
    endOfDayFeedback,
    recoveredToday,
    notificationMessages: {
      midday: !todayEntry.swipes.length || realTimeStatus === "safe"
        ? null
        : "You’re falling behind. Don’t lose your streak.",
      evening: !todayEntry.swipes.length || realTimeStatus === "safe"
        ? null
        : `Last chance. ${formatMinutes(remainingMinutes)} to save your streak.`,
      success: realTimeStatus === "safe" ? "+1 added. Streak alive!" : null,
    },
  };
}

export function getLeaderboardCards(entries: LeaderboardEntry[]) {
  const visible = entries.filter((entry) => entry.public);

  const byHighestHours = [...visible].sort((a, b) => b.totalMinutes - a.totalMinutes)[0];
  const byArrival = [...visible].sort((a, b) =>
    a.averageArrivalTime.localeCompare(b.averageArrivalTime),
  )[0];
  const byDeparture = [...visible].sort((a, b) =>
    b.averageDepartureTime.localeCompare(a.averageDepartureTime),
  )[0];
  const bySwipes = [...visible].sort(
    (a, b) => b.averageSwipesPerDay - a.averageSwipesPerDay,
  )[0];

  return [
    {
      title: "The Iron Man/Woman",
      winner: byHighestHours?.alias ?? "Waiting for data",
      stat: byHighestHours ? formatMinutes(byHighestHours.totalMinutes) : "No live opt-ins yet",
    },
    {
      title: "The Early Bird",
      winner: byArrival?.alias ?? "Waiting for data",
      stat: byArrival?.averageArrivalTime ?? "No live opt-ins yet",
    },
    {
      title: "The Night Owl",
      winner: byDeparture?.alias ?? "Waiting for data",
      stat: byDeparture?.averageDepartureTime ?? "No live opt-ins yet",
    },
    {
      title: "The Restless",
      winner: bySwipes?.alias ?? "Waiting for data",
      stat: bySwipes ? `${bySwipes.averageSwipesPerDay.toFixed(1)} swipes/day` : "No live opt-ins yet",
    },
  ];
}

export function getBalanceTone(balanceMinutes: number) {
  if (balanceMinutes > 0) {
    return "text-moss";
  }

  if (balanceMinutes < 0) {
    return "text-coral";
  }

  return "text-ink";
}

export function getBalanceLabel(balanceMinutes: number) {
  if (balanceMinutes > 0) {
    return "Surplus";
  }

  if (balanceMinutes < 0) {
    return "Deficit";
  }

  return "Even";
}

export function formatRelativeTime(date: string | Date) {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(past);
}
