# AUDIT LAUNCH-READINESS — Faza Studio

> Laporan audit kesiapan launch. Data kode: branch `main` @ `f2102b7`.
> Sistema pembuatan konten video otomatis (script → audio → subtitle → video).
> Nota: i temuan che vengono già risolti in questo branch `launch-fixes` sono
> segnalati con `[DONE]` nella colonna Rekomendasi.

---

## 1. Ringkasan eksekutif + VERDICT

**VERDICT: `BELUM LAYAK`** (produk belum layak per promosi pubbliche).

Alasan (3–5 poin):
1. **Kualitas video non incontra la priorità del proprietario**: subtitle renderizzati
   con font di fallback (Quicksand/Poppins non caricati nel worker), footage Pexels
   top-1 senza dedupe/zoom/transizioni, durata scena uguale per tutte (non segue la
   narrazione), nessuna normalizzazione volume, TTS default robotico (node-gtts),
   nessuna musica. Le claims "720p vs 1080p", "template", "gayà visual" nel pricing
   **non sono enforcement** dal render.
2. **Claim "10.000+ script fatto"** senza base via query/dati → fuorviante.
3. **Nessuna pagina legale** (Privacy/Terms/Refund/support) → blocker conformità.
4. **Unit economics fragili**: Free abusabile (identity = cookie, pulendo → crediti
   gratuiti illimitati senza captcha/verifica), e TTS premium spinto può rendere il
   margine Starter/Pro pari/al costo.
5. **Payment webhook senza idempotency** + piano legato a device cookie (non account);
   assenza CI/monitoring/benchmark render.

---

## 2. Skor (0–10)

| Area | Skor |
|---|---|
| Kualitas video | 2 |
| Keandalan | 5 |
| Keamanan | 6 |
| Unit economics | 4 |
| Kejujuran klaim | 3 |
| Legal/kepatuhan | 2 |
| Onboarding | 5 |

---

## 3. Tabel temuan

ID | Area | Severity | Bukti (file:baris) | Dampak | Rekomendasi | Est. usaha (h)
|---|---|---|---|---|---|---|
| F-01 | Kualitas video | **Critical** | `worker/src/render.ts:123` (baseDir `process.cwd()/public/fonts`) — `/worker` non ha `public/` (verificato; radice lo ha) | Subtitle burn-in con font di fallback di ffmpeg o mancante → video "brutto" | `[DONE]` copy font in `worker/` al build + **fail-loud** se font non trovato; watermark free indipendente | 2 |
| F-02 | Kualitas video | High | `worker/src/render.ts:158-160,163-169,171-190` — Pexels top-1, no dedupe per scene | Scene ripetute / footage poco rilevante → video ripetitivo | Dedupe by video.id + select 3 candidati + query migliori | 5 |
| F-03 | Kualitas video | High | `worker/src/render.ts:319` — `perSceneDur = totalDuration / visible.length` | Pacing visivo non segue la narrazione di ogni scena | Deriva durata scena da lunghezza narrazione / segment timing | 4 |
| F-04 | Kualitas video | Medium | `worker/src/render.ts:355-365` — nessun `zoompan`/`xfade`/`eq`; loop statico `-stream_loop -1` | Nessun motion/movimento; hard cuts | Aggiungi Ken Burns, transizioni, grade leggero | 6 |
| F-05 | Kualitas video | High | `src/lib/tts/index.ts:247-292` — default `node-gtts` (robotico) se no key; `render.ts` nessun `loudnorm` | Audio robotico e volume incoerente | Default provider migliore per login + `loudnorm`; (opz.) music bed licenzia | 6 |
| F-06 | Kualitas video | Low | `worker/src/render.ts:78-92` — split proporzionale a 3 parole | Sync subtitle approssimata (drift) | Migliora con word-level timing | 4 |
| F-07 | Kualitas video | Medium | `src/lib/constants.ts:92-190` ("720p","5 template","Semua & gayà visual","AI Generated") vs `render.ts:283-365` (solo stock+subtitle) | Claims non implementati → delusione | `[DONE]` Allinea claims alla realtà | 3 |
| F-08 | Kualitas video | Medium | `render.ts:294-303` — watermark dipende dal font presente; senza font nessun watermark | Free può uscire senza watermark (perdita monetizzazione) | `[DONE]` Watermark indipendente dal font subtitle | 2 |
| R-01 | Keandalan | Medium | `worker/src/queue.ts:126-138` — `attempts:2`, no dead-letter queue; `index.ts:84-107` stato error quasi vuoto | Nessun dead-letter; errore visibile nullo; non refund | Dead-letter/retry log + stato error + refund su render fallito | 6 |
| R-02 | Keandalan | Medium | `src/app/api/generate-script/route.ts:122,130` decrement credit a generate-script, non a render | Credito addebitato anche se render fallisce | Valuta credito "solo a success/regenerate" o compensazione | 3 |
| R-03 | Keandalan | Medium | `src/lib/usage.ts:489-496` `setPlan` resetta `credits_used:0`; `checkout/webhook/route.ts:69-74` no idempotency | Retry webhook → doppio grant / reset crediti | `[DONE]` Idempotency per order_id + `setPlan` no reset used + verifica `gross_amount` | 6 |
| R-04 | Keandalan | Medium | Vercel Hobby 60s; generate-tts/subtitle sync con TTS/Whisper lunghi | Timeout su media lunga | Streaming/refactor o upscale function | 4 |
| S-01 | Keamanan | Medium | `src/lib/api-auth.ts:109` + `cron/trends/route.ts:40` confronto stringa non timing-safe | Minor; difficile via rete | Usa `crypto.timingSafeEqual` | 1 |
| S-02 | Keamanan | Medium | `src/app/api/video-proxy/route.ts:37,69` e `audio-proxy` — nessun auth, CORS `*` | Open proxy verso storage (R2/Supabase) | Auth/rate-limit sul proxy, CORS ristretto | 2 |
| S-03 | Keamanan | High | `worker/src/lib/r2.ts:58-68` — URL pubblici R2 `premium/{identityKey}/{timestamp}.mp4` | Video accessibili a chi conosce URL (no auth) | Signed/private URL per premium, o auth check al serve | 4 |
| S-04 | Keamanan | Medium | `src/lib/identity.ts:61-71` — identity anon = cookie `device_id`; `src/lib/usage.ts:45` 10 crediti | Abuse Free illimitato (clearing cookie/incognito), no captcha | Enforcement server (firma device) + captcha/honeypot + limit IP anon | 6 |
| S-05 | Keamanan | Low | RLS: `projects/user_usage/profiles` own-data (mig 016), trend/script service_role (mig 019). Non letto: `content_categories`, `behavior_events` | TIDAK TERVERIFIKATO | Verifica RLS di tutte le tabelle | 1 |
| C-01 | Klaim | High | `src/app/page.tsx:629-630` "10.000+ script" — nessuna query a supporto | Claim fuorviante | `[DONE]` Rimuovi claim simplex | 1 |
| C-02 | Klaim | Medium | `src/lib/constants.ts:103,134,139,151,166,185` (~720p, template, gayà visual) vs render | Claims non enforcement | `[DONE]` Allinea pricing a behavior render | 2 |
| C-03 | Klaim | Low | `src/lib/constants.ts:110` free `videoExpiry:"72 jam"` vs `render.ts:401` `24h` | Discrepanza | Sincronizza (24h o 72h) | 1 |
| L-01 | Legal | **Critical** | Landing footer `page.tsx:708-716` (solo Harga/Masuk); nessun /privasi /syarat /refund /kontak | Conformità zero | `[DONE]` Creare pagine legali + link footer | 4 |
| L-02 | Legal | Medium | `docs/r2-lifecycle-setup.md`, Pexels uso commerciale embedded — piano rivendita non verificato | TIDAK TERVERIFIKATO | Conferma copertura licenza Pexels | 1 |
| U-01 | Unit econ | High | Costi stimati Rp300–1.500/video free; TTS premium fino Rp3.000; Free abusabile | Margini sottili/negativi se abusato | Rivedi economia + anti-abuse | 5 |
| H-01 | Repo | Medium | `supabase/.temp/cli-latest` committata; `run-build-tmp.bat`,`poll-build.mjs`,`build-check.mjs`; `.kilo/` non gitignored | Igiene repo bassa; `npm test` non verde in locale | `[DONE]` Rimuovi artifact + .gitignore + test verdi | 2 |
| M-01 | Monitoring | Medium | solo `console.*`, nessun Sentry/aggregato; nessun benchmark render | Zero visibilità prod | Aggiungi error monitoring + benchmark 10 prompt/rubrica | 4 |

