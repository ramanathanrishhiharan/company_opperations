import Airtable from "airtable";

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
const Holidays = () => base()("Holidays");
const Breaks = () => base()("Breaks");

export type Mode = "Office" | "Remote";

// The Airtable "Mode" single-select only contains "Office" and "Home".
// Our API key can't create new select options, so we translate at the boundary.
const AIRTABLE_REMOTE_LABEL = "Home";
function toAirtableMode(mode: Mode): string {
  return mode === "Remote" ? AIRTABLE_REMOTE_LABEL : "Office";
}
function fromAirtableMode(raw: string | undefined | null): Mode {
  return raw === AIRTABLE_REMOTE_LABEL || raw === "Remote"
    ? "Remote"
    : "Office";
}

export type Session = {
  id: string;
  date: string; // YYYY-MM-DD
  signInTime: string | null;
  signOutTime: string | null;
  mode: Mode;
};

export type BreakRecord = {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
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

// ---------------------------------------------------------------------------
// Break rules — shared by server (enforcement) and client (display/alerts).
// ---------------------------------------------------------------------------
export const BREAK_RULES = {
  maxBreaks: 2,
  maxPerBreakMin: 30,
  maxTotalMin: 60,
} as const;

export function breakElapsedMin(b: BreakRecord, nowMs: number) {
  const end = b.endTime ? new Date(b.endTime).getTime() : nowMs;
  return Math.max(0, (end - new Date(b.startTime).getTime()) / 60000);
}

export function summarizeBreaks(breaks: BreakRecord[], nowMs: number) {
  const active = breaks.find((b) => !b.endTime) ?? null;
  const finishedMin = breaks
    .filter((b) => b.endTime)
    .reduce((sum, b) => sum + breakElapsedMin(b, nowMs), 0);
  const activeElapsedMin = active ? breakElapsedMin(active, nowMs) : 0;
  const usedMin = finishedMin + activeElapsedMin;
  // Allowance left for the break that is (or would be) running now.
  const remainingBeforeActiveMin = Math.max(
    0,
    BREAK_RULES.maxTotalMin - finishedMin,
  );
  const allowedForActiveMin = Math.min(
    BREAK_RULES.maxPerBreakMin,
    remainingBeforeActiveMin,
  );
  const overrunMin = active
    ? Math.max(0, activeElapsedMin - allowedForActiveMin)
    : 0;
  const countUsed = breaks.length;

  let blockReason: "break_active" | "max_breaks" | "allowance_used" | null =
    null;
  if (active) blockReason = "break_active";
  else if (countUsed >= BREAK_RULES.maxBreaks) blockReason = "max_breaks";
  else if (remainingBeforeActiveMin < 1) blockReason = "allowance_used";

  return {
    active,
    usedMin,
    activeElapsedMin,
    allowedForActiveMin,
    overrunMin,
    countUsed,
    canStart: blockReason === null,
    blockReason,
  };
}

export const BREAK_BLOCK_MESSAGES: Record<string, string> = {
  not_signed_in: "Sign in before starting a break.",
  break_active: "You're already on a break.",
  max_breaks: "You've used both of your breaks today.",
  allowance_used: "Your 1-hour break allowance is used up for today.",
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const TZ = process.env.APP_TIMEZONE || "Asia/Colombo";

// "Today" in the workplace timezone (YYYY-MM-DD). Using UTC here put
// early-morning sign-ins on the previous day.
function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

// Weekdays inclusive of both ends, excluding `holidays`. Uses UTC date math so
// the result never depends on the machine's timezone.
export function countWorkingDays(
  startISO: string,
  endISO: string,
  holidays?: Set<string>,
) {
  const start = new Date(`${startISO.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${endISO.slice(0, 10)}T00:00:00Z`);
  let count = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    if (holidays?.has(d.toISOString().slice(0, 10))) continue;
    count += 1;
  }
  return count;
}

let holidayCache: { dates: Set<string>; expiresAt: number } | null = null;

// A missing/misnamed Holidays table must not take down the leave page.
export async function getHolidaySet(): Promise<Set<string>> {
  if (holidayCache && holidayCache.expiresAt > Date.now())
    return holidayCache.dates;
  try {
    const records = await Holidays().select().all();
    const dates = new Set(
      records
        .map((r) => r.get("Date") as string)
        .filter((d): d is string => Boolean(d)),
    );
    holidayCache = { dates, expiresAt: Date.now() + 5 * 60 * 1000 };
    return dates;
  } catch (err) {
    console.error("getHolidaySet failed — continuing with no holidays:", err);
    return new Set();
  }
}

export const LEAVE_ALLOWANCE: Record<LeaveType, number> = {
  Annual: 24,
  Sick: 10,
  Personal: 5,
};

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export async function findEmployee(email: string): Promise<Employee | null> {
  const records = await Employees()
    .select({
      filterByFormula: `LOWER({Email}) = LOWER("${esc(email)}")`,
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
    defaultMode: fromAirtableMode(r.get("Default Mode") as string),
  };
}

function sessionFromRecord(r: Airtable.Record<Airtable.FieldSet>): Session {
  return {
    id: r.id,
    date: r.get("Date") as string,
    signInTime: (r.get("Sign In Time") as string) || null,
    signOutTime: (r.get("Sign Out Time") as string) || null,
    mode: fromAirtableMode(r.get("Mode") as string),
  };
}

export async function getTodaySessions(employeeId: string): Promise<Session[]> {
  const records = await Attendance()
    .select({
      filterByFormula: `AND({EmployeeId} = "${employeeId}", IS_SAME({Date}, "${todayISO()}", "day"))`,
      sort: [{ field: "Sign In Time", direction: "asc" }],
    })
    .all();
  return records.map(sessionFromRecord);
}

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
    Employee: [employeeId],
    Date: todayISO(),
    "Sign In Time": now,
    Mode: toAirtableMode(mode), // <-- the fix: "Remote" is stored as "Home"
  });
  return created.id;
}

