import Airtable from "airtable";

// ---------------------------------------------------------------------------
// CHANGED FROM THE PREVIOUS VERSION: attendance is now multi-session.
//
// The old version assumed one Attendance row per employee per day (find-or-
// create keyed on date), which meant signing out for lunch and back in the
// same afternoon overwrote the morning's session. The reference design's
// "Today's log" and "Attendance history" both clearly show multiple
// in/out pairs on the same day, so each sign-in now always creates a new
// row, and "today's status" is derived from whichever row (if any) has no
// Sign Out Time yet. No Airtable schema change is required — same fields,
// just no longer assuming uniqueness per day.
// ---------------------------------------------------------------------------

let _base: Airtable.Base | null = null;
function base() {
  if (!_base) {
    _base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
      process.env.AIRTABLE_BASE_ID as string,
    );
  }
  return _base;
}

const Employees = () => base()("Employees");
const Attendance = () => base()("Attendance");
const LeaveRequests = () => base()("LeaveRequests");

export type Mode = "Office" | "Remote";

export type Session = {
  id: string;
  date: string; // YYYY-MM-DD
  signInTime: string | null;
  signOutTime: string | null;
  mode: Mode;
};

export type LeaveType = "Annual" | "Sick" | "Personal";
export type LeaveStatus = "Pending" | "Approved" | "Declined";
export type HalfDayPeriod = "AM" | "PM" | null;

export type LeaveRecord = {
  id: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  type: LeaveType;
  reason: string;
  status: LeaveStatus;
  halfDayPeriod: HalfDayPeriod;
};

