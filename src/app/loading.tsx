/**
 * Loading boundary App Router — skeleton ringan per section,
 * bukan spinner full-page.
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-14 border-b" />
      <main className="container mx-auto max-w-3xl px-4 py-8 lg:px-8 space-y-5">
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          <div className="h-3 w-72 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="h-44 animate-pulse rounded-xl border bg-card" />
        <div className="h-24 animate-pulse rounded-xl border bg-card" />
        <div className="h-40 animate-pulse rounded-xl border bg-card" />
      </main>
    </div>
  );
}