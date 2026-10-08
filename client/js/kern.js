/**
 * kern.js – lokaler Anzeigezustand und die einzige Socket-Verbindung.
 * Der Store kennt kein DOM; die Netzverbindung kennt keine Ansichten.
 * Inhalt: == 1. Anzeigezustand · == 2. Netzverbindung
 * Benutzt von main.js; Protokoll und Socket.io liefert der Server.
 */

import { io } from '/socket.io/socket.io.esm.min.js';
import { EREIGNIS } from '/shared/protokoll.js';

// == 1. Anzeigezustand ====================================================
export const ANSICHT = Object.freeze({
  ANMELDEN: 'ANMELDEN',
  WARTEN: 'WARTEN',
  SPIEL: 'SPIEL',
  ENDE: 'ENDE',
});

// Eine Fabrik kapselt Zustand und Abonnenten in einer gemeinsamen Umgebung.
export function erzeugeStore() {
  let zustand = {
    ansicht: ANSICHT.ANMELDEN,
    name: '',
    sitz: null,
    spielstand: null,
    position: null,
    einladung: null,
    ergebnis: null,
    revanche: null,
    revancheSeit: 0,
  };

  const abonnenten = new Set();

  // Flache Kopie: Die Felder selbst sollen nicht von außen ersetzt werden.
  function lies() {
    return { ...zustand };
  }

  // Ein gescheiterter Abonnent darf die anderen nicht anhalten.
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

  // Die zurückgegebene Funktion meldet genau diesen Abonnenten wieder ab.
  function abonniere(abonnent) {
    abonnenten.add(abonnent);
    return () => abonnenten.delete(abonnent);
  }

  return { lies, setze, abonniere };
}

// == 2. Netzverbindung ====================================================
export function verbinde(rueckrufe) {
  const socket = io({
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });

  // Seitenweite Listener: Servernachrichten können in jeder Ansicht eintreffen.
  socket.on('connect', () => rueckrufe.beiVerbindung?.());
  socket.on('disconnect', (grund) => rueckrufe.beiTrennung?.(grund));
  socket.on('connect_error', (fehler) => rueckrufe.beiTrennung?.(fehler.message));

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

  // SCHUTZ: Vor dem Einfrieren schließen; ein alter WebSocket überlebt den
  // Zurück-Cache nicht zuverlässig. Die Ansichts-Listener bleiben bestehen.
  window.addEventListener('pagehide', () => socket.disconnect());
  window.addEventListener('pageshow', (ereignis) => {
    if (ereignis.persisted) socket.connect();
  });

  // Nach einer neuen Verbindung muss die erneute Suche den Namen mitsenden.
  let letzterName = '';

  return {
    // Ein Einladungscode gewinnt vor der Wahl „schnell“ oder „privat“.
    beitreten(name, { privat = false, code = null } = {}) {
      letzterName = name;
      const nutzdaten = code ? { name, code } : { name, privat };
      socket.emit(EREIGNIS.BEITRETEN, nutzdaten);
    },
    abbrechen: () => socket.emit(EREIGNIS.ABBRECHEN),
    // SCHUTZ: Nur die Muldennummer senden; Spielstand und Punkte bestimmt der
    // Server.
    zug: (mulde) => socket.emit(EREIGNIS.ZUG, { mulde }),
    aufgeben: () => socket.emit(EREIGNIS.AUFGEBEN),
    erneut: () => socket.emit(EREIGNIS.ERNEUT, { name: letzterName }),
    revanche: () => socket.emit(EREIGNIS.REVANCHE),

  };
}
