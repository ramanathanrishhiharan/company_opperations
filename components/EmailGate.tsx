"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";

export default function EmailGate({ onVerified }: { onVerified: (email: string) => void }) {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);

  async function handleContinue() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/attendance?email=${encodeURIComponent(trimmed)}`);
      if (res.status === 404) {
        toast.error("That email isn't set up yet. Check with your admin.");
        setChecking(false);
        return;
      }
      if (!res.ok) throw new Error("lookup failed");
      onVerified(trimmed);
    } catch {
      toast.error("Couldn't verify that email. Try again.");
      setChecking(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        flex: 1,
        padding: "32px 24px",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          padding: "28px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 19, margin: "0 0 6px", letterSpacing: -0.2 }}>
            Sign in to Attendance
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Enter your work email. This device will remember you after that.
          </p>
        </div>
        <input
          type="email"
          inputMode="email"
          autoFocus
          placeholder="you@company.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleContinue()}
          style={{
            padding: "12px 14px",
            fontSize: 15,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-strong)",
            background: "var(--bg)",
          }}
        />
        <button
          onClick={handleContinue}
          disabled={checking || !value.trim()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 0",
            fontSize: 14,
            fontWeight: 600,
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: checking ? "var(--text-tertiary)" : "var(--primary)",
            color: "white",
            cursor: checking ? "default" : "pointer",
          }}
        >
          {checking && <Loader2 size={15} className="spin" />}
          {checking ? "Checking" : "Continue"}
        </button>
      </div>
      <style>{`
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
