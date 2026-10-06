/**
 * Das Brett: Aufbau, Nachbarschaft, Sichtbezuege, Invarianten (Konzept 4).
 *
 * Diese Datei ist die EINZIGE Stelle im Projekt, an der mit Zellenindizes
 * gerechnet wird. Kein anderes Modul bildet Muldennummern selbst auf
 * [reihe, spalte] ab (Konzept 4.9). Wer die Darstellung austauschen will,
 * muss deshalb nur diese Datei anfassen.
 *
 * Abhaengigkeiten: KEINE. Das Modul kennt weder Socket.io noch Express noch
 * das DOM – nur so ist es ohne laufenden Server testbar (Konzept 3.4, NFA-09).
 */

// ---------------------------------------------------------------------------
// Grundgroessen
// ---------------------------------------------------------------------------

/** Reihe 0 = obere Tischseite. */
export const OBEN = 0;

/** Reihe 1 = untere Tischseite. */
export const UNTEN = 1;

/** Mulden je Spieler. */
export const MULDEN_JE_SEITE = 6;

/** Kugeln, mit denen jede Mulde startet. */
export const START_KUGELN = 4;

/** 12 Mulden * 4 Kugeln = 48. Diese Zahl ist die Grundlage von Invariante I-1. */
export const KUGELN_GESAMT = MULDEN_JE_SEITE * 2 * START_KUGELN;

/** Spalten je Reihe: 6 Mulden + 1 Haus. */
export const SPALTEN = MULDEN_JE_SEITE + 1;

// ---------------------------------------------------------------------------
// Sitz-Konfiguration (Konzept 4.4)
// ---------------------------------------------------------------------------

/**
 * Alles, was von der Tischseite abhaengt, steht an genau dieser einen Stelle.
 * Damit gibt es im weiteren Code keine verstreuten `if (sitz === ...)`-Zweige;
 * jede Regel liest ihre Zellen aus dieser Tabelle.
 *
 * Die Bezeichner `oben`/`unten` beschreiben die Lage im SERVERMODELL, nicht
 * das, was ein Spieler sieht. Der Spieler auf dem Sitz `oben` sieht seine
 * eigene Reihe natuerlich unten – dafuer sorgt allein die Sichttransformation
 * im Client (Konzept 4.6).
 */
export const SITZE = Object.freeze({
  unten: Object.freeze({
    reihe: UNTEN,
    haus: Object.freeze([UNTEN, 6]),
    gegnerHaus: Object.freeze([OBEN, 0]),
    gegner: 'oben',
    // Muldennummer aus Spielersicht -> Zelle. 0 = am weitesten vom eigenen
    // Haus entfernt, 5 = direkt daneben (Konzept 4.5).
    mulde: (n) => [UNTEN, n],
  }),
  oben: Object.freeze({
    reihe: OBEN,
    haus: Object.freeze([OBEN, 0]),
    gegnerHaus: Object.freeze([UNTEN, 6]),
    gegner: 'unten',
    // Der obere Spieler sitzt gegenueber: seine Zaehlung laeuft auf dem
    // Bildschirm von rechts nach links, deshalb 6 - n.
    mulde: (n) => [OBEN, 6 - n],
  }),
});

/** Die beiden Sitznamen als Liste – fuer Schleifen ueber beide Spieler. */
export const SITZ_NAMEN = Object.freeze(['unten', 'oben']);

/** Prueft, ob eine Zeichenkette ein gueltiger Sitzname ist. */
export function istSitz(sitz) {
  return sitz === 'unten' || sitz === 'oben';
}

// ---------------------------------------------------------------------------
// Aufbau
// ---------------------------------------------------------------------------

/**
 * Erzeugt den Startzustand des Bretts (Konzept 4.1).
 *
 *   Reihe 0: [Haus oben, L12, L11, L10, L9, L8, L7]
 *   Reihe 1: [L1, L2, L3, L4, L5, L6, Haus unten]
 *
 * Die obere Reihe ist "rueckwaerts" gefuellt, weil die Array-Reihenfolge der
 * BILDSCHIRMDARSTELLUNG folgt, nicht der Zaehlung des oberen Spielers. Genau
 * diesen Unterschied loest SITZE.oben.mulde() wieder auf.
 *
 * @returns {number[][]} frisches Brett, 2 Reihen zu 7 Zahlen, Summe 48
 */
