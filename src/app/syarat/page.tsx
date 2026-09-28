import { LegalShell } from "@/components/legal-shell";

export default function SyaratPage() {
  return (
    <LegalShell
      title="Termini e condizioni"
      intro="Le regole d'uso di Faza Studio."
      updatedLabel="BOZZA · da revisionare legalmente · versione 0.1"
    >
      <h2 className="text-lg font-semibold">1. Il servizio</h2>
      <p>
        Faza Studio è uno strumento online che genera bozze di script, audio e
        video con l'ausilio dell'AI. I contenuti generati sono bozze: l'utente è
        responsabile di verificarne e modificarli prima della pubblicazione e di
        assicurarsi che non violino diritti di terzi.
      </p>

      <h2 className="text-lg font-semibold">2. Account e utilizzo</h2>
      <p>
        Devi usare Faza Studio in modo legale e non abusivo. È vietato creare
        account multipli per aggirare i limiti del piano gratuito, rivendere
        l'accesso, o usare il servizio per contenuti illeciti. Ti chiediamo di
        fornire dati veritieri al momento della registrazione e del pagamento.
      </p>

      <h2 className="text-lg font-semibold">3. Piani, crediti e pagamenti</h2>
      <p>
        I piani (Free, Starter, Pro) offrono un numero di crediti per periodo
        (mese). Un credito viene consumato quando generi uno script per un
        progetto (un progetto = un credito). I pagamenti sono gestiti da Midtrans;
        le condizioni del piano applicabile sono quelle mostrate al momento
        dell'acquisto. I prezzi sono in Rupiah indonesiana (IDR) e si intendono
        IVA inclusa se applicabile.
      </p>

      <h2 className="text-lg font-semibold">4. Disponibilità del servizio</h2>
      <p>
        Facciamo il possibile per garantire continuità, ma il servizio può essere
        sospeso per manutenzione, errori tecnici, o dipendenze da terze parti senza
        che questo costituisca inadempienza qualora sia dovuto a cause non imputabili
        a noi.
      </p>

      <h2 className="text-lg font-semibold">5. Proprietà intellettuale</h2>
      <p>
        I contenuti generati ti appartengono per l'uso previsto dal piano, fermi
        restando i diritti dei terzi su eventuali materiali (ad es. footage stock,
        voci, modelli AI) i cui termini di licenza regolano l'uso commerciale.
      </p>

      <h2 className="text-lg font-semibold">6. Limitazioni e responsabilità</h2>
      <p>
        Il servizio è fornito "così com'è". Nella misura consentita dalla legge,
        non rispondiamo di danni derivanti dall'uso dei contenuti generati. Per i
        rimborsi sul piano pagato, consulta la pagina /refund.
      </p>
    </LegalShell>
  );
}