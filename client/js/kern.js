/**
 * Kern des Clients: Anzeigezustand und Netzverbindung (Konzept 8.2).
 *
 * Beide Bausteine werden je GENAU EINMAL erzeugt, und zwar in main.js.
 * Sie liegen deshalb in einer Datei, sind aber in zwei Abschnitte getrennt –
 * die Grenzen aus Konzept 8.2 gelten weiter: Der Zustand kennt Socket.io
 * nicht, die Netzschicht kennt das DOM nicht.
 *
 * Diese Datei ist NUR im Browser ladbar: `/shared/protokoll.js` und
 * `/socket.io/socket.io.esm.min.js` sind absolute Pfade, die der Server
 * ausliefert und die Node nicht aufloest. Die DOM-Helfer stehen deshalb in
 * dom.js und nicht hier – sonst waere die Brettgeometrie aus spiel.js nicht
 * mehr unter Jest testbar.
 */

// Den Socket.io-Client liefert der Socket.io-Server selbst aus, passend zu
// seiner eigenen Version. Die ESM-Fassung ist ein normales ES-Modul: kein
// klassisches <script>, kein globales `io`.
import { io } from '/socket.io/socket.io.esm.min.js';
import { EREIGNIS } from '/shared/protokoll.js';

// ===========================================================================
// 1. Anzeigezustand
// ===========================================================================

/**
 * Der Datenfluss ist eine Einbahnstrasse: Socket -> store -> Ansicht. Ein
 * Klick geht den umgekehrten Weg, aendert aber NIE direkt den Anzeigezustand –
 * er schickt nur `spiel:zug`. Erst die Antwort des Servers veraendert das
 * Bild.
 *
 * Damit kann die Anzeige gar nicht von der Serverwahrheit abweichen, und die
 * Regel "dem Client nicht trauen" gilt auch innerhalb des Clients.
 *
 * Dieser Abschnitt kennt Socket.io nicht und das DOM nicht.
 */

/** Die vier Ansichten aus dem Zustandsautomaten (Konzept 8.1). */
export const ANSICHT = Object.freeze({
  ANMELDEN: 'ANMELDEN',
  WARTEN: 'WARTEN',
  SPIEL: 'SPIEL',
  ENDE: 'ENDE',
});

/**
 * Erzeugt einen Anzeigezustand mit Abonnenten.
 *
 * Bewusst eine Fabrikfunktion statt eines Moduls mit globalen Variablen: So
 * gibt es keinen versteckten Zustand, der zwischen zwei Partien ueberlebt.
 */
export function erzeugeStore() {
  /** @type {object} */
  let zustand = {
    ansicht: ANSICHT.ANMELDEN,
    name: '',            // eigener Spielername
    sitz: null,          // 'unten' | 'oben', erst ab Partiestart bekannt
    gegnerName: '',
    spielstand: null,    // letzter vom Server gelieferter Stand
    position: null,      // Platz in der Warteschlange
    einladung: null,     // Code des eigenen privaten Spiels, z. B. "K7M2QX"
    ergebnis: null,      // Endergebnis, sobald die Partie vorbei ist
    revanche: null,      // nach Partieende: 'moeglich' | 'gewuenscht' | 'angeboten' | 'weg' | 'abgelaufen'
    revancheSeit: 0,     // Zeitpunkt (ms), ab dem die Revanche-Frist laeuft
    verbunden: false,
  };

  /** @type {Set<Function>} */
  const abonnenten = new Set();

  /** Liefert eine flache Kopie – niemand soll den Zustand direkt veraendern. */
  function lies() {
    return { ...zustand };
  }

  /**
   * Uebernimmt Aenderungen und benachrichtigt alle Abonnenten.
   *
   * Ein Fehler in einem Abonnenten darf die uebrigen nicht verhindern –
   * deshalb steht jeder Aufruf in seinem eigenen try/catch.
   */
  function setze(aenderungen) {
    zustand = { ...zustand, ...aenderungen };

    for (const abonnent of abonnenten) {
      try {
        abonnent(lies());
      } catch (fehler) {
        console.error('Abonnent des Stores ist gescheitert', fehler);
      }
    }
  }

  /**
   * Meldet einen Abonnenten an.
   * @returns {Function} Abmeldefunktion – wichtig gegen Speicherlecks.
   */
  function abonniere(abonnent) {
    abonnenten.add(abonnent);
    return () => abonnenten.delete(abonnent);
  }

  return { lies, setze, abonniere };
}

// ===========================================================================
// 2. Netzverbindung
// ===========================================================================