export type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  defaultMode: Mode;
};
export type TeamMember = {
  id: string;
  name: string;
  role: string;
  mode: Mode | null;
  status: "signed_in" | "signed_out" | "on_leave" | "not_started";
  since: string | null;
  leaveLabel: string | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Counts weekdays inclusive of both ends — matches "5 working days" style
// labels in the reference design rather than raw calendar day counts.
export function countWorkingDays(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export const LEAVE_ALLOWANCE: Record<LeaveType, number> = {
  Annual: 24,
  Sick: 10,
  Personal: 5,
};

export async function findEmployee(email: string): Promise<Employee | null> {
  const records = await Employees()
    .select({
      filterByFormula: `LOWER({Email}) = LOWER("${email}")`,
      maxRecords: 1,
    })
    .firstPage();
  if (records.length === 0) return null;
  const r = records[0];
  return {
    id: r.id,
    name: r.get("Name") as string,
    email: r.get("Email") as string,
    role: (r.get("Role") as string) || "",
    defaultMode:
      ((r.get("Default Mode") as string) === "Home"
        ? "Remote"
        : (r.get("Default Mode") as Mode)) || "Office",
  };
}

function sessionFromRecord(r: Airtable.Record<Airtable.FieldSet>): Session {
  const rawMode = r.get("Mode") as string;
  return {
    id: r.id,
    date: r.get("Date") as string,
    signInTime: (r.get("Sign In Time") as string) || null,
    signOutTime: (r.get("Sign Out Time") as string) || null,
    mode: rawMode === "Home" ? "Remote" : (rawMode as Mode) || "Office",
  };
}

// All of today's sessions for one employee, oldest first — powers "Today's log".
export async function getTodaySessions(employeeId: string): Promise<Session[]> {
  const records = await Attendance()
    .select({
      filterByFormula: `AND({EmployeeId} = "${employeeId}", IS_SAME({Date}, "${todayISO()}", "day"))`,
      sort: [{ field: "Sign In Time", direction: "asc" }],
    })
    .all();
  return records.map(sessionFromRecord);
}

// The currently-open session (signed in, not yet out), if any.
export async function getOpenSession(
  employeeId: string,
): Promise<Session | null> {
  const sessions = await getTodaySessions(employeeId);
  return sessions.find((s) => s.signInTime && !s.signOutTime) ?? null;
}

export async function signIn(employeeId: string, mode: Mode) {
  const now = new Date().toISOString();
  const created = await Attendance().create({
    EmployeeId: employeeId,
    Date: todayISO(),
    "Sign In Time": now,
    Mode: mode,
  });
  return created.id;
}

export async function signOut(recordId: string) {
  const now = new Date().toISOString();
  await Attendance().update(recordId, { "Sign Out Time": now });
}

// Sessions before today, newest first — used for History and the week total.
export async function getPastSessions(
  employeeId: string,
  limit = 60,
): Promise<Session[]> {
  const records = await Attendance()
    .select({
      filterByFormula: `AND({EmployeeId} = "${employeeId}", NOT(IS_SAME({Date}, "${todayISO()}", "day")))`,
      sort: [{ field: "Date", direction: "desc" }],
      maxRecords: limit,
    })
    .all();
  return records.map(sessionFromRecord);
}

export async function getTeamToday(): Promise<TeamMember[]> {
  const today = todayISO();

  const employeeRecords = await Employees().select().all();
  const employees = employeeRecords.map((r) => ({
    id: r.id,
    name: r.get("Name") as string,
    role: (r.get("Role") as string) || "",
  }));

  const attendanceRecords = await Attendance()
    .select({ filterByFormula: `IS_SAME({Date}, "${today}", "day")` })
    .all();
  const sessionsByEmployee = new Map<string, Session[]>();
  attendanceRecords.forEach((r) => {
    const empId = r.get("EmployeeId") as string;
    const list = sessionsByEmployee.get(empId) ?? [];
    list.push(sessionFromRecord(r));
    sessionsByEmployee.set(empId, list);
  });

  const leaveRecords = await LeaveRequests()
    .select({
      filterByFormula: `AND({Status} = "Approved", {Start Date} <= "${today}", {End Date} >= "${today}")`,
    })
    .all();
  const leaveByEmployee = new Map<string, string>();
  leaveRecords.forEach((r) => {
    const empId = r.get("EmployeeId") as string;
    const type = r.get("Type") as string;
    const end = r.get("End Date") as string;
    leaveByEmployee.set(
      empId,
      `${type} leave until ${new Date(end).toLocaleDateString([], { month: "short", day: "numeric" })}`,
    );
  });

  return employees.map((e): TeamMember => {
    const onLeave = leaveByEmployee.get(e.id);
    if (onLeave) {
      return {
        id: e.id,
        name: e.name,
        role: e.role,
        mode: null,
        status: "on_leave",
        since: null,
        leaveLabel: onLeave,
      };
    }
    const sessions = (sessionsByEmployee.get(e.id) ?? []).sort(
      (a, b) =>
        new Date(b.signInTime ?? 0).getTime() -
        new Date(a.signInTime ?? 0).getTime(),
    );
    const open = sessions.find((s) => s.signInTime && !s.signOutTime);
    if (open) {
      return {
        id: e.id,
        name: e.name,
        role: e.role,
        mode: open.mode,
        status: "signed_in",
        since: open.signInTime,
        leaveLabel: null,
      };
    }
    const last = sessions[0];
    if (last) {
      return {
        id: e.id,
        name: e.name,
        role: e.role,
        mode: last.mode,
        status: "signed_out",
        since: last.signOutTime,
        leaveLabel: null,
      };
    }
    return {
      id: e.id,
      name: e.name,
      role: e.role,
      mode: null,
      status: "not_started",
      since: null,
      leaveLabel: null,
    };
  });
}

export async function createLeaveRequest(
  employeeId: string,
  employeeEmail: string,
  startDate: string,
  endDate: string,
  type: LeaveType,
  reason: string,
  halfDayPeriod: HalfDayPeriod = null,
) {
  await LeaveRequests().create({
    EmployeeId: employeeId,
    Email: employeeEmail,
    "Start Date": startDate,
    "End Date": endDate,
    Type: type,
    Reason: reason,
    Status: "Pending",
    "Half Day": halfDayPeriod ? halfDayPeriod : "Full day",
  });
}

export async function getLeaveRequests(
  employeeId: string,
): Promise<LeaveRecord[]> {
  const records = await LeaveRequests()
    .select({
      filterByFormula: `{EmployeeId} = "${employeeId}"`,
      sort: [{ field: "Start Date", direction: "desc" }],
      maxRecords: 20,
    })
    .firstPage();

  return records.map((r) => {
    const startDate = r.get("Start Date") as string;
    const endDate = r.get("End Date") as string;
    const rawHalfDay = r.get("Half Day") as string;
    const halfDayPeriod = (
      rawHalfDay === "AM" || rawHalfDay === "PM" ? rawHalfDay : null
    ) as HalfDayPeriod;
    return {
      id: r.id,
      startDate,
      endDate,
      workingDays: halfDayPeriod ? 0.5 : countWorkingDays(startDate, endDate),
      type: (r.get("Type") as LeaveType) || "Annual",
      reason: (r.get("Reason") as string) || "",
      status: (r.get("Status") as LeaveStatus) || "Pending",
      halfDayPeriod,
    };
  });
}