---

## 4. Blocker prima di promosi

1. **Fix font worker** + verifica render reale (10 output) — PRIORITA' #1 (qualità).
2. **Cleanup claim**: rimuovi "10.000+", allinea 720p/1080p/template/gayà visual alla
   realtà del render (o implementa 1-2 template).
3. **Pagine legali** (Privacy, Terms, Refund, Contact).
4. **Webhook**: idempotency, verifica `gross_amount`, `setPlan` no reset crediti,
   legame piano ad account (non device — in attesa approval user, tocca schema DB).
5. **Mini-motion + normalizzazione audio** (ken burns, loudnorm, default TTS migliore).
6. **Anti-abuse Free** (captcha/signature device/IP) + revisione unit economics TTS.
7. **CI/lint + esclusione `.kilo`** + rimozione artifact temporanei.

---

## 5. Rencana 2 settimane (focus: qualità video, ordine dampatto/usaha)

- **G1-2**: Bundle font worker + 10 render test + fix subtitle/fail-loud.
- **G3-4**: Dedupe + ken-burns + transizioni footaggio; query visual per-scena.
- **G5-6**: `loudnorm` + default TTS migliore; (opz.) music bed licenzia.
- **G7**: Durata scena da narrazione; hook treatment primi 3s.
- **G8-9**: 2 preset visual (color/overlay/layout) renderizzati davvero.
- **G10-11**: Benchmark automatico 10 prompt + rubrica; CI run.
- **G12-14**: Legal pages + webhook idempotency + claim cleanup + anti-abuse.

---

## 6. TIDAK TERVERIFIKATO (dati da owner)

- Count reale `script_generations` (dashboard) per claim "10.000+".
- 2-3 esempio video output reale (per valutazione visiva).
- Log Vercel (errori/timeout generate-tts/script), uptime worker, failure BullMQ.
- Fattura mensile API (Groq/Cartesia/ElevenLabs/Pexels) per unit economics reali.
- Config deploy worker (Railway/VM): cwd, presenza `public/fonts`, R2 lifecycle rule
  "free/ 1 giorno", durata function Vercel (Hobby 60s?).
- Migrazioni RLS `content_categories`, `behavior_events`.
- Verifica `git log --all -p` per secret storici.
- Piano Pexels: licenza rivendita commerciale embeddata.