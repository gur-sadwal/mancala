/**
 * main.js – verbindet Netzwerk, Anzeigezustand und Ansichten.
 * Nur der Server entscheidet den Spielstand; der Client zeigt ihn an.
 * Inhalt: == 1. Einrichtung · == 2. Servernachrichten
 *         == 3. Ansichten und gemeinsame Helfer · == 4. Zeichnen und Start
 * Benutzt die Ansichten, kern.js, dom.js und shared/protokoll.js.
 */

import { $, zeige } from './dom.js';
import { erzeugeStore, ANSICHT, REVANCHE_STAND, verbinde } from './kern.js';
import { erzeugeAnmeldeAnsicht } from './anmelden.js';
import { erzeugeWarteAnsicht } from './warten.js';
import { erzeugeSpielAnsicht } from './spiel.js';
import { erzeugeEndeAnsicht } from './ende.js';
import { erzeugeEinstellungen } from './einstellungen.js';
import { FEHLER, FEHLER_TEXT, STATUS } from '/shared/protokoll.js';

// == 1. Einrichtung ======================================================
const einstellungen = erzeugeEinstellungen();

const store = erzeugeStore();
const verbindungshinweis = $('#verbindungshinweis');

// Ende-Nachrichten warten auf diese letzte Zuganimation.
let letzteAnimation = Promise.resolve();

// Eine verspätete Meldung KEINE_PARTIE darf das bereits eintreffende Ergebnis
// nicht durch die Anmeldung ersetzen.
let partieVorbei = false;

// Die erste Verbindung braucht keinen Hinweis auf verlorene Warteplätze.
let warSchonVerbunden = false;

// SCHUTZ: Start, neue Suche und Rückkehr zur Anmeldung erhöhen diese Nummer.
// Nach einem await dürfen alte Endabläufe dann keinen Dialog mehr öffnen.
let ablaufNr = 0;

// SCHUTZ: Wer zur Anmeldung zurückkehrt, sucht nicht mehr. Eine Meldung zur
// Warteschlange, die beim Abbrechen noch unterwegs war, darf die Warteansicht
// nicht zurückholen. Erst eine neue eigene Suche zählt wieder.
let sucheBeendet = false;

// Nach der Wiederverbindung führt beiVerbindung ohnehin zur Anmeldung.
const OHNE_VERBINDUNG = 'Ohne Verbindung wurde nichts gesendet. Sobald sie '
  + 'wieder steht, geht es bei der Anmeldung weiter.';

// Die Rückrufe benutzen Ansichten, die erst weiter unten entstehen. Das geht,
// weil Socket-Nachrichten frühestens nach dem Ende dieses Moduls eintreffen.
const aktionen = verbinde({
  beiVerbindung,
  beiTrennung,
  beiOnline,
  beiWarteschlange,
  beiPrivat,
  beiStart,
  beiStand,
  beiEnde: zeigeErgebnis,
  beiAbbruch: zeigeErgebnis,
  beiRevancheAngebot,
  beiRevancheWeg,
  beiRevancheAbgelaufen,
  beiFehler,
});

// == 2. Servernachrichten =================================================
function beiVerbindung() {
  const { ansicht } = store.lies();
  const hingAmServer = ansicht !== ANSICHT.ANMELDEN;

  zeige(verbindungshinweis, false);

  // Nach Wiederverbindung kennt der Server den neuen Socket noch nicht.
  if (warSchonVerbunden && hingAmServer) {
    zurueckZurAnmeldung();

    anmeldeAnsicht.melde(
      'Die Verbindung war unterbrochen. Bitte tritt erneut bei.',
    );
  }

  warSchonVerbunden = true;
}

function beiTrennung() {
  zeige(verbindungshinweis, true);
}

// Das Netz ist zurück und der Socket hat die Pause überstanden.
function beiOnline() {
  zeige(verbindungshinweis, false);
}

function beiWarteschlange({ position }) {
  if (sucheBeendet) return;
  store.setze({ ansicht: ANSICHT.WARTEN, position, einladung: null });
}

function beiPrivat({ code }) {
  if (sucheBeendet) return;
  store.setze({ ansicht: ANSICHT.WARTEN, einladung: code, position: null });
}

// Ein Start verwirft den alten Ablauf und baut das Brett für diesen Sitz.
function beiStart({ sitz, spielstand }) {
  entferneEinladungAusAdresse();
  beginneNeuenAblauf();

  store.setze({
    ansicht: ANSICHT.SPIEL,
    sitz,
    spielstand,
    ergebnis: null,
    position: null,
    einladung: null,
    revanche: null,
  });

  spielAnsicht.starte(spielstand, sitz);
}

function beiStand({ spielstand, bericht }) {
  if (spielstand.status !== STATUS.LAEUFT) markierePartieVorbei();
  store.setze({ spielstand });
  letzteAnimation = warteAufAnimation(
    spielAnsicht.spieleZug(bericht, spielstand),
  );
}

