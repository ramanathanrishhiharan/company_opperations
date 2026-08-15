"use client";

import { useEffect, useState } from "react";
import { Home as HomeIcon, Building2 } from "lucide-react";
import { useSession } from "@/components/SessionContext";
import { Session } from "@/lib/airtable";

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function durationLabel(session: Session, now: number) {
  if (!session.signInTime) return "—";
  const end = session.signOutTime ? new Date(session.signOutTime).getTime() : now;
  const min = Math.max(0, (end - new Date(session.signInTime).getTime()) / 60000);
  return `${Math.floor(min / 60)}h ${Math.round(min % 60).toString().padStart(2, "0")}m`;
}

export default function HistoryPage() {
  const { todaySessions, pastSessions, loadingData } = useSession();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const all = [...todaySessions, ...pastSessions].sort((a, b) => {
    const aTime = a.signInTime ? new Date(a.signInTime).getTime() : 0;
    const bTime = b.signInTime ? new Date(b.signInTime).getTime() : 0;
    return bTime - aTime;
  });

  const periodTotalMin = all.reduce((sum, s) => {
    if (!s.signInTime) return sum;
    const end = s.signOutTime ? new Date(s.signOutTime).getTime() : now;
    return sum + Math.max(0, (end - new Date(s.signInTime).getTime()) / 60000);
  }, 0);

  return (
    <div>
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Timesheet</p>
          <h1 className="page-title">Attendance history</h1>
          <p className="page-subtitle">Every sign in and sign out on record, newest first. Export before the payroll cut-off on the 25th.</p>
        </div>
        <div className="card mini-card" style={{ minWidth: 160 }}>
          <p className="mini-card-label">Period total</p>
          <p className="mini-card-value">
            {Math.floor(periodTotalMin / 60)}h {Math.round(periodTotalMin % 60).toString().padStart(2, "0")}m
          </p>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden", marginTop: 8 }}>
        {loadingData && all.length === 0 ? (
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 20 }} />
            ))}
          </div>
        ) : all.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: "var(--text-tertiary)" }}>No attendance recorded yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Location</th>
                  <th style={{ textAlign: "right" }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {all.map((s) => {
                  const isOpen = Boolean(s.signInTime && !s.signOutTime);
                  return (
                    <tr key={s.id}>
                      <td>{formatDay(s.date)}</td>
                      <td className="mono">{s.signInTime ? formatTime(s.signInTime) : "—"}</td>
                      <td className="mono" style={{ color: isOpen ? "var(--success)" : undefined }}>
                        {isOpen ? "active" : s.signOutTime ? formatTime(s.signOutTime) : "—"}
                      </td>
                      <td>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
                          {s.mode === "Remote" ? <HomeIcon size={13} /> : <Building2 size={13} />}
                          {s.mode}
                        </span>
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {durationLabel(s, now)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
