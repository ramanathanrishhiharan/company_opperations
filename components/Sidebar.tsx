"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarClock, Users, CalendarDays, History } from "lucide-react";
import { useSession } from "./SessionContext";

const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME || "Your Company";

const NAV = [
  { href: "/", label: "Today", Icon: CalendarClock },
  { href: "/team", label: "Team", Icon: Users },
  { href: "/leave", label: "Leave", Icon: CalendarDays },
  { href: "/history", label: "History", Icon: History },
];

function minutesToLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

// Sums today's sessions (there can be more than one — lunch breaks etc.),
// counting the still-open one up to right now.
function useTodayMinutes(sessions: { signInTime: string | null; signOutTime: string | null }[]) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  return sessions.reduce((total, s) => {
    if (!s.signInTime) return total;
    const start = new Date(s.signInTime).getTime();
    const end = s.signOutTime ? new Date(s.signOutTime).getTime() : now;
    return total + Math.max(0, (end - start) / 60000);
  }, 0);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { employee, todaySessions, openSession, switchAccount } = useSession();
  const todayMinutes = useTodayMinutes(todaySessions);
  const initial = employee?.name?.trim().charAt(0).toUpperCase() || "?";

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-brand">
          <span className="brand-mark">P</span>
          <div>
            <p className="brand-name">Presence</p>
            <p className="brand-sub">{ORG_NAME}</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} className={`sidebar-link${active ? " active" : ""}`}>
                <Icon size={16} strokeWidth={active ? 2.3 : 1.9} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-footer">
        {openSession && (
          <div className="session-widget">
            <span className="dot dot-success dot-pulse" style={{ marginTop: 4 }} />
            <div>
              <p className="session-label">SIGNED IN</p>
              <p className="session-time">
                {minutesToLabel(todayMinutes)} <span>today</span>
              </p>
            </div>
          </div>
        )}

        <button className="profile-row" onClick={switchAccount} title="Switch account">
          <span className="avatar">{initial}</span>
          <span>
            <p className="profile-name">{employee?.name ?? "…"}</p>
            <p className="profile-role">{employee?.role || "—"}</p>
          </span>
        </button>
      </div>
    </aside>
  );
}
