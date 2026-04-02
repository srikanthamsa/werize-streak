export type AttendanceDayStatus = "in_progress" | "done" | "missing_swipe";
export type StreakStatus = "safe" | "risk" | "broken";
export type RealTimeRiskStatus = "safe" | "risk" | "danger";

export type AttendanceDay = {
  date: string;
  swipes: string[];
  status: AttendanceDayStatus;
};

export type UserProfile = {
  id: string;
  fullName: string;
  role: string;
  team: string;
  leaderboardOptIn: boolean;
  firstSwipeAt: string | null;
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
