import {
  calculateStreakData,
  calculateMonthSummary,
  calculateTargetExitTime,
  calculateWorkedMinutes,
  getLeaderboardCards,
  getProgressPercent,
} from "@/lib/attendance";
import type { AttendanceDay, LeaderboardEntry, MonthSummary, StreakData, UserProfile } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export type DashboardData = {
  profile: UserProfile;
  todayEntry: AttendanceDay;
  monthEntries: AttendanceDay[];
  leaderboardEntries: LeaderboardEntry[];
  monthSummary: MonthSummary;
  targetExitTime: string | null;
  workedMinutes: number;
  progressPercent: number;
  leaderboardCards: ReturnType<typeof getLeaderboardCards>;
  isLive: boolean;
  syncUserId: string | null;
  syncStatus: string;
  lastSyncedAt: string | null;
  streak: StreakData;
  notifications: any[];
};

type AttendanceRow = {
  attendance_date: string;
  swipe_times: string[];
  sync_source?: string | null;
};

type LeaderboardAttendanceRow = AttendanceRow & {
  user_id: string;
};

type UserProfileRow = {
  id: string;
  auth_user_id?: string | null;
  full_name: string;
  role: string | null;
  team: string;
  leaderboard_opt_in: boolean;
  email?: string;
  greythr_user_id?: string | null;
  greythr_username?: string | null;
};

