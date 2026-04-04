"use client";

import { useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence, LayoutGroup, useMotionValue, animate } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import Image from "next/image";
import { syncAttendanceAction, markTodayAsLeaveAction, undoLeaveMarkAction, undoLeaveForDateAction, deleteNotificationAction, markLeaveForDateAction } from "@/app/actions";
import {
  calculateWorkedMinutes,
  DAILY_TARGET_MINUTES,
  formatMinutes,
  HALF_DAY_MINUTES,
  getMinutesRemaining,
  isWeekend,
  toClockLabel,
  toShortDate,
  formatRelativeTime,
} from "@/lib/attendance";
import type { DashboardData } from "@/lib/dashboard-data";
import type { LeaderboardEntry, AttendanceDay, UserProfile } from "@/lib/types";

type TabId = "today" | "insights" | "leaderboard" | "profile" | "notifications";

type TabDefinition = {
  id: TabId;
  label: string;
  icon: ReactNode;
};

const tabs: TabDefinition[] = [
  {
    id: "today",
    label: "Home",
    icon: (
      <path
        d="M3 9l9-7l9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: "insights",
    label: "Insights",
    icon: (
      <path
        d="M3 3v18h18m-2-12l-5 5l-4-4l-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: "leaderboard",
    label: "Arena",
    icon: (
      <path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: "notifications",
    label: "Activity",
    icon: (
      <path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: "profile",
    label: "Profile",
    icon: (
      <path
        d="M12 12a3.25 3.25 0 1 0 0-6.5a3.25 3.25 0 0 0 0 6.5Zm-5.5 7a5.5 5.5 0 0 1 11 0"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

function formatLastSynced(lastSyncedAt: string | null) {
  if (!lastSyncedAt) {
    return "No sync yet";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(lastSyncedAt));
}

function formatDisplayTime(value: string | null) {
  if (!value) {
    return {
      time: "Walk in",
      meridiem: "",
    };
  }

  const formatted = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));

  const [time, meridiem] = formatted.split(" ");
  return {
    time,
    meridiem: meridiem?.toUpperCase() ?? "",
  };
}

function splitDurationLabel(value: string) {
  const match = value.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/);
  return {
    hours: match?.[1] ?? "0",
    minutes: match?.[2] ?? "00",
  };
}

function getDayProgressLabel(monthSummary: DashboardData["monthSummary"]) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  let currentWorkingDay = 0;

  for (let day = 1; day <= today; day += 1) {
    const current = new Date(year, month, day);
    const weekday = current.getDay();
    if (weekday !== 0 && weekday !== 6) {
      currentWorkingDay += 1;
    }
  }

  return {
    current: `Day ${currentWorkingDay}`,
    total: `of ${monthSummary.totalWorkingDays} working days`,
  };
}

function getTodayStatus(minutesRemaining: number, status: DashboardData["todayEntry"]["status"]) {
  if (status === "missing_swipe") {
    return {
      label: "Risk",
      tone: "bg-[#EF4444]/15 text-[#F87171]",
      copy: "Swipe data looks incomplete. Verify greytHR before leaving.",
    };
  }

  if (minutesRemaining <= 0) {
    return {
      label: "Safe",
      tone: "bg-[#22C55E]/18 text-[#4ADE80]",
      copy: "Ahead of schedule. You can relax.",
    };
  }

  if (minutesRemaining <= 60) {
    return {
      label: "Risk",
      tone: "bg-[#22C55E]/12 text-[#86EFAC]",
      copy: "Close. A small buffer gets you comfortable.",
    };
  }

  return {
    label: "Behind",
    tone: "bg-[#EF4444]/15 text-[#F87171]",
    copy: "Not safe yet. Staying longer materially improves the month.",
  };
}

function LeaveButton({ profileId, syncUserId, initiallyMarked = false, monthEntries = [] }: { profileId: string; syncUserId: string | null; initiallyMarked?: boolean; monthEntries?: AttendanceDay[] }) {
  const [leaveState, setLeaveState] = useState<"idle" | "pending" | "marked" | "selecting">(initiallyMarked ? "marked" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState(() => {
    const today = new Date();
    const istNow = new Date(today.getTime() + 5.5 * 60 * 60 * 1000);
    return istNow.toISOString().split('T')[0];
  });
  const id = syncUserId ?? profileId;

  const isLeaveForSelectedDate = monthEntries.some(e => e.date === dateStr && e.syncSource === "manual_leave");

  async function handleMark() {
    if (!id) return;
    setLeaveState("pending");
    setError(null);
    const result = await markLeaveForDateAction(id, dateStr);
    if (result.ok) {
      setLeaveState("idle");
      alert(result.message);
    } else {
      setError(result.message);
      setLeaveState("idle");
    }
  }

  async function handleUndoHistorical() {
    if (!id) return;
    setLeaveState("pending");
    setError(null);
    const result = await undoLeaveForDateAction(id, dateStr);
    if (result.ok) {
      setLeaveState("idle");
      alert(result.message);
    } else {
      setError(result.message);
      setLeaveState("idle");
    }
  }

  async function handleUndo() {
    if (!id) return;
    setError(null);
    const result = await undoLeaveMarkAction(id);
    if (result.ok) {
      setLeaveState("idle");
    } else {
      setError(result.message);
    }
  }

  if (leaveState === "marked") {
    return (
      <div className="flex items-center justify-between rounded-[24px] border border-[rgba(57,255,20,0.15)] bg-[rgba(57,255,20,0.06)] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(57,255,20,0.12)]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#4ADE80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">On Leave Today</p>
            <p className="text-xs text-[#71717A]">9h credited to your bank</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleUndo}
          className="rounded-full bg-[#17171A] border border-[#2d2d33] px-4 py-2 text-xs font-semibold text-[#A1A1AA] transition hover:text-white"
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[24px] bg-[#17171A] px-5 py-5 border border-[#2d2d33]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Missing a day?</p>
          <p className="mt-1 text-xs text-[#A1A1AA]">
            Mark any day as leave to keep your target accurate.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="rounded-xl bg-[#1A1A1D] px-3 py-2.5 text-sm font-medium text-white focus:outline-none focus:ring-1 focus:ring-[#39FF14] border border-[#2d2d33] appearance-none"
          max={new Date().toISOString().split('T')[0]}
        />
        {isLeaveForSelectedDate ? (
          <button
            type="button"
            onClick={handleUndoHistorical}
            disabled={leaveState === "pending"}
            className="flex-1 rounded-xl bg-[rgba(248,113,113,0.1)] px-4 py-2.5 text-sm font-semibold text-[#F87171] transition hover:bg-[rgba(248,113,113,0.15)] disabled:opacity-50 appearance-none text-center"
          >
            {leaveState === "pending" ? "Reverting..." : "Undo Leave"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleMark}
            disabled={leaveState === "pending"}
            className="flex-1 rounded-xl bg-[rgba(57,255,20,0.1)] px-4 py-2.5 text-sm font-semibold text-[#4ADE80] transition hover:bg-[rgba(57,255,20,0.15)] disabled:opacity-50 appearance-none text-center"
          >
            {leaveState === "pending" ? "Applying..." : "Mark as Leave"}
          </button>
        )}
      </div>
      {error ? <p className="mt-1 px-2 text-xs text-[#F87171]">{error}</p> : null}
    </div>
  );
}

function GlowCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`magic-panel magic-float rounded-[28px] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function CenterModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(0,0,0,0.72)] backdrop-blur-sm"
      />
      <div className="magic-panel relative z-10 w-full max-w-md overflow-hidden rounded-[28px]">
        <div className="max-h-[80vh] overflow-y-auto p-6 scrollbar-hide">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="magic-tech-label text-xs text-[#A1A1AA]">{title}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-[#17171A] px-3 py-1 text-sm text-[#A1A1AA] transition hover:text-white"
            >
              Close
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function MiniCard({
  title,
  value,
  highlight,
}: {
  title: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[22px] px-4 py-4 ${highlight
        ? "bg-[linear-gradient(180deg,rgba(57,255,20,0.22),rgba(57,255,20,0.09))] shadow-[0_0_34px_rgba(57,255,20,0.18)]"
        : "bg-[#17171A]"
        }`}
    >
      <p className="text-[12px] uppercase tracking-[0.18em] text-[#71717A]">{title}</p>
      <p className="mt-3 text-[22px] font-semibold tracking-[-0.03em] text-white">{value}</p>
    </div>
  );
}

function Header({
  monthSummary,
}: {
  monthSummary: DashboardData["monthSummary"];
}) {
  const dayLabel = getDayProgressLabel(monthSummary);

  return (
    <header className="mb-8 flex w-full max-w-6xl items-start justify-between gap-6">
      <div className="flex items-center gap-3">
        <div className="h-[46px] w-[188px] overflow-hidden sm:h-[54px] sm:w-[220px]">
          <Image
            src="/streak-logo-header-tight.png"
            alt="Streak"
            width={220}
            height={54}
            className="h-full w-full object-contain"
            priority
          />
        </div>
      </div>

      <div className="text-right">
        <p className="text-lg font-semibold tracking-[-0.03em] text-white">{dayLabel.current}</p>
        <p className="text-xs text-[#A1A1AA]">{dayLabel.total}</p>
      </div>
    </header>
  );
}

function StreakFireIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <div className="absolute inset-[-20%] pointer-events-none">
        <DotLottieReact
          src="/Fire.lottie"
          loop
          autoplay
          className="w-full h-full relative z-10 drop-shadow-[0_0_15px_rgba(248,113,113,0.4)]"
        />
      </div>
    </div>
  );
}

