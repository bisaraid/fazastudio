import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

/**
 * Layout condiviso per le pagine legali (/privasi, /syarat, /refund, /kontak).
 * Componente server (statico). Mostra un banner "BOZZA — da rivedere" come
 * richiesto dall'audit: questi testi NON sono stati revisionati da un legale
 * e NON vanno usati come versione definitiva prima di una revisione.
 */

interface LegalShellProps {
  title: string;
  intro: string;
  updatedLabel: string;
  children: ReactNode;
}

export function LegalShell({ title, intro, updatedLabel, children }: LegalShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center px-4 lg:px-6">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            <Link href="/" className="hover:opacity-80">
              <span>Faza Studio</span>
            </Link>
          </div>
          <div className="flex-1" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-50/10 p-4 text-sm">
          <strong>BOZZA — DA RIVEDERE.</strong>{" "}
          Questo testo è una bozza preliminare in lingua indonesiana, redatta per
          strutturare la pagina. Prima della pubblicazione va revisionato da un
          consulente legale / da chi gestisce l'attività. Non è la versione definitiva.
        </div>

        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{intro}</p>
        <p className="mt-1 text-xs text-muted-foreground/70">{updatedLabel}</p>

        <div className="mt-6 space-y-4 text-sm leading-relaxed">{children}</div>
      </main>

      <footer className="mx-auto mt-10 flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between lg:px-8">
        <span>© {new Date().getFullYear()} Faza Studio</span>
        <nav className="flex flex-wrap gap-4">
          <Link href="/privasi">Privacy</Link>
          <Link href="/syarat">Termini e condizioni</Link>
          <Link href="/refund">Rimborsi</Link>
          <Link href="/kontak">Contatto</Link>
          <Link href="/">Home</Link>
        </nav>
      </footer>
    </div>
  );
}