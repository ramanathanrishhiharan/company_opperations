"use client";

import { useEffect, useState } from "react";
import { Home as HomeIcon, Building2 } from "lucide-react";
import { TeamMember } from "@/lib/airtable";

type Filter = "all" | "signed_in" | "signed_out" | "on_leave";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "signed_in", label: "Signed in" },
  { key: "signed_out", label: "Signed out" },
  { key: "on_leave", label: "On leave" },
];

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d) => setTeam(d.team));
  }, []);

  const signedIn = (team ?? []).filter((m) => m.status === "signed_in");
  const remote = signedIn.filter((m) => m.mode === "Remote");
  const onLeave = (team ?? []).filter((m) => m.status === "on_leave");

  const visible = (team ?? []).filter((m) => filter === "all" || m.status === filter);

  return (
    <div>
      <p className="page-eyebrow">Team presence</p>
      <h1 className="page-title">Who&rsquo;s in today</h1>
      <p className="page-subtitle">
        {team === null
          ? "Loading…"
          : `${signedIn.length} of ${team.length} people are signed in — ${remote.length} working remotely, ${onLeave.length} on leave.`}
      </p>

      <div className="tab-group" style={{ marginTop: 20, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} className={filter === t.key ? "active" : ""} onClick={() => setFilter(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card row-list">
        {team === null && (
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 40 }} />
            ))}
          </div>
        )}
        {team !== null && visible.length === 0 && (
          <div className="row-item" style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
            No one matches this filter.
          </div>
        )}
        {visible.map((m) => (
          <MemberRow key={m.id} member={m} />
        ))}
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: TeamMember }) {
  const initial = member.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="row-item">
      <span className="avatar">{initial}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{member.name}</p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>{member.role}</p>
      </div>

      {member.mode && (
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-secondary)" }}>
          {member.mode === "Remote" ? <HomeIcon size={13} /> : <Building2 size={13} />}
          {member.mode}
        </span>
      )}

      <div style={{ textAlign: "right", minWidth: 130 }}>
        {member.status === "signed_in" && (
          <>
            <span className="pill pill-success">
              <span className="dot" style={{ background: "currentColor" }} /> Signed in
            </span>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-tertiary)" }}>
              since {member.since ? formatTime(member.since) : "—"}
            </p>
          </>
        )}
        {member.status === "signed_out" && (
          <>
            <span className="pill pill-neutral">
              <span className="dot dot-neutral" /> Signed out
            </span>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-tertiary)" }}>
              {member.since ? `Signed out ${formatTime(member.since)}` : ""}
            </p>
          </>
        )}
        {member.status === "on_leave" && (
          <>
            <span className="pill pill-warning">
              <span className="dot" style={{ background: "currentColor" }} /> On leave
            </span>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-tertiary)" }}>{member.leaveLabel}</p>
          </>
        )}
        {member.status === "not_started" && <span className="pill pill-neutral">Not signed in</span>}
      </div>
    </div>
  );
}
