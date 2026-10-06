/**
 * Die Spiel-Engine: Zugpruefung, Saeen, Sonderregeln, Abrechnung (Konzept 5).
 *
 * Dies ist der einzige Ort im Projekt, an dem SPIELREGELN stehen. Die Engine
 * ist frei von Seiteneffekten: Sie bekommt einen Zustand, liefert einen neuen
 * Zustand und einen Bericht, und kennt weder Netzwerk noch Uhr noch Zufall.
 *
 * Entscheidung E-4: Ein Regelverstoss liefert `{ ok: false, code }` statt einer
 * Ausnahme. Ein Klick auf eine leere Mulde ist kein Programmfehler, sondern
 * Alltag – etwa wenn zwei Klicks dicht hintereinander eintreffen. `throw` waere
 * hier Kontrollfluss ueber Ausnahmen und wuerde die Handler unnoetig
 * verschachteln. Zugleich ist das Schicht 3 der Absturzsicherung (Konzept 7.7).
 */

import {
  SITZE,
  KUGELN_GESAMT,
  kopiereBrett,
  lies,
  setze,
  erhoehe,
  zelleGleich,
  istHaus,
  istInEigenerReihe,
  naechsteZelle,
  gegenueber,
  muldenSumme,
  muldenZellen,
  punkteVon,
  pruefeInvarianten,
  SITZ_NAMEN,
  istSitz,
} from './brett.js';

import { FEHLER, STATUS, GRUND, GRENZEN } from '../../shared/protokoll.js';

// `neuesBrett` gehoert zur oeffentlichen Schnittstelle der Engine (Konzept
// 5.1), liegt aber sachlich im Brett-Modul. Re-Export statt Zweitimplementierung.
export { neuesBrett } from './brett.js';

// ---------------------------------------------------------------------------
// 5.2 Zugvalidierung
// ---------------------------------------------------------------------------

/**
 * Prueft, ob ein Zug ueberhaupt erlaubt ist – ohne etwas zu veraendern.
 *
 * Fuenf Pruefungen in genau dieser Reihenfolge, weil jede die naechste
 * voraussetzt (Konzept 5.2):
 *
 *   1. Laeuft die Partie?            -> PARTIE_NICHT_AKTIV
 *   2. Ist dieser Sitz an der Reihe?  -> NICHT_AM_ZUG
 *   3. Ist `mulde` ganzzahlig 0..5?   -> MULDE_UNGUELTIG
 *   4. Liegt die Zelle in der eigenen Reihe? -> MULDE_UNGUELTIG
 *   5. Enthaelt die Mulde eine Kugel? -> MULDE_LEER
 *
 * @param {object} partie  Partiezustand (Konzept 4.7)
 * @param {'unten'|'oben'} sitz
 * @param {number} mulde   Muldennummer 0..5 aus Sicht des Spielers
 * @returns {{ok: true, zelle: number[]} | {ok: false, code: string}}
 */
export function pruefeZug(partie, sitz, mulde) {
  // 1. Partie muss laufen. Eine beendete oder abgebrochene Partie nimmt keine
  //    Zuege mehr an – das faengt auch verspaetete Nachrichten ab (F-03).
  if (!partie || partie.status !== STATUS.LAEUFT) {
    return { ok: false, code: FEHLER.PARTIE_NICHT_AKTIV };
  }

  // Ein unbekannter Sitzname kaeme nur durch einen Programmierfehler zustande,
  // wuerde aber unten zu einem Zugriff auf `undefined` fuehren.
  if (!istSitz(sitz)) {
    return { ok: false, code: FEHLER.NICHT_AM_ZUG };
  }

  // 2. Reihenfolge. Das ist die Anti-Cheating-Kernpruefung: Auch ein
  //    manipulierter Client kann nicht ausserhalb der Reihe ziehen.
  if (partie.amZug !== sitz) {
    return { ok: false, code: FEHLER.NICHT_AM_ZUG };
  }

  // 3. Bereich. Number.isInteger schliesst "3", 3.5, NaN, null und Infinity
  //    gemeinsam aus (Konzept 7.8).
  if (!Number.isInteger(mulde) || mulde < GRENZEN.MULDE_MIN || mulde > GRENZEN.MULDE_MAX) {
    return { ok: false, code: FEHLER.MULDE_UNGUELTIG };
  }

  const zelle = SITZE[sitz].mulde(mulde);

  // 4. Kann nicht fehlschlagen, solange 3 gilt. Steht trotzdem hier, weil die
  //    Sitzabbildung SITZE[sitz].mulde die Stelle ist, an der ein spaeterer
  //    Umbau einen Fehler einschleppen koennte (assert-artige Kontrolle).
  if (!istInEigenerReihe(sitz, zelle) || istHaus(zelle)) {
    return { ok: false, code: FEHLER.MULDE_UNGUELTIG };
  }

  // 5. Leere Mulden koennen nicht gewaehlt werden (Regelwerk 3.2.1).
  if (lies(partie.brett, zelle) < 1) {
    return { ok: false, code: FEHLER.MULDE_LEER };
  }

  return { ok: true, zelle };
}