// Ende und Abbruch liefern beide Spielstand und Ergebnis vom Server. Die
// Revanche-Frist beginnt beim Empfang, bevor die Animation fertig ist.
async function zeigeErgebnis({ spielstand, ergebnis, revanche }) {
  const meineNr = ablaufNr;
  const revancheSeit = Date.now();
  markierePartieVorbei();

  await warteAufAnimation();
  // SCHUTZ: Während des Wartens kann eine neue Partie begonnen haben.
  if (meineNr !== ablaufNr) return;
  spielAnsicht.zeigeEnde();
  store.setze({
    ansicht: ANSICHT.ENDE,
    spielstand,
    ergebnis,
    revanche: revancheStand(revanche),
    revancheSeit,
  });
}

function beiRevancheAngebot() {
  if (!partieVorbei) return;
  if (store.lies().revanche !== REVANCHE_STAND.GEWUENSCHT) {
    store.setze({ revanche: REVANCHE_STAND.ANGEBOTEN });
  }
}

// Auch während der Schlussanimation merken, dass der Gegner weg ist.
function beiRevancheWeg() {
  if (partieVorbei) {
    store.setze({ revanche: REVANCHE_STAND.WEG });
  }
}

function beiRevancheAbgelaufen() {
  if (partieVorbei) {
    store.setze({ revanche: REVANCHE_STAND.ABGELAUFEN });
  }
}

// Diese Fehler beenden Suche oder Partie; die Anmeldung erklärt den Grund.
const ZURUECK_ZUR_ANMELDUNG = [
  FEHLER.KEINE_PARTIE, FEHLER.WARTEZEIT_ABGELAUFEN, FEHLER.CODE_UNBEKANNT,
  FEHLER.SERVER_VOLL,
];

function beiFehler({ code, text }) {
  const meldung = text ?? FEHLER_TEXT[code] ?? 'Unbekannter Fehler.';

  if (code === FEHLER.KEINE_PARTIE && partieVorbei) return;
  if (code === FEHLER.BEREITS_IN_WARTESCHLANGE && sucheBeendet) return;
  if (istNurBestaetigung(code)) return;

  if (ZURUECK_ZUR_ANMELDUNG.includes(code)) {
    if (code === FEHLER.CODE_UNBEKANNT) entferneEinladungAusAdresse();
    zurueckZurAnmeldung();
  } else if (code === FEHLER.BEREITS_IN_WARTESCHLANGE) {
    store.setze({ ansicht: ANSICHT.WARTEN });
  }
  meldeFehler(meldung, code);
}

// Ein doppelt abgeschickter Beitritt meldet nur, was die Ansicht schon zeigt.
// Als Text würde sie „Du bist am Zug“ oder den Hinweis zum Link ersetzen.
function istNurBestaetigung(code) {
  const { ansicht } = store.lies();
  const imSpiel = ansicht === ANSICHT.SPIEL;
  const beimWarten = ansicht === ANSICHT.WARTEN;

  return (code === FEHLER.BEREITS_IN_PARTIE && imSpiel)
    || (code === FEHLER.BEREITS_IN_WARTESCHLANGE && beimWarten);
}

// == 3. Ansichten und gemeinsame Helfer ===================================
const anmeldeAnsicht = erzeugeAnmeldeAnsicht({
  aktionen,

  beiAnmeldung(name) {
    sucheBeendet = false;
    store.setze({ name });
  },
});

const warteAnsicht = erzeugeWarteAnsicht({
  aktionen,
  beiAbbrechen() {
    zurueckZurAnmeldung();
  },
});
const spielAnsicht = erzeugeSpielAnsicht({ aktionen });

function markierePartieVorbei() {
  partieVorbei = true;
  spielAnsicht.beende();
}

// Start, neue Suche und Rückkehr zur Anmeldung beginnen einen neuen Ablauf.
function beginneNeuenAblauf() {
  ablaufNr += 1;
  partieVorbei = false;
  letzteAnimation = Promise.resolve();
}

// Der Name bleibt erhalten; Partie, Einladung und Revanche werden
// zurückgesetzt.
function zurueckZurAnmeldung() {
  sucheBeendet = true;
  beginneNeuenAblauf();
  store.setze({
    ansicht: ANSICHT.ANMELDEN,
    spielstand: null,
    sitz: null,
    position: null,
    einladung: null,
    ergebnis: null,
    revanche: null,
    revancheSeit: 0,
  });
}

// Fehler immer in der gerade sichtbaren Ansicht anzeigen.
function meldeFehler(text, code) {
  switch (store.lies().ansicht) {
    case ANSICHT.SPIEL:
      spielAnsicht.melde(text, {
        ruetteln: code === FEHLER.MULDE_LEER || code === FEHLER.NICHT_AM_ZUG,
      });
      break;
    case ANSICHT.WARTEN:
      warteAnsicht.melde(text);
      break;
    case ANSICHT.ENDE:
      endeAnsicht.melde(text);
      break;
    default:
      anmeldeAnsicht.melde(text);
  }
}

