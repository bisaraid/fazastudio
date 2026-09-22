"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";

interface PostingCardProps {
  script?: {
    optimizedTitle?: string;
    caption?: string;
    hashtags?: string[];
  };
}

/** Card "Siap untuk Posting" — editable + copy-to-clipboard proper, muncul fade-in setelah output siap. */
export function PostingCard({ script }: PostingCardProps) {
  const hasContent = !!script?.optimizedTitle;

  const [title, setTitle] = useState(script?.optimizedTitle ?? "");
  const [caption, setCaption] = useState(script?.caption ?? "");
  const [hashtags, setHashtags] = useState(script?.hashtags?.join(" ") ?? "");

  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sinkron state lokal ketika hasil generate-posting tiba (via setScriptResult).
  useEffect(() => {
    setTitle(script?.optimizedTitle ?? "");
    setCaption(script?.caption ?? "");
    setHashtags(script?.hashtags?.join(" ") ?? "");
  }, [script?.optimizedTitle, script?.caption, script?.hashtags]);

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

  // Loading skeleton saat generate-posting masih berjalan.
  if (!hasContent) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <p className="text-sm font-semibold">🎯 Siap untuk Posting</p>
        <div className="mt-3 space-y-2">
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted-foreground/15" />
          <div className="h-14 w-full animate-pulse rounded-lg bg-muted-foreground/15" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted-foreground/15" />
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