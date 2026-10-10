"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useEmployeeEmail } from "@/lib/useEmployee";
import { Mode, Session, BreakRecord, BREAK_RULES, summarizeBreaks } from "@/lib/airtable";

type Employee = { id: string; name: string; email: string; role: string; defaultMode: Mode };

type SessionCtx = {
  email: string | null;
  loaded: boolean;
  employee: Employee | null;
  todaySessions: Session[];
  openSession: Session | null;
  pastSessions: Session[];
  todayBreaks: BreakRecord[];
  activeBreak: BreakRecord | null;
  loadingData: boolean;
  busy: boolean;
  setEmail: (value: string) => void;
  switchAccount: () => void;
  refresh: () => Promise<void>;
  signIn: (mode: Mode) => Promise<void>;
  signOut: () => Promise<void>;
  startBreak: () => Promise<void>;
  endBreak: () => Promise<void>;
};

const SessionContext = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { email, setEmail, clearEmail, loaded } = useEmployeeEmail();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [todaySessions, setTodaySessions] = useState<Session[]>([]);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [todayBreaks, setTodayBreaks] = useState<BreakRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!email) return;
    setLoadingData(true);
    try {
      const res = await fetch(`/api/attendance?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setEmployee(data.employee);
        setTodaySessions(data.todaySessions ?? []);
        setPastSessions(data.pastSessions ?? []);
        setTodayBreaks(data.todayBreaks ?? []);
      }
    } catch {
      toast.error("Couldn't load your data. Check your connection.");
    }
    setLoadingData(false);
  }, [email]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount
    if (email) refresh();
  }, [email, refresh]);

  const openSession = todaySessions.find((s) => s.signInTime && !s.signOutTime) ?? null;
  const activeBreak = todayBreaks.find((b) => !b.endTime) ?? null;

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function signIn(mode: Mode) {
    if (!email) return;
    setBusy(true);
    const { ok } = await post({ action: "sign-in", mode });
    setBusy(false);
    if (!ok) {
      toast.error("Couldn't sign you in. Try again.");
      return;
    }
    await refresh();
  }

  async function signOut() {
    if (!email || !openSession) return;
    setBusy(true);
    const { ok } = await post({ action: "sign-out", recordId: openSession.id });
    setBusy(false);
    if (!ok) {
      toast.error("Couldn't sign you out. Try again.");
      return;
    }
    await refresh();
  }

  async function startBreak() {
    if (!email) return;
    setBusy(true);
    const { ok, data } = await post({ action: "break-start" });
    setBusy(false);
    if (!ok) {
      toast.error(data?.message || "Couldn't start your break. Try again.");
      await refresh();
      return;
    }
    toast.success("Break started. Enjoy!");
    await refresh();
  }

  async function endBreak() {
    if (!email || !activeBreak) return;
    // Capture the numbers before refresh replaces them.
    const before = summarizeBreaks(todayBreaks, Date.now());
    setBusy(true);
    const { ok } = await post({ action: "break-end" });
    setBusy(false);
    if (!ok) {
      toast.error("Couldn't end your break. Try again.");
      return;
    }
    if (before.overrunMin >= 0.5) {
      toast.error(`Break ended — you went ${Math.round(before.overrunMin)} min over your limit.`, { duration: 8000 });
    } else {
      toast.success(`Welcome back! ${Math.round(before.usedMin)} of ${BREAK_RULES.maxTotalMin} break minutes used today.`);
    }
    await refresh();
  }

  function switchAccount() {
    clearEmail();
    setEmployee(null);
    setTodaySessions([]);
    setPastSessions([]);
    setTodayBreaks([]);
  }

  return (
    <SessionContext.Provider
      value={{
        email,
        loaded,
        employee,
        todaySessions,
        openSession,
        pastSessions,
        todayBreaks,
        activeBreak,
        loadingData,
        busy,
        setEmail,
        switchAccount,
        refresh,
        signIn,
        signOut,
        startBreak,
        endBreak,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}