export function neuesBrett() {
  const reiheOben = [0];  // [0,0] ist das Haus des oberen Spielers
  const reiheUnten = [];

  for (let i = 0; i < MULDEN_JE_SEITE; i += 1) {
    reiheOben.push(START_KUGELN);
    reiheUnten.push(START_KUGELN);
  }
  reiheUnten.push(0);     // [1,6] ist das Haus des unteren Spielers

  return [reiheOben, reiheUnten];
}

/**
 * Tiefe Kopie des Bretts.
 *
 * Die Engine arbeitet grundsaetzlich auf einer Kopie und gibt das Ergebnis
 * zurueck, statt die Eingabe zu veraendern (Konzept 5.1, Test T-22). Ein
 * `[...brett]` waere hier zu flach – die inneren Arrays waeren geteilt.
 */
export function kopiereBrett(brett) {
  return [[...brett[OBEN]], [...brett[UNTEN]]];
}

// ---------------------------------------------------------------------------
// Zellenzugriff
// ---------------------------------------------------------------------------

/** Liest den Inhalt einer Zelle. */
export function lies(brett, [reihe, spalte]) {
  return brett[reihe][spalte];
}

/** Schreibt einen Wert in eine Zelle (veraendert das uebergebene Brett). */
export function setze(brett, [reihe, spalte], wert) {
  brett[reihe][spalte] = wert;
}

/** Erhoeht eine Zelle um einen Betrag (Standard: 1 Kugel). */
export function erhoehe(brett, [reihe, spalte], betrag = 1) {
  brett[reihe][spalte] += betrag;
}

