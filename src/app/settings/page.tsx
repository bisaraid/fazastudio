"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Check, Zap, Users, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { PLANS } from "@/lib/constants";
import type { PlanTier } from "@/lib/usage";

export default function SettingsPage() {
  const router = useRouter();
  const [usage, setUsage] = useState<{ plan: PlanTier; creditsTotal: number; creditsUsed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [payMessage, setPayMessage] = useState<string | null>(null);
  // FIX 3 — jenis pesan menentukan warna (success hijau / warn amber).
  const [payMessageTone, setPayMessageTone] = useState<"success" | "warn">("success");

  // Fetch usage real dari /api/usage (based on client IP / identity)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage")
      .then((res) => (res.ok ? res.json() : Promise.resolve({ success: false, data: null })))
      .then((data) => {
        if (!cancelled && data?.success && data?.data) {
          setUsage(data.data);
        }
      })
      .catch(() => {
        // Silently fallback to free/default on error
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Muat Snap.js Midtrans (popup pembayaran)
  useEffect(() => {
    const isProd = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";
    const src = isProd
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";

    const script = document.createElement("script");
    script.src = src;
    script.setAttribute("data-client-key", process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "");
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const currentPlan: PlanTier = usage?.plan || "free";
  const currentPlanLabel =
    currentPlan === "free" ? "Paket Gratis" : currentPlan === "pro" ? "Paket Pro" : "Paket Tim";
  const creditsUsed = usage?.creditsUsed ?? 0;
  const creditsTotal = usage?.creditsTotal ?? 5;

  // Setelah pembayaran sukses: polling /api/usage hingga plan berubah, lalu tampilkan pesan sukses
  const handlePaymentSuccess = (planId: string) => {
    let resolved = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/usage");
        const data = await res.json();
        const newPlan = data?.data?.plan;
        if (newPlan === planId) {
          clearInterval(interval);
          resolved = true;
          setUsage(data.data);
          setPayMessageTone("success");
          setPayMessage(
            planId === "pro"
              ? "Pembayaran berhasil! Paket Pro kini aktif."
              : "Pembayaran berhasil! Paket Tim kini aktif."
          );
        }
      } catch {
        // abaikan, coba lagi
      }
    }, 3000);

    // Pengaman: hentikan polling setelah 30 detik
    // FIX 3 — jika masih belum terkonfirmasi, beri tahu user dengan pesan ramah.
    setTimeout(() => {
      clearInterval(interval);
      if (!resolved) {
        setPayMessageTone("warn");
        setPayMessage(
          "Pembayaran belum terkonfirmasi. Jika sudah bayar, tunggu beberapa menit lalu refresh halaman."
        );
      }
    }, 30000);
  };

  // Buka popup Midtrans Snap untuk plan terpilih (tanpa redirect ke halaman baru)
  const handleUpgrade = async (planId: string) => {
    try {
      const res = await fetch(`/api/checkout?plan=${encodeURIComponent(planId)}`);
      const data = await res.json();
      if (!res.ok || !data?.token) {
        alert(data?.error || "Gagal membuat pembayaran. Coba lagi.");
        return;
      }

      const snap = (window as any).snap;
      if (!snap) {
        alert("Popup pembayaran belum siap. Muat ulang halaman lalu coba lagi.");
        return;
      }

      setPayMessage(null);
      setPayMessageTone("success");
      snap.pay(data.token, {
        onSuccess: () => handlePaymentSuccess(planId),
        onPending: () => {
          setPayMessageTone("warn");
          setPayMessage("Pembayaran sedang diproses. Kami akan mengaktifkan plan kamu otomatis.");
        },
        onError: () => alert("Pembayaran gagal. Silakan coba lagi."),
        onClose: () => {
          setPayMessageTone("warn");
          setPayMessage("Pembayaran dibatalkan.");
        },
      });
    } catch {
      alert("Gagal membuat pembayaran. Coba lagi.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 lg:px-8 max-w-5xl">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pengaturan & Billing</h1>
            <p className="text-muted-foreground">Kelola akun dan langganan kamu</p>
          </div>
        </div>

        {/* Usage Indicator (REAL data dari /api/usage) */}
        {payMessage && (
          <div
            className={`mb-8 border rounded-lg p-4 text-sm ${
              payMessageTone === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            {payMessage}
          </div>
        )}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Penggunaan Bulan Ini</CardTitle>
            <CardDescription>
              {loading ? "Memuat usage..." : `${currentPlanLabel} — Sisa kredit: ${Math.max(0, creditsTotal - creditsUsed)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span>Kredit Generate</span>
              <span className="font-medium">
                {creditsUsed} / {creditsTotal} digunakan
              </span>
            </div>
            <Progress value={creditsTotal > 0 ? (creditsUsed / creditsTotal) * 100 : 0} className="h-2" />
            {!loading && creditsUsed >= creditsTotal && (
              <p className="text-xs text-destructive">
                Kredit kamu habis! Upgrade untuk melanjutkan.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pricing Plans */}
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const Icon = plan.id === "free" ? Sparkles : plan.id === "pro" ? Zap : Users;
            const planLabel = plan.label_id || plan.name;

            return (
              <Card
                key={plan.id}
                className={`relative ${
                  plan.highlighted
                    ? "border-primary shadow-lg shadow-primary/10"
                    : ""
                } ${isCurrent ? "ring-2 ring-primary" : ""}`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Paling Populer</Badge>
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-5 w-5 ${plan.highlighted ? "text-primary" : "text-muted-foreground"}`} />
                    <CardTitle className="text-lg">{planLabel}</CardTitle>
                  </div>
                  <div className="flex items-baseline gap-1">
                    {plan.price === 0 ? (
                      <span className="text-3xl font-bold">Gratis</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">Rp {plan.price.toLocaleString("id-ID")}</span>
                        <span className="text-muted-foreground">/bulan</span>
                      </>
                    )}
                  </div>
                  <CardDescription>{plan.creditsPerMonth} kredit/bulan</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                    disabled={isCurrent}
                    onClick={() => !isCurrent && plan.price > 0 && handleUpgrade(plan.id)}
                  >
                    {isCurrent ? "Aktif" : plan.price === 0 ? "Mulai Gratis" : "Berlangganan"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}