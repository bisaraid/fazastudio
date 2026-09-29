import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_auth";
import { recordAdminMetricsDay } from "@/lib/admin-snapshot";
import { recordAudit } from "@/lib/admin-audit";

/**
 * POST /api/admin/trends/trigger — Trigger harvest manual.
 * Client tidak boleh tahu CRON_SECRET, jadi server yang menambahkan header
 * Authorization: Bearer CRON_SECRET lalu memanggil /api/cron/trends (GET).
 */
export async function POST(request: NextRequest) {
  const { user, response: unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET belum diset di server" },
      { status: 500 }
    );
  }

  try {
    const url = new URL("/api/cron/trends", request.nextUrl.origin);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = await res.json().catch(() => ({}));
      if (res.ok) {
        try {
          await recordAdminMetricsDay();
        } catch (e) {
          console.warn(
            "[admin-trends-trigger] snapshot gagal:",
            e instanceof Error ? e.message : e
          );
        }
        if (user?.id) {
          await recordAudit({
            actorUserId: user.id,
            action: "trigger_trends",
            payload: { status: res.status },
          });
        }
      }
      return NextResponse.json(json, { status: res.status });
  } catch (e) {
    console.warn("[admin-trends-trigger] gagal:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { success: false, error: "Gagal memicu harvest" },
      { status: 500 }
    );
  }
}