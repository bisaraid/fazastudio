"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useProjectStore } from "@/lib/store/projectStore";
import type { ProjectMetadata, ScriptResult } from "@/lib/types";
import {
  getPostingCardPhase,
  hasPostingMaterial,
  resolvePostingCache,
  type PostingFetchStatus,
  type PostingMaterial,
} from "@/lib/pipeline/posting-card-state";

/** Timeout fetch caption — skeleton maksimal ~15 dtk, lewat itu → state gagal. */
const FETCH_TIMEOUT_MS = 15_000;

interface PostingCardProps {
  /** Project yang sedang dibuka — untuk POST /api/generate-posting. */
  projectId: string;
  /** Kartu hanya tampil setelah video selesai (pre-video = hidden). */
  videoDone: boolean;
  /** Fallback cache lama di script (optimizedTitle/caption/hashtags). */
  script?: Pick<ScriptResult, "optimizedTitle" | "caption" | "hashtags">;
  /** Cache utama: project.metadata.posting — di-invalidate saat script diregenerasi (5A). */
  posting?: ProjectMetadata["posting"];
}

/** Card "Siap untuk Posting" — LAZY setelah video selesai: cache hit → tampil
 *  langsung; miss → auto-fetch sekali (timeout 15 dtk); gagal → baris kecil +
 *  tombol "Buat caption". Copy-to-clipboard per bagian. */
