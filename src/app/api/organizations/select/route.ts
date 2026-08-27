import { NextResponse } from "next/server";
import { z } from "zod";
import { ORGANIZATION_COOKIE } from "@/features/organizations/context";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ organization_id: z.uuid(), next: z.string().startsWith("/").default("/") });

export async function POST(request: Request) {
  const form = await request.formData();
  const parsed = schema.safeParse({ organization_id: form.get("organization_id"), next: form.get("next") ?? "/" });
  if (!parsed.success || parsed.data.next.startsWith("//")) return Response.json({ error: "invalid_request" }, { status: 400 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data: membership } = await db.from("organization_members").select("id")
    .eq("user_id", user.id).eq("organization_id", parsed.data.organization_id).maybeSingle();
  if (!membership) return Response.json({ error: "forbidden" }, { status: 403 });
  const response = NextResponse.redirect(new URL(parsed.data.next, request.url), 303);
  response.cookies.set(ORGANIZATION_COOKIE, parsed.data.organization_id, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