// SCHUTZ: Eine abgelehnte Animation darf das Ergebnis nicht verhindern.
async function warteAufAnimation(animation = letzteAnimation) {
  try {
    await animation;
  } catch (fehler) {
    console.error(
      'Zug-Animation gescheitert – zeige trotzdem das Ergebnis.', fehler,
    );
  }
}

// Frühe Servernachrichten zur Revanche haben Vorrang vor „möglich“.
function revancheStand(moeglich) {
  if (!moeglich) return null;
  return store.lies().revanche ?? REVANCHE_STAND.MOEGLICH;
}

const endeAnsicht = erzeugeEndeAnsicht({
  // Ohne Verbindung bleibt der Dialog offen; das Warten würde sonst eine
  // Suche vortäuschen, die nie gesendet wurde.
  beiNeuemSpiel() {
    if (!aktionen.erneut()) {
      endeAnsicht.melde(OHNE_VERBINDUNG);
      return;
    }

    // Erst schließen: Solange der modale Dialog offen ist, kann die
    // Warteansicht den Fokus nicht übernehmen.
    endeAnsicht.verstecke();
    sucheBeendet = false;

    // Sofort warten: Verspätete Revanche-Nachrichten des alten Gegners dürfen
    // den Ergebnisdialog während der neuen Suche nicht erneut öffnen.
    beginneNeuenAblauf();
    store.setze({
      ansicht: ANSICHT.WARTEN, position: null, einladung: null, revanche: null,
    });
  },

  beiRevanche() {
    if (!aktionen.revanche()) {
      endeAnsicht.melde(OHNE_VERBINDUNG);
      return;
    }
    store.setze({ revanche: REVANCHE_STAND.GEWUENSCHT });
  },

  beiAbmelden: verlasseErgebnis,
  beiSchliessen: verlasseErgebnis,
});

// Abmelden und Esc nehmen die Revanche zurück und führen zur Anmeldung.
function verlasseErgebnis() {
  aktionen.abbrechen();
  zurueckZurAnmeldung();
}

// == 4. Zeichnen und Start ================================================
store.abonniere((zustand) => {
  const { ansicht } = zustand;

  schuetzeVorVerlassen(ansicht === ANSICHT.SPIEL);
  anmeldeAnsicht.zeige(ansicht === ANSICHT.ANMELDEN);
  warteAnsicht.zeige(ansicht === ANSICHT.WARTEN);
  spielAnsicht.zeige(ansicht === ANSICHT.SPIEL || ansicht === ANSICHT.ENDE);

  if (ansicht === ANSICHT.WARTEN) {
    warteAnsicht.aktualisiere({
      name: zustand.name,
      position: zustand.position,
      einladung: zustand.einladung,
    });
  }

  if (ansicht === ANSICHT.ENDE && zustand.ergebnis && zustand.sitz) {
    endeAnsicht.zeige({
      ergebnis: zustand.ergebnis,
      sitz: zustand.sitz,
      revanche: zustand.revanche,
      revancheSeit: zustand.revancheSeit,
      name: eigenerName(zustand),
    });
  } else {
    endeAnsicht.verstecke();
  }
});

// Während einer Partie fragt der Browser vor Schließen, Neuladen oder Zurück
// nach. Den Text bestimmt der Browser; wer bleibt, spielt einfach weiter.
// Erst das tatsächliche Verlassen trennt die Verbindung (pagehide in kern.js).
function warneVorVerlassen(ereignis) {
  ereignis.preventDefault();
}

// Gleiche Funktionsreferenz: Wiederholtes Anmelden bleibt ein Listener.
function schuetzeVorVerlassen(aktiv) {
  if (aktiv) {
    window.addEventListener('beforeunload', warneVorVerlassen);
  } else {
    window.removeEventListener('beforeunload', warneVorVerlassen);
  }
}

// Für die Bilanz gilt bevorzugt der vom Server bereinigte Name.
function eigenerName(zustand) {
  const spieler = zustand.spielstand?.spieler[zustand.sitz];
  return spieler ? spieler.name : zustand.name;
}

// replaceState verhindert eine zusätzliche Station beim Zurück-Knopf.
function entferneEinladungAusAdresse() {
  window.history.replaceState(null, '', window.location.pathname);
}

store.setze({ ansicht: ANSICHT.ANMELDEN });

einstellungen.zeigeBeimErstenBesuch();

// ACHTUNG: Den Ladehinweis erst nach erfolgreicher Einrichtung ausblenden.
// Bei einem Fehler davor bleibt die Erklärung sichtbar.
zeige($('#ladehinweis'), false);
