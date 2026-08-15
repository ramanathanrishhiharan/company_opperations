"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, Users, CalendarDays, History } from "lucide-react";

const NAV = [
  { href: "/", label: "Today", Icon: CalendarClock },
  { href: "/team", label: "Team", Icon: Users },
  { href: "/leave", label: "Leave", Icon: CalendarDays },
  { href: "/history", label: "History", Icon: History },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`bottom-nav-link${active ? " active" : ""}`}>
              <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
