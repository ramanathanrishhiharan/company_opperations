"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, X } from "lucide-react";
import { useSession } from "@/components/SessionContext";
import { LeaveRecord, LeaveType, LEAVE_ALLOWANCE, HalfDayPeriod } from "@/lib/airtable";

const LEAVE_TYPES: LeaveType[] = ["Annual", "Sick", "Personal"];

const STATUS_META: Record<LeaveRecord["status"], { className: string }> = {
  Pending: { className: "pill-warning" },
  Approved: { className: "pill-success" },
  Declined: { className: "pill-neutral" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function LeavePage() {
  const { employee } = useSession();
  const [requests, setRequests] = useState<LeaveRecord[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<LeaveType>("Annual");
  const [reason, setReason] = useState("");
  const [halfDayPeriod, setHalfDayPeriod] = useState<HalfDayPeriod>(null);

  const isSingleDay = Boolean(startDate) && startDate === endDate;

  // Half-day only makes sense for a single-day request — if the person
  // widens the range after turning it on, silently drop it rather than
  // submitting a half-day leave that spans multiple days.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset invalid derived state when date range changes
    if (!isSingleDay && halfDayPeriod) setHalfDayPeriod(null);
  }, [isSingleDay, halfDayPeriod]);

  function loadRequests() {
    if (!employee?.email) return;
    fetch(`/api/leave?email=${encodeURIComponent(employee.email)}`)
      .then((r) => r.json())
      .then((d) => setRequests(d.requests));
  }

  useEffect(loadRequests, [employee?.email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee?.email || !startDate || !endDate) {
      toast.error("Pick a start and end date.");
      return;
    }
    if (endDate < startDate) {
      toast.error("End date is before the start date.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: employee.email, startDate, endDate, type, reason, halfDayPeriod }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("Couldn't submit. Try again.");
      return;
    }
    toast.success("Request sent for approval");
    setStartDate("");
    setEndDate("");
    setReason("");
    setHalfDayPeriod(null);
    setShowForm(false);
    loadRequests();
  }

  const pendingCount = (requests ?? []).filter((r) => r.status === "Pending").length;

  const balances = LEAVE_TYPES.map((t) => {
    const used = (requests ?? [])
      .filter((r) => r.type === t && r.status !== "Declined")
      .reduce((sum, r) => sum + r.workingDays, 0);
    const allowance = LEAVE_ALLOWANCE[t];
    return { type: t, left: Math.max(0, allowance - used), allowance };
  });

  return (
    <div>
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Time off</p>
          <h1 className="page-title">Leave</h1>
          <p className="page-subtitle">
            {requests === null
              ? "\u00A0"
              : pendingCount > 0
              ? `${pendingCount} request${pendingCount === 1 ? "" : "s"} awaiting approval from your manager.`
              : "All caught up — no requests waiting on approval."}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "Request leave"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 150 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Start date</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={inputStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 150 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>End date</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required style={inputStyle} />
            </label>
          </div>

          {isSingleDay && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={Boolean(halfDayPeriod)}
                  onChange={(e) => setHalfDayPeriod(e.target.checked ? "AM" : null)}
                />
                Half day
              </label>
              {halfDayPeriod && (
                <div className="segmented" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                  {(["AM", "PM"] as const).map((p) => (
                    <button
                      type="button"
                      key={p}
                      className={halfDayPeriod === p ? "active" : ""}
                      onClick={() => setHalfDayPeriod(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Type</span>
            <div style={{ display: "flex", gap: 8 }}>
              {LEAVE_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    borderRadius: "var(--radius-sm)",
                    border: t === type ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    background: t === type ? "var(--accent-soft)" : "var(--surface)",
                    color: t === type ? "var(--accent)" : "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Reason (optional)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} />
          </label>

          <div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Sending…" : "Submit request"}
            </button>
          </div>
        </form>
      )}

      <div className="stat-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {balances.map((b) => (
          <div key={b.type} className="card mini-card">
            <p className="mini-card-label">{b.type}</p>
            <p className="mini-card-value">
              {b.left}{" "}
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                / {b.allowance} days left
              </span>
            </p>
            <div className="progress-track" style={{ marginTop: 8 }}>
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, (b.left / b.allowance) * 100)}%`, background: "var(--text-primary)" }}
              />
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>Your requests</h2>
      <div className="card row-list">
        {requests === null && (
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {[0, 1].map((i) => (
              <div key={i} className="skeleton" style={{ height: 40 }} />
            ))}
          </div>
        )}
        {requests !== null && requests.length === 0 && (
          <div className="row-item" style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
            No requests yet.
          </div>
        )}
        {requests?.map((r) => (
          <div key={r.id} className="row-item">
            <div style={{ minWidth: 130 }}>
              <p style={{ margin: 0, fontSize: 13, fontFamily: "var(--font-display)" }}>
                {formatDate(r.startDate)}
                {r.startDate !== r.endDate ? ` – ${formatDate(r.endDate)}` : ""}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-tertiary)" }}>
                {r.halfDayPeriod
                  ? `Half day (${r.halfDayPeriod})`
                  : `${r.workingDays} working day${r.workingDays === 1 ? "" : "s"}`}
              </p>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{r.type} leave</p>
              {r.reason && (
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.reason}
                </p>
              )}
            </div>
            <span className={`pill ${STATUS_META[r.status].className}`}>{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  fontFamily: "inherit",
};
