"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { syncAttendanceAction } from "@/app/actions";
import {
  calculateWorkedMinutes,
  DAILY_TARGET_MINUTES,
  formatMinutes,
  HALF_DAY_MINUTES,
  getMinutesRemaining,
  toClockLabel,
  toShortDate,
} from "@/lib/attendance";
import type { DashboardData } from "@/lib/dashboard-data";
import type { LeaderboardEntry } from "@/lib/types";

type TabId = "today" | "plan" | "leaderboard" | "profile";

type TabDefinition = {
  id: TabId;
  label: string;
  icon: ReactNode;
};

const tabs: TabDefinition[] = [
  {
    id: "today",
    label: "Today",
    icon: (
      <path
        d="M12 7v5l3 3m6-3a9 9 0 1 1-18 0a9 9 0 0 1 18 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: "plan",
    label: "Plan",
    icon: (
      <path
        d="M4 8.5L12 4l8 4.5M5.5 10H18.5M7 10v7m5-7v7m5-7v7M4 19h16"
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
    label: "Leaderboard",
    icon: (
      <path
        d="M16 21v-1.5a3.5 3.5 0 0 0-3.5-3.5h-1A3.5 3.5 0 0 0 8 19.5V21m10-8a2.5 2.5 0 1 0-2.2-3.7M6 13a2.5 2.5 0 1 1 2.2-3.7M12 13a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z"
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
      <div className="magic-panel relative z-10 w-full max-w-md rounded-[28px] p-6">
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
      className={`rounded-[22px] px-4 py-4 ${
        highlight
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
  const hasStartedToday = data.todayEntry.swipes.length > 0;
  const minimumViable = data.profile.firstSwipeAt
    ? new Date(new Date(data.profile.firstSwipeAt).getTime() + 4.5 * 60 * 60 * 1000).toISOString()
    : null;
  const comfortable = data.profile.firstSwipeAt
    ? new Date(new Date(data.profile.firstSwipeAt).getTime() + 8 * 60 * 60 * 1000).toISOString()
    : null;
  const required = data.targetExitTime;
  const displayRequired = formatDisplayTime(required);
  const currentAverageParts = splitDurationLabel(currentAverage);
  const statusCopy = status.label === "Behind"
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
    ? "+1 loading"
    : data.streak.realTimeStatus === "risk"
    ? "At risk"
    : "Break risk";

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
            {!hasStartedToday
              ? "Go to office first. Your average starts updating after the first swipe."
              : minutesRemaining <= 0
              ? "You have already cleared the day."
              : `You still need ${formatMinutes(minutesRemaining)} if you want zero regret later.`}
          </p>
        </div>

        <div className={`mt-6 inline-flex items-center gap-3 rounded-full px-4 py-3 text-sm ${hasStartedToday ? status.tone : "bg-[#17171A] text-[#A1A1AA]"}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${hasStartedToday ? (status.label === "Behind" ? "bg-[#F87171] shadow-[0_0_18px_#F87171]" : "bg-[#4ADE80] shadow-[0_0_18px_#4ADE80]") : "bg-gradient-to-tr from-[#F59E0B] to-[#FDE047] shadow-[0_0_12px_rgba(253,224,71,0.5)]"}`} />
          <span>{hasStartedToday ? statusCopy : "Day not started yet."}</span>
        </div>

        <div className="mt-8">
          <div className="magic-tech-label mb-2 flex justify-between text-[11px] text-[#71717A]">
            <span>month progress</span>
            <span>{formatMinutes(data.monthSummary.actualMinutesToDate)} / {formatMinutes(totalMonthlyMinutes)}</span>
          </div>

          <div className="magic-progress-track h-2 w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#7CFF61,#39FF14,#20E70A)] shadow-[0_0_30px_rgba(57,255,20,0.24)] transition-all duration-1000"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowStreakDetails(true)}
            className="magic-streak-card w-full rounded-[24px] bg-[#151518] px-5 py-5 text-left transition hover:bg-[#19191d]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="magic-tech-label text-[11px] text-[#71717A]">STREAK</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">
                  🔥 {data.streak.currentStreak}
                </p>
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
              <p className="magic-tech-label text-xs text-[#A1A1AA]">TODAY ENGINE</p>
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">When can I leave?</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowExitGuide(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#17171A] text-sm text-[#A1A1AA] transition hover:text-white"
              >
                i
              </button>
              <div className="rounded-xl bg-[#1A1A1D] px-4 py-2 text-right text-sm text-white">
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#71717A]">Started</div>
                <div>{hasStartedToday ? `${firstSwipeLabel.time} ${firstSwipeLabel.meridiem}` : "First swipe pending"}</div>
              </div>
            </div>
          </div>

          <div className="my-8 text-center sm:my-10">
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
                : "You’re good to leave by then"}
            </p>
          </div>

          {hasStartedToday ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <MiniCard title="Avoid LOP" value={minimumViable ? toClockLabel(minimumViable) : "--"} />
              <MiniCard title="Comfort zone" value={comfortable ? toClockLabel(comfortable) : "--"} />
              <MiniCard highlight title="Remaining" value={formatMinutes(minutesRemaining)} />
            </div>
          ) : null}
        </GlowCard>

        <div className="flex flex-col gap-5 lg:col-span-4 lg:gap-6">
          <GlowCard className="magic-panel-glow p-6">
            <p className="magic-tech-label text-xs text-[#A1A1AA]">TIME BANK</p>
            <h2 className={`mt-2 text-4xl font-semibold tracking-[-0.04em] ${data.monthSummary.balanceMinutes >= 0 ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
              {data.monthSummary.balanceMinutes >= 0 ? "+" : "-"}
              {formatMinutes(Math.abs(data.monthSummary.balanceMinutes))}
            </h2>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              {data.monthSummary.balanceMinutes >= 0 ? "Ahead of expected pace." : "Below expected pace."}
            </p>
          </GlowCard>

          <GlowCard className="relative overflow-hidden p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="magic-tech-label text-xs text-[#A1A1AA]">LEAVE NOW IMPACT</p>
              <div className="magic-glow-dot h-3 w-3 rounded-full bg-[#39FF14]" />
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-[#1A1A1D]">
              <div className="absolute inset-y-0 left-0 w-[58%] rounded-full bg-[linear-gradient(90deg,#7CFF61,#39FF14,#20E70A)] shadow-[0_0_24px_rgba(57,255,20,0.2)]" />
            </div>
            <div className="mt-6 rounded-[24px] bg-[#121214] px-5 py-5">
              <p className="text-sm leading-6 text-white">
                {leaveNowCopy}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowSwipes((value) => !value)}
                  disabled={!hasStartedToday}
                  className="rounded-2xl bg-[#1A1A1D] px-4 py-3 text-left text-sm text-[#A1A1AA] transition hover:bg-[#202024] hover:text-white"
                >
                  {hasStartedToday ? `${data.todayEntry.swipes.length} swipes` : "No swipes yet"}
                </button>
                <div className="rounded-2xl bg-[#1A1A1D] px-4 py-3 text-sm text-[#A1A1AA]">
                  Last synced {formatLastSynced(data.lastSyncedAt)}
                </div>
              </div>
              {showSwipes && hasStartedToday ? (
                <div className="mt-4 space-y-2">
                  {data.todayEntry.swipes.map((swipe) => (
                    <div
                      key={swipe}
                      className="flex items-center justify-between rounded-2xl bg-[#1A1A1D] px-4 py-3 text-sm text-[#A1A1AA]"
                    >
                      <span>Swipe</span>
                      <span className="text-white">{toClockLabel(swipe)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </GlowCard>
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
              If one day goes wrong, the app can let it slide once in the week before the streak actually snaps.
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

function PlanView({ monthSummary, streak }: Pick<DashboardData, "monthSummary" | "streak">) {
  const daysLeft = Math.max(1, monthSummary.totalWorkingDays - monthSummary.workingDaysElapsed);
  const recoveryStep = monthSummary.balanceMinutes < 0
    ? Math.ceil(Math.abs(monthSummary.balanceMinutes) / Math.min(daysLeft, 4))
    : 0;
  const earlyExitAllowance = monthSummary.balanceMinutes > 0
    ? Math.floor(monthSummary.balanceMinutes / daysLeft)
    : 0;
  const ifEight = Math.round(
    (monthSummary.actualMinutesToDate + daysLeft * 8 * 60) / Math.max(1, monthSummary.totalWorkingDays),
  );
  const ifNine = Math.round(
    (monthSummary.actualMinutesToDate + daysLeft * 9 * 60) / Math.max(1, monthSummary.totalWorkingDays),
  );

  return (
    <div className="grid w-full max-w-6xl grid-cols-12 gap-6">
      <GlowCard className="magic-panel-glow col-span-12 p-8 lg:col-span-7">
        <p className="magic-tech-label text-xs text-[#A1A1AA]">TIME BANK</p>
        <h2 className="magic-display text-[76px] text-white">
          {monthSummary.balanceMinutes >= 0 ? "+" : "-"}
          {formatMinutes(Math.abs(monthSummary.balanceMinutes))}
        </h2>
        <p className="mt-4 text-base text-[#A1A1AA]">
          {monthSummary.balanceMinutes >= 0
            ? "You can coast a little. The month still stays safe."
            : "You need recovery, but it is still recoverable without drama."}
        </p>
      </GlowCard>

      <GlowCard className="col-span-12 p-8 lg:col-span-5">
        <p className="magic-tech-label text-xs text-[#A1A1AA]">REQUIRED PACE</p>
        <h3 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
          {formatMinutes(monthSummary.recommendedDailyAverageMinutes)}/day
        </h3>
        <p className="mt-3 text-sm text-[#A1A1AA]">
          Longest streak: {streak.longestStreak} days
        </p>
      </GlowCard>

      <GlowCard className="col-span-12 p-8 lg:col-span-4">
        {monthSummary.balanceMinutes < 0 ? (
          <>
            <p className="magic-tech-label text-xs text-[#A1A1AA]">RECOVERY PLAN</p>
            <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
              +{formatMinutes(recoveryStep)}
            </h3>
            <p className="mt-3 text-sm text-[#A1A1AA]">
              Add this for the next 4 working days to catch up.
            </p>
          </>
        ) : (
          <>
            <p className="magic-tech-label text-xs text-[#A1A1AA]">EARLY EXIT ALLOWANCE</p>
            <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#4ADE80]">
              -{formatMinutes(earlyExitAllowance)}/day
            </h3>
            <p className="mt-3 text-sm text-[#A1A1AA]">
              {earlyExitAllowance > 0
                ? "You can leave this much earlier every remaining day and still perfectly clear the month."
                : "You are exactly on pace. No surplus to burn yet."}
            </p>
          </>
        )}
      </GlowCard>

      <GlowCard className="col-span-12 p-8 lg:col-span-8">
        <p className="magic-tech-label text-xs text-[#A1A1AA]">SCENARIOS</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[22px] bg-[#17171A] p-5">
            <p className="text-sm text-[#A1A1AA]">If you do 8h/day</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
              {formatMinutes(ifEight)}
            </p>
            <p className={`mt-2 text-sm ${ifEight >= DAILY_TARGET_MINUTES ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
              {ifEight >= DAILY_TARGET_MINUTES ? "Safe" : "Below target"}
            </p>
          </div>
          <div className="rounded-[22px] bg-[#17171A] p-5">
            <p className="text-sm text-[#A1A1AA]">If you do 9h/day</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
              {formatMinutes(ifNine)}
            </p>
            <p className={`mt-2 text-sm ${ifNine >= DAILY_TARGET_MINUTES ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
              {ifNine >= DAILY_TARGET_MINUTES ? "Safe" : "Below target"}
            </p>
          </div>
        </div>
      </GlowCard>
    </div>
  );
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
              return (
                <div key={entry.id} className="rounded-[22px] bg-[#17171A] px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-semibold tracking-[-0.03em] text-white">#{index + 1}</p>
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
                        {formatMinutes(entry.averageDailyMinutes ?? 0)}
                      </p>
                      <p className="mt-1 whitespace-nowrap text-xs text-[#A1A1AA]">
                        🔥 {entry.currentStreak ?? 0}
                      </p>
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
}: Pick<DashboardData, "syncUserId" | "lastSyncedAt" | "isLive" | "monthEntries" | "profile">) {
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
              href="/setup"
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
      </div>

      <GlowCard className="col-span-12 p-8 lg:col-span-7">
        <p className="magic-tech-label text-xs text-[#A1A1AA]">RECENT HISTORY</p>
        {monthEntries.length ? (
          <div className="mt-6 space-y-3">
            {monthEntries.slice(0, 8).map((entry) => (
              <>
                <button
                  key={entry.date}
                  type="button"
                  onClick={() => setSelectedDay((current) => current === entry.date ? null : entry.date)}
                  className={`flex w-full items-center justify-between rounded-[22px] px-4 py-4 text-left transition hover:bg-[#1b1b1f] ${
                    selectedDay === entry.date ? "bg-[#1b1b1f]" : "bg-[#17171A]"
                  }`}
                >
                  <div>
                    <p className="font-semibold tracking-[-0.02em] text-white">{toShortDate(entry.date)}</p>
                    <p className="mt-1 text-sm text-[#A1A1AA]">{entry.swipes.length} swipes captured</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-white">{formatMinutes(calculateWorkedMinutes(entry.swipes))}</p>
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
                        <p className="mt-2 text-lg font-semibold text-white">{entry.swipes[0] ? toClockLabel(entry.swipes[0]) : "--"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-[#71717A]">Last out</p>
                        <p className="mt-2 text-lg font-semibold text-white">{entry.swipes.at(-1) ? toClockLabel(entry.swipes.at(-1) as string) : "--"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-[#71717A]">Total</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatMinutes(calculateWorkedMinutes(entry.swipes))}</p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-[#A1A1AA]">
                      {entry.swipes.length <= 1
                        ? "Thin day. This one probably needs attention."
                        : calculateWorkedMinutes(entry.swipes) >= DAILY_TARGET_MINUTES
                        ? "Clean day. You cleared the line."
                        : calculateWorkedMinutes(entry.swipes) >= HALF_DAY_MINUTES
                        ? "Half-day safe, but not a full clear."
                        : "Below half-day floor. This one was expensive."}
                    </p>
                  </div>
                ) : null}
              </>
            ))}
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
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <div className="flex justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+18px)]">
        {/* Glow halo behind the nav pill */}
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-28 w-72 -translate-x-1/2 rounded-full bg-[rgba(57,255,20,0.13)] blur-[40px]" />
        <nav className="magic-bottom-nav pointer-events-auto relative flex items-center gap-2 rounded-[26px] p-2 shadow-[0_0_40px_rgba(57,255,20,0.15)]">
          {tabs.map((tab) => {
            const active = tab.id === currentTab;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelect(tab.id)}
                className={`flex items-center gap-2 rounded-[20px] px-4 py-3 text-sm font-medium transition duration-300 ${
                  active
                    ? "bg-[linear-gradient(180deg,rgba(57,255,20,0.22),rgba(57,255,20,0.1))] text-white shadow-[0_0_28px_rgba(57,255,20,0.18)]"
                    : "text-[#A1A1AA] hover:bg-[#17171A] hover:text-white"
                }`}
              >
                <svg viewBox="0 0 24 24" className="size-[18px] shrink-0">
                  {tab.icon}
                </svg>
                {active ? <span>{tab.label}</span> : null}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function AppShell(data: DashboardData) {
  const [currentTab, setCurrentTab] = useState<TabId>("today");
  const hasTriggeredFirstSync = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);

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
        {currentTab === "plan" ? <PlanView monthSummary={data.monthSummary} streak={data.streak} /> : null}
        {currentTab === "leaderboard" ? (
          <LeaderboardView
            profile={data.profile}
            leaderboardEntries={data.leaderboardEntries}
            leaderboardCards={data.leaderboardCards}
            monthEntries={data.monthEntries}
          />
        ) : null}
        {currentTab === "profile" ? (
          <ProfileView
            syncUserId={data.syncUserId}
            lastSyncedAt={data.lastSyncedAt}
            isLive={data.isLive}
            monthEntries={data.monthEntries}
            profile={data.profile}
          />
        ) : null}
      </div>

      <BottomNav currentTab={currentTab} onSelect={setCurrentTab} />
    </main>
  );
}
