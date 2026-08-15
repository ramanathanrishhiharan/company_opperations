import { NextRequest, NextResponse } from "next/server";
import { findEmployee, createLeaveRequest, getLeaveRequests, LeaveType, HalfDayPeriod } from "@/lib/airtable";

const VALID_TYPES: LeaveType[] = ["Annual", "Sick", "Personal"];

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

  const employee = await findEmployee(email);
  if (!employee) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const requests = await getLeaveRequests(employee.id);
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, startDate, endDate, type, reason, halfDayPeriod } = body as {
    email: string;
    startDate: string;
    endDate: string;
    type: LeaveType;
    reason: string;
    halfDayPeriod?: HalfDayPeriod;
  };

  if (!email || !startDate || !endDate || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "End date is before start date" }, { status: 400 });
  }
  if (halfDayPeriod && startDate !== endDate) {
    return NextResponse.json({ error: "Half-day leave must be a single day" }, { status: 400 });
  }

  const employee = await findEmployee(email);
  if (!employee) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await createLeaveRequest(employee.id, employee.email, startDate, endDate, type, reason || "", halfDayPeriod ?? null);
  return NextResponse.json({ ok: true });
}