function TodayView(data: DashboardData) {
  const [showSwipes, setShowSwipes] = useState(false);
  const [showStreakDetails, setShowStreakDetails] = useState(false);
  const [showExitGuide, setShowExitGuide] = useState(false);
  const minutesRemaining = getMinutesRemaining(data.todayEntry.swipes);
  const status = getTodayStatus(minutesRemaining, data.todayEntry.status);
  const currentAverageMinutes = data.monthSummary.workingDaysElapsed > 0
    ? Math.round(data.monthSummary.actualMinutesToDate / data.monthSummary.workingDaysElapsed)
    : 0;
  const currentAverage = formatMinutes(currentAverageMinutes);
  const totalMonthlyMinutes = data.monthSummary.totalWorkingDays * DAILY_TARGET_MINUTES;
  const progressWidth = Math.max(0, Math.min(
    100,
    Math.round((data.monthSummary.actualMinutesToDate / Math.max(1, totalMonthlyMinutes)) * 100),
  ));
  const progressColorClass = data.monthSummary.balanceMinutes >= 0
    ? "bg-[linear-gradient(90deg,#7CFF61,#39FF14,#20E70A)] shadow-[0_0_30px_rgba(57,255,20,0.24)]"
    : data.monthSummary.balanceMinutes >= -60
      ? "bg-[linear-gradient(90deg,#FDE68A,#FBBF24,#F59E0B)] shadow-[0_0_30px_rgba(251,191,36,0.24)]"
      : "bg-[linear-gradient(90deg,#FCA5A5,#F87171,#EF4444)] shadow-[0_0_30px_rgba(248,113,113,0.24)]";
  const hasStartedToday = data.todayEntry.swipes.length > 0;
  const isOnLeaveToday = data.todayEntry.syncSource === "manual_leave";
  const isTodayWeekend = isWeekend(data.todayEntry.date);
  const minimumViable = data.profile.firstSwipeAt
    ? new Date(new Date(data.profile.firstSwipeAt).getTime() + 4.5 * 60 * 60 * 1000).toISOString()
    : null;
  const comfortable = data.profile.firstSwipeAt
    ? new Date(new Date(data.profile.firstSwipeAt).getTime() + 8 * 60 * 60 * 1000).toISOString()
    : null;
  const required = data.targetExitTime;
  const displayRequired = formatDisplayTime(required);
  const currentAverageParts = splitDurationLabel(currentAverage);
  const statusCopy = isOnLeaveToday
    ? "Enjoy your leave today."
    : status.label === "Behind"
      ? "Behind today. Stay longer."
      : status.label === "Risk"
        ? "Close, but not clear."
        : "Safe to leave.";
  const firstSwipeLabel = formatDisplayTime(data.profile.firstSwipeAt);
  const ifLeaveNow = calculateWorkedMinutes(data.todayEntry.swipes);
  const leaveNowCopy = !hasStartedToday
    ? "Walk in first. We will tell you the cost of leaving once the day actually starts."
    : minutesRemaining <= 0
      ? "Leave now and the day still closes clean."
      : ifLeaveNow < HALF_DAY_MINUTES
        ? `Leave now and this risks falling below the ${formatMinutes(HALF_DAY_MINUTES)} floor.`
        : `Leave now and you land ${formatMinutes(minutesRemaining)} short today.`;
  const streakTone = data.streak.realTimeStatus === "safe"
    ? "bg-[rgba(57,255,20,0.12)] text-[#7CFF61]"
    : data.streak.realTimeStatus === "risk"
      ? "bg-[rgba(253,230,138,0.12)] text-[#FDE68A]"
      : "bg-[rgba(248,113,113,0.12)] text-[#F87171]";
  const streakLabel = data.streak.currentStreak === 0
    ? "Start today"
    : data.streak.realTimeStatus === "safe"
      ? "Safe today"
      : data.streak.realTimeStatus === "risk"
        ? "Target pending"
        : "At risk";

  const daysLeft = Math.max(1, data.monthSummary.totalWorkingDays - data.monthSummary.workingDaysElapsed);
  const recoveryStep = data.monthSummary.balanceMinutes < 0
    ? Math.ceil(Math.abs(data.monthSummary.balanceMinutes) / Math.min(daysLeft, 4))
    : 0;
  const earlyExitAllowance = data.monthSummary.balanceMinutes > 0
    ? Math.floor(data.monthSummary.balanceMinutes / daysLeft)
    : 0;

  const isBankPositive = data.monthSummary.balanceMinutes >= 0;
  const timeBankBg = isBankPositive
    ? "bg-[rgba(57,255,20,0.03)] border border-[rgba(57,255,20,0.1)] shadow-[0_0_30px_rgba(57,255,20,0.05)_inset]"
    : "bg-[rgba(248,113,113,0.03)] border border-[rgba(248,113,113,0.1)] shadow-[0_0_30px_rgba(248,113,113,0.05)_inset]";

  return (
    <>
      <section className="magic-panel magic-panel-glow w-full max-w-6xl rounded-[32px] p-7 sm:p-10">
        <p className="magic-tech-label mb-4 text-xs text-[#A1A1AA]">CURRENT AVERAGE</p>
        <div className="flex items-end gap-4">
          <h1 className="magic-display flex items-end gap-2 text-white sm:gap-3">
            <span className="text-[78px] leading-[0.84] tracking-[-0.07em] sm:text-[112px]">
              {currentAverageParts.hours}
              <span className="pl-1">H</span>
            </span>
            <span className="text-[78px] leading-[0.84] tracking-[-0.07em] sm:text-[112px]">
              {currentAverageParts.minutes}
              <span className="pl-1">M</span>
            </span>
          </h1>
        </div>
        <div className="relative mt-3">
          <p className="text-base text-[#A1A1AA]">
            {isTodayWeekend
              ? "It's the weekend. Enjoy!"
              : !hasStartedToday
                ? "Go to office first. Your average starts updating after the first swipe."
                : minutesRemaining <= 0
                  ? "You have already cleared the day."
                  : `You still need ${formatMinutes(minutesRemaining)} if you want zero regret later.`}
          </p>
        </div>

        <div className={`mt-6 inline-flex items-center gap-3 rounded-full px-4 py-3 text-sm ${isTodayWeekend ? "bg-[#17171A] text-[#A1A1AA]" : hasStartedToday ? status.tone : "bg-[#17171A] text-[#A1A1AA]"}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${isTodayWeekend ? "bg-[#71717A]" : hasStartedToday ? (status.label === "Behind" ? "bg-[#F87171] shadow-[0_0_18px_#F87171]" : "bg-[#4ADE80] shadow-[0_0_18px_#4ADE80]") : "bg-gradient-to-tr from-[#F59E0B] to-[#FDE047] shadow-[0_0_12px_rgba(253,224,71,0.5)]"}`} />
          <span>{isTodayWeekend ? (new Date(data.todayEntry.date).getDay() === 0 ? "Happy Sunday" : "Happy Saturday") : hasStartedToday ? statusCopy : "Day not started yet."}</span>
        </div>

        <div className="mt-8">
          <div className="magic-tech-label mb-2 flex justify-between text-[11px] text-[#71717A]">
            <span>monthly progress</span>
            <span>{formatMinutes(data.monthSummary.actualMinutesToDate)} / {formatMinutes(totalMonthlyMinutes)}</span>
          </div>

          <div className="magic-progress-track h-2 w-full overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${progressColorClass}`}
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowStreakDetails(true)}
            disabled={data.streak.currentStreak === 0 && data.streak.longestStreak === 0}
            className="magic-streak-card w-full rounded-[24px] bg-[#151518] px-5 py-5 text-left transition hover:bg-[#19191d]"
          >
            {data.streak.currentStreak === 0 && data.streak.longestStreak === 0 ? (
              <div>
                <p className="magic-tech-label text-[11px] text-[#71717A]">STREAK</p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[#D4D4D8]">Start your first streak today.</p>
                <p className="mt-1 text-sm text-[#A1A1AA]">Hit the daily target to catch fire.</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="magic-tech-label text-[11px] text-[#71717A]">STREAK</p>
                    <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white flex items-center gap-1.5">
                      <StreakFireIcon className="h-8 w-8 -mt-1" />
                      <span>{data.streak.currentStreak}</span>
                    </div>
                    <p className="mt-1 text-sm text-[#A1A1AA]">
                      Best {data.streak.longestStreak}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${streakTone}`}>
                    {streakLabel}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-[#D4D4D8]">
                    {data.streak.message}
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#71717A]">
                    Details
                  </p>
                </div>
              </>
            )}
          </button>
        </div>

        {data.streak.banner ? (
          <div className="mt-4 rounded-[24px] bg-[#2A1616] px-5 py-4 text-sm text-[#FCA5A5]">
            {data.streak.banner}
          </div>
        ) : null}
      </section>

      <div className="mt-8 grid w-full max-w-6xl grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
        <GlowCard className="p-6 sm:p-8 lg:col-span-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="magic-tech-label text-xs text-[#A1A1AA]">DAY STATUS</p>
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">
                {isOnLeaveToday ? "You're on Leave" : isTodayWeekend ? "It's the Weekend" : "When can I leave?"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowExitGuide(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#17171A] text-sm text-[#A1A1AA] transition hover:text-white"
              >
                i
              </button>
              {!isOnLeaveToday && !isTodayWeekend ? (
                <div className="rounded-xl bg-[#1A1A1D] px-4 py-2 text-sm text-white">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#71717A]">Started</div>
                  <div className="whitespace-nowrap">{hasStartedToday ? `${firstSwipeLabel.time} ${firstSwipeLabel.meridiem}` : "First swipe pending"}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="my-8 text-center sm:my-10">
            {isOnLeaveToday ? (
              <div className="flex flex-col items-center justify-center gap-2">
                <h1 className="text-[58px] font-semibold leading-none tracking-[-0.02em] text-white sm:text-[78px]">
                  Leave
                </h1>
                <p className="mt-4 text-sm text-[#A1A1AA]">
                  You're officially off the clock today. Check back tomorrow.
                </p>
              </div>
            ) : isTodayWeekend ? (
              <div className="flex flex-col items-center justify-center gap-2">
                <h1 className="text-[58px] font-semibold leading-none tracking-[-0.02em] text-white sm:text-[78px]">
                  Rest Day!
                </h1>
                <p className="mt-4 text-sm text-[#A1A1AA]">
                  No office today. Enjoy your break.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-end justify-center gap-3">
                  <h1 className="text-[58px] font-semibold leading-none tracking-[-0.02em] text-white sm:text-[78px]">
                    {displayRequired.time}
                  </h1>
                  <span className="mb-2 text-[16px] font-semibold tracking-[0.12em] text-[#A1A1AA] sm:mb-3 sm:text-[18px]">
                    {displayRequired.meridiem}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#A1A1AA]">
                  {!hasStartedToday
                    ? "Go to office first."
                    : minutesRemaining <= 0
                      ? "You are safe to leave now"
                      : "You're good to leave by then"}
                </p>
              </>
            )}
          </div>

          {isOnLeaveToday || isTodayWeekend ? null : hasStartedToday ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <MiniCard title="Avoid LOP" value={minimumViable ? toClockLabel(minimumViable) : "--"} />
              <MiniCard title="Comfort zone" value={comfortable ? toClockLabel(comfortable) : "--"} />
              <MiniCard highlight title="Remaining" value={formatMinutes(minutesRemaining)} />
            </div>
          ) : null}
        </GlowCard>

        <div className="flex flex-col gap-5 lg:col-span-4 lg:gap-6">
          <div className={`relative overflow-hidden rounded-[28px] p-6 ${data.monthSummary.balanceMinutes >= 0
            ? "bg-[linear-gradient(135deg,rgba(57,255,20,0.18)_0%,rgba(57,255,20,0.07)_100%)] border border-[rgba(57,255,20,0.2)] shadow-[0_0_40px_rgba(57,255,20,0.1)]"
            : "bg-[linear-gradient(135deg,rgba(248,113,113,0.22)_0%,rgba(220,38,38,0.10)_100%)] border border-[rgba(248,113,113,0.25)] shadow-[0_0_40px_rgba(248,113,113,0.12)]"
            }`}>
            <p className="magic-tech-label text-xs text-[#A1A1AA]">TIME BANK</p>
            <h2 className={`mt-2 text-4xl font-semibold tracking-[-0.04em] ${data.monthSummary.balanceMinutes >= 0 ? "text-[#4ADE80]" : "text-[#F87171]"
              }`}>
              {data.monthSummary.balanceMinutes >= 0 ? "+" : "-"}
              {formatMinutes(Math.abs(data.monthSummary.balanceMinutes))}
            </h2>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              {data.monthSummary.balanceMinutes >= 0 ? "Ahead of expected pace." : "Below expected pace."}
            </p>
          </div>

          <GlowCard className="p-6">
            {data.monthSummary.balanceMinutes < 0 ? (
              <>
                <p className="magic-tech-label text-xs text-[#A1A1AA]">RECOVERY PLAN</p>
                <h3 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">
                  +{formatMinutes(recoveryStep)}
                </h3>
                <p className="mt-2 text-sm text-[#A1A1AA]">
                  Add this for the next 4 working days to catch up.
                </p>
              </>
            ) : (
              <>
                <p className="magic-tech-label text-xs text-[#A1A1AA]">EARLY EXIT ALLOWANCE</p>
                <h3 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#4ADE80]">
                  -{formatMinutes(earlyExitAllowance)}/day
                </h3>
                <p className="mt-2 text-sm text-[#A1A1AA]">
                  {earlyExitAllowance > 0
                    ? "You can leave this much earlier every remaining day and still perfectly clear the month."
                    : "You are exactly on pace. No surplus to burn yet."}
                </p>
              </>
            )}
          </GlowCard>

          {!hasStartedToday || isOnLeaveToday ? null : (
            <GlowCard className="p-6">
              <p className="magic-tech-label text-xs text-[#A1A1AA]">LEAVE NOW IMPACT</p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-[#17171A] p-4 border border-[#2d2d33] transition hover:border-[#3a3a3f]">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#71717A]">Today's Yield</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
                    {formatMinutes(ifLeaveNow)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#17171A] p-4 border border-[#2d2d33] transition hover:border-[#3a3a3f]">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#71717A]">Bank Delta</p>
                  <p className={`mt-2 text-2xl font-semibold tracking-[-0.03em] ${ifLeaveNow >= DAILY_TARGET_MINUTES ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
                    {ifLeaveNow >= DAILY_TARGET_MINUTES ? "+" : "-"}{formatMinutes(Math.abs(ifLeaveNow - DAILY_TARGET_MINUTES))}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-6 text-[#A1A1AA]">
                {leaveNowCopy}
              </p>
            </GlowCard>
          )}

          {!hasStartedToday || isOnLeaveToday ? (
            <LeaveButton profileId={data.profile.id ?? ""} syncUserId={data.syncUserId} initiallyMarked={isOnLeaveToday} monthEntries={data.monthEntries} />
          ) : null}
        </div>
      </div>

      <CenterModal
        open={showStreakDetails}
        title="STREAK DETAILS"
        onClose={() => setShowStreakDetails(false)}
      >
        <div className="grid gap-4">
          <div className="rounded-[22px] bg-[#17171A] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[#71717A]">Current run</p>
            <p className="mt-2 text-3xl font-semibold text-white">{data.streak.currentStreak} days</p>
            <p className="mt-2 text-sm text-[#A1A1AA]">Best streak: {data.streak.longestStreak} days</p>
          </div>
          <div className="rounded-[22px] bg-[#17171A] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[#71717A]">Safety net</p>
            <p className="mt-2 text-base font-semibold text-white">
              {data.streak.weeklyForgivenessUsed ? "Already used this week" : "Still available this week"}
            </p>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              {data.streak.graceUsedThisWeek
                ? "30min grace buffer used this week."
                : "30min grace buffer available."}
            </p>
          </div>
          <div className="rounded-[22px] bg-[#17171A] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[#71717A]">How today lands</p>
            <p className="mt-2 text-base font-semibold text-white">{data.streak.endOfDayFeedback}</p>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              If today finishes strong, the streak grows. If not, this is the outcome you should expect tonight.
            </p>
          </div>
        </div>
      </CenterModal>

      <CenterModal
        open={showExitGuide}
        title="EXIT GUIDE"
        onClose={() => setShowExitGuide(false)}
      >
        <div className="space-y-3">
          <div className="rounded-[20px] bg-[#17171A] px-4 py-3">
            <p className="text-sm font-semibold text-white">Avoid LOP</p>
            <p className="mt-1 text-sm text-[#A1A1AA]">
              The earliest point where the day avoids falling below the half-day floor.
            </p>
          </div>
          <div className="rounded-[20px] bg-[#17171A] px-4 py-3">
            <p className="text-sm font-semibold text-white">Comfort zone</p>
            <p className="mt-1 text-sm text-[#A1A1AA]">
              A safer exit point with enough buffer that the day does not feel razor-thin.
            </p>
          </div>
          <div className="rounded-[20px] bg-[#17171A] px-4 py-3">
            <p className="text-sm font-semibold text-white">Remaining</p>
            <p className="mt-1 text-sm text-[#A1A1AA]">
              The exact number of hours and minutes left to clear the daily target.
            </p>
          </div>
        </div>
      </CenterModal>
    </>
  );
}


function InsightsView({ monthEntries, monthSummary }: Pick<DashboardData, "monthEntries" | "monthSummary">) {
  const daysLeft = Math.max(1, monthSummary.totalWorkingDays - monthSummary.workingDaysElapsed);
  const isAhead = monthSummary.balanceMinutes >= 0;

  const validEntries = [...monthEntries]
    .filter(e => e.swipes.length >= 2 && e.syncSource !== "manual_leave")
    .map(e => ({ date: e.date, minutes: calculateWorkedMinutes(e.swipes), swipes: e.swipes }))
    .sort((a, b) => b.minutes - a.minutes);

  // Burnout Warning
  const sortedByDateDesc = [...validEntries].sort((a, b) => b.date.localeCompare(a.date));
  const lastDays = sortedByDateDesc.slice(0, 3);
  const isBurningOut = lastDays.length === 3 && lastDays.every(d => d.minutes >= 10 * 60);

  // Late Arrival Tax
  const parseTimeValue = (swipe: string) => {
    const d = new Date(swipe);
    return d.getHours() * 60 + d.getMinutes();
  };
  const entriesWithTime = validEntries.map(e => ({
    ...e,
    arrivalMins: parseTimeValue(e.swipes[0])
  })).sort((a, b) => a.arrivalMins - b.arrivalMins);

  const medianArrival = entriesWithTime[Math.floor(entriesWithTime.length / 2)]?.arrivalMins ?? 600;
  const lateEntries = entriesWithTime.filter(e => e.arrivalMins > medianArrival + 30);
  const normalEntries = entriesWithTime.filter(e => e.arrivalMins <= medianArrival + 30);

  const normalPace = normalEntries.length ? normalEntries.reduce((sum, e) => sum + e.minutes, 0) / normalEntries.length : DAILY_TARGET_MINUTES;
  const latePace = lateEntries.length ? lateEntries.reduce((sum, e) => sum + e.minutes, 0) / lateEntries.length : normalPace;
  const lateTax = latePace - normalPace;

  // Best/worst days
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekdayStats = validEntries.reduce((acc, e) => {
    const d = new Date(e.date).getDay();
    if (!acc[d]) acc[d] = { count: 0, total: 0 };
    acc[d].count++;
    acc[d].total += e.minutes;
    return acc;
  }, {} as Record<number, { count: number, total: number }>);

  const weekdayAverages = Object.entries(weekdayStats).map(([day, stats]) => ({
    day: weekdayNames[Number(day)],
    avg: stats.total / stats.count
  })).sort((a, b) => b.avg - a.avg);

  const bestDay = weekdayAverages.length ? weekdayAverages[0] : null;
  const worstDay = weekdayAverages.length > 1 ? weekdayAverages[weekdayAverages.length - 1] : null;

  return (
    <div className="grid w-full max-w-6xl grid-cols-12 gap-6">
      <GlowCard className="col-span-12 p-8 lg:col-span-7">
        <p className="magic-tech-label text-xs text-[#A1A1AA]">THE FORECAST</p>
        <h2 className={`mt-3 text-4xl font-semibold tracking-[-0.04em] ${isAhead ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
          {isAhead ? "Coast into Friday" : "Recovery Mode"}
        </h2>
        <p className="mt-3 text-[#A1A1AA]">
          {isAhead
            ? `You have a surplus of ${formatMinutes(monthSummary.balanceMinutes)}. You can afford to drop your pace to ${formatMinutes(monthSummary.recommendedDailyAverageMinutes)}/day for the rest of the month.`
            : `You are down ${formatMinutes(Math.abs(monthSummary.balanceMinutes))}. You need to average ${formatMinutes(monthSummary.recommendedDailyAverageMinutes)}/day to recover your standing by the end of the month.`
          }
        </p>

        {isBurningOut ? (
          <div className="mt-6 rounded-2xl bg-[rgba(251,191,36,0.1)] p-4 border border-[rgba(251,191,36,0.2)]">
            <p className="font-semibold text-[#FBBF24]">⚠️ Burnout Warning</p>
            <p className="mt-1 text-sm text-[#FDE68A]">You've logged 10+ hours for consecutive days. You are far over-indexing. Take a shorter day soon.</p>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-[#17171A] p-4 text-sm text-[#A1A1AA]">
            Pace is stable. No burnout warnings triggered for recent activity.
          </div>
        )}
      </GlowCard>

      <GlowCard className="col-span-12 p-8 lg:col-span-5 flex flex-col justify-between">
        <p className="magic-tech-label text-xs text-[#A1A1AA]">RECOVERY PATHS</p>
        <div className="mt-6 flex flex-col gap-3">
          {(!isAhead && daysLeft > 1) ? (
            <>
              <div className="flex justify-between items-center bg-[#17171A] p-4 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-white">Aggressive</p>
                  <p className="text-xs text-[#A1A1AA]">Fix your deficit in 2 days</p>
                </div>
                <p className="text-lg font-semibold text-[#FBBF24]">+{formatMinutes(Math.ceil(Math.abs(monthSummary.balanceMinutes) / 2))}/day</p>
              </div>
              {daysLeft > 2 && (
                <div className="flex justify-between items-center bg-[#17171A] p-4 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-white">Balanced</p>
                    <p className="text-xs text-[#A1A1AA]">Spread it over 5 days</p>
                  </div>
                  <p className="text-lg font-semibold text-[#FBBF24]">+{formatMinutes(Math.ceil(Math.abs(monthSummary.balanceMinutes) / Math.min(5, daysLeft)))}/day</p>
                </div>
              )}
              {daysLeft > 5 && (
                <div className="flex justify-between items-center bg-[#17171A] p-4 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-white">Slow</p>
                    <p className="text-xs text-[#A1A1AA]">Coast until month end</p>
                  </div>
                  <p className="text-lg font-semibold text-[#FBBF24]">+{formatMinutes(Math.ceil(Math.abs(monthSummary.balanceMinutes) / daysLeft))}/day</p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-[#17171A] p-4 rounded-xl text-sm text-[#A1A1AA]">
              {isAhead ? "You have a surplus. No recovery paths needed." : "It's the last day of the month! No time to space out recovery."}
            </div>
          )}
        </div>
      </GlowCard>

      <GlowCard className="col-span-12 p-8 lg:col-span-12">
        <p className="magic-tech-label text-xs text-[#A1A1AA]">BEHAVIOR PATTERNS</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[22px] bg-[#17171A] p-5">
            <p className="text-sm text-[#A1A1AA]">Best / Worst Days</p>
            {bestDay && worstDay ? (
              <div className="mt-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 items-center rounded-sm bg-[rgba(57,255,20,0.1)] px-2 text-[10px] font-bold uppercase tracking-wider text-[#39FF14]">Peak</span>
                    <p className="text-base text-white">{bestDay.day}s</p>
                  </div>
                  <p className="text-sm font-medium text-[#A1A1AA]">Avg {formatMinutes(Math.round(bestDay.avg))}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 items-center rounded-sm bg-[rgba(248,113,113,0.1)] px-2 text-[10px] font-bold uppercase tracking-wider text-[#F87171]">Drag</span>
                    <p className="text-base text-white">{worstDay.day}s</p>
                  </div>
                  <p className="text-sm font-medium text-[#A1A1AA]">Avg {formatMinutes(Math.round(worstDay.avg))}</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-[#A1A1AA]">Not enough data to calculate best/worst days yet.</div>
            )}
          </div>

          <div className="rounded-[22px] bg-[#17171A] p-5">
            <p className="text-sm text-[#A1A1AA]">The Late Arrival Tax</p>
            {lateEntries.length > 0 ? (
              <div className="mt-4">
                <p className="text-xl font-semibold tracking-[-0.04em] text-white">
                  {lateTax > 30 ? `Cost: +${formatMinutes(Math.round(lateTax))}` : lateTax < -30 ? `Cut: -${formatMinutes(Math.abs(Math.round(lateTax)))}` : `No heavy tax`}
                </p>
                <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
                  {lateTax > 30
                    ? `When you arrive >30m after your normal time, you end up staying ${formatMinutes(Math.round(lateTax))} longer on average to compensate.`
                    : lateTax < -30
                      ? `When you arrive >30m late, you tend to cut your day short by ${formatMinutes(Math.abs(Math.round(lateTax)))}.`
                      : `Your arrival time doesn't heavily impact your overall hours worked.`}
                </p>
              </div>
            ) : (
              <div className="mt-4 text-sm text-[#A1A1AA]">You haven't had late arrivals this month to analyze perfectly. Keep it up!</div>
            )}
          </div>
        </div>
      </GlowCard>
    </div>
  );
}

function NotificationsView({ notifications, profile }: { notifications: any[], profile: any }) {
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  return (
    <div className="grid w-full max-w-6xl grid-cols-1 gap-4">
      <h2 className="mb-2 text-2xl font-semibold tracking-[-0.04em] text-white">Activity</h2>

      {notifications.length > 0 ? (
        notifications.map(n => {
          const isDeleting = deletingIds.has(n.id);
          return (
            <div key={n.id} className={`flex items-start gap-4 rounded-[22px] bg-[#17171A] p-5 shadow-sm transition hover:bg-[#1a1a1e] ${isDeleting ? "opacity-50" : ""}`}>
              <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${n.type === "achievement" ? "bg-[rgba(251,191,36,0.1)] border-[rgba(251,191,36,0.2)] text-[#FBBF24]" :
                n.type === "streak" ? "bg-[rgba(248,113,113,0.1)] border-[rgba(248,113,113,0.2)] text-[#F87171]" :
                  n.type === "new_join" ? "bg-[rgba(57,255,20,0.1)] border-[rgba(57,255,20,0.2)] text-[#39FF14]" :
                    "bg-[rgba(161,161,170,0.1)] border-[rgba(161,161,170,0.2)] text-[#A1A1AA]"
                }`}>
                {n.type === "achievement" ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>
                ) : n.type === "streak" ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.256 1.185-3.103a2.5 2.5 0 0 0 3.315 3.603z" /></svg>
                ) : n.type === "new_join" ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m12 8 4 4-4 4" /><path d="M8 12h7" /></svg>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-white">{n.title || "Alert"}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-[#A1A1AA]">
                      {n.body}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        setDeletingIds(prev => new Set(prev).add(n.id));
                        const res = await deleteNotificationAction(n.id);
                        if (!res.ok) {
                          alert(res.message);
                          setDeletingIds(prev => {
                            const next = new Set(prev);
                            next.delete(n.id);
                            return next;
                          });
                        }
                      }}
                      disabled={isDeleting}
                      className="text-[#71717A] hover:text-[#F87171] transition p-2 disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <svg className="h-4 w-4 animate-spin text-[#F87171]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-[12px] uppercase tracking-wider text-[#71717A] font-medium">{formatRelativeTime(n.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <div className="mt-6 flex w-full flex-col items-center justify-center py-12 text-center opacity-70">
          <svg xmlns="http://www.w3.org/2000/svg" className="mb-4 h-6 w-6 text-[#71717A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <p className="text-sm text-[#71717A]">No notifications or activity yet.</p>
        </div>
      )}
    </div>
  );
}

const VAPID_PUBLIC_KEY = "BCPWnqvTqJJImzH5FuQIqyUGNUN5_qW2xweZ263_swBdQh1X3IbAMHC9ohGglpvd5DdB7w4TUBfSY5DRwwvDDDk";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function deriveStanding(profileName: string, entries: LeaderboardEntry[], minutes: number) {
  const publicEntries = entries.filter((entry) => entry.public);
  if (!publicEntries.length) {
    return "Leaderboard unlocks when people opt in";
  }

  const combined = [...publicEntries.map((entry) => ({ alias: entry.alias, totalMinutes: entry.totalMinutes })), {
    alias: profileName,
    totalMinutes: minutes,
  }].sort((a, b) => b.totalMinutes - a.totalMinutes);

  const rank = combined.findIndex((entry) => entry.alias === profileName) + 1;
  const percentile = Math.round(((combined.length - rank) / Math.max(1, combined.length - 1)) * 100);
  return `You’re ahead of ${percentile}% of the company`;
}

function getLeaderboardTags(entry: LeaderboardEntry, entries: LeaderboardEntry[]) {
  const tags: string[] = [];
  const byHours = [...entries].sort((a, b) => b.totalMinutes - a.totalMinutes);
  const byArrival = [...entries].sort((a, b) => a.averageArrivalTime.localeCompare(b.averageArrivalTime));
  const byDeparture = [...entries].sort((a, b) => b.averageDepartureTime.localeCompare(a.averageDepartureTime));
  const bySwipes = [...entries].sort((a, b) => b.averageSwipesPerDay - a.averageSwipesPerDay);

  if (byHours[0]?.id === entry.id) tags.push("Most efficient");
  if (byArrival[0]?.id === entry.id) tags.push("Early bird");
  if (byDeparture[0]?.id === entry.id) tags.push("Night owl");
  if (bySwipes[0]?.id === entry.id) tags.push("Most consistent");
  if (entry.totalMinutes >= byHours[Math.max(0, Math.floor(entries.length / 3) - 1)]?.totalMinutes) tags.push("Workhorse");
  if (entry.averageSwipesPerDay >= 4.5) tags.push("Always moving");
  if (entry.averageArrivalTime <= "09:45") tags.push("Clockwork");
  if (entry.averageDepartureTime >= "20:00") tags.push("Closer");

  return [...new Set(tags)].slice(0, 3);
}

const tagDescriptions: Record<string, string> = {
  "Most efficient": "Highest average working-hours output in the current board.",
  "Early bird": "Usually among the earliest arrivals.",
  "Night owl": "Usually among the latest departures.",
  "Most consistent": "Shows up with the steadiest, repeatable attendance pattern.",
  "Workhorse": "Stays in the top tier for total effort logged.",
  "Always moving": "High swipe activity across the day.",
  "Clockwork": "Usually lands early and reliably.",
  "Closer": "Often finishes late and closes the day strong.",
};

function LeaderboardView({
  profile,
  leaderboardEntries,
  leaderboardCards,
  monthEntries,
}: Pick<DashboardData, "profile" | "leaderboardEntries" | "leaderboardCards" | "monthEntries">) {
  const [showTagInfo, setShowTagInfo] = useState(false);
  const totalMinutes = monthEntries.reduce((sum, entry) => sum + calculateWorkedMinutes(entry.swipes), 0);
  const standing = deriveStanding(profile.fullName, leaderboardEntries, totalMinutes);
  const visibleEntries = leaderboardEntries.filter((entry) => entry.public);
  const rankedEntries = [...visibleEntries].sort((a, b) => b.totalMinutes - a.totalMinutes);
  const cards = leaderboardCards.map((card) => {
    if (card.title === "The Iron Man/Woman") {
      return { ...card, title: "Most Efficient" };
    }
    if (card.title === "The Restless") {
      return { ...card, title: "Most Consistent" };
    }
    return card;
  });

  return (
    <div className="grid w-full max-w-6xl grid-cols-12 gap-6">
      <GlowCard className="col-span-12 p-8 lg:col-span-5">
        <p className="magic-tech-label text-xs text-[#A1A1AA]">YOUR RANK</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">{standing}</h2>
        <p className="mt-3 text-sm text-[#A1A1AA]">Private by default. Opt in if you want your streak and hours to show up company-wide.</p>
      </GlowCard>

      <GlowCard className="col-span-12 p-8 lg:col-span-7">
        <div className="flex items-center justify-between gap-4">
          <p className="magic-tech-label text-xs text-[#A1A1AA]">TOP TAGS</p>
          <button
            type="button"
            onClick={() => setShowTagInfo(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#17171A] text-sm text-[#A1A1AA] transition hover:text-white"
          >
            i
          </button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.title} className="rounded-[22px] bg-[#17171A] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[#71717A]">{card.title}</p>
              <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-white">{card.winner}</h3>
              <p className="mt-2 text-sm text-[#A1A1AA]">{card.stat}</p>
            </div>
          ))}
        </div>
      </GlowCard>

      <GlowCard className="col-span-12 p-8">
        <p className="magic-tech-label text-xs text-[#A1A1AA]">FULL LEADERBOARD</p>
        {rankedEntries.length ? (
          <div className="mt-6 space-y-3">
            {rankedEntries.map((entry, index) => {
              const tags = getLeaderboardTags(entry, visibleEntries);
              const rankColor = index === 0 ? "text-[#FBBF24]"
                : index === 1 ? "text-[#9CA3AF]"
                  : index === 2 ? "text-[#B45309]"
                    : "text-white";
              return (
                <div key={entry.id} className="rounded-[22px] bg-[#17171A] px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className={`text-xl font-semibold tracking-[-0.03em] ${rankColor}`}>#{index + 1}</p>
                        <p className="text-lg font-semibold tracking-[-0.03em] text-white">{entry.alias}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-[rgba(57,255,20,0.12)] px-3 py-1 text-xs font-medium text-[#9DFF7A]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="whitespace-nowrap text-sm font-semibold text-white sm:text-base">
                        <span className="mr-1 text-[10px] font-normal tracking-[0.1em] text-[#71717A] uppercase transition">avg</span>
                        {formatMinutes(entry.averageDailyMinutes ?? 0)}
                      </p>
                      <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-[#A1A1AA]">
                        <span className="text-[10px] font-normal tracking-[0.1em] text-[#71717A] uppercase transition">streak</span>
                        <StreakFireIcon className="h-[18px] w-[18px] -mt-[3px]" />
                        <span className="font-semibold text-white">{entry.currentStreak ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-[22px] bg-[#17171A] px-5 py-6">
            <p className="text-lg font-semibold tracking-[-0.03em] text-white">No live leaderboard yet</p>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              As soon as people opt in and sync real attendance, the company board will light up here.
            </p>
          </div>
        )}
      </GlowCard>

      <CenterModal open={showTagInfo} title="TAG GUIDE" onClose={() => setShowTagInfo(false)}>
        <div className="space-y-3">
          {Object.entries(tagDescriptions).map(([tag, description]) => (
            <div key={tag} className="rounded-[20px] bg-[#17171A] px-4 py-3">
              <p className="text-sm font-semibold text-white">{tag}</p>
              <p className="mt-1 text-sm text-[#A1A1AA]">{description}</p>
            </div>
          ))}
        </div>
      </CenterModal>
    </div>
  );
}

function ProfileView({
  syncUserId,
  lastSyncedAt,
  isLive,
  monthEntries,
  profile,
  onEnableNotifications,
  pushEnabled,
  isPushLoading,
}: Pick<DashboardData, "syncUserId" | "lastSyncedAt" | "isLive" | "monthEntries" | "profile"> & {
  onEnableNotifications: () => void;
  pushEnabled: boolean;
  isPushLoading: boolean;
}) {
  const router = useRouter();
  const [syncState, syncAction, isPending] = useActionState(syncAttendanceAction, {
    ok: false,
    message: "",
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selectedEntry = monthEntries.find((entry) => entry.date === selectedDay) ?? null;
  const selectedWorkedMinutes = selectedEntry ? calculateWorkedMinutes(selectedEntry.swipes) : 0;
  const selectedFirstIn = selectedEntry?.swipes[0] ? toClockLabel(selectedEntry.swipes[0]) : "--";
  const selectedLastOut = selectedEntry?.swipes.at(-1) ? toClockLabel(selectedEntry.swipes.at(-1) as string) : "--";
  const selectedFunFact = !selectedEntry
    ? ""
    : selectedEntry.swipes.length <= 1
      ? "Thin day. This one probably needs attention."
      : selectedWorkedMinutes >= DAILY_TARGET_MINUTES
        ? "Clean day. You cleared the line."
        : selectedWorkedMinutes >= HALF_DAY_MINUTES
          ? "Half-day safe, but not a full clear."
          : "Below half-day floor. This one was expensive.";

  return (
    <div className="grid w-full max-w-6xl grid-cols-12 gap-6">
      <div className="col-span-12 flex flex-col gap-6 lg:col-span-5">
        <GlowCard className="p-8">
          <p className="magic-tech-label text-xs text-[#A1A1AA]">PROFILE & SETTINGS</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">
            {profile?.fullName ?? "You"}
          </h2>
          <p className="mt-1 text-[#A1A1AA]">
            {profile?.role ?? "Team Member"} · {profile?.team ?? "Team"}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/setup?mode=edit"
              className="inline-flex rounded-full bg-[#17171A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1f1f24]"
            >
              Update Preferences
            </Link>

            <form action="/auth/logout" method="POST">
              <button
                type="submit"
                className="inline-flex rounded-full bg-[rgba(248,113,113,0.1)] px-5 py-3 text-sm font-semibold text-[#F87171] transition hover:bg-[rgba(248,113,113,0.15)]"
              >
                Log Out
              </button>
            </form>
          </div>
        </GlowCard>

        <GlowCard className="p-8">
          <p className="magic-tech-label text-xs text-[#A1A1AA]">SYNC CONNECTION</p>
          <div className="mt-3 flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${isLive ? "bg-[#39FF14] shadow-[0_0_12px_#39FF14]" : "bg-[#71717A]"}`} />
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
              {isLive ? "Sync is live" : "Demo mode"}
            </h2>
          </div>
          <p className="mt-2 text-sm text-[#A1A1AA]">
            Last synced {formatLastSynced(lastSyncedAt)}
          </p>

          <form action={syncAction} className="mt-6">
            <input type="hidden" name="profileId" value={syncUserId ?? ""} />
            <button
              type="submit"
              disabled={!syncUserId || isPending}
              className="rounded-full bg-gradient-to-r from-[#4ADE80] to-[#22C55E] px-5 py-3 text-sm font-semibold text-[#08110B] shadow-[0_0_30px_rgba(74,222,128,0.18)] transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Analyzing your day..." : "Run manual sync"}
            </button>
            {syncState.message ? (
              <p className={`mt-3 text-sm ${syncState.ok ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
                {syncState.message}
              </p>
            ) : null}
          </form>
        </GlowCard>

        <GlowCard className="p-8">
          <p className="magic-tech-label text-xs text-[#A1A1AA]">SUPPORT</p>
          <div className="mt-4 flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-white">Find a bug or have an idea?</h2>
            <p className="text-sm text-[#A1A1AA]">Reach out to share feedback on how to make this better.</p>
            <a
              href="mailto:srikanthamsa@gmail.com"
              className="mt-3 inline-block rounded-full bg-[#17171A] px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#1f1f24]"
            >
              Email Support
            </a>
          </div>
        </GlowCard>

        <GlowCard className="p-8">
          <p className="magic-tech-label text-xs text-[#A1A1AA]">NOTIFICATIONS</p>
          <div className="mt-3">
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Mobile Alerts</h2>
            <p className="mt-2 text-sm text-[#A1A1AA]">Get a notification on your phone the moment you clear your 9 hours or when someone joins the leaderboard.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                className={`group rounded-full px-5 py-3 text-sm font-semibold transition flex items-center gap-2 ${pushEnabled
                  ? "bg-[rgba(57,255,20,0.1)] border border-[rgba(57,255,20,0.2)] text-[#4ADE80] cursor-default"
                  : "bg-[#17171A] border border-[#2d2d33] text-white hover:bg-[#1f1f24]"
                  }`}
                onClick={!pushEnabled ? onEnableNotifications : undefined}
              >
                {pushEnabled ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <span>Enabled</span>
                  </>
                ) : "Enable Push Notifications"}
              </button>
              {pushEnabled && (
                <button
                  onClick={onEnableNotifications}
                  className="group rounded-full px-5 py-3 text-sm font-semibold transition flex items-center gap-2 bg-[rgba(248,113,113,0.1)] border border-[rgba(248,113,113,0.2)] text-[#F87171] hover:bg-[rgba(248,113,113,0.15)]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  <span>Turn Off</span>
                </button>
              )}
            </div>
          </div>
        </GlowCard>

        {profile?.email === "srikanthamsa@gmail.com" || profile?.email === "srikant.hamsa@werize.com" ? (
          <GlowCard className="p-8">
            <p className="magic-tech-label text-xs text-[#A1A1AA]">ADMIN SETTINGS</p>
            <div className="mt-3">
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Broadcast Alert</h2>
              <p className="mt-2 text-sm text-[#A1A1AA]">Push a custom notification to all users.</p>
              <form
                action="/api/admin/broadcast"
                method="POST"
                className="mt-6 flex flex-col gap-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const formData = new FormData(form);
                  const title = formData.get("title") as string;
                  const body = formData.get("body") as string;
                  const url = formData.get("url") as string;
                  if (!title || !body) return;
                  const secret = "streaksecrethamsa2026";

                  const btn = form.querySelector('[type="submit"]') as HTMLButtonElement;
                  const originalText = btn.textContent;
                  btn.disabled = true;
                  btn.textContent = "Sending...";

                  try {
                    const res = await fetch("/api/admin/broadcast", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ secret, title, body, url })
                    });
                    if (res.ok) {
                      alert("Broadcast sent successfully!");
                      form.reset();
                      router.refresh();
                    } else {
                      const text = await res.text();
                      alert("Failed to send: " + text);
                    }
                  } catch (err) {
                    alert("Error sending broadcast: " + err);
                  } finally {
                    btn.disabled = false;
                    btn.textContent = originalText;
                  }
                }}
              >
                <input type="text" name="title" placeholder="Message Title" className="rounded-xl bg-[#17171A] p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#39FF14]" required />
                <textarea name="body" placeholder="Message Body" rows={3} className="rounded-xl bg-[#17171A] p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#39FF14]" required />
                <div className="relative">
                  <select name="url" className="w-full appearance-none rounded-xl bg-[#17171A] p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#39FF14]">
                    <option value="/">Main Hub (Home)</option>
                    <option value="/#Insights">Key Insights</option>
                    <option value="/#Arena">The Arena (Leaderboard)</option>
                    <option value="/#Activity">Recent Activity Feed</option>
                    <option value="/#Profile">Personal Profile</option>
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#71717A]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </div>
                </div>
                <button type="submit" className="mt-2 rounded-full bg-[rgba(57,255,20,0.1)] px-6 py-3 text-sm font-semibold text-[#4ADE80] transition hover:bg-[rgba(57,255,20,0.15)]">
                  Send to all devices
                </button>
              </form>
            </div>
          </GlowCard>
        ) : null}
      </div>

      <GlowCard className="col-span-12 p-8 lg:col-span-7">
        <p className="magic-tech-label text-xs text-[#A1A1AA]">RECENT HISTORY</p>
        {monthEntries.length ? (
          <div className="mt-6 max-h-[500px] space-y-3 overflow-y-auto pr-2 scrollbar-hide">
            {monthEntries.map((entry) => {
              const isOnLeave = entry.syncSource === "manual_leave";
              const isLOP = entry.status === "lop";
              const worked = calculateWorkedMinutes(entry.swipes);

              return (
                <div key={entry.date}>
                  <button
                    type="button"
                    onClick={() => setSelectedDay((current) => current === entry.date ? null : entry.date)}
                    className={`flex w-full items-center justify-between rounded-[22px] px-4 py-4 text-left transition hover:bg-[#1b1b1f] ${selectedDay === entry.date ? "bg-[#1b1b1f]" : "bg-[#17171A]"
                      }`}
                  >
                    <div>
                      <p className="font-semibold tracking-[-0.02em] text-white">{toShortDate(entry.date)}</p>
                      {isOnLeave ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[rgba(57,255,20,0.1)] px-2.5 py-0.5 text-xs font-medium text-[#4ADE80]">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          On Leave
                        </span>
                      ) : isLOP ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[rgba(248,113,113,0.12)] px-2.5 py-0.5 text-xs font-medium text-[#F87171]">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                          LOP
                        </span>
                      ) : (
                        <p className="mt-1 text-sm text-[#A1A1AA]">{entry.swipes.length} swipes captured</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className={`text-sm font-semibold ${isLOP ? "text-[#F87171]" : "text-white"}`}>
                        {isOnLeave ? "Full Clear" : formatMinutes(worked)}
                      </p>
                      <svg viewBox="0 0 24 24" className={`size-4 text-[#71717A] transition-transform duration-200 ${selectedDay === entry.date ? "rotate-180" : ""}`}>
                        <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                      </svg>
                    </div>
                  </button>
                  {selectedDay === entry.date ? (
                    <div className="-mt-1 rounded-b-[22px] rounded-t-[8px] bg-[#141416] px-5 py-5">
                      <p className="magic-tech-label text-xs text-[#A1A1AA]">DAY DETAIL · {toShortDate(entry.date)}</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-[#71717A]">First in</p>
                          <p className="mt-2 text-lg font-semibold text-white">
                            {isOnLeave ? "10:00 AM" : (entry.swipes[0] ? toClockLabel(entry.swipes[0]) : "--")}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-[#71717A]">Last out</p>
                          <p className="mt-2 text-lg font-semibold text-white">
                            {isOnLeave ? "07:00 PM" : (entry.swipes.at(-1) ? toClockLabel(entry.swipes.at(-1) as string) : "--")}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-[#71717A]">Total</p>
                          <p className="mt-2 text-lg font-semibold text-white">
                            {isOnLeave ? "9h 00m" : formatMinutes(worked)}
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-[#A1A1AA]">
                        {isOnLeave
                          ? "Leave day. Closes clean automatically."
                          : entry.swipes.length <= 1
                            ? "Thin day. This one probably needs attention."
                            : worked >= DAILY_TARGET_MINUTES
                              ? "Clean day. You cleared the line."
                              : worked >= HALF_DAY_MINUTES
                                ? "Half-day safe, but not a full clear."
                                : "Below the half-day floor — this counts as LOP."}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-[22px] bg-[#17171A] px-5 py-6">
            <p className="text-lg font-semibold tracking-[-0.03em] text-white">No recent history yet</p>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              Run your first sync and your actual attendance days will appear here.
            </p>
          </div>
        )}

      </GlowCard>
    </div>
  );
}

function BottomNav({
  currentTab,
  onSelect,
}: {
  currentTab: TabId;
  onSelect: (tab: TabId) => void;
}) {
  const SPRING       = { type: "spring" as const, stiffness: 280, damping: 26 };
  const COMPACT_W    = 46;  // icon(18) + px-3.5(14px × 2)
  const EXPANDED_PAD = 40;  // px-5(20px) × 2 — the indicator's horizontal padding when expanded
  const ICON_W       = 18;
  const LABEL_GAP    = 8;

  const navRef         = useRef<HTMLDivElement>(null);
  const tabRefs        = useRef<(HTMLButtonElement | null)[]>([]);
  const probeRefs      = useRef<(HTMLSpanElement | null)[]>([]);
  const expandedWidths = useRef<number[]>(tabs.map(() => 100));
  const dragState      = useRef<{ startX: number; startIndicatorX: number } | null>(null);
  const didDrag        = useRef(false);
  const isDraggingRef  = useRef(false);

  const indicatorX = useMotionValue(0);
  const indicatorW = useMotionValue(COMPACT_W);
  const [isDragging, setIsDragging] = useState(false);

  const activeIdx = tabs.findIndex((t) => t.id === currentTab);

  function setDragging(val: boolean) {
    isDraggingRef.current = val;
    setIsDragging(val);
  }

  // Measure each label's rendered pixel width on mount, then set the initial indicator position.
  useLayoutEffect(() => {
    tabs.forEach((_, i) => {
      const probe = probeRefs.current[i];
      if (probe) {
        expandedWidths.current[i] = EXPANDED_PAD + ICON_W + LABEL_GAP + probe.offsetWidth;
      }
    });
    const btn = tabRefs.current[activeIdx];
    if (btn) {
      const w = expandedWidths.current[activeIdx]!;
      indicatorX.set(btn.offsetLeft + btn.offsetWidth / 2 - w / 2);
      indicatorW.set(w);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate the indicator's FUTURE x position mathematically, without reading
  // the shifting DOM. All non-active tabs settle to COMPACT_W; the target tab
  // settles to its expanded width. The indicator width equals the expanded width,
  // so the +w/2-w/2 centering terms cancel and x equals the tab's future left edge.
  // nav padding: p-2 = 8px  |  flex gap: gap-1 = 4px
  function getFutureX(targetIdx: number): number {
    const NAV_PAD_LEFT = 8;
    const FLEX_GAP     = 4;
    return NAV_PAD_LEFT + targetIdx * (COMPACT_W + FLEX_GAP);
  }

  // When the active tab changes (driven by parent prop), spring the indicator to the new tab.
  useEffect(() => {
    if (isDraggingRef.current) return;
    const w = expandedWidths.current[activeIdx]!;
    const x = getFutureX(activeIdx);
    animate(indicatorX, x, SPRING);
    animate(indicatorW, w, SPRING);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  function getTabIdxAt(clientX: number): number {
    let closest = activeIdx, minDist = Infinity;
    tabRefs.current.forEach((btn, i) => {
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const dist = Math.abs(clientX - (rect.left + rect.width / 2));
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    return closest;
  }

  // Drag starts only when the user presses on the active tab area.
  function handleNavPointerDown(e: React.PointerEvent<HTMLElement>) {
    didDrag.current = false;
    const tabIdx = getTabIdxAt(e.clientX);
    if (tabIdx !== activeIdx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startIndicatorX: indicatorX.get() };
    setDragging(true);
    // Shrink the indicator to its compact icon-only size immediately.
    animate(indicatorW, COMPACT_W, SPRING);
  }

  function handleNavPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!dragState.current) return;
    const nav = navRef.current;
    if (!nav) return;
    const delta = e.clientX - dragState.current.startX;
    if (Math.abs(delta) > 4) didDrag.current = true;
    const rawX = dragState.current.startIndicatorX + delta;
    const maxX = nav.offsetWidth - indicatorW.get();
    indicatorX.set(Math.max(0, Math.min(rawX, maxX)));
  }

  function handleNavPointerUp(e: React.PointerEvent<HTMLElement>) {
    if (!dragState.current) return;
    dragState.current = null;
    setDragging(false);

    if (!didDrag.current) {
      // Tap on active tab — spring the indicator back to its expanded position.
      const btn = tabRefs.current[activeIdx];
      if (btn) {
        const w = expandedWidths.current[activeIdx]!;
        animate(indicatorX, btn.offsetLeft + btn.offsetWidth / 2 - w / 2, SPRING);
        animate(indicatorW, w, SPRING);
      }
      return;
    }

    // Determine the nearest tab by comparing the indicator's center to each tab's center.
    const center = indicatorX.get() + COMPACT_W / 2;
    let closest = activeIdx, minDist = Infinity;
    tabRefs.current.forEach((btn, i) => {
      if (!btn) return;
      const tabCenter = btn.offsetLeft + btn.offsetWidth / 2;
      const dist = Math.abs(center - tabCenter);
      if (dist < minDist) { minDist = dist; closest = i; }
    });

    // Snap the indicator to the closest tab and expand it simultaneously.
    // Use the same predictive math as getFutureX so the animation targets the
    // settled layout position, not the pre-shift DOM position.
    const w = expandedWidths.current[closest]!;
    animate(indicatorX, getFutureX(closest), SPRING);
    animate(indicatorW, w, SPRING);
    if (tabs[closest]?.id !== currentTab) onSelect(tabs[closest]!.id);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <div className="flex justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-32 w-80 -translate-x-1/2 rounded-full bg-[rgba(57,255,20,0.07)] blur-[48px]" />

        {/* Hidden spans used to measure each label's rendered width for the expanded indicator. */}
        <div className="pointer-events-none invisible absolute" aria-hidden="true">
          {tabs.map((tab, i) => (
            <span
              key={tab.id}
              ref={(el) => { probeRefs.current[i] = el; }}
              className="whitespace-nowrap text-sm font-semibold"
            >
              {tab.label}
            </span>
          ))}
        </div>

        <nav
          ref={navRef}
          className="magic-bottom-nav pointer-events-auto relative flex items-center gap-1 rounded-[28px] p-2 touch-none select-none"
          onPointerDown={handleNavPointerDown}
          onPointerMove={handleNavPointerMove}
          onPointerUp={handleNavPointerUp}
          onPointerCancel={handleNavPointerUp}
        >
          {/* Single global indicator — absolutely positioned, draggable via nav pointer events. */}
          <motion.div
            style={{
              x: indicatorX,
              width: indicatorW,
              position: "absolute",
              top: 8,
              bottom: 8,
              left: 0,
              borderRadius: 22,
              background: "linear-gradient(135deg, #52FF2A 0%, #39FF14 50%, #28CC0F 100%)",
              boxShadow: "0 0 22px rgba(57,255,20,0.5), inset 0 1px 0 rgba(255,255,255,0.18)",
              cursor: isDragging ? "grabbing" : "grab",
              zIndex: 0,
            }}
          />

          {tabs.map((tab, i) => {
            const active = i === activeIdx;
            return (
              <button
                key={tab.id}
                ref={(el) => { tabRefs.current[i] = el as HTMLButtonElement | null; }}
                type="button"
                onClick={() => { if (!isDraggingRef.current && !didDrag.current) onSelect(tab.id); }}
                className="relative z-10 flex items-center justify-center rounded-[22px] py-3.5 px-3.5 text-sm font-semibold"
                style={{ color: active && !isDragging ? "#07120A" : "#71717A" }}
              >
                <svg viewBox="0 0 24 24" className="size-[18px] shrink-0">
                  {tab.icon}
                </svg>

                <AnimatePresence initial={false}>
                  {active && !isDragging && (
                    <motion.span
                      key={tab.id + "-label"}
                      initial={{ maxWidth: 0, opacity: 0, marginLeft: 0 }}
                      animate={{ maxWidth: 96, opacity: 1, marginLeft: 8 }}
                      exit={{ maxWidth: 0, opacity: 0, marginLeft: 0 }}
                      transition={SPRING}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      {tab.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function AppShell(data: DashboardData) {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<TabId>("today");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const hasTriggeredFirstSync = useRef(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      }).catch(console.error);
    }
  }, []);

  async function handleEnableNotifications() {
    if (!("serviceWorker" in navigator)) return;
    setIsPushLoading(true);
    if (!("serviceWorker" in navigator)) return;

    if (pushEnabled) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
        setPushEnabled(false);
      } catch (err) {
        console.error("Unsubscribe failed", err);
      }
      setIsPushLoading(false);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      await fetch("/api/save-push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.profile.id,
          subscription: subscription,
        }),
      });

      setPushEnabled(true);
    } catch (err) {
      console.error("Subscription failed", err);
      alert("Failed to enable notifications. Make sure you are using an HTTPS connection.");
    } finally {
      setIsPushLoading(false);
    }
  }



  useEffect(() => {
    if (!data.syncUserId || !data.isLive || hasTriggeredFirstSync.current) {
      return;
    }

    const shouldRunFirstSync = !data.lastSyncedAt;
    if (!shouldRunFirstSync) {
      return;
    }

    hasTriggeredFirstSync.current = true;

    void fetch("/api/sync-attendance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ profileId: data.syncUserId }),
    });
  }, [data.isLive, data.lastSyncedAt, data.syncUserId]);

  useEffect(() => {
    if (!data.syncUserId || !data.isLive) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      const jitterMinutes = Math.floor(Math.random() * 21) - 10;
      const delayMs = (120 + jitterMinutes) * 60 * 1000;
      timer = setTimeout(async () => {
        if (cancelled) {
          return;
        }

        try {
          await fetch("/api/sync-attendance", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ profileId: data.syncUserId }),
          });
        } finally {
          if (!cancelled) {
            scheduleNext();
          }
        }
      }, delayMs);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [data.isLive, data.syncUserId]);

  return (
    <main className="magic-shell min-h-screen bg-[#0B0B0C] px-6 py-10 pb-32 text-white">
      <div className="magic-grid" />
      <div className="relative z-10 flex flex-col items-center">
        <Header monthSummary={data.monthSummary} />

        {currentTab === "today" ? <TodayView {...data} /> : null}
        {currentTab === "insights" ? <InsightsView monthEntries={data.monthEntries} monthSummary={data.monthSummary} /> : null}
        {currentTab === "leaderboard" ? (
          <LeaderboardView
            profile={data.profile}
            leaderboardEntries={data.leaderboardEntries}
            leaderboardCards={data.leaderboardCards}
            monthEntries={data.monthEntries}
          />
        ) : null}
        {currentTab === "notifications" ? <NotificationsView notifications={data.notifications} profile={data.profile} /> : null}
        {currentTab === "profile" ? (
          <ProfileView
            syncUserId={data.syncUserId}
            lastSyncedAt={data.lastSyncedAt}
            isLive={data.isLive}
            monthEntries={data.monthEntries}
            profile={data.profile}
            pushEnabled={pushEnabled}
            isPushLoading={isPushLoading}
            onEnableNotifications={handleEnableNotifications}
          />
        ) : null}
      </div>

      <BottomNav currentTab={currentTab} onSelect={setCurrentTab} />
    </main>
  );
}