// ---------------------------------------------------------------------------
// 5.3 Saeen
// ---------------------------------------------------------------------------

/**
 * Verteilt die Kugeln einer Mulde gegen den Uhrzeigersinn.
 *
 * Drei Punkte, die im Code-Review sicher gefragt werden:
 *
 *  - Nur das gegnerische HAUS wird uebersprungen. Die gegnerischen MULDEN
 *    werden ganz normal besaet. Das ist der haeufigste Denkfehler bei
 *    Mancala-Implementierungen.
 *  - Die Startmulde kann wieder gefuellt werden: Fuer einen Spieler sind 13
 *    Felder erreichbar (14 minus gegnerisches Haus). Bei genau 13 Kugeln
 *    landet die letzte in der inzwischen geleerten Startmulde und loest die
 *    Klau-Regel aus (Randfall R-01, Test T-09).
 *  - `pfad` enthaelt die Zellen in Wurfreihenfolge, ohne die Startmulde und
 *    ohne uebersprungene Haeuser. Genau diese Folge spielt der Client als
 *    Animation ab (Konzept 8.4).
 *
 * Veraendert das uebergebene Brett – der Aufrufer arbeitet bereits auf einer
 * Kopie.
 *
 * @returns {{letzteZelle: number[], pfad: number[][]}}
 */
function saee(brett, sitz, startZelle) {
  const gegnerHaus = SITZE[sitz].gegnerHaus;

  let steine = lies(brett, startZelle);
  setze(brett, startZelle, 0);   // Mulde wird vollstaendig geleert

  const pfad = [];
  let zelle = startZelle;

  while (steine > 0) {
    zelle = naechsteZelle(zelle);

    // Das gegnerische Haus wird uebersprungen: Ein Spieler kann niemals
    // Kugeln in das Haus des Gegners befoerdern (Regelwerk 3.2.3).
    if (zelleGleich(zelle, gegnerHaus)) {
      continue;
    }

    erhoehe(brett, zelle);
    steine -= 1;
    pfad.push(zelle);
  }

  return { letzteZelle: zelle, pfad };
}

// ---------------------------------------------------------------------------
// 5.5 Sonderregel 2: Kugeln klauen
// ---------------------------------------------------------------------------

/**
 * Prueft und vollzieht den Diebstahl (Regelwerk 3.4).
 *
 * Bedingung: Die letzte Kugel landet in einer Mulde der EIGENEN Reihe, die
 * vorher leer war, und gegenueber liegt mindestens eine Kugel.
 *
 * Veraendert das Brett nur, wenn tatsaechlich geklaut wird.
 *
 * @returns {{eigeneZelle: number[], gegnerZelle: number[], anzahl: number}|null}
 */
