import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { getUsage } from "@/lib/usage";
import { getServerIdentity, deviceCookieOptions, DEVICE_ID_COOKIE } from "@/lib/identity";

/**
 * GET /api/usage
 *
 * Return usage credit/plan real untuk identity caller (stable device cookie).
 * - Auth via validateApiKey
 * - identity diambil dari cookie `device_id` (anon:<uuid>), bukan IP.
 *
 * Response: { success: true, data: { plan, creditsTotal, creditsUsed, creditsRemaining } }
 */
export async function GET(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const identity = getServerIdentity(request);
    const usage = await getUsage(identity.identityKey);

    const res = NextResponse.json({ success: true, data: usage });
    if (identity.isNew) {
      res.cookies.set(DEVICE_ID_COOKIE, identity.deviceId, deviceCookieOptions());
    }
    return res;
  } catch (error) {
    console.error("[usage] GET error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}