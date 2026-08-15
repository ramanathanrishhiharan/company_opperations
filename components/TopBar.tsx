"use client";

import { useEffect, useState } from "react";
import { useSession } from "./SessionContext";

export default function TopBar() {
  const { openSession } = useSession();
  const [now, setNow] = useState<Date | null>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="topbar">
      <span className="topbar-date">
        {now ? (
          <>
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            <span className="topbar-sep">/</span>
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
          </>
        ) : (
          "\u00A0"
        )}
      </span>
      <span className={`clock-pill ${openSession ? "on" : "off"}`}>
        <span className="dot" />
        {openSession ? "On the clock" : "Off the clock"}
      </span>
    </header>
  );
}
