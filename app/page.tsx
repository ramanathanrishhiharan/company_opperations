"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Home as HomeIcon, Building2, Power, ArrowRight, Coffee } from "lucide-react";
import { useSession } from "@/components/SessionContext";
import {
  Mode,
  Session,
  LeaveRecord,
  TeamMember,
  LEAVE_ALLOWANCE,
  BREAK_RULES,
  breakElapsedMin,
  summarizeBreaks,
} from "@/lib/airtable";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
// Round first, then split — avoids "0h 60m" when minutes are e.g. 59.6.
function fmtHM(min: number) {
  const total = Math.round(min);
  return `${Math.floor(total / 60)}h ${(total % 60).toString().padStart(2, "0")}m`;
}
function fmtClock(min: number) {
  const s = Math.floor(min * 60);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function sumMinutes(sessions: { signInTime: string | null; signOutTime: string | null }[], nowMs: number) {
  return sessions.reduce((total, s) => {
    if (!s.signInTime) return total;
    const start = new Date(s.signInTime).getTime();
    const end = s.signOutTime ? new Date(s.signOutTime).getTime() : nowMs;
    return total + Math.max(0, (end - start) / 60000);
  }, 0);
}

const WEEKLY_TARGET_MIN = 40 * 60;
const DAY_TARGET_MIN = 8 * 60;
const DANGER = "var(--danger, #c0392b)";

export default function TodayPage() {
  const {
    employee,
    todaySessions,
    openSession,
    pastSessions,
    todayBreaks,
    activeBreak,
    busy,
    signIn,
    signOut,
    startBreak,
    endBreak,
  } = useSession();
  const [pendingMode, setPendingMode] = useState<Mode>("Office");
  const [now, setNow] = useState(() => Date.now());
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRecord[] | null>(null);
  const alerted = useRef<Set<string>>(new Set());

  const breakInfo = summarizeBreaks(todayBreaks, now);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local default once employee loads
    if (employee) setPendingMode(employee.defaultMode);
  }, [employee]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d) => setTeam(d.team ?? []))
      .catch(() => setTeam([]));
    if (employee?.email) {
      fetch(`/api/leave?email=${encodeURIComponent(employee.email)}`)
        .then((r) => r.json())
        .then((d) => setLeaveRequests(d.requests ?? []))
        .catch(() => setLeaveRequests([]));
    }
  }, [employee?.email]);

  // Break alerts: a heads-up at 5 minutes left, and an alert when time is up.
  useEffect(() => {
    if (!activeBreak) return;
    const left = breakInfo.allowedForActiveMin - breakInfo.activeElapsedMin;
    const warnKey = `${activeBreak.id}:warn`;
    const limitKey = `${activeBreak.id}:limit`;
    if (left <= 0 && !alerted.current.has(limitKey)) {
      alerted.current.add(limitKey);
      toast.error("Your break time is up — please resume work.", { duration: 10000 });
    } else if (left > 0 && left <= 5 && !alerted.current.has(warnKey)) {
      alerted.current.add(warnKey);
      toast("5 minutes left on your break.", { icon: "⏳", duration: 6000 });
    }
  }, [activeBreak, breakInfo.activeElapsedMin, breakInfo.allowedForActiveMin]);

  if (!employee) {
    return (
      <div>
        <div className="skeleton" style={{ height: 16, width: 140, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 26, width: 200, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 220, borderRadius: 16 }} />
      </div>
    );
  }

  const isSignedIn = Boolean(openSession);
  const todayMinutesTotal = sumMinutes(todaySessions, now);
  const activeSessionMinutes = openSession?.signInTime
    ? Math.max(0, (now - new Date(openSession.signInTime).getTime()) / 60000)
    : 0;
  const activeSeconds = openSession?.signInTime
    ? Math.floor((Math.max(0, now - new Date(openSession.signInTime).getTime()) / 1000) % 60)
    : 0;

  const monday = startOfWeek();
  const weekSessions = [...pastSessions, ...todaySessions].filter((s) => new Date(s.date) >= monday);
  const weekMinutes = sumMinutes(weekSessions, now);
  const weekDays = new Set(weekSessions.filter((s) => s.signInTime).map((s) => s.date)).size;

  const progressPct = Math.min(100, Math.round((todayMinutesTotal / DAY_TARGET_MIN) * 100));
  const remainingWeekMin = Math.max(0, WEEKLY_TARGET_MIN - weekMinutes);

  const workingNow = (team ?? []).filter((m) => m.status === "signed_in");
  const signedInCount = workingNow.length;

  const pendingLeave = (leaveRequests ?? []).find((r) => r.status === "Pending");
  // Same rule as the Leave page (holidays + half days via r.workingDays).
  const annualUsed = (leaveRequests ?? [])
    .filter((r) => r.type === "Annual" && r.status !== "Declined")
    .reduce((sum, r) => sum + r.workingDays, 0);
  const annualLeft = Math.max(0, LEAVE_ALLOWANCE.Annual - annualUsed);

  function handlePress() {
    if (isSignedIn) {
      signOut();
    } else {
      signIn(pendingMode);
    }
  }

  const cardActiveClass = isSignedIn ? "status-card dark" : "status-card";

  const breakOver = breakInfo.overrunMin > 0;
  const breakPct = activeBreak
    ? Math.min(100, (breakInfo.activeElapsedMin / Math.max(1, breakInfo.allowedForActiveMin)) * 100)
    : 0;
  const totalOver = breakInfo.usedMin > BREAK_RULES.maxTotalMin;

  return (
    <div>
      <p className="page-eyebrow">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p>
      <h1 className="page-title">
        {(() => {
          const hour = new Date().getHours();
          const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
          return `${greeting}, ${employee.name.split(" ")[0]}`;
        })()}
      </h1>
      <p className="page-subtitle">Your day at a glance — hours logged, what the team is doing, and anything waiting on you.</p>

      <div className="two-col" style={{ marginTop: 24 }}>
        <div>
          <div className={`card ${cardActiveClass}`}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <span className={`dot ${isSignedIn ? "dot-success dot-pulse" : "dot-neutral"}`} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="status-caption">
                    {isSignedIn
                      ? activeBreak
                        ? "Signed in · on break"
                        : "Currently signed in"
                      : todaySessions.length > 0
                      ? "Signed out"
                      : "Not signed in"}
                  </span>
                </div>
                {isSignedIn ? (
                  <p style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, lineHeight: 1 }}>
                    {Math.floor(activeSessionMinutes / 60)}h {Math.floor(activeSessionMinutes % 60).toString().padStart(2, "0")}m
                    <span style={{ fontSize: 15, opacity: 0.6, marginLeft: 4 }}>{activeSeconds.toString().padStart(2, "0")}s</span>
                  </p>
                ) : (
                  <p style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700 }}>
                    {fmtHM(todayMinutesTotal)} logged
                  </p>
                )}
                <p className="status-caption" style={{ margin: "6px 0 0", fontSize: 13 }}>
                  {isSignedIn && openSession?.signInTime
                    ? `In since ${formatTime(openSession.signInTime)} · Working ${openSession.mode === "Remote" ? "remotely" : "from the office"}`
                    : "Tap below when you start work"}
                </p>
              </div>

              <div className="segmented">
                {(["Office", "Remote"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    className={(isSignedIn ? openSession?.mode : pendingMode) === m ? "active" : ""}
                    disabled={isSignedIn}
                    onClick={() => setPendingMode(m)}
                    style={{ display: "flex", alignItems: "center", gap: 5, cursor: isSignedIn ? "default" : "pointer" }}
                  >
                    {m === "Office" ? <Building2 size={12} /> : <HomeIcon size={12} />}
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }} className="status-caption">
                <span>Progress to 8h day</span>
                <span>{progressPct}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            <button className="day-action" onClick={handlePress} disabled={busy}>
              <Power size={15} />
              {busy ? "Working…" : isSignedIn ? "Sign out for the day" : "Sign in for the day"}
            </button>
          </div>

          {/* ---------------- Breaks ---------------- */}
          <div className="card" style={{ padding: 18, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Coffee size={16} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Breaks</h3>
              </div>
              <span style={{ fontSize: 12, color: totalOver ? DANGER : "var(--text-secondary)", fontWeight: totalOver ? 700 : 500 }}>
                {Math.round(breakInfo.usedMin)} / {BREAK_RULES.maxTotalMin} min · {breakInfo.countUsed} of {BREAK_RULES.maxBreaks} used
              </span>
            </div>

            {activeBreak ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 30,
                      fontWeight: 700,
                      color: breakOver ? DANGER : undefined,
                    }}
                  >
                    {fmtClock(breakInfo.activeElapsedMin)}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    of {Math.round(breakInfo.allowedForActiveMin)}:00 allowed
                  </span>
                </div>
                <div className="progress-track" style={{ marginTop: 8 }}>
                  <div className="progress-fill" style={{ width: `${breakPct}%`, background: breakOver ? DANGER : "var(--accent)" }} />
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: breakOver ? DANGER : "var(--text-secondary)", fontWeight: breakOver ? 600 : 400 }}>
                  {breakOver
                    ? `Break limit exceeded by ${fmtClock(breakInfo.overrunMin)} — please resume work.`
                    : `${fmtClock(breakInfo.allowedForActiveMin - breakInfo.activeElapsedMin)} left on this break.`}
                </p>
                <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={endBreak} disabled={busy}>
                  {busy ? "Working…" : "End break"}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                <button
                  className="btn btn-primary"
                  onClick={startBreak}
                  disabled={busy || !isSignedIn || !breakInfo.canStart}
                >
                  {busy ? "Working…" : "Start break"}
                </button>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                  {!isSignedIn
                    ? "Sign in to take a break."
                    : breakInfo.blockReason === "max_breaks"
                    ? "You've used both breaks today."
                    : breakInfo.blockReason === "allowance_used"
                    ? "Your 1-hour allowance is used up."
                    : `Up to ${BREAK_RULES.maxBreaks} breaks of ${BREAK_RULES.maxPerBreakMin} min, ${BREAK_RULES.maxTotalMin} min in total.`}
                </p>
              </div>
            )}

            {todayBreaks.length > 0 && (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {todayBreaks.map((b, i) => (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)" }}>
                    <span>
                      Break {i + 1}: {formatTime(b.startTime)} → {b.endTime ? formatTime(b.endTime) : "now"}
                    </span>
                    <span style={{ fontFamily: "var(--font-display)" }}>{Math.round(breakElapsedMin(b, now))} min</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="section-header">
            <h2>Today&rsquo;s log</h2>
            <Link href="/history" className="link-row">
              Full history <ArrowRight size={12} />
            </Link>
          </div>
          <div className="card row-list">
            {todaySessions.length === 0 && (
              <div className="row-item" style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
                Nothing logged yet today.
              </div>
            )}
            {[...todaySessions].reverse().map((s) => (
              <SessionRow key={s.id} session={s} now={now} />
            ))}
          </div>
        </div>

        <div className="side-col">
          <div className="card mini-card">
            <p className="mini-card-label">This week</p>
            <p className="mini-card-value">{fmtHM(weekMinutes)}</p>
            <p className="mini-card-sub">
              {weekDays} day{weekDays === 1 ? "" : "s"} worked · {fmtHM(todayMinutesTotal)} today
            </p>
            <div className="mini-card-divider" />
            <div className="mini-card-stat-row">
              <span>Weekly target</span>
              <span className="mono">{fmtHM(WEEKLY_TARGET_MIN)}</span>
            </div>
            <div className="mini-card-stat-row">
              <span>Remaining</span>
              <span className="mono">{fmtHM(remainingWeekMin)}</span>
            </div>
          </div>

          <div className="card mini-card">
            <div className="mini-card-header">
              <h3>Leave</h3>
              <Link href="/leave" className="link-row">
                Request <ArrowRight size={12} />
              </Link>
            </div>
            {leaveRequests === null ? (
              <div className="skeleton" style={{ height: 40, marginTop: 8 }} />
            ) : (
              <>
                <p className="mini-card-value" style={{ fontSize: 18 }}>
                  {annualLeft} <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                    of {LEAVE_ALLOWANCE.Annual} annual days left
                  </span>
                </p>
                <div className="progress-track" style={{ marginTop: 8 }}>
                  <div className="progress-fill" style={{ width: `${Math.min(100, (annualLeft / LEAVE_ALLOWANCE.Annual) * 100)}%`, background: "var(--text-primary)" }} />
                </div>
                {pendingLeave && (
                  <p className="mini-card-sub" style={{ marginTop: 10 }}>
                    Next: {formatDate(pendingLeave.startDate)} – {formatDate(pendingLeave.endDate)} · {pendingLeave.workingDays} days ·{" "}
                    <span style={{ color: "var(--warning)", fontWeight: 600 }}>pending</span>
                  </p>
                )}
              </>
            )}
          </div>

          <div className="card mini-card">
            <div className="mini-card-header">
              <h3>In right now</h3>
              <Link href="/team" className="link-row">
                Team <ArrowRight size={12} />
              </Link>
            </div>
            {team === null && <div className="skeleton" style={{ height: 60, marginTop: 8 }} />}
            {team !== null && workingNow.length === 0 && (
              <p className="mini-card-sub">No one is signed in right now.</p>
            )}
            {workingNow.slice(0, 5).map((m) => (
              <div key={m.id} className="team-preview-row">
                <span className="avatar">{m.name.trim().charAt(0).toUpperCase()}</span>
                <p className="team-preview-name">{m.name}</p>
                <span className="team-preview-time">{m.since ? formatTime(m.since) : ""}</span>
              </div>
            ))}
            {team !== null && (
              <p className="mini-card-sub" style={{ marginTop: 8 }}>
                {signedInCount} of {team.length} signed in
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionRow({ session, now }: { session: Session; now: number }) {
  const isOpen = Boolean(session.signInTime && !session.signOutTime);
  return (
    <div className="row-item">
      {session.mode === "Remote" ? <HomeIcon size={14} color="var(--text-tertiary)" /> : <Building2 size={14} color="var(--text-tertiary)" />}
      <span style={{ flex: 1, fontSize: 13, fontFamily: "var(--font-display)" }}>
        {session.signInTime ? formatTime(session.signInTime) : "—"}
        {" \u2192 "}
        {isOpen ? <span style={{ color: "var(--success)" }}>now</span> : session.signOutTime ? formatTime(session.signOutTime) : "—"}
      </span>
      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-display)" }}>
        {(() => {
          if (!session.signInTime) return "";
          const end = session.signOutTime ? new Date(session.signOutTime).getTime() : now;
          return fmtHM(Math.max(0, (end - new Date(session.signInTime).getTime()) / 60000));
        })()}
      </span>
    </div>
  );
}