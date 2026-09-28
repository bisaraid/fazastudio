import { LegalShell } from "@/components/legal-shell";

export default function PrivasiPage() {
  return (
    <LegalShell
      title="Politica sulla Privacy"
      intro="Come Faza Studio raccoglie, usa e protegge i tuoi dati."
      updatedLabel="BOZZA · da revisionare legalmente · versione 0.1"
    >
      <h2 className="text-lg font-semibold">1. Dati che raccogliamo</h2>
      <p>
        Quando usi Faza Studio possiamo raccogliere: dati dell'account (email),
        dati del dispositivo (come un identificatore di dispositivo anonimo basato
        su cookie), informazioni di utilizzo (progetti, script, audio, contenuti
        generati), e dati di pagamento gestiti dal nostro processore Midtrans
        (non conserviamo noi i dati della carta).
      </p>

      <h2 className="text-lg font-semibold">2. Come usiamo i dati</h2>
      <p>
        Usiamo i dati per fornire il servizio (generare script/audio/video),
        gestire crediti e piani, prevenire abusi e furto di credito, e migliorare
        il prodotto tramite analisi aggregate anonimizzate.
      </p>

      <h2 className="text-lg font-semibold">3. Con chi condividiamo i dati</h2>
      <p>
        Non vendiamo dati personali. Condividiamo dati con fornitori di servizi
        indispensabili: Supabase (database/autenticazione), provider AI/TTS per
        generare i contenuti richiesti, Midtrans per il pagamento, e servizi di
        hosting/analisi (es. Vercel, Cloudflare, PostHog). Ciascuno di questi
        tratta i dati secondo la propria politica.
      </p>

      <h2 className="text-lg font-semibold">4. Conservazione e cancellazione</h2>
      <p>
        I contenuti gratuiti (video) scadono dopo circa 24 ore per ruolo tecnico di
        storage; i contenuti a pagamento restano disponibili. Puoi chiederci di
        eliminare un account e i relativi dati contattandoci tramite la pagina
        /kontak.
      </p>

      <h2 className="text-lg font-semibold">5. I tuoi diritti</h2>
      <p>
        A seconda della normativa applicabile potresti avere diritto ad accesso,
        rettifica, portabilità e cancellazione dei dati. Per esercitare i diritti,
        scrivi alla pagina /kontak.
      </p>
    </LegalShell>
  );
}