/**
 * Socket.io-Client: Ereignisse rein und raus (Konzept 8.2).
 *
 * Dieser Abschnitt kennt das DOM NICHT. Er uebersetzt Socket-Ereignisse in
 * Rueckrufe und stellt die fuenf Aktionen bereit, die der Client ausloesen
 * darf. Damit bleibt die gesamte Netzwerkkenntnis an einer Stelle.
 *
 * `io` kommt per import aus /socket.io/socket.io.esm.min.js (siehe oben).
 */

/**
 * @param {object} rueckrufe  je Ereignis eine Funktion
 * @returns {object} die Aktionen, die der Client senden darf
 */
export function verbinde(rueckrufe) {
  // Ohne Adresse (nur Optionen) verbindet sich Socket.io mit dem Ursprung,
  // von dem die Seite geladen wurde – genau das ist gewollt.
  const socket = io({
    // Verbindungsabbrueche selbst ueberbruecken: Bei einem kurzen Netzloch im
    // Hoersaal-WLAN soll der Client von sich aus wiederkommen (Fall F-02).
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });

  // ----- Verbindungszustand -------------------------------------------------

  socket.on('connect', () => rueckrufe.beiVerbindung?.());
  socket.on('disconnect', (grund) => rueckrufe.beiTrennung?.(grund));
  socket.on('connect_error', (fehler) => rueckrufe.beiTrennung?.(fehler.message));

  // ----- Spielereignisse ----------------------------------------------------

  socket.on(EREIGNIS.WARTESCHLANGE, (daten) => rueckrufe.beiWarteschlange?.(daten));
  socket.on(EREIGNIS.PRIVAT, (daten) => rueckrufe.beiPrivat?.(daten));
  socket.on(EREIGNIS.START, (daten) => rueckrufe.beiStart?.(daten));
  socket.on(EREIGNIS.STAND, (daten) => rueckrufe.beiStand?.(daten));
  socket.on(EREIGNIS.ENDE, (daten) => rueckrufe.beiEnde?.(daten));
  socket.on(EREIGNIS.ABBRUCH, (daten) => rueckrufe.beiAbbruch?.(daten));
  socket.on(EREIGNIS.FEHLER, (daten) => rueckrufe.beiFehler?.(daten));
  socket.on(EREIGNIS.REVANCHE_ANGEBOT, () => rueckrufe.beiRevancheAngebot?.());
  socket.on(EREIGNIS.REVANCHE_WEG, () => rueckrufe.beiRevancheWeg?.());
  socket.on(EREIGNIS.REVANCHE_ABGELAUFEN, () => rueckrufe.beiRevancheAbgelaufen?.());

  // ----- Aktionen -----------------------------------------------------------

  /**
   * Zuletzt beim Beitreten benutzter Name.
   *
   * `spiel:erneut` schickt ihn mit: Nach einem Verbindungsabbruch ist der
   * Socket auf dem Server ein neuer und kennt den Namen sonst nicht mehr.
   */
  let letzterName = '';

  /*
   * Der Client sendet AUSSCHLIESSLICH diese sechs Nachrichten – und bei
   * einem Zug nur eine Zahl zwischen 0 und 5. Er sendet kein Brett, keine
   * Punktzahl und keine Spiel-ID: Die Zuordnung Socket zu Partie kennt
   * allein der Server (Konzept 3.2).
   */
  return {
    /**
     * Beitreten: schnelles Spiel, privates Spiel erstellen oder per Code.
     * Ein Code gewinnt – wer einen Link hat, will genau diesem Spiel beitreten.
     */
    beitreten(name, { privat = false, code = null } = {}) {
      letzterName = name;
      const nutzdaten = code ? { name, code } : { name, privat };
      socket.emit(EREIGNIS.BEITRETEN, nutzdaten);
    },
    abbrechen: () => socket.emit(EREIGNIS.ABBRECHEN),
    zug: (mulde) => socket.emit(EREIGNIS.ZUG, { mulde }),
    aufgeben: () => socket.emit(EREIGNIS.AUFGEBEN),
    erneut: () => socket.emit(EREIGNIS.ERNEUT, { name: letzterName }),
    revanche: () => socket.emit(EREIGNIS.REVANCHE),

    /** Nur fuer den Abmelde-Knopf: Verbindung bewusst schliessen. */
    trennen: () => socket.disconnect(),

    /** Nach einem bewussten Trennen wieder aufbauen. */
    neuVerbinden: () => socket.connect(),

    istVerbunden: () => socket.connected,
  };
}
