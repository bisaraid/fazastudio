"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, CreditCard, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type PlanTierClient = "starter" | "pro";

interface HistoryEntry {
  email: string;
  plan: PlanTierClient;
  note: string;
  at: string;
}

const STORAGE_KEY = "faza_admin_manual_activations";

export default function TransaksiPage() {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<PlanTierClient>("starter");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw) as HistoryEntry[]);
    } catch {
      /* abaikan */
    }
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setStatus({ ok: false, message: "Email wajib diisi." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/set-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), plan }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setStatus({ ok: false, message: json.error || "Aktivasi gagal." });
        return;
      }
      const entry: HistoryEntry = {
        email: email.trim(),
        plan,
        note: note.trim(),
        at: new Date().toISOString(),
      };
      const updated = [entry, ...history];
      setHistory(updated);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        /* abaikan */
      }
      setStatus({
        ok: true,
        message: `Plan ${plan} berhasil diaktifkan untuk ${email.trim()}.`,
      });
      setEmail("");
      setNote("");
    } catch (err) {
      setStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Terjadi kesalahan jaringan",
      });
    } finally {
      setSaving(false);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* abaikan */
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Transaksi</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Aktivasi plan secara manual (mis. pembayaran transfer/offline) untuk user
        terdaftar.
      </p>

      <form
        onSubmit={submit}
        className="mt-6 max-w-md space-y-4 rounded-xl border bg-card p-5"
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-email">
            Email user
          </label>
          <Input
            id="tx-email"
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-plan">
            Plan
          </label>
          <Select
            id="tx-plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value as PlanTierClient)}
          >
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
          </Select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="tx-note">
            Catatan (opsional)
          </label>
          <Input
            id="tx-note"
            placeholder="Mis. transfer bank, promo, dsb."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {status && (
          <p
            className={
              "rounded-lg border px-3 py-2 text-sm " +
              (status.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/30 bg-destructive/10 text-destructive")
            }
          >
            {status.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Aktifkan Plan
        </Button>
      </form>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Riwayat Aktivasi Manual
          </h2>
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearHistory}>
              <Trash2 className="mr-1 h-4 w-4" />
              Bersihkan
            </Button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border bg-card px-4 py-12 text-center">
            <CreditCard className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Belum ada aktivasi manual. Riwayat tersimpan di browser ini.
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border bg-card">
            {history.map((h, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{h.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.at).toLocaleString("id-ID")}
                    {h.note ? ` · ${h.note}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-semibold capitalize">
                  {h.plan}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}