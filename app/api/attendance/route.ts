import { NextRequest, NextResponse } from "next/server";
import {
  findEmployee,
  getTodaySessions,
  getOpenSession,
  getPastSessions,
  getTodayBreaks,
  signIn,
  signOut,
  startBreak,
  endBreak,
  summarizeBreaks,
  BREAK_BLOCK_MESSAGES,
  BreaksUnavailableError,
  Mode,
} from "@/lib/airtable";

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get("email");
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const employee = await findEmployee(email);
    if (!employee) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const [todaySessions, pastSessions, todayBreaks] = await Promise.all([
      getTodaySessions(employee.id),
      getPastSessions(employee.id, 60),
      getTodayBreaks(employee.id),
    ]);
    const openSession = todaySessions.find((s) => s.signInTime && !s.signOutTime) ?? null;

    return NextResponse.json({ employee, todaySessions, openSession, pastSessions, todayBreaks });
  } catch (err) {
    console.error("GET /api/attendance failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let action: string | undefined;
  try {
    const body = await req.json();
    const { email, mode, recordId } = body as {
      email: string;
      mode?: Mode;
      recordId?: string;
    };
    action = body.action as "sign-in" | "sign-out" | "break-start" | "break-end";

    const employee = await findEmployee(email);
    if (!employee) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (action === "sign-in") {
      const openSession = await getOpenSession(employee.id);
      if (openSession) return NextResponse.json({ recordId: openSession.id });
      const safeMode: Mode = mode === "Remote" || mode === "Office" ? mode : employee.defaultMode;
      const newRecordId = await signIn(employee.id, safeMode);
      return NextResponse.json({ recordId: newRecordId });
    }

    if (action === "sign-out") {
      if (!recordId) return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
      // Best-effort: closing a running break must never block signing out.
      try {
        const breaks = await getTodayBreaks(employee.id);
        const activeBreak = breaks.find((b) => !b.endTime);
        if (activeBreak) await endBreak(activeBreak.id);
      } catch (err) {
        console.error("Couldn't auto-close break on sign-out:", err);
      }
      await signOut(recordId);
      return NextResponse.json({ ok: true });
    }

    if (action === "break-start") {
      const open = await getOpenSession(employee.id);
      if (!open) {
        return NextResponse.json(
          { error: "not_signed_in", message: BREAK_BLOCK_MESSAGES.not_signed_in },
          { status: 400 }
        );
      }
      const breaks = await getTodayBreaks(employee.id, { strict: true });
      const summary = summarizeBreaks(breaks, Date.now());
      if (!summary.canStart && summary.blockReason) {
        return NextResponse.json(
          { error: summary.blockReason, message: BREAK_BLOCK_MESSAGES[summary.blockReason] },
          { status: 400 }
        );
      }
      const id = await startBreak(employee.id);
      return NextResponse.json({ recordId: id });
    }

    if (action === "break-end") {
      const breaks = await getTodayBreaks(employee.id, { strict: true });
      const activeBreak = breaks.find((b) => !b.endTime);
      if (activeBreak) await endBreak(activeBreak.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/attendance failed:", err);
    const status = (err as { statusCode?: number }).statusCode;
    const isBreakSetupProblem =
      action?.startsWith("break-") &&
      (err instanceof BreaksUnavailableError || status === 403 || status === 404 || status === 422);
    if (isBreakSetupProblem) {
      return NextResponse.json(
        {
          error: "breaks_unavailable",
          message: "Breaks aren't set up in Airtable yet. Ask your admin to check the 'Breaks' table and token access.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}