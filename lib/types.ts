export type AttendanceDayStatus = "in_progress" | "done" | "missing_swipe" | "leave" | "lop";
export type StreakStatus = "safe" | "risk" | "broken";
export type RealTimeRiskStatus = "safe" | "risk" | "danger";

export type AttendanceDay = {
  date: string;
  swipes: string[];
  status: AttendanceDayStatus;
  syncSource?: string;
};

export type UserProfile = {
  id: string;
  fullName: string;
  email?: string | null;
  role: string;
  team: string;
  leaderboardOptIn: boolean;
  firstSwipeAt: string | null;
  greythrUsername?: string | null;
};

export type LeaderboardEntry = {
  id: string;
  alias: string;
  totalMinutes: number;
  averageDailyMinutes?: number;
  currentStreak?: number;
  averageArrivalTime: string;
  averageDepartureTime: string;
  averageSwipesPerDay: number;
  public: boolean;
};

export type MonthSummary = {
  workingDaysElapsed: number;
  totalWorkingDays: number;
  targetMinutesToDate: number;
  actualMinutesToDate: number;
  balanceMinutes: number;
  recommendedDailyAverageMinutes: number;
  // Completed days only — excludes today while in_progress, used for the average display
  completedDaysCount: number;
  completedDaysMinutes: number;
};

export type StreakData = {
  currentStreak: number;
  longestStreak: number;
  lastValidDate: string | null;
  streakStatus: StreakStatus;
  realTimeStatus: RealTimeRiskStatus;
  remainingMinutes: number;
  graceUsedThisWeek: boolean;
  weeklyForgivenessUsed: boolean;
  message: string;
  banner: string | null;
  endOfDayFeedback: string;
  recoveredToday: boolean;
  notificationMessages: {
    midday: string | null;
    evening: string | null;
    success: string | null;
  };
};
