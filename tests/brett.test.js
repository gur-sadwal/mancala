/**
 * brett.test.js – Brettmodell: Zellen, Sitze, Kopien und Prüfregeln.
 *
 * Die Prüfungen brauchen weder Server noch Browser. So werden falsche
 * Nachbarschaften und beschädigte Bretter direkt am Datenmodell erkannt.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import {
  OBEN,
  UNTEN,
  SITZE,
  KUGELN_GESAMT,
  neuesBrett,
  kopiereBrett,
  naechsteZelle,
  gegenueber,
  istHaus,
  zelleGleich,
  muldenSumme,
  muldenZellen,
  gesamtSumme,
  pruefeInvarianten,
  SITZ_NAMEN,
  istSitz,
} from '../server/spiel/brett.js';

// == 2. Testfälle ===========================================================

describe('T-03: Startbrett', () => {
  test('hat 2 Reihen zu je 7 Feldern', () => {
    const brett = neuesBrett();
    expect(brett).toHaveLength(2);
    expect(brett[OBEN]).toHaveLength(7);
    expect(brett[UNTEN]).toHaveLength(7);
  });

  test('enthält genau 48 Kugeln', () => {
    expect(gesamtSumme(neuesBrett())).toBe(KUGELN_GESAMT);
    expect(KUGELN_GESAMT).toBe(48);
  });

  test('entspricht der Startaufstellung aus Regel 3.1', () => {
    expect(neuesBrett()).toEqual([
      [0, 4, 4, 4, 4, 4, 4],
      [4, 4, 4, 4, 4, 4, 0],
    ]);
  });

  test('beide Häuser starten bei 0, jede Mulde bei 4', () => {
    const brett = neuesBrett();
    expect(brett[OBEN][0]).toBe(0);   // Haus oben
    expect(brett[UNTEN][6]).toBe(0);  // Haus unten
    expect(muldenSumme(brett, OBEN)).toBe(24);
    expect(muldenSumme(brett, UNTEN)).toBe(24);
  });
});

describe('T-01: naechsteZelle läuft im Ring', () => {
  test('14 Schritte führen von jeder Zelle wieder zum Ausgangspunkt', () => {
    // Das Brett hat 14 Felder. Wer 14-mal weitergeht, ist wieder da – sonst
    // stimmt der Ring der Zellen nicht.
    for (const reihe of [OBEN, UNTEN]) {
      for (let spalte = 0; spalte < 7; spalte += 1) {
        const start = [reihe, spalte];
        let zelle = start;
        for (let schritt = 0; schritt < 14; schritt += 1) {
          zelle = naechsteZelle(zelle);
        }
        expect(zelle).toEqual(start);
      }
    }
  });

  test('besucht in 14 Schritten jedes Feld genau einmal', () => {
    const besucht = new Set();
    let zelle = [UNTEN, 0];

    for (let schritt = 0; schritt < 14; schritt += 1) {
      besucht.add(zelle.join(','));
      zelle = naechsteZelle(zelle);
    }
    expect(besucht.size).toBe(14);
  });

  test('geht vom Haus unten in die obere Reihe und umgekehrt', () => {
    // Die beiden Übergangsstellen einzeln, weil dort die
    // Fallunterscheidung greift.
    expect(naechsteZelle([UNTEN, 6])).toEqual([OBEN, 6]);
    expect(naechsteZelle([OBEN, 0])).toEqual([UNTEN, 0]);
  });

  test('läuft unten aufwärts und oben abwärts', () => {
    expect(naechsteZelle([UNTEN, 0])).toEqual([UNTEN, 1]);
    expect(naechsteZelle([OBEN, 6])).toEqual([OBEN, 5]);
  });
});

describe('T-02: gegenueber', () => {
  // Jede Mulde wird in beide Richtungen geprüft: Ein Spaltenversatz
  // würde erst beim Klauen als scheinbarer Regelfehler auffallen.
  const paare = [
    [[UNTEN, 0], [OBEN, 1]],
    [[UNTEN, 1], [OBEN, 2]],
    [[UNTEN, 2], [OBEN, 3]],
    [[UNTEN, 3], [OBEN, 4]],
    [[UNTEN, 4], [OBEN, 5]],
    [[UNTEN, 5], [OBEN, 6]],
  ];

  test.each(paare)('%j liegt gegenüber von %j', (unten, oben) => {
    expect(gegenueber(unten)).toEqual(oben);
  });

  test('ist beidseitig: gegenueber(gegenueber(x)) === x', () => {
    for (const [unten, oben] of paare) {
      expect(gegenueber(oben)).toEqual(unten);
      expect(gegenueber(gegenueber(unten))).toEqual(unten);
    }
  });

  test('trifft nie ein Haus', () => {
    for (const [unten, oben] of paare) {
      expect(istHaus(gegenueber(unten))).toBe(false);
      expect(istHaus(gegenueber(oben))).toBe(false);
    }
  });
});

describe('T-21: Sitzabbildung', () => {
  test('Sitz unten: Muldennummer n liegt auf [1, n]', () => {
    for (let n = 0; n <= 5; n += 1) {
      expect(SITZE.unten.mulde(n)).toEqual([UNTEN, n]);
    }
  });

  test('Sitz oben: Muldennummer n liegt auf [0, 6 - n]', () => {
    // Für den oberen Sitz zählt der Server die Spalten rückwärts;
    // der Client dreht das Brett erst bei der Darstellung.
    const erwartet = [
      [OBEN, 6], [OBEN, 5], [OBEN, 4], [OBEN, 3], [OBEN, 2], [OBEN, 1],
    ];
    for (let n = 0; n <= 5; n += 1) {
      expect(SITZE.oben.mulde(n)).toEqual(erwartet[n]);
    }
  });

  test('Mulde 5 liegt bei beiden Sitzen direkt neben dem eigenen Haus', () => {
    // "Direkt neben dem Haus" heißt: die nächste Zelle ist das eigene Haus.
    expect(naechsteZelle(SITZE.unten.mulde(5))).toEqual([...SITZE.unten.haus]);
    expect(naechsteZelle(SITZE.oben.mulde(5))).toEqual([...SITZE.oben.haus]);
  });

  test('Häuser und gegnerische Häuser sind gekreuzt zugeordnet', () => {
    expect(zelleGleich(SITZE.unten.haus, SITZE.oben.gegnerHaus)).toBe(true);
    expect(zelleGleich(SITZE.oben.haus, SITZE.unten.gegnerHaus)).toBe(true);
    expect(SITZE.unten.gegner).toBe('oben');
    expect(SITZE.oben.gegner).toBe('unten');
  });

  test('keine Muldennummer trifft ein Haus', () => {
    for (const sitz of ['unten', 'oben']) {
      for (let n = 0; n <= 5; n += 1) {
        expect(istHaus(SITZE[sitz].mulde(n))).toBe(false);
      }
    }
  });
});

describe('istHaus und muldenZellen', () => {
  test('genau zwei Felder sind Häuser', () => {
    expect(istHaus([OBEN, 0])).toBe(true);
    expect(istHaus([UNTEN, 6])).toBe(true);
    expect(istHaus([OBEN, 6])).toBe(false);
    expect(istHaus([UNTEN, 0])).toBe(false);
  });

  test('muldenZellen liefert je Reihe sechs Mulden ohne Haus', () => {
    for (const reihe of [OBEN, UNTEN]) {
      const zellen = muldenZellen(reihe);
      expect(zellen).toHaveLength(6);
      expect(zellen.every((z) => !istHaus(z))).toBe(true);
    }
  });
});

describe('kopiereBrett', () => {
  test('erzeugt eine echte Tiefenkopie', () => {
    const original = neuesBrett();
    const kopie = kopiereBrett(original);

    kopie[UNTEN][0] = 99;

    // Wäre die Kopie flach, wäre das Original jetzt mitverändert.
    expect(original[UNTEN][0]).toBe(4);
    expect(kopie[UNTEN][0]).toBe(99);
  });
});

describe('Invarianten des Bretts', () => {
  test('das Startbrett erfüllt alle Invarianten', () => {
    expect(pruefeInvarianten(neuesBrett()).ok).toBe(true);
  });

  test('I-1 schlägt an, wenn eine Kugel verschwindet', () => {
    const brett = neuesBrett();
    brett[UNTEN][0] -= 1;

    const ergebnis = pruefeInvarianten(brett);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.verletzungen.join(' ')).toContain('I-1');
  });

  test('I-2 schlägt bei negativen Feldern an', () => {
    const brett = neuesBrett();
    brett[UNTEN][0] = -4;
    brett[UNTEN][1] = 12;   // Summe bleibt 48, nur I-2 ist verletzt

    const ergebnis = pruefeInvarianten(brett);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.verletzungen.join(' ')).toContain('I-2');
  });

  test('I-2 schlägt schon bei einem Feld mit -1 an', () => {
    const brett = neuesBrett();
    brett[UNTEN][0] = -1;
    brett[UNTEN][1] = 9;   // Summe bleibt 48, nur I-2 ist verletzt

    const ergebnis = pruefeInvarianten(brett);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.verletzungen.join(' ')).toContain('I-2');
  });

  test('I-3 schlägt bei falscher Form an', () => {
    expect(pruefeInvarianten([[1, 2, 3]]).ok).toBe(false);
    expect(pruefeInvarianten(null).ok).toBe(false);
  });
});

describe('Sicherheitsnetz vor dem Umbau', () => {
  test('I-3 schlägt an, wenn ein Feld keine ganze Zahl ist', () => {
    const brett = neuesBrett();
    brett[UNTEN][0] = 3.5;
    brett[UNTEN][1] = 4.5;   // Summe bleibt 48

    const ergebnis = pruefeInvarianten(brett);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.verletzungen).toEqual(['I-3: Feld ist keine ganze Zahl']);
  });

  test('muldenSumme zählt genau die Felder aus muldenZellen', () => {
    const brett = [
      [7, 1, 2, 3, 4, 5, 6],
      [8, 9, 10, 11, 12, 13, 14],
    ];

    for (const reihe of [OBEN, UNTEN]) {
      let erwartet = 0;
      for (const [r, s] of muldenZellen(reihe)) erwartet += brett[r][s];
      expect(muldenSumme(brett, reihe)).toBe(erwartet);
    }
    expect(muldenSumme(brett, OBEN)).toBe(21);
    expect(muldenSumme(brett, UNTEN)).toBe(63);
  });

  test('istSitz kennt genau die beiden Sitznamen', () => {
    expect(SITZ_NAMEN.every((sitz) => istSitz(sitz))).toBe(true);
    for (const falsch of ['links', '', null, undefined, '__proto__', 'Unten']) {
      expect(istSitz(falsch)).toBe(false);
    }
  });
});