function toLocalDateKey(date = new Date()) {
  // Use IST (UTC+5:30) — server runs UTC but users are in India
  const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const year = istDate.getUTCFullYear();
  const month = `${istDate.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${istDate.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function getStatusForDay(entry: Omit<AttendanceDay, "status">): AttendanceDay["status"] {
  if (entry.syncSource === "manual_leave") {
    return "leave";
  }

  if (entry.swipes.length === 0 || entry.swipes.length === 1) {
    return "missing_swipe";
  }

  const isSameDay = entry.date === toLocalDateKey();

  return isSameDay ? "in_progress" : "done";
}

function normalizeAttendanceRows(rows: AttendanceRow[]) {
  return rows.map((row) => {
    const swipes = [...row.swipe_times].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const entry = {
      date: row.attendance_date,
      swipes,
      status: "done" as const,
      syncSource: row.sync_source ?? undefined,
    };

    return {
      ...entry,
      status: getStatusForDay(entry),
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function toTimeKey(totalMinutes: number) {
  const hours = `${Math.floor(totalMinutes / 60)}`.padStart(2, "0");
  const minutes = `${totalMinutes % 60}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getSwipeMinutes(value: string) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function buildLeaderboardEntries(
  profileRows: UserProfileRow[],
  attendanceRows: LeaderboardAttendanceRow[],
) {
  const attendanceByUser = new Map<string, AttendanceRow[]>();

  for (const row of attendanceRows) {
    const rows = attendanceByUser.get(row.user_id) ?? [];
    rows.push({
      attendance_date: row.attendance_date,
      swipe_times: row.swipe_times,
      sync_source: row.sync_source,
    });
    attendanceByUser.set(row.user_id, rows);
  }

  return profileRows
    .filter((row) => row.leaderboard_opt_in)
    .map((row) => {
      const normalizedEntries = normalizeAttendanceRows(attendanceByUser.get(row.id) ?? []);
      const activeEntries = normalizedEntries.filter((entry) => 
        entry.swipes.length > 0 && entry.syncSource !== "manual_leave"
      );
      const totalMinutes = activeEntries.reduce((sum, entry) => sum + calculateWorkedMinutes(entry.swipes), 0);
      const averageDailyMinutes = average(activeEntries.map((entry) => calculateWorkedMinutes(entry.swipes)));
      const averageArrivalTime = toTimeKey(
        average(activeEntries.map((entry) => getSwipeMinutes(entry.swipes[0] as string))),
      );
      const averageDepartureTime = toTimeKey(
        average(activeEntries.map((entry) => getSwipeMinutes(entry.swipes.at(-1) as string))),
      );
      const averageSwipesPerDay = activeEntries.length
        ? Number((activeEntries.reduce((sum, entry) => sum + entry.swipes.length, 0) / activeEntries.length).toFixed(1))
        : 0;

      return {
        id: row.id,
        alias: row.full_name,
        totalMinutes,
        averageDailyMinutes,
        currentStreak: calculateStreakData(normalizedEntries).currentStreak,
        averageArrivalTime,
        averageDepartureTime,
        averageSwipesPerDay,
        public: true,
      } satisfies LeaderboardEntry;
    })
    .filter((entry) => entry.totalMinutes > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

function createEmptyDashboardData({
  isLive,
  syncStatus,
  profile,
  syncUserId,
  lastSyncedAt,
}: {
  isLive: boolean;
  syncStatus: string;
  profile?: UserProfile;
  syncUserId?: string | null;
  lastSyncedAt?: string | null;
}): DashboardData {
  const todayEntry: AttendanceDay = {
    date: toLocalDateKey(),
    swipes: [],
    status: "missing_swipe",
  };
  const monthEntries: AttendanceDay[] = [];
  const leaderboardEntries: LeaderboardEntry[] = [];
  const safeProfile: UserProfile = profile ?? {
    id: "",
    fullName: "You",
    role: "Team Member",
    team: "Not connected",
    leaderboardOptIn: false,
    firstSwipeAt: null,
  };

  return {
    profile: safeProfile,
    todayEntry,
    monthEntries,
    leaderboardEntries,
    monthSummary: calculateMonthSummary(monthEntries, getWorkingDaysInMonth()),
    targetExitTime: null,
    workedMinutes: 0,
    progressPercent: 0,
    leaderboardCards: getLeaderboardCards(leaderboardEntries),
    isLive,
    syncUserId: syncUserId ?? safeProfile.id ?? null,
    syncStatus,
    lastSyncedAt: lastSyncedAt ?? null,
    streak: calculateStreakData(monthEntries),
    notifications: [],
  };
}

function getWorkingDaysInMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  let workingDays = 0;

  for (let day = 1; day <= lastDay; day += 1) {
    const current = new Date(year, month, day);
    const weekday = current.getDay();
    if (weekday !== 0 && weekday !== 6) {
      workingDays += 1;
    }
  }

  return workingDays;
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return createEmptyDashboardData({
      isLive: false,
      syncStatus: "Supabase env missing. Connect Supabase to go live.",
    });
  }

  const supabase = getSupabaseAdmin();
  const authUser = await getAuthenticatedUser();

  if (!authUser) {
    return createEmptyDashboardData({
      isLive: false,
      syncStatus: "Sign in to Streak to connect your work account.",
    });
  }

  const { data: profileRows, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, auth_user_id, email, full_name, role, team, leaderboard_opt_in, greythr_user_id, greythr_username")
    .eq("auth_user_id", authUser.id)
    .limit(1);

  if (profileError || !profileRows?.length) {
    return createEmptyDashboardData({
      isLive: false,
      syncUserId: null,
      profile: {
        id: "",
        fullName: authUser.user_metadata.full_name ?? authUser.email?.split("@")[0] ?? "You",
        role: "Team Member",
        team: "Finish setup",
        leaderboardOptIn: true,
        firstSwipeAt: null,
      },
      syncStatus: profileError?.message ?? "Finish setup to connect greytHR and go live.",
    });
  }

  const profileRow = profileRows[0] as UserProfileRow;
  
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const startOfMonth = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from("attendance_logs")
    .select("attendance_date, swipe_times, sync_source")
    .eq("user_id", profileRow.id)
    .gte("attendance_date", startOfMonth)
    .order("attendance_date", { ascending: false });

  if (attendanceError) {
    throw new Error(`Failed to fetch attendance_logs: ${attendanceError.message}`);
  }

  const { data: lastSyncRow, error: lastSyncError } = await supabase
    .from("attendance_logs")
    .select("synced_at")
    .eq("user_id", profileRow.id)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSyncError) {
    throw new Error(`Failed to fetch last sync state: ${lastSyncError.message}`);
  }

  const { data: leaderboardProfileRows, error: leaderboardProfileError } = await supabase
    .from("user_profiles")
    .select("id, full_name, role, team, leaderboard_opt_in")
    .eq("leaderboard_opt_in", true);

  if (leaderboardProfileError) {
    throw new Error(`Failed to fetch leaderboard profiles: ${leaderboardProfileError.message}`);
  }

  const leaderboardUserIds = (leaderboardProfileRows ?? []).map((row) => row.id);
  let leaderboardEntries: LeaderboardEntry[] = [];

  if (leaderboardUserIds.length) {
    const { data: leaderboardAttendanceRows, error: leaderboardAttendanceError } = await supabase
      .from("attendance_logs")
      .select("user_id, attendance_date, swipe_times, sync_source")
      .in("user_id", leaderboardUserIds)
      .gte("attendance_date", startOfMonth);

    if (leaderboardAttendanceError) {
      throw new Error(`Failed to fetch leaderboard attendance: ${leaderboardAttendanceError.message}`);
    }

    leaderboardEntries = buildLeaderboardEntries(
      (leaderboardProfileRows ?? []) as UserProfileRow[],
      (leaderboardAttendanceRows ?? []) as LeaderboardAttendanceRow[],
    );
  }

  const normalizedEntries = normalizeAttendanceRows((attendanceRows ?? []) as AttendanceRow[]);
  const currentDateKey = toLocalDateKey();
  const todayEntryLive = normalizedEntries.find((entry) => entry.date === currentDateKey) ?? {
    date: currentDateKey,
    swipes: [],
    status: "missing_swipe" as const,
  };

  const derivedProfile: UserProfile = {
    id: profileRow.id,
    fullName: profileRow.full_name,
    email: profileRow.email ?? null,
    role: profileRow.role ?? "Team Member",
    team: profileRow.team,
    leaderboardOptIn: profileRow.leaderboard_opt_in,
    firstSwipeAt: todayEntryLive.swipes[0] ?? null,
    greythrUsername: profileRow.greythr_username ?? null,
  };

  const workingDays = getWorkingDaysInMonth();
  const summary = calculateMonthSummary(normalizedEntries, workingDays);
  const streak = calculateStreakData(normalizedEntries);

  if (!normalizedEntries.length) {
    return createEmptyDashboardData({
      isLive: true,
      profile: derivedProfile,
      syncUserId: profileRow.id,
      lastSyncedAt: lastSyncRow?.synced_at ?? null,
      syncStatus: "Connection is live. Run your first sync to pull real attendance.",
    });
  }

  const { data: notificationRows, error: notificationError } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", profileRow.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    profile: derivedProfile,
    todayEntry: todayEntryLive,
    monthEntries: normalizedEntries,
    leaderboardEntries,
    monthSummary: summary,
    targetExitTime: calculateTargetExitTime(todayEntryLive.swipes),
    workedMinutes: calculateWorkedMinutes(todayEntryLive.swipes),
    progressPercent: getProgressPercent(todayEntryLive),
    leaderboardCards: getLeaderboardCards(leaderboardEntries),
    isLive: true,
    syncUserId: profileRow.id,
    syncStatus: normalizedEntries.length
      ? "Live biometric attendance synced from greytHR into Supabase."
      : "Connection is live. Run your first sync to pull biometric swipes.",
    lastSyncedAt: lastSyncRow?.synced_at ?? null,
    streak,
    notifications: notificationRows ?? [],
  };
}