function pruefeBeute(brett, sitz, letzteZelle) {
  // Nur auf der eigenen Seite. Eine letzte Kugel in einer leeren GEGNERISCHEN
  // Mulde bleibt folgenlos (Randfall R-04, Test T-08).
  if (!istInEigenerReihe(sitz, letzteZelle)) return null;

  // Im Haus gelandet? Dann greift stattdessen die Extrazug-Regel. Beides
  // schliesst sich gegenseitig aus, weil die letzte Kugel entweder im Haus
  // oder in einer Mulde liegt.
  if (istHaus(letzteZelle)) return null;

  // "War vorher leer": Nach dem Einwurf liegt genau EINE Kugel darin, wenn die
  // Mulde vorher leer war. Deshalb der Vergleich mit 1 und nicht mit 0.
  if (lies(brett, letzteZelle) !== 1) return null;

  const gegnerZelle = gegenueber(letzteZelle);

  // Liegt gegenueber nichts, passiert nichts – die Kugel bleibt einfach
  // liegen. Kein Sonderfall, kein Extrazug (Randfall R-03, Test T-12).
  if (lies(brett, gegnerZelle) === 0) return null;

  // Beute = gegnerische Kugeln + die eigene letzte Kugel. Dass die eigene
  // Kugel mitwandert, steht ausdruecklich im Regelwerk 3.4.
  const anzahl = lies(brett, gegnerZelle) + 1;

  setze(brett, gegnerZelle, 0);
  setze(brett, letzteZelle, 0);
  erhoehe(brett, SITZE[sitz].haus, anzahl);

  return { eigeneZelle: letzteZelle, gegnerZelle, anzahl };
}

// ---------------------------------------------------------------------------
// 5.6 Spielende und Restabrechnung
// ---------------------------------------------------------------------------

/**
 * Prueft auf Spielende und rechnet gegebenenfalls die Restkugeln ab.
 *
 * AUSLEGUNG (Konzept 5.6): Das Regelwerk formuliert die Endebedingung aus
 * Sicht des Spielers, der nicht mehr ziehen kann. Geprueft werden hier BEIDE
 * Reihen nach jedem Zug, denn ein Zug kann auch die eigene Reihe leeren.
 * Beides fuehrt gemaess Regelwerk 3.5 zum sofortigen Ende; die Restkugeln
 * gehen an den Spieler, auf dessen Seite sie liegen. Diese Fassung ist die
 * allgemeinere und deckt beide Faelle mit demselben Code ab.
 *
 * @returns {{unten: number, oben: number}|null} gutgeschriebene Restkugeln,
 *          oder null, wenn die Partie weiterlaeuft
 */
function pruefeEnde(brett) {
  const leerOben = muldenSumme(brett, SITZE.oben.reihe) === 0;
  const leerUnten = muldenSumme(brett, SITZE.unten.reihe) === 0;

  if (!leerOben && !leerUnten) return null;

  const abrechnung = { unten: 0, oben: 0 };

  for (const sitz of SITZ_NAMEN) {
    const reihe = SITZE[sitz].reihe;
    const rest = muldenSumme(brett, reihe);

    if (rest > 0) {
      erhoehe(brett, SITZE[sitz].haus, rest);
      for (const zelle of muldenZellen(reihe)) {
        setze(brett, zelle, 0);
      }
    }
    abrechnung[sitz] = rest;
  }

  return abrechnung;
}

// ---------------------------------------------------------------------------
// 5.7 Ergebnis
// ---------------------------------------------------------------------------

/**
 * Ermittelt Punktestaende und Sieger aus einem (abgerechneten) Brett.
 *
 * Bei 48 Kugeln gilt: ab 25 Punkten Sieg, bei 24:24 Remis (Regelwerk 3.5.3).
 *
 * @param {number[][]} brett
 * @param {string} grund  Standard REGULAER; GEGNER_WEG/AUFGEGEBEN setzt der
 *                        Server (Konzept 7.7), nicht die Engine.
 */
export function ergebnisVon(brett, grund = GRUND.REGULAER) {
  const punkte = {
    unten: punkteVon(brett, 'unten'),
    oben: punkteVon(brett, 'oben'),
  };

  let sieger;
  if (punkte.unten > punkte.oben) sieger = 'unten';
  else if (punkte.oben > punkte.unten) sieger = 'oben';
  else sieger = 'remis';

  return { punkte, sieger, grund };
}

// ---------------------------------------------------------------------------
// 5.1 / 5.8 Zug ausfuehren
// ---------------------------------------------------------------------------

