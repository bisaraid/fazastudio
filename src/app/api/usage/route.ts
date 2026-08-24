import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { getClientIp } from "@/lib/rate-limit";
import { getUsage } from "@/lib/usage";

/**
 * GET /api/usage
 *
 * Return usage credit/plan real untuk identity caller (based on IP for MVP).
 * - Auth via validateApiKey
 * - identity_key = `anon:<ip>` (konsisten dengan identityKey generation routes)
 *
 * Response: { success: true, data: { plan, creditsTotal, creditsUsed, creditsRemaining } }
 */
export async function GET(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const ip = getClientIp(request);
    const identityKey = `anon:${ip}`;
    const usage = await getUsage(identityKey);

    return NextResponse.json({ success: true, data: usage });
  } catch (error) {
    console.error("[usage] GET error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}