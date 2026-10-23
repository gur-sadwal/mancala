/**
 * brett.js – die Brettzellen auf dem Server.
 *
 * Legt das Brett an und liefert seine Nachbarn, Punkte und Prüfregeln.
 * Die passende Darstellung im Browser steht in client/js/spiel.js.
 *
 * Inhalt:
 *   == 1. Größen und Sitze
 *   == 2. Brett aufbauen
 *   == 3. Zellen und Nachbarn
 *   == 4. Punkte und Summen
 *   == 5. Prüfregeln nach einem Zug
 *
 * Benutzt von: Engine, Partie und Tests. Braucht keine Bibliothek.
 */

// == 1. Größen und Sitze =================================================
// REGEL 3.1: Zwei Reihen, sechs Mulden je Sitz, vier Kugeln je Mulde.
export const OBEN = 0;
export const UNTEN = 1;

const MULDEN_JE_SEITE = 6;
const START_KUGELN = 4;
export const KUGELN_GESAMT = MULDEN_JE_SEITE * 2 * START_KUGELN;
const SPALTEN = MULDEN_JE_SEITE + 1;

// Das obere Haus liegt in Spalte 0, das untere in Spalte 6. So passen beide
// Reihen samt Haus in ein Array der Form [2][7].
const HAUS_OBEN = Object.freeze([OBEN, 0]);
const HAUS_UNTEN = Object.freeze([UNTEN, MULDEN_JE_SEITE]);

// SITZE beschreibt die Server-Sicht; für „oben“ dreht der Browser das Brett.
// Mulde 0 liegt bei beiden Sitzen am weitesten vom eigenen Haus entfernt,
// oben zählt mulde(n) deshalb von Spalte 6 abwärts.
// ACHTUNG: tests/sicht.test.js vergleicht beide Abbildungen.
export const SITZE = Object.freeze({
  unten: Object.freeze({
    reihe: UNTEN,
    haus: HAUS_UNTEN,
    gegnerHaus: HAUS_OBEN,
    gegner: 'oben',

    mulde: (n) => [UNTEN, n],
  }),
  oben: Object.freeze({
    reihe: OBEN,
    haus: HAUS_OBEN,
    gegnerHaus: HAUS_UNTEN,
    gegner: 'unten',

    mulde: (n) => [OBEN, MULDEN_JE_SEITE - n],
  }),
});

export const SITZ_NAMEN = Object.freeze(['unten', 'oben']);

export function istSitz(sitz) {
  return SITZ_NAMEN.includes(sitz);
}

// == 2. Brett aufbauen ===================================================
export function neuesBrett() {
  const reiheOben = [0];
  const reiheUnten = [];

  for (let i = 0; i < MULDEN_JE_SEITE; i += 1) {
    reiheOben.push(START_KUGELN);
    reiheUnten.push(START_KUGELN);
  }
  reiheUnten.push(0);

  return [reiheOben, reiheUnten];
}

/** Beide Reihen kopieren, damit die Engine das alte Brett nicht verändert. */
export function kopiereBrett(brett) {
  return [[...brett[OBEN]], [...brett[UNTEN]]];
}

// == 3. Zellen und Nachbarn ==============================================
export function lies(brett, [reihe, spalte]) {
  return brett[reihe][spalte];
}

export function setze(brett, [reihe, spalte], wert) {
  brett[reihe][spalte] = wert;
}

export function erhoehe(brett, [reihe, spalte], betrag = 1) {
  brett[reihe][spalte] += betrag;
}

// === erkennt nur dasselbe Array. Für gleiche Zellen beide Zahlen vergleichen.
export function zelleGleich(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

export function istHaus(zelle) {
  return zelleGleich(zelle, HAUS_OBEN) || zelleGleich(zelle, HAUS_UNTEN);
}

export function istInEigenerReihe(sitz, [reihe]) {
  return reihe === SITZE[sitz].reihe;
}

// REGEL 3.2: Gegen den Uhrzeigersinn, in der Server-Sicht also unten nach
// rechts und oben nach links.
export function naechsteZelle([reihe, spalte]) {
  if (reihe === UNTEN) {
    if (spalte < MULDEN_JE_SEITE) return [UNTEN, spalte + 1];
    return [OBEN, MULDEN_JE_SEITE];
  }

  return spalte > 0 ? [OBEN, spalte - 1] : [UNTEN, 0];
}

// ACHTUNG: Gegenüber liegt wegen des oberen Hauses eine Spalte versetzt.
// Nur für Mulden aufrufen; die Engine schließt Häuser vorher aus.
export function gegenueber([reihe, spalte]) {
  return reihe === UNTEN ? [OBEN, spalte + 1] : [UNTEN, spalte - 1];
}

// == 4. Punkte und Summen ================================================
// REGEL 3.5: Eine Reihe ohne Kugeln in ihren Mulden beendet die Partie.
export function muldenSumme(brett, reihe) {
  let summe = 0;
  for (const zelle of muldenZellen(reihe)) {
    summe += lies(brett, zelle);
  }
  return summe;
}

export function muldenZellen(reihe) {
  const von = reihe === OBEN ? 1 : 0;
  const zellen = [];
  for (let s = von; s < von + MULDEN_JE_SEITE; s += 1) {
    zellen.push([reihe, s]);
  }
  return zellen;
}

export function punkteVon(brett, sitz) {
  return lies(brett, SITZE[sitz].haus);
}

export function gesamtSumme(brett) {
  return brett[OBEN].reduce((a, b) => a + b, 0)
    + brett[UNTEN].reduce((a, b) => a + b, 0);
}

// == 5. Prüfregeln nach einem Zug ========================================
/**
 * SCHUTZ: Diese Invarianten müssen nach jedem Zug gelten.
 * I-1 zählt Kugeln, I-2 verbietet negative Werte, I-3 prüft Form und Zahlen.
 * Falsch verteilte Kugeln erkennt die Summe allein nicht; dafür gibt es Tests.
 */
export function pruefeInvarianten(brett) {
  const verletzungen = [];

  const formOk = Array.isArray(brett)
    && brett.length === 2
    && brett.every((reihe) => Array.isArray(reihe) && reihe.length === SPALTEN);

  if (!formOk) {
    return {
      ok: false,
      verletzungen: ['I-3: Brett hat nicht die Form [2][7]'],
    };
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

  const summe = gesamtSumme(brett);
  if (summe !== KUGELN_GESAMT) {
    verletzungen.push(`I-1: Summe ist ${summe} statt ${KUGELN_GESAMT}`);
  }

  return { ok: verletzungen.length === 0, verletzungen };
}
