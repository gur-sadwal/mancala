/**
 * Tests des Datenmodells (Konzept 10.3, Faelle T-01 bis T-03 und T-21).
 *
 * Diese Tests laufen ohne Server und ohne Browser – genau dafuer ist
 * `brett.js` frei von Socket.io-, Express- und DOM-Bezuegen (Konzept 3.4).
 */

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
} from '../server/spiel/brett.js';

describe('T-03: Startbrett', () => {
  test('hat 2 Reihen zu je 7 Feldern', () => {
    const brett = neuesBrett();
    expect(brett).toHaveLength(2);
    expect(brett[OBEN]).toHaveLength(7);
    expect(brett[UNTEN]).toHaveLength(7);
  });

  test('enthaelt genau 48 Kugeln', () => {
    expect(gesamtSumme(neuesBrett())).toBe(KUGELN_GESAMT);
    expect(KUGELN_GESAMT).toBe(48);
  });

  test('entspricht dem Literal aus Konzept 4.1', () => {
    expect(neuesBrett()).toEqual([
      [0, 4, 4, 4, 4, 4, 4],
      [4, 4, 4, 4, 4, 4, 0],
    ]);
  });

  test('beide Haeuser starten bei 0, jede Mulde bei 4', () => {
    const brett = neuesBrett();
    expect(brett[OBEN][0]).toBe(0);   // Haus oben
    expect(brett[UNTEN][6]).toBe(0);  // Haus unten
    expect(muldenSumme(brett, OBEN)).toBe(24);
    expect(muldenSumme(brett, UNTEN)).toBe(24);
  });
});

describe('T-01: naechsteZelle laeuft im Ring', () => {
  test('14 Schritte fuehren von jeder Zelle wieder zum Ausgangspunkt', () => {
    // Das Brett hat 14 Felder. Wer 14-mal weitergeht, ist wieder da – sonst
    // stimmt die Schlangenlinie nicht (Konzept 4.2).
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
    // Die beiden Uebergangsstellen einzeln, weil dort die
    // Fallunterscheidung greift.
    expect(naechsteZelle([UNTEN, 6])).toEqual([OBEN, 6]);
    expect(naechsteZelle([OBEN, 0])).toEqual([UNTEN, 0]);
  });

  test('laeuft unten aufwaerts und oben abwaerts', () => {
    expect(naechsteZelle([UNTEN, 0])).toEqual([UNTEN, 1]);
    expect(naechsteZelle([OBEN, 6])).toEqual([OBEN, 5]);
  });
});

describe('T-02: gegenueber', () => {
  // Die Paare aus der Tabelle in Konzept 4.3. Ein "off by one" hier wuerde zu
  // einem Spiel fuehren, das FAST richtig aussieht – deshalb alle zwoelf.
  const paare = [
    [[UNTEN, 0], [OBEN, 1]],
    [[UNTEN, 1], [OBEN, 2]],
    [[UNTEN, 2], [OBEN, 3]],
    [[UNTEN, 3], [OBEN, 4]],
    [[UNTEN, 4], [OBEN, 5]],
    [[UNTEN, 5], [OBEN, 6]],
  ];

  test.each(paare)('%j liegt gegenueber von %j', (unten, oben) => {
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
    // Der obere Spieler sitzt gegenueber, seine Zaehlung laeuft auf dem
    // Bildschirm von rechts nach links (Konzept 4.5).
    const erwartet = [
      [OBEN, 6], [OBEN, 5], [OBEN, 4], [OBEN, 3], [OBEN, 2], [OBEN, 1],
    ];
    for (let n = 0; n <= 5; n += 1) {
      expect(SITZE.oben.mulde(n)).toEqual(erwartet[n]);
    }
  });

  test('Mulde 5 liegt bei beiden Sitzen direkt neben dem eigenen Haus', () => {
    // "Direkt neben dem Haus" heisst: die naechste Zelle ist das eigene Haus.
    expect(naechsteZelle(SITZE.unten.mulde(5))).toEqual([...SITZE.unten.haus]);
    expect(naechsteZelle(SITZE.oben.mulde(5))).toEqual([...SITZE.oben.haus]);
  });

  test('Haeuser und gegnerische Haeuser sind gekreuzt zugeordnet', () => {
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
  test('genau zwei Felder sind Haeuser', () => {
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

    // Waere die Kopie flach, waere das Original jetzt mitveraendert.
    expect(original[UNTEN][0]).toBe(4);
    expect(kopie[UNTEN][0]).toBe(99);
  });
});

describe('Invarianten (Konzept 4.8)', () => {
  test('das Startbrett erfuellt alle Invarianten', () => {
    expect(pruefeInvarianten(neuesBrett()).ok).toBe(true);
  });

  test('I-1 schlaegt an, wenn eine Kugel verschwindet', () => {
    const brett = neuesBrett();
    brett[UNTEN][0] -= 1;

    const ergebnis = pruefeInvarianten(brett);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.verletzungen.join(' ')).toContain('I-1');
  });

  test('I-2 schlaegt bei negativen Feldern an', () => {
    const brett = neuesBrett();
    brett[UNTEN][0] = -4;
    brett[UNTEN][1] = 12;   // Summe bleibt 48, nur I-2 ist verletzt

    const ergebnis = pruefeInvarianten(brett);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.verletzungen.join(' ')).toContain('I-2');
  });

  test('I-3 schlaegt bei falscher Form an', () => {
    expect(pruefeInvarianten([[1, 2, 3]]).ok).toBe(false);
    expect(pruefeInvarianten(null).ok).toBe(false);
  });
});