export function PostingCard({ projectId, videoDone, script, posting }: PostingCardProps) {
  const [fetchStatus, setFetchStatus] = useState<PostingFetchStatus>("idle");
  const [localMaterial, setLocalMaterial] = useState<PostingMaterial | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const cached = resolvePostingCache(posting, script);
  const material: PostingMaterial | null =
    cached ?? (hasPostingMaterial(localMaterial) ? localMaterial : null);
  const hasMaterial = hasPostingMaterial(material);
  const phase = getPostingCardPhase({ videoDone, material, fetchStatus });

  const [title, setTitle] = useState(material?.optimizedTitle ?? "");
  const [caption, setCaption] = useState(material?.caption ?? "");
  const [hashtags, setHashtags] = useState(material?.hashtags?.join(" ") ?? "");

  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Auto-fetch hanya SEKALI per "video selesai" — tombol retry yang pegang sesudah gagal. */
  const attemptedRef = useRef(false);

  // Sinkron state lokal ketika materi tiba/di-invalidate (mis. script diregenerasi).
  useEffect(() => {
    setTitle(material?.optimizedTitle ?? "");
    setCaption(material?.caption ?? "");
    setHashtags(material?.hashtags?.join(" ") ?? "");
  }, [material?.optimizedTitle, material?.caption, material?.hashtags]);

  // Script berganti (regenerasi) → hasil fetch lokal dari naskah LAMA tidak berlaku.
  const lastScriptRef = useRef(script);
  useEffect(() => {
    if (lastScriptRef.current !== script) {
      lastScriptRef.current = script;
      setLocalMaterial(null);
    }
  }, [script]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = (key: string, text: string) => {
    if (!text) return;
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => {});
  };

  // ===== LAZY fetch caption (sekali per "video selesai", timeout 15 dtk) =====
  const loadPosting = useCallback(async () => {
    setFetchStatus("loading");
    setFetchError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    // Guard race: script diregenerasi di tengah fetch → hasil STALE dibuang.
    // Bandingkan identitas objek script (bukan hanya id) — regen mengganti
    // seluruh objek script, id pun bisa sama.
    const scriptAtStart = useProjectStore.getState().currentProject?.script ?? null;
    try {
      const res = await fetch("/api/generate-posting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.data) {
        const msg = json?.error || `HTTP ${res.status}`;
        console.warn(`[PostingCard] generate-posting gagal (${res.status}): ${msg}`);
        setFetchError(
          res.status === 429
            ? "Terlalu banyak permintaan. Coba lagi sebentar."
            : "Caption belum berhasil dibuat. Coba lagi?"
        );
        setFetchStatus("error");
        return;
      }
      const data: PostingMaterial = {
        optimizedTitle:
          typeof json.data.optimizedTitle === "string" ? json.data.optimizedTitle : "",
        caption: typeof json.data.caption === "string" ? json.data.caption : "",
        hashtags: Array.isArray(json.data.hashtags)
          ? json.data.hashtags.filter((h: unknown): h is string => typeof h === "string")
          : [],
      };
      if (!hasPostingMaterial(data)) {
        console.warn("[PostingCard] generate-posting sukses tapi materi kosong");
        setFetchError("Caption belum berhasil dibuat. Coba lagi?");
        setFetchStatus("error");
        return;
      }
      const scriptNow = useProjectStore.getState().currentProject?.script ?? null;
      if (scriptNow !== scriptAtStart) {
        console.warn("[PostingCard] hasil caption dibuang: script diregenerasi saat fetch berjalan");
        setFetchStatus("idle");
        return;
      }
      // Tampil seketika (state lokal) + cache ke project.metadata.posting
      // (persist ke DB; di-invalidate otomatis saat script diregenerasi — 5A).
      setLocalMaterial(data);
      setFetchStatus("idle");
      void useProjectStore.getState().updateProjectMetadata({ posting: data });
    } catch (err) {
      // Catatan: abort dari AbortController melempar DOMException (bukan Error
      // di sebagian browser) — cek name-nya saja, jangan instanceof.
      const timedOut = err instanceof Error || err instanceof DOMException
        ? err.name === "AbortError"
        : false;
      console.warn(
        `[PostingCard] generate-posting ${timedOut ? "timeout (15 dtk)" : "error"}:`,
        err
      );
      setFetchError(
        timedOut
          ? "Waktu tunggu habis (15 detik). Coba lagi?"
          : "Caption belum berhasil dibuat. Coba lagi?"
      );
      setFetchStatus("error");
    } finally {
      clearTimeout(timeoutId);
    }
  }, [projectId]);

  // Auto-fetch: hanya saat kartu pertama tampil setelah video selesai dan
  // belum ada cache. Gagal → berhenti (retry manual via tombol); pre-video →
  // reset agar fetch ulang jalan pada siklus video berikutnya.
  useEffect(() => {
    if (!videoDone) {
      attemptedRef.current = false;
      setFetchStatus((s) => (s === "error" ? "idle" : s));
      return;
    }
    if (hasMaterial || fetchStatus !== "idle" || attemptedRef.current) return;
    attemptedRef.current = true;
    void loadPosting();
  }, [videoDone, hasMaterial, fetchStatus, loadPosting]);

  // Pre-video: kartu tidak dirender sama sekali.
  if (phase === "hidden") return null;

  // Skeleton saat cache miss + fetch masih berjalan (maks ~15 dtk).
  if (phase === "loading") {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5" aria-busy="true">
        <p className="text-sm font-semibold">🎯 Siap untuk Posting</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Menyiapkan caption…</p>
        <div className="mt-3 space-y-2">
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted-foreground/15" />
          <div className="h-14 w-full animate-pulse rounded-lg bg-muted-foreground/15" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted-foreground/15" />
        </div>
      </div>
    );
  }

  // Gagal/timeout → baris kecil + tombol retry (bukan skeleton menggantung).
  if (phase === "failed") {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <p className="text-sm font-semibold">🎯 Siap untuk Posting</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{fetchError}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadPosting()}
            disabled={fetchStatus === "loading"}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Buat caption
          </Button>
        </div>
      </div>
    );
  }

  const section = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    rows: number,
    placeholder: string
  ) => (
    <div className="rounded-xl border border-primary/10 bg-card/60 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => copy(key, value)}
          aria-label={`Salin ${label}`}
          title={`Salin ${label}`}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied === key ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-none rounded-lg bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <p className="text-sm font-semibold">🎯 Siap untuk Posting</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Salin dan posting ke akun kamu.</p>

      <div className="mt-3 space-y-2">
        {section("title", "Judul Video", title, setTitle, 1, "Judul video yang menarik...")}
        {section("caption", "Caption", caption, setCaption, 3, "Caption dengan emoji...")}
        {section("hashtags", "Hashtag", hashtags, setHashtags, 1, "#hashtag1 #hashtag2 ...")}
      </div>

      <Button
        variant="outline"
        onClick={() => copy("all", [title, caption, hashtags].filter(Boolean).join("\n\n"))}
        className="mt-3 w-full gap-1.5"
      >
        {copied === "all" ? (
          <>
            <Check className="h-4 w-4 text-emerald-500" /> Tersalin
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" /> Copy Semua
          </>
        )}
      </Button>
    </div>
  );
}