"use client";

import { SessionProvider, useSession } from "./SessionContext";
import EmailGate from "./EmailGate";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";

function Shell({ children }: { children: React.ReactNode }) {
  const { loaded, email, setEmail } = useSession();

  if (!loaded) return null;

  if (!email) {
    return (
      <main className="auth-shell">
        <EmailGate onVerified={setEmail} />
      </main>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <div className="app-content">{children}</div>
      </div>
      <BottomNav />
    </div>
  );
}

export default function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
