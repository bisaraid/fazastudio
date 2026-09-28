import { LegalShell } from "@/components/legal-shell";

export default function KontakPage() {
  return (
    <LegalShell
      title="Contatto e supporto"
      intro="Come raggiungerci per supporto, privacy, rimborsi o segnalazioni."
      updatedLabel="BOZZA · da revisionare · versione 0.1"
    >
      <h2 className="text-lg font-semibold">Supporto / Problemi tecnici</h2>
      <p>
        Se riscontri un problema con la generazione di script, audio o video (ad
        es. un render fallito), contattaci: nella richiesta includi l'email
        dell'account e, se possibile, una descrizione del passaggio che ha causato
        il problema. Per i problemi con i crediti, vedi la pagina /refund.
      </p>

      <h2 className="text-lg font-semibold">Privacy e diritti dei dati</h2>
      <p>
        Per richieste di accesso, rettifica o cancellazione dei dati, oppure
        domande sulla policy privacy (vedi /privasi), scrivici indicando "Privacy"
        come oggetto.
      </p>

      <h2 className="text-lg font-semibold">Segnalazioni di contenuti</h2>
      <p>
        Per segnalare contenuti illeciti o violazioni di diritti, scrivici con
        oggetto "Segnalazione" e includi i riferimenti necessari. Valuteremo la
        segnalazione e ti risponderemo a breve.
      </p>

      <h2 className="text-lg font-semibold">Dove scrivere</h2>
      <p>
        Usa l'indirizzo del supporto indicato nel piano (o nella pagina di
        contatto pubblica). Ti preghiamo di aggiungere sempre l'email dell'account
        usato su Faza Studio per velocizzare la risposta.
      </p>
    </LegalShell>
  );
}