/** Vergleicht zwei Zellenadressen. Arrays lassen sich nicht mit === pruefen. */
export function zelleGleich(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Ist diese Zelle ein Haus?
 *
 * Haeuser sind genau [0,0] (oben) und [1,6] (unten) – jeweils das Feld am
 * aeusseren Ende der eigenen Reihe.
 */
export function istHaus([reihe, spalte]) {
  return (reihe === OBEN && spalte === 0) || (reihe === UNTEN && spalte === 6);
}

/** Gehoert die Zelle zur Reihe dieses Sitzes? */
export function istInEigenerReihe(sitz, [reihe]) {
  return reihe === SITZE[sitz].reihe;
}

// ---------------------------------------------------------------------------
// Nachbarschaft: die Schlangenlinie (Konzept 4.2)
// ---------------------------------------------------------------------------

/**
 * Liefert die naechste Zelle gegen den Uhrzeigersinn.
 *
 * Das Brett ist physisch ein Ring, das Array ist es nicht. Der Nachfolger
 * ergibt sich deshalb aus einer Fallunterscheidung nach Reihe: In der unteren
 * Reihe waechst die Spalte, in der oberen schrumpft sie.
 *
 *   [1,0] -> [1,1] -> ... -> [1,6]*        * Haus "unten"
 *     ^                        |
 *     |                        v
 *   [0,0]# <- [0,1] <- ... <- [0,6]        # Haus "oben"
 *
 * Vierzehn Aufrufe fuehren wieder zum Ausgangspunkt – genau das prueft Test
 * T-01, weil ein Vorzeichenfehler hier jede weitere Regel kaputt machen wuerde.
 */
export function naechsteZelle([reihe, spalte]) {
  if (reihe === UNTEN) {
    // Untere Reihe laeuft nach rechts; hinter dem Haus [1,6] geht es in der
    // oberen Reihe ganz rechts weiter.
    return spalte < 6 ? [UNTEN, spalte + 1] : [OBEN, 6];
  }
  // Obere Reihe laeuft nach links; hinter dem Haus [0,0] geht es unten links
  // weiter.
  return spalte > 0 ? [OBEN, spalte - 1] : [UNTEN, 0];
}

/**
 * Liefert die physisch gegenueberliegende Mulde (Konzept 4.3).
 *
 * ACHTUNG, der Fallstrick des ganzen Datenmodells: Im Array ist das NICHT
 * dieselbe Spalte, sondern um eins versetzt, weil Spalte 0 der oberen Reihe
 * vom Haus belegt ist.
 *
 *   [0,1] [0,2] [0,3] [0,4] [0,5] [0,6]     obere Mulden
 *     |     |     |     |     |     |
 *     v     v     v     v     v     v
 *   [1,0] [1,1] [1,2] [1,3] [1,4] [1,5]     untere Mulden
 *
 * Nur fuer MULDEN definiert, nie fuer ein Haus. Der einzige Aufrufer
 * (Klau-Regel, Konzept 5.5) stellt das sicher, indem er Haeuser vorher
 * ausschliesst.
 */
export function gegenueber([reihe, spalte]) {
  return reihe === UNTEN ? [OBEN, spalte + 1] : [UNTEN, spalte - 1];
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

/**
 * Summe der sechs MULDEN einer Reihe – ohne das Haus.
 *
 * Grundlage der Endebedingung: Ist diese Summe 0, kann der betreffende
 * Spieler keinen legalen Zug mehr machen (Konzept 5.6).
 */
export function muldenSumme(brett, reihe) {
  const zeile = brett[reihe];
  // Obere Reihe: Spalten 1..6 sind Mulden (Spalte 0 ist das Haus).
  // Untere Reihe: Spalten 0..5 sind Mulden (Spalte 6 ist das Haus).
  const von = reihe === OBEN ? 1 : 0;
  let summe = 0;
  for (let s = von; s < von + MULDEN_JE_SEITE; s += 1) {
    summe += zeile[s];
  }
  return summe;
}

/** Alle Muldenzellen einer Reihe, in Array-Reihenfolge. */
export function muldenZellen(reihe) {
  const von = reihe === OBEN ? 1 : 0;
  const zellen = [];
  for (let s = von; s < von + MULDEN_JE_SEITE; s += 1) {
    zellen.push([reihe, s]);
  }
  return zellen;
}

/** Kugeln im Haus eines Sitzes = dessen Punktestand. */
export function punkteVon(brett, sitz) {
  return lies(brett, SITZE[sitz].haus);
}

/** Summe aller 14 Felder. Muss immer 48 sein (Invariante I-1). */
export function gesamtSumme(brett) {
  return brett[OBEN].reduce((a, b) => a + b, 0)
    + brett[UNTEN].reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// Invarianten (Konzept 4.8)
// ---------------------------------------------------------------------------

/**
 * Prueft die strukturellen Invarianten I-1 bis I-3.
 *
 * I-1 (Summe = 48) ist die wirksamste Fehlerbremse des ganzen Projekts: Fast
 * jeder denkbare Fehler beim Saeen, Ueberspringen oder Klauen verletzt sie
 * sofort. Sie wird nach JEDEM Zug geprueft; schlaegt sie fehl, wird die Partie
 * kontrolliert abgebrochen und protokolliert, statt einen kaputten Zustand
 * weiterzuverbreiten (Konzept 7.7, Fall F-11).
 *
 * @returns {{ok: boolean, verletzungen: string[]}}
 */
export function pruefeInvarianten(brett) {
  const verletzungen = [];

  // I-3: Form des Bretts
  const formOk = Array.isArray(brett)
    && brett.length === 2
    && brett.every((reihe) => Array.isArray(reihe) && reihe.length === SPALTEN);

  if (!formOk) {
    // Ohne korrekte Form sind die weiteren Pruefungen sinnlos.
    return { ok: false, verletzungen: ['I-3: Brett hat nicht die Form [2][7]'] };
  }

  for (const reihe of brett) {
    for (const wert of reihe) {
      if (!Number.isInteger(wert)) {
        verletzungen.push('I-3: Feld ist keine ganze Zahl');
        break;
      }
      if (wert < 0) {
        verletzungen.push('I-2: Feld ist negativ');
        break;
      }
    }
  }

  // I-1: Kugelzahl bleibt erhalten
  const summe = gesamtSumme(brett);
  if (summe !== KUGELN_GESAMT) {
    verletzungen.push(`I-1: Summe ist ${summe} statt ${KUGELN_GESAMT}`);
  }

  return { ok: verletzungen.length === 0, verletzungen };
}
