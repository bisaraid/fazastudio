"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Users as UsersIcon, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";

type PlanTierClient = "free" | "starter" | "pro";

interface AdminUser {
  userId: string;
  email: string;
  plan: PlanTierClient;
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
  createdAt: string;
  isAdmin: boolean;
}

const PLAN_OPTIONS: PlanTierClient[] = ["free", "starter", "pro"];

function PlanBadge({ plan }: { plan: PlanTierClient }) {
  const styles: Record<PlanTierClient, string> = {
    free: "bg-muted text-muted-foreground",
    starter: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    pro: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold",
        styles[plan]
      )}
    >
      {plan === "free" ? "Free" : plan === "starter" ? "Starter" : "Pro"}
    </span>
  );
}

function Avatar({ email }: { email: string }) {
  const initial = (email.trim().charAt(0) || "?").toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold">
      {initial}
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

interface UserRowProps {
  user: AdminUser;
  onApply: (user: AdminUser, plan: PlanTierClient) => void;
  isSuperAdmin: boolean;
  isSelf: boolean;
  onSetAdmin: (user: AdminUser, isAdmin: boolean) => void;
}

function UserRow({ user, onApply, isSuperAdmin, isSelf, onSetAdmin }: UserRowProps) {
  const [selected, setSelected] = useState<PlanTierClient>(user.plan);
  const lowCredit = user.creditsRemaining < 3;

  return (
    <tr className="border-b border-border transition-colors duration-200 last:border-b-0 hover:bg-muted/30">
      <td className="px-4 py-3">
        <Avatar email={user.email} />
      </td>
      <td className="px-4 py-3 text-sm">{user.email}</td>
      <td className="px-4 py-3">
        <PlanBadge plan={user.plan} />
      </td>
      <td
        className={cn(
          "px-4 py-3 text-sm tabular-nums",
          lowCredit ? "font-semibold text-red-600 dark:text-red-400" : ""
        )}
      >
        {user.creditsRemaining}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(user.createdAt)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Select
            value={selected}
            onChange={(e) => setSelected(e.target.value as PlanTierClient)}
            className="h-8 w-[110px] text-xs"
          >
            {PLAN_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={selected === user.plan}
            onClick={() => onApply(user, selected)}
          >
            Ubah Plan
          </Button>
        </div>
      </td>
      <td className="px-4 py-3">
        {isSuperAdmin ? (
          <div className="flex flex-col items-start gap-1.5">
            {user.isAdmin && (
              <span className="inline-flex items-center rounded-md border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
                Admin
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={isSelf && user.isAdmin}
              title={isSelf && user.isAdmin ? "Tidak bisa cabut akses sendiri" : undefined}
              onClick={() => onSetAdmin(user, !user.isAdmin)}
            >
              {user.isAdmin ? "Cabut Admin" : "Jadikan Admin"}
            </Button>
          </div>
        ) : (
          user.isAdmin && (
            <span className="inline-flex items-center rounded-md border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
                Admin
            </span>
          )
        )}
      </td>
    </tr>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<{ user: AdminUser; plan: PlanTierClient } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [adminPending, setAdminPending] = useState<{
    user: AdminUser;
    isAdmin: boolean;
  } | null>(null);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminNotice, setAdminNotice] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || `HTTP ${res.status}`);
        setUsers([]);
        return;
      }
      setUsers(json.data as AdminUser[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan jaringan");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Deteksi super admin (email di ADMIN_EMAILS) untuk kolom Admin.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/check");
        const json = await res.json();
        if (res.ok && json?.success) {
          setIsSuperAdmin(Boolean(json.isSuperAdmin));
          setCurrentUserId(json.userId ?? null);
        }
      } catch {
        /* abaikan */
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, search]);

  const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const confirmSetPlan = async () => {
    if (!pending) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/set-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pending.user.userId, plan: pending.plan }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setNotice(json.error || "Gagal mengubah plan");
      } else {
        setNotice(`Plan ${pending.user.email} diubah ke ${titleCase(pending.plan)}.`);
        setPending(null);
        void loadUsers();
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Terjadi kesalahan jaringan");
    } finally {
      setSaving(false);
    }
  };

  const confirmSetAdmin = async () => {
    if (!adminPending) return;
    setSavingAdmin(true);
    setAdminNotice(null);
    try {
      const res = await fetch("/api/admin/set-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: adminPending.user.userId,
          isAdmin: adminPending.isAdmin,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setAdminNotice(json.error || "Gagal mengubah status admin");
      } else {
        setAdminPending(null);
        void loadUsers();
      }
    } catch (e) {
      setAdminNotice(e instanceof Error ? e.message : "Terjadi kesalahan jaringan");
    } finally {
      setSavingAdmin(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Manajemen User</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Kelola plan dan pantau kredit user terdaftar.
      </p>

      <div className="relative mt-6 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cari berdasarkan email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {notice && (
        <p className="mt-4 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm">
          {notice}
        </p>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Avatar</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Kredit Sisa</th>
                <th className="px-4 py-3 font-medium">Bergabung</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
                <th className="px-4 py-3 font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-5 w-full animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading &&
                filtered.map((u) => (
                  <UserRow
                    key={u.userId}
                    user={u}
                    onApply={(user, plan) => setPending({ user, plan })}
                    isSuperAdmin={isSuperAdmin}
                    isSelf={currentUserId === u.userId}
                    onSetAdmin={(user, isAdmin) => setAdminPending({ user, isAdmin })}
                  />
                ))}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <UsersIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {users.length === 0
                ? "Belum ada user terdaftar."
                : "Tidak ada hasil untuk pencarian ini."}
            </p>
          </div>
        )}
      </div>

      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        title="Konfirmasi Ubah Plan"
      >
        {pending && (
          <>
            <p className="text-sm text-muted-foreground">
              Ubah plan{" "}
              <span className="font-medium text-foreground">{pending.user.email}</span>{" "}
              menjadi{" "}
              <span className="font-medium capitalize text-foreground">
                {pending.plan}
              </span>
              ?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outline" disabled={saving} onClick={() => setPending(null)}>
                Batal
              </Button>
              <Button onClick={confirmSetPlan} disabled={saving}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Konfirmasi
              </Button>
            </div>
          </>
        )}
      </Dialog>

      <Dialog
        open={!!adminPending}
        onClose={() => setAdminPending(null)}
        title="Konfirmasi Role Admin"
      >
        {adminPending && (
          <>
            <p className="text-sm text-muted-foreground">
              {adminPending.isAdmin
                ? `Jadikan ${adminPending.user.email} sebagai admin?`
                : `Cabut akses admin dari ${adminPending.user.email}?`}
            </p>
            {adminNotice && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {adminNotice}
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                disabled={savingAdmin}
                onClick={() => setAdminPending(null)}
              >
                Batal
              </Button>
              <Button onClick={confirmSetAdmin} disabled={savingAdmin}>
                {savingAdmin && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Konfirmasi
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}