/**
 * Fuehrt einen Zug aus. Die einzige Funktion, die den Zustand veraendert.
 *
 * Sie arbeitet auf einer KOPIE des Bretts und gibt das Ergebnis zurueck; der
 * Aufrufer entscheidet, ob er es uebernimmt. Damit kann ein Test einen Zug
 * probeweise rechnen, ohne den Ausgangszustand zu zerstoeren (Test T-22).
 *
 * Reihenfolge der Schritte – die Reihenfolge ist regelrelevant:
 *   1. validieren
 *   2. saeen
 *   3. Beute pruefen (nur wenn nicht im Haus gelandet)
 *   4. Extrazug bestimmen
 *   5. Spielende pruefen – AUCH bei Extrazug (Randfall R-06, Test T-13)
 *   6. Zugrecht weitergeben
 *   7. Invarianten pruefen (Schicht 4 der Absturzsicherung)
 *
 * @returns {{ok: true, partie: object, bericht: object}
 *          |{ok: false, code: string}}
 */
export function fuehreZugAus(partie, sitz, mulde) {
  // --- 1. Validierung -----------------------------------------------------
  const pruefung = pruefeZug(partie, sitz, mulde);
  if (!pruefung.ok) return pruefung;

  const startZelle = pruefung.zelle;
  const brettVorher = kopiereBrett(partie.brett);
  const brett = kopiereBrett(partie.brett);   // auf dieser Kopie wird gerechnet

  // --- 2. Saeen -----------------------------------------------------------
  const { letzteZelle, pfad } = saee(brett, sitz, startZelle);

  // --- 3. Sonderregel 2: Klauen ------------------------------------------
  const beute = pruefeBeute(brett, sitz, letzteZelle);

  // --- 4. Sonderregel 1: Extrazug ----------------------------------------
  // Landet die letzte Kugel im eigenen Haus, bleibt das Zugrecht beim
  // Spieler (Regelwerk 3.3).
  const extrazug = zelleGleich(letzteZelle, SITZE[sitz].haus);

  // --- 5. Spielende -------------------------------------------------------
  // Bewusst VOR der Zugrechtvergabe und auch dann, wenn ein Extrazug
  // vorliegt: Ein Spieler kann seine Reihe mit genau dem Zug leeren, der ihm
  // einen Extrazug gibt – dann endet die Partie, statt ihn ins Leere ziehen
  // zu lassen (Konzept 5.4, Test T-13).
  const abrechnung = pruefeEnde(brett);
  const beendet = abrechnung !== null;

  // --- 6. Zugrecht --------------------------------------------------------
  let amZug = partie.amZug;
  if (!beendet && !extrazug) {
    amZug = SITZE[sitz].gegner;
  }

  // --- 7. Invarianten (Schicht 4, Konzept 7.7) ---------------------------
  const invarianten = pruefeInvarianten(brett);
  if (!invarianten.ok) {
    // Kein throw: Der Aufrufer beendet diese eine Partie kontrolliert, statt
    // den Prozess oder andere Partien mitzureissen (Fall F-11).
    return {
      ok: false,
      code: FEHLER.INTERNER_FEHLER,
      verletzungen: invarianten.verletzungen,
    };
  }

  const neuePartie = {
    ...partie,
    brett,
    amZug,
    zugNr: partie.zugNr + 1,
    status: beendet ? STATUS.BEENDET : STATUS.LAEUFT,
    ergebnis: beendet ? ergebnisVon(brett, GRUND.REGULAER) : null,
  };

  // Zugbericht fuer die Animation (Konzept 5.8, Entscheidung E-6). Alle Zellen
  // sind kanonisch; der Client dreht sie selbst mit ausSicht().
  const bericht = {
    sitz,
    mulde,
    vonZelle: startZelle,
    pfad,
    extrazug: beendet ? false : extrazug,  // nach Partieende gibt es keinen Extrazug mehr
    beute,
    abrechnung,
    brettVorher,
  };

  return { ok: true, partie: neuePartie, bericht };
}

/**
 * Liefert die Muldennummern 0..5, die dieser Sitz gerade spielen darf.
 *
 * Nicht regelrelevant, aber nuetzlich fuer den Zufallstest T-20 und fuer eine
 * spaetere Hilfestellung in der Oberflaeche.
 */
export function moeglicheZuege(partie, sitz) {
  const zuege = [];
  for (let n = GRENZEN.MULDE_MIN; n <= GRENZEN.MULDE_MAX; n += 1) {
    if (pruefeZug(partie, sitz, n).ok) zuege.push(n);
  }
  return zuege;
}

/** Gesamtzahl der Kugeln – fuer Tests und Anzeigen re-exportiert. */
export { KUGELN_GESAMT };
