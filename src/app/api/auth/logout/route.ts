import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ORGANIZATION_COOKIE } from "@/features/organizations/context";

export async function POST(request: Request) {
  const db = await createClient();
  await db.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete(ORGANIZATION_COOKIE);
  return response;
}