export async function signOut(recordId: string) {
  const now = new Date().toISOString();
  await Attendance().update(recordId, { "Sign Out Time": now });
}

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

// ---------------------------------------------------------------------------
// Breaks
// ---------------------------------------------------------------------------
export class BreaksUnavailableError extends Error {}

// strict = true for anything that enforces rules (break-start): if we can't read
// the breaks, we must NOT assume there are none. Display paths stay lenient.
export async function getTodayBreaks(
  employeeId: string,
  opts: { strict?: boolean } = {},
): Promise<BreakRecord[]> {
  try {
    const records = await Breaks()
      .select({
        filterByFormula: `AND({EmployeeId} = "${employeeId}", IS_SAME({Date}, "${todayISO()}", "day"))`,
        sort: [{ field: "Break Start", direction: "asc" }],
      })
      .all();
    return records.map((r) => ({
      id: r.id,
      date: r.get("Date") as string,
      startTime: r.get("Break Start") as string,
      endTime: (r.get("Break End") as string) || null,
    }));
  } catch (err) {
    console.error(
      "getTodayBreaks failed (is the 'Breaks' table created and the token allowed?):",
      err,
    );
    if (opts.strict)
      throw new BreaksUnavailableError("Breaks table unavailable");
    return [];
  }
}
export async function startBreak(employeeId: string) {
  const created = await Breaks().create({
    EmployeeId: employeeId,
    Employee: [employeeId],
    Date: todayISO(),
    "Break Start": new Date().toISOString(),
  });
  return created.id;
}

export async function endBreak(recordId: string) {
  await Breaks().update(recordId, { "Break End": new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------
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
    Employee: [employeeId],
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
  const [records, holidays] = await Promise.all([
    LeaveRequests()
      .select({
        filterByFormula: `{EmployeeId} = "${employeeId}"`,
        sort: [{ field: "Start Date", direction: "desc" }],
        maxRecords: 20,
      })
      .firstPage(),
    getHolidaySet(),
  ]);

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
      workingDays: halfDayPeriod
        ? 0.5
        : countWorkingDays(startDate, endDate, holidays),
      type: (r.get("Type") as LeaveType) || "Annual",
      reason: (r.get("Reason") as string) || "",
      status: (r.get("Status") as LeaveStatus) || "Pending",
      halfDayPeriod,
    };
  });
}
