"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useEmployeeEmail } from "@/lib/useEmployee";
import { Mode, Session } from "@/lib/airtable";

type Employee = { id: string; name: string; email: string; role: string; defaultMode: Mode };

type SessionCtx = {
  email: string | null;
  loaded: boolean;
  employee: Employee | null;
  todaySessions: Session[];
  openSession: Session | null;
  pastSessions: Session[];
  loadingData: boolean;
  busy: boolean;
  setEmail: (value: string) => void;
  switchAccount: () => void;
  refresh: () => Promise<void>;
  signIn: (mode: Mode) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { email, setEmail, clearEmail, loaded } = useEmployeeEmail();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [todaySessions, setTodaySessions] = useState<Session[]>([]);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!email) return;
    setLoadingData(true);
    const res = await fetch(`/api/attendance?email=${encodeURIComponent(email)}`);
    if (res.ok) {
      const data = await res.json();
      setEmployee(data.employee);
      setTodaySessions(data.todaySessions ?? []);
      setPastSessions(data.pastSessions ?? []);
    }
    setLoadingData(false);
  }, [email]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount
    if (email) refresh();
  }, [email, refresh]);

  const openSession = todaySessions.find((s) => s.signInTime && !s.signOutTime) ?? null;

  async function signIn(mode: Mode) {
    if (!email) return;
    setBusy(true);
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, action: "sign-in", mode }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Couldn't sign you in. Try again.");
      return;
    }
    await refresh();
  }

  async function signOut() {
    if (!email || !openSession) return;
    setBusy(true);
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, action: "sign-out", recordId: openSession.id }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Couldn't sign you out. Try again.");
      return;
    }
    await refresh();
  }

  function switchAccount() {
    clearEmail();
    setEmployee(null);
    setTodaySessions([]);
    setPastSessions([]);
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
        loadingData,
        busy,
        setEmail,
        switchAccount,
        refresh,
        signIn,
        signOut,
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
