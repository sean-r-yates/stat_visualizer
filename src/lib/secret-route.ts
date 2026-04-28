import { NextResponse } from "next/server";

import { isSecretSlugMatch } from "@/lib/env";

export function ensureSecretRoute(secret: string): NextResponse | null {
  if (isSecretSlugMatch(secret)) {
    return null;
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
