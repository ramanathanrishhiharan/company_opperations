import { NextRequest, NextResponse } from "next/server";
import {
  findEmployee,
  getTodaySessions,
  getOpenSession,
  getPastSessions,
  signIn,
  signOut,
} from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

  const employee = await findEmployee(email);
  if (!employee) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [todaySessions, pastSessions] = await Promise.all([
    getTodaySessions(employee.id),
    getPastSessions(employee.id, 60),
  ]);
  const openSession = todaySessions.find((s) => s.signInTime && !s.signOutTime) ?? null;

  return NextResponse.json({ employee, todaySessions, openSession, pastSessions });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, action, mode, recordId } = body as {
    email: string;
    action: "sign-in" | "sign-out";
    mode?: "Office" | "Remote";
    recordId?: string;
  };

  const employee = await findEmployee(email);
  if (!employee) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (action === "sign-in") {
    const openSession = await getOpenSession(employee.id);
    if (openSession) {
      // Already have an open session — don't create a duplicate.
      return NextResponse.json({ recordId: openSession.id });
    }
    const newRecordId = await signIn(employee.id, mode || employee.defaultMode);
    return NextResponse.json({ recordId: newRecordId });
  }

  if (action === "sign-out") {
    if (!recordId) return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
    await signOut(recordId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
