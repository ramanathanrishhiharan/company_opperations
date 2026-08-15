import { NextResponse } from "next/server";
import { getTeamToday } from "@/lib/airtable";

export async function GET() {
  const team = await getTeamToday();
  return NextResponse.json({ team });
}
