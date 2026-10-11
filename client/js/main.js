/**
 * main.js – verbindet Netzwerk, Anzeigezustand und Ansichten.
 * Nur der Server entscheidet den Spielstand; der Client zeigt ihn an.
 * Inhalt: == 1. Einrichtung · == 2. Servernachrichten
 *         == 3. Ansichten und gemeinsame Helfer · == 4. Zeichnen und Start
 * Benutzt die Ansichten, kern.js, dom.js und shared/protokoll.js.
 */

import { $, zeige } from './dom.js';
import { erzeugeStore, ANSICHT, verbinde } from './kern.js';
import { erzeugeAnmeldeAnsicht } from './anmelden.js';
import { erzeugeWarteAnsicht } from './warten.js';
import { erzeugeSpielAnsicht } from './spiel.js';
import { erzeugeEndeAnsicht } from './ende.js';
import { erzeugeEinstellungen } from './einstellungen.js';
import { FEHLER, FEHLER_TEXT, STATUS, REMIS } from '/shared/protokoll.js';

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

// Socket-Nachrichten treffen erst nach Einrichtung aller Ansichten ein.
const aktionen = verbinde({
  beiVerbindung,
  beiTrennung,
  beiWarteschlange,
  beiPrivat,
  beiStart,
  beiStand,
  beiEnde,
  beiAbbruch,
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

function beiWarteschlange({ position }) {
  store.setze({ ansicht: ANSICHT.WARTEN, position, einladung: null });
}

function beiPrivat({ code }) {
  store.setze({ ansicht: ANSICHT.WARTEN, einladung: code, position: null });
}

// Ein Start verwirft den alten Ablauf und baut das Brett für diesen Sitz.
function beiStart({ sitz, spielstand }) {
  entferneEinladungAusAdresse();
  ablaufNr += 1;
  letzteAnimation = Promise.resolve();
  partieVorbei = false;

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

// Die Revanche-Frist beginnt beim Empfang, bevor die Animation fertig ist.
async function beiEnde({ spielstand, ergebnis, revanche }) {
  const meineNr = ablaufNr;

  const revancheSeit = Date.now();
  markierePartieVorbei();

  await warteAufAnimation();
  // SCHUTZ: Während des Wartens kann eine neue Partie begonnen haben.
  if (meineNr !== ablaufNr) return;
  store.setze({
    ansicht: ANSICHT.ENDE,
    spielstand,
    ergebnis,
    revanche: revancheStand(revanche),
    revancheSeit,
  });
}

async function beiAbbruch({ grund, ergebnis, spielstand, revanche }) {
  const meineNr = ablaufNr;
  markierePartieVorbei();
  const revancheSeit = Date.now();
  await warteAufAnimation();
  if (meineNr !== ablaufNr) return;

  store.setze({
    ansicht: ANSICHT.ENDE,
    spielstand: spielstand ?? store.lies().spielstand,
    ergebnis: ergebnis ?? {
      punkte: { unten: 0, oben: 0 }, sieger: REMIS, grund,
    },
    revanche: revancheStand(revanche),
    revancheSeit,
  });
}

function beiRevancheAngebot() {
  if (!partieVorbei) return;
  if (store.lies().revanche !== 'gewuenscht') {
    store.setze({ revanche: 'angeboten' });
  }
}

// Auch während der Schlussanimation merken, dass der Gegner weg ist.
function beiRevancheWeg() {
  if (partieVorbei) {
    store.setze({ revanche: 'weg' });
  }
}

function beiRevancheAbgelaufen() {
  if (partieVorbei) {
    store.setze({ revanche: 'abgelaufen' });
  }
}

// Ein abgelaufener Warteplatz und eine fehlende Partie brauchen einen Neustart.
function beiFehler({ code, text }) {
  const meldung = text ?? FEHLER_TEXT[code] ?? 'Unbekannter Fehler.';

  if (code === FEHLER.KEINE_PARTIE && partieVorbei) return;

  if ([FEHLER.KEINE_PARTIE, FEHLER.WARTEZEIT_ABGELAUFEN,
    FEHLER.CODE_UNBEKANNT].includes(code)) {
    if (code === FEHLER.CODE_UNBEKANNT) entferneEinladungAusAdresse();
    zurueckZurAnmeldung();
  } else if (code === FEHLER.BEREITS_IN_WARTESCHLANGE) {
    store.setze({ ansicht: ANSICHT.WARTEN });
  }
  meldeFehler(meldung, code);
}

// == 3. Ansichten und gemeinsame Helfer ===================================
const anmeldeAnsicht = erzeugeAnmeldeAnsicht({
  aktionen,

  beiAnmeldung(name) {
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

// Der Name bleibt erhalten; Partie, Einladung und Revanche werden
// zurückgesetzt.
function zurueckZurAnmeldung() {
  ablaufNr += 1;
  partieVorbei = false;
  letzteAnimation = Promise.resolve();
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
  return store.lies().revanche ?? 'moeglich';
}

const endeAnsicht = erzeugeEndeAnsicht({
  // Sofort warten: Verspätete Revanche-Nachrichten des alten Gegners dürfen
  // den Ergebnisdialog während der neuen Suche nicht erneut öffnen.
  beiNeuemSpiel() {
    ablaufNr += 1;
    partieVorbei = false;
    store.setze({
      ansicht: ANSICHT.WARTEN, position: null, einladung: null, revanche: null,
    });
    aktionen.erneut();
  },

  beiRevanche() {
    aktionen.revanche();
    store.setze({ revanche: 'gewuenscht' });
  },

  beiAbmelden() {
    aktionen.abbrechen();
    zurueckZurAnmeldung();
  },

  beiSchliessen() {
    aktionen.abbrechen();
    zurueckZurAnmeldung();
  },
});

// == 4. Zeichnen und Start ================================================
store.abonniere((zustand) => {
  const { ansicht } = zustand;

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
