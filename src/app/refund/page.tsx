import { LegalShell } from "@/components/legal-shell";

/**
 * Politica di rimborso — coerente con il comportamento dei crediti nel codice:
 * - 1 credito consumato per progetto alla generazione dello script
 *   (src/app/api/generate-script/route.ts -> decrementCredit).
 * - tts/subtitle/video controllano i crediti ma NON li decrementano.
 * - I rimborsi non sono automatici: vanno richiesti a supporto.
 */
export default function RefundPage() {
  return (
    <LegalShell
      title="Politica di rimborso"
      intro="Quando e come puoi chiedere un rimborso per un piano a pagamento."
      updatedLabel="BOZZA · da revisionare legalmente · versione 0.1"
    >
      <h2 className="text-lg font-semibold">1. Come funzionano i crediti</h2>
      <p>
        Un credito viene consumato nel momento in cui generi uno script per un
        progetto (un progetto = un credito). La generazione di audio, sottotitoli
        e video non consuma crediti aggiuntivi; richiede soltanto che tu abbia
        ancora crediti disponibili.
      </p>

      <h2 className="text-lg font-semibold">2. Rimborso dei crediti non usati</h2>
      <p>
        Se hai acquistato un piano (Starter o Pro) e non hai ancora consumato tutti
        i crediti del periodo, puoi chiedere il rimborso dei crediti/importo non
        utilizzati. Rimborseremo la parte non consumata, al netto di eventuali
        costi di pagamento, a condizione che la richiesta arrivi entro il periodo
        di acquisto.
      </p>

      <h2 className="text-lg font-semibold">3. Crediti già consumati</h2>
      <p>
        I crediti già consumati corrispondono a contenuti effettivamente generati
        (script/audio/video) e, di norma, non sono rimborsabili, perché il valore
        è stato già erogato. Errori/o contenuti difettosi di Faza Studio verranno
        valutati caso per caso dal supporto.
      </p>

      <h2 className="text-lg font-semibold">4. Come richiedere un rimborso</h2>
      <p>
        Scrivi alla pagina /kontak indicando: email dell'account, piano acquistato,
        numero d'ordine (se disponibile), motivo e importo richiesto. Valuteremo la
        richiesta e ti risponderemo entro un termine ragionevole.
      </p>

      <h2 className="text-lg font-semibold">5. Non sono rimborsabili</h2>
      <p>
        Aggiramento dei termini, uso fraudolento, account multipli per aggirare il
        piano gratuito, o acquisti effettuati in modo abusivo. In questi casi
        possiamo rifiutare il rimborso.
      </p>
    </LegalShell>
  );
}