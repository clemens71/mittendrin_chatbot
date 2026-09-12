import { NextResponse } from "next/server";
import { getAllowedTags } from "@/lib/server/tags";
import { corsPreflight, withCors } from "@/lib/server/cors";

export const runtime = "nodejs";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET() {
  const tags = await getAllowedTags();
  return withCors(NextResponse.json({ tags }));
}
