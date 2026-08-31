"use client";

import { useCallback, useState, Suspense } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";

function DaftarForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/mulai";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const supabase = createSupabaseBrowserClient();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const handleGoogle = useCallback(async () => {
    setLoading("google");
    setMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    if (error) setMessage({ tone: "error", text: error.message });
    setLoading(null);
  }, [supabase, callbackUrl]);

  const handleEmail = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !email.includes("@")) {
        setMessage({ tone: "error", text: "Masukkan alamat email yang valid." });
        return;
      }
      setLoading("email");
      setMessage(null);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl },
      });
      if (error) {
        setMessage({ tone: "error", text: error.message });
      } else {
        setMessage({
          tone: "success",
          text: `Kode/tautan sudah dikirim ke ${email}. Periksa inbox (dan folder spam) untuk menyelesaikan pendaftaran.`,
        });
      }
      setLoading(null);
    },
    [email, supabase, callbackUrl]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Buat akun Faza Studio</h1>
          <p className="text-sm text-muted-foreground">Gratis. Simpan & lanjutkan hasil kontenmu.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daftar</CardTitle>
            <CardDescription>Pilih cara untuk mulai.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full"
              size="lg"
              onClick={handleGoogle}
              disabled={!!loading}
            >
              {loading === "google" ? "Menghubungkan…" : "Lanjutkan dengan Google"}
            </Button>

            <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              atau
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleEmail} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              />
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={!!loading}
              >
                {loading === "email" ? "Mengirim…" : "Daftar dengan Email"}
              </Button>
            </form>

            {message && (
              <p
                className={`text-sm ${
                  message.tone === "error" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {message.text}
              </p>
            )}

            <p className="text-center text-sm text-muted-foreground">
              Sudah punya akun?{" "}
              <Link href={`/masuk`} className="font-medium text-primary underline underline-offset-2">
                Masuk
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DaftarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
          Memuat…
        </div>
      }
    >
      <DaftarForm />
    </Suspense>
  );
}