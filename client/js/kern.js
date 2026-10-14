/**
 * kern.js – lokaler Anzeigezustand und die einzige Socket-Verbindung.
 * Der Store kennt kein DOM; die Netzverbindung kennt keine Ansichten.
 * Inhalt: == 1. Anzeigezustand · == 2. Netzverbindung
 * Benutzt von main.js und ende.js; Protokoll und Socket.io liefert der Server.
 */

import { io } from '/socket.io/socket.io.esm.min.js';
import { EREIGNIS, ZUG_TYP } from '/shared/protokoll.js';

// EINSTELLBAR: Pause, bevor ein abgelehnter Verbindungsaufbau neu beginnt.
const NEUVERSUCH_MS = 5000;

// == 1. Anzeigezustand ====================================================
export const ANSICHT = Object.freeze({
  ANMELDEN: 'ANMELDEN',
  WARTEN: 'WARTEN',
  SPIEL: 'SPIEL',
  ENDE: 'ENDE',
});

// Was der Ergebnisdialog zur Revanche zeigt. Diese Werte kennt nur der
// Browser; der Server meldet Angebot, Weggang und Ablauf als Ereignisse.
export const REVANCHE_STAND = Object.freeze({
  MOEGLICH: 'moeglich',
  GEWUENSCHT: 'gewuenscht',
  ANGEBOTEN: 'angeboten',
  WEG: 'weg',
  ABGELAUFEN: 'abgelaufen',
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

  // Flache Kopie schützt die obersten Felder. Enthaltene Objekte bleiben
  // geteilt und werden von den Ansichten nur gelesen.
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

  function abonniere(abonnent) {
    abonnenten.add(abonnent);
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

  // Erst nach der ersten Verbindung kann eine Nachricht veralten.
  let warVerbunden = false;

  // Seitenweite Listener: Servernachrichten können in jeder Ansicht eintreffen.
  socket.on('connect', () => {
    warVerbunden = true;
    rueckrufe.beiVerbindung?.();
  });
  socket.on('disconnect', (grund) => {
    // SCHUTZ: Was Socket.io noch zurückhält, gehört zur alten Verbindung.
    socket.sendBuffer = [];
    rueckrufe.beiTrennung?.(grund);
  });
  // Lehnt der Server selbst ab (etwa SERVER_VOLL), ist der Socket nicht mehr
  // aktiv und Socket.io versucht es nicht neu. Dann später selbst verbinden.
  socket.on('connect_error', (fehler) => {
    if (!socket.active) setTimeout(() => socket.connect(), NEUVERSUCH_MS);
    rueckrufe.beiTrennung?.(fehler.message);
  });

  socket.on(EREIGNIS.WARTESCHLANGE,
    (daten) => rueckrufe.beiWarteschlange?.(daten));
  socket.on(EREIGNIS.PRIVAT, (daten) => rueckrufe.beiPrivat?.(daten));
  socket.on(EREIGNIS.START, (daten) => rueckrufe.beiStart?.(daten));
  socket.on(EREIGNIS.STAND, (daten) => rueckrufe.beiStand?.(daten));
  socket.on(EREIGNIS.ENDE, (daten) => rueckrufe.beiEnde?.(daten));
  socket.on(EREIGNIS.ABBRUCH, (daten) => rueckrufe.beiAbbruch?.(daten));
  socket.on(EREIGNIS.FEHLER, (daten) => rueckrufe.beiFehler?.(daten));
  socket.on(EREIGNIS.REVANCHE_ANGEBOT, () => rueckrufe.beiRevancheAngebot?.());
  socket.on(EREIGNIS.REVANCHE_WEG, () => rueckrufe.beiRevancheWeg?.());
  socket.on(EREIGNIS.REVANCHE_ABGELAUFEN,
    () => rueckrufe.beiRevancheAbgelaufen?.());

  // SCHUTZ: Vor dem Einfrieren schließen; ein alter WebSocket überlebt den
  // Zurück-Cache nicht zuverlässig. Bei Cache-Rückkehr neu verbinden; main.js
  // führt dann zur Anmeldung. Die Ansichts-Listener bleiben bestehen.
  window.addEventListener('pagehide', () => socket.disconnect());
  window.addEventListener('pageshow', (ereignis) => {
    if (ereignis.persisted) socket.connect();
  });

  // Nach einer neuen Verbindung muss die erneute Suche den Namen mitsenden.
  let letzterName = '';

  // SCHUTZ: Während einer Unterbrechung nichts senden. Socket.io würde die
  // Nachricht sonst puffern und nach der Wiederverbindung mit neuer
  // Socket-Kennung nachreichen; diese gehört zu keiner Partie mehr.
  // Liefert false, wenn die Nachricht deshalb nicht hinausging.
  function sende(ereignis, ...nutzdaten) {
    if (warVerbunden && !socket.connected) return false;
    socket.emit(ereignis, ...nutzdaten);
    return true;
  }

  return {
    // Ein Einladungscode gewinnt vor der Wahl „schnell“ oder „privat“.
    // Die Anmeldung erfährt, ob der Beitritt hinausging.
    beitreten(name, { privat = false, code = null } = {}) {
      letzterName = name;
      const nutzdaten = code ? { name, code } : { name, privat };
      return sende(EREIGNIS.BEITRETEN, nutzdaten);
    },
    abbrechen: () => sende(EREIGNIS.ABBRECHEN),
    // SCHUTZ: Nur die Muldennummer senden; Spielstand und Punkte bestimmt der
    // Server. Die Form { type, pitIndex } steht in shared/protokoll.js.
    zug: (mulde) => sende(EREIGNIS.ZUG, { type: ZUG_TYP, pitIndex: mulde }),
    aufgeben: () => sende(EREIGNIS.AUFGEBEN),
    erneut: () => sende(EREIGNIS.ERNEUT, { name: letzterName }),
    revanche: () => sende(EREIGNIS.REVANCHE),
  };
}
