/**
 * engine.test.js – Kalaha-Spielregeln und ungültige Züge.
 *
 * Regeltests verwenden Bretter mit 48 Kugeln. Beschädigte Bretter werden
 * gezielt getrennt geprüft, damit sie einen Regeltest nicht verdecken.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Säen
 *   == 3. Extrazug
 *   == 4. Klauen
 *   == 5. Spielende
 *   == 6. Zugvalidierung
 *   == 7. Reinheit und Zufallstest
 *   == 8. Beschädigte Bretter und beide Sitze
 */

// == 1. Testaufbau ==========================================================

import {
  pruefeZug,
  fuehreZugAus,
  ergebnisVon,
  moeglicheZuege,
} from '../server/spiel/engine.js';

import { neuesBrett, gesamtSumme, muldenSumme, OBEN, UNTEN } from '../server/spiel/brett.js';
import { STATUS, FEHLER, GRUND, REMIS } from '../shared/protokoll.js';


/** Baut eine laufende Partie um ein vorgegebenes Brett. */
function partieMit(brett, amZug = 'unten') {
  return {
    id: 'g-test',
    status: STATUS.LAEUFT,
    brett,
    amZug,
    zugNr: 0,
    spieler: {
      unten: { socketId: 'a', name: 'Unten' },
      oben: { socketId: 'b', name: 'Oben' },
    },
    ergebnis: null,
    letzteAktivitaet: 0,
  };
}

/** Kurzform: Partie im Startzustand. */
const startPartie = (amZug = 'unten') => partieMit(neuesBrett(), amZug);

/** Führt einen Zug aus und besteht darauf, dass er gelingt. */
function zug(partie, sitz, mulde) {
  const ergebnis = fuehreZugAus(partie, sitz, mulde);
  if (!ergebnis.ok) {
    throw new Error(`Zug haette gelingen muessen, war aber ${ergebnis.code}`);
  }
  return ergebnis;
}

// == 2. Säen ================================================================

describe('T-04: einfacher Zug innerhalb der eigenen Reihe', () => {
  test('vier Mulden bekommen je eine Kugel, die Startmulde wird leer', () => {
    // Startbrett, Sitz unten spielt Mulde 0 = [1,0] mit 4 Kugeln.
    // Bestreut werden [1,1], [1,2], [1,3], [1,4].
    const { partie, bericht } = zug(startPartie(), 'unten', 0);

    expect(partie.brett[UNTEN]).toEqual([0, 5, 5, 5, 5, 4, 0]);
    expect(partie.brett[OBEN]).toEqual([0, 4, 4, 4, 4, 4, 4]);

    expect(bericht.pfad).toEqual([[1, 1], [1, 2], [1, 3], [1, 4]]);
    expect(bericht.vonZelle).toEqual([1, 0]);
    expect(bericht.extrazug).toBe(false);
    expect(bericht.beute).toBeNull();

    // Zugrecht wechselt.
    expect(partie.amZug).toBe('oben');
    expect(partie.zugNr).toBe(1);
    expect(gesamtSumme(partie.brett)).toBe(48);
  });
});

describe('T-05: Zug, dessen Pfad das eigene Haus berührt', () => {
  test('das eigene Haus bekommt genau eine Kugel', () => {
    // Sitz unten spielt Mulde 3 = [1,3]: [1,4], [1,5], [1,6] (Haus), [0,6].
    const { partie, bericht } = zug(startPartie(), 'unten', 3);

    expect(partie.brett[UNTEN]).toEqual([4, 4, 4, 0, 5, 5, 1]);
    expect(partie.brett[OBEN]).toEqual([0, 4, 4, 4, 4, 4, 5]);

    // Letzte Kugel liegt in einer gegnerischen Mulde, nicht im Haus.
    expect(bericht.extrazug).toBe(false);
    expect(partie.amZug).toBe('oben');
    expect(gesamtSumme(partie.brett)).toBe(48);
  });
});

describe('T-06: Zug über die gegnerische Seite', () => {
  test('gegnerische Mulden werden besät, das gegnerische Haus nicht', () => {
    // Sitz unten spielt Mulde 5 = [1,5] mit 6 Kugeln:
    // [1,6] (eigenes Haus), [0,6], [0,5], [0,4], [0,3], [0,2].
    const partie = partieMit([
      [0, 4, 4, 4, 4, 4, 4],
      [1, 0, 0, 0, 0, 6, 17],
    ]);
    expect(gesamtSumme(partie.brett)).toBe(48);   // Kontrolle des Testbretts

    const ergebnis = zug(partie, 'unten', 5);

    // REGEL 3.2: Das gegnerische Haus wird beim Säen übersprungen.
    expect(ergebnis.partie.brett[OBEN][0]).toBe(0);

    expect(ergebnis.partie.brett[OBEN]).toEqual([0, 4, 5, 5, 5, 5, 5]);
    expect(ergebnis.partie.brett[UNTEN]).toEqual([1, 0, 0, 0, 0, 0, 18]);
    expect(gesamtSumme(ergebnis.partie.brett)).toBe(48);
  });

  test('ein sehr langer Zug überspringt das gegnerische Haus genau einmal', () => {
    // 13 Kugeln = eine volle Runde über alle erreichbaren Felder.
    const partie = partieMit([
      [0, 1, 1, 1, 1, 1, 1],
      [13, 0, 0, 0, 0, 0, 29],
    ]);
    expect(gesamtSumme(partie.brett)).toBe(48);

    const { bericht } = zug(partie, 'unten', 0);

    // 13 Kugeln, 13 Ziele – das gegnerische Haus ist keines davon.
    expect(bericht.pfad).toHaveLength(13);
    expect(bericht.pfad.some(([r, s]) => r === OBEN && s === 0)).toBe(false);
  });
});

// == 3. Extrazug ============================================================

describe('T-07: letzte Kugel im eigenen Haus', () => {
  test('Extrazug: amZug bleibt beim selben Spieler (Beispiel B1)', () => {
    // REGEL 3.3: Aus Mulde 2 endet der Eröffnungszug im eigenen Haus.
    const { partie, bericht } = zug(startPartie(), 'unten', 2);

    expect(partie.brett[UNTEN]).toEqual([4, 4, 0, 5, 5, 5, 1]);
    expect(partie.brett[OBEN]).toEqual([0, 4, 4, 4, 4, 4, 4]);

    expect(bericht.extrazug).toBe(true);
    expect(partie.amZug).toBe('unten');
    expect(partie.status).toBe(STATUS.LAEUFT);
  });

  test('Beispiel B2: der Anschlusszug wechselt das Zugrecht', () => {
    // Der Anschlusszug aus Mulde 5 endet auf der gegnerischen Seite.
    const nachB1 = zug(startPartie(), 'unten', 2).partie;
    const { partie } = zug(nachB1, 'unten', 5);

    expect(partie.brett[OBEN]).toEqual([0, 4, 4, 5, 5, 5, 5]);
    expect(partie.brett[UNTEN]).toEqual([4, 4, 0, 5, 5, 0, 2]);
    expect(partie.amZug).toBe('oben');
  });

  test('der Sitz oben bekommt seinen Extrazug genauso', () => {
    // Sitz oben spielt Mulde 2 = [0,4] mit 4 Kugeln:
    // [0,3], [0,2], [0,1], [0,0] = eigenes Haus.
    const { partie, bericht } = zug(startPartie('oben'), 'oben', 2);

    expect(bericht.extrazug).toBe(true);
    expect(partie.amZug).toBe('oben');
    expect(partie.brett[OBEN]).toEqual([1, 5, 5, 5, 0, 4, 4]);
  });
});

// == 4. Klauen ==============================================================

describe('T-11: Klauen mit gefüllter Gegenmulde (Beispiel B3)', () => {
  test('Beute und eigene Kugel wandern ins Haus, beide Mulden werden leer', () => {
    // [1,0] = 1 Kugel, [1,1] leer, gegenueber [0,2] = 6 Kugeln.
    const partie = partieMit([
      [0, 4, 6, 4, 4, 4, 4],
      [1, 0, 4, 4, 4, 4, 5],
    ]);
    expect(gesamtSumme(partie.brett)).toBe(48);

    const { partie: neu, bericht } = zug(partie, 'unten', 0);

    // 6 gegnerische + 1 eigene = 7 Kugeln ins Haus (Regelwerk 3.4).
    expect(bericht.beute).toEqual({
      eigeneZelle: [1, 1],
      gegnerZelle: [0, 2],
      anzahl: 7,
    });

    expect(neu.brett[UNTEN][6]).toBe(12);   // Haus: 5 + 7
    expect(neu.brett[UNTEN][1]).toBe(0);    // eigene Mulde geleert
    expect(neu.brett[OBEN][2]).toBe(0);     // gegnerische Mulde geleert
    expect(neu.brett[UNTEN][0]).toBe(0);    // Startmulde
    expect(gesamtSumme(neu.brett)).toBe(48);

    // Klauen gibt keinen Extrazug.
    expect(bericht.extrazug).toBe(false);
    expect(neu.amZug).toBe('oben');
  });
});

describe('T-12: Klauen mit leerer Gegenmulde', () => {
  test('kein Diebstahl, die Kugel bleibt liegen (Randfall R-03)', () => {
    const partie = partieMit([
      [0, 4, 0, 4, 4, 4, 4],
      [1, 0, 4, 4, 4, 4, 11],
    ]);
    expect(gesamtSumme(partie.brett)).toBe(48);

    const { partie: neu, bericht } = zug(partie, 'unten', 0);

    expect(bericht.beute).toBeNull();
    expect(neu.brett[UNTEN][1]).toBe(1);    // Kugel bleibt liegen
    expect(neu.brett[UNTEN][6]).toBe(11);   // Haus unverändert
    expect(gesamtSumme(neu.brett)).toBe(48);
  });
});

describe('T-08: letzte Kugel in leerer gegnerischer Mulde', () => {
  test('keine Beute – die Regel greift nur auf der eigenen Seite (R-04)', () => {
    // Sitz unten spielt Mulde 5 = [1,5] mit 3 Kugeln:
    // [1,6], [0,6], [0,5]. [0,5] ist leer, gegenueber liegt [1,4] mit 4 Kugeln.
    const partie = partieMit([
      [0, 4, 4, 4, 4, 0, 4],
      [4, 4, 4, 4, 4, 3, 5],
    ]);
    expect(gesamtSumme(partie.brett)).toBe(48);

    const { partie: neu, bericht } = zug(partie, 'unten', 5);

    expect(bericht.beute).toBeNull();
    expect(neu.brett[OBEN][5]).toBe(1);     // die Kugel liegt dort
    expect(neu.brett[UNTEN][4]).toBe(4);    // gegenueber unangetastet
    expect(neu.brett[UNTEN][6]).toBe(6);    // Haus: nur die eine Saatkugel
  });
});

describe('T-09: Mulde mit genau 13 Kugeln (Randfall R-01)', () => {
  test('die letzte Kugel fällt in die geleerte Startmulde und klaut', () => {
    const partie = partieMit([
      [0, 1, 1, 1, 1, 1, 1],
      [13, 0, 0, 0, 0, 0, 29],
    ]);
    expect(gesamtSumme(partie.brett)).toBe(48);

    const { partie: neu, bericht } = zug(partie, 'unten', 0);

    // Die Startmulde zählt als "war leer" – sie wurde ja zu Beginn geleert.
    expect(bericht.beute).toEqual({
      eigeneZelle: [1, 0],
      gegnerZelle: [0, 1],
      anzahl: 3,          // [0,1] hatte 1 + 1 gesät = 2, plus eigene Kugel
    });

    expect(neu.brett[UNTEN][0]).toBe(0);
    expect(neu.brett[OBEN][1]).toBe(0);
    expect(neu.brett[UNTEN][6]).toBe(33);   // 29 + 1 gesät + 3 Beute
    expect(gesamtSumme(neu.brett)).toBe(48);
  });
});

describe('T-10: Mulde mit mehr als 13 Kugeln (Randfall R-02)', () => {
  test('die Startmulde wird mitbesät und ist dann nicht mehr leer', () => {
    const partie = partieMit([
      [0, 1, 1, 1, 1, 1, 1],
      [14, 0, 0, 0, 0, 0, 28],
    ]);
    expect(gesamtSumme(partie.brett)).toBe(48);

    const { partie: neu, bericht } = zug(partie, 'unten', 0);

    // REGEL 3.4: [1,1] ist beim letzten Einwurf bereits besetzt;
    // deshalb löst die 14. Kugel kein Klauen aus.
    expect(bericht.beute).toBeNull();
    expect(neu.brett[UNTEN][0]).toBe(1);    // Startmulde wurde mitbesät
    expect(neu.brett[UNTEN][1]).toBe(2);
    expect(gesamtSumme(neu.brett)).toBe(48);
  });
});

// == 5. Spielende ===========================================================

describe('T-13: Zug leert die eigene Reihe bei gleichzeitigem Extrazug', () => {
  test('die Partie endet, statt einen Extrazug ins Leere zu geben (R-06)', () => {
    // Sitz unten hat nur noch [1,5] = 1 Kugel; sie landet im eigenen Haus.
    const partie = partieMit([
      [0, 2, 2, 2, 2, 2, 2],
      [0, 0, 0, 0, 0, 1, 35],
    ]);
    expect(gesamtSumme(partie.brett)).toBe(48);

    const { partie: neu, bericht } = zug(partie, 'unten', 5);

    expect(neu.status).toBe(STATUS.BEENDET);

    // Entscheidend: kein Extrazug mehr, obwohl die letzte Kugel im Haus lag.
    expect(bericht.extrazug).toBe(false);

    // Restkugeln des Gegners gehen an den Gegner (Regelwerk 3.5.2).
    expect(bericht.abrechnung).toEqual({ unten: 0, oben: 12 });
    expect(neu.brett[UNTEN][6]).toBe(36);
    expect(neu.brett[OBEN][0]).toBe(12);
    expect(neu.ergebnis.sieger).toBe('unten');
  });
});

describe('T-14: Zug leert die gegnerische Reihe', () => {
  test('Diebstahl der letzten gegnerischen Kugeln beendet die Partie (R-07)', () => {
    // Oben hat nur [0,2] = 3 Kugeln. Unten klaut sie weg.
    const partie = partieMit([
      [0, 0, 3, 0, 0, 0, 0],
      [1, 0, 2, 0, 0, 0, 42],
    ]);
    expect(gesamtSumme(partie.brett)).toBe(48);

    const { partie: neu, bericht } = zug(partie, 'unten', 0);

    expect(bericht.beute.anzahl).toBe(4);        // 3 gegnerische + 1 eigene
    expect(neu.status).toBe(STATUS.BEENDET);

    // Unten bekommt seine eigenen Restkugeln gutgeschrieben.
    expect(bericht.abrechnung).toEqual({ unten: 2, oben: 0 });
    expect(neu.brett[UNTEN][6]).toBe(48);
    expect(neu.ergebnis.sieger).toBe('unten');
  });
});

describe('T-15: Endabrechnung', () => {
  test('nach dem Ende sind alle zwölf Mulden leer und die Häuser ergeben 48', () => {
    const partie = partieMit([
      [0, 2, 2, 2, 2, 2, 2],
      [0, 0, 0, 0, 0, 1, 35],
    ]);

    const { partie: neu } = zug(partie, 'unten', 5);

    expect(muldenSumme(neu.brett, OBEN)).toBe(0);
    expect(muldenSumme(neu.brett, UNTEN)).toBe(0);
    expect(neu.brett[OBEN][0] + neu.brett[UNTEN][6]).toBe(48);

    // REGEL 3.5: Nach der Restabrechnung ist die Partie beendet.
    expect(neu.status).toBe(STATUS.BEENDET);
  });
});

describe('T-16: Endstand 24:24', () => {
  test('ergibt ein Remis', () => {
    const brett = [
      [24, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 24],
    ];
    const ergebnis = ergebnisVon(brett);

    expect(ergebnis.punkte).toEqual({ unten: 24, oben: 24 });
    expect(ergebnis.sieger).toBe(REMIS);
    expect(ergebnis.grund).toBe(GRUND.REGULAER);
  });

  test('ab 25 Punkten gewinnt der jeweilige Spieler', () => {
    expect(ergebnisVon([[23, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 25]]).sieger)
      .toBe('unten');
    expect(ergebnisVon([[25, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 23]]).sieger)
      .toBe('oben');
  });
});

// == 6. Zugvalidierung ======================================================

describe('T-17: Zug, wenn man nicht am Zug ist', () => {
  test('wird mit NICHT_AM_ZUG abgelehnt', () => {
    const partie = startPartie('unten');
    const ergebnis = fuehreZugAus(partie, 'oben', 0);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(FEHLER.NICHT_AM_ZUG);
  });

  test('eine beendete Partie nimmt keine Züge mehr an', () => {
    const partie = { ...startPartie(), status: STATUS.BEENDET };
    expect(fuehreZugAus(partie, 'unten', 0).code).toBe(FEHLER.PARTIE_NICHT_AKTIV);
  });
});

describe('T-18: Zug auf eine leere eigene Mulde', () => {
  test('wird mit MULDE_LEER abgelehnt', () => {
    const partie = partieMit([
      [0, 4, 4, 4, 4, 4, 4],
      [0, 4, 4, 4, 4, 4, 4],
    ]);
    expect(gesamtSumme(partie.brett)).toBe(48);

    const ergebnis = fuehreZugAus(partie, 'unten', 0);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(FEHLER.MULDE_LEER);
  });
});

describe('T-19: unbrauchbare Muldennummern', () => {
  // Genau die Werte, die ein manipulierter Client schicken könnte.
  const schlechteWerte = [6, -1, 1.5, '2', null, undefined, NaN, Infinity, {}, []];

  test.each(schlechteWerte)('%p wird mit MULDE_UNGUELTIG abgelehnt', (wert) => {
    const ergebnis = fuehreZugAus(startPartie(), 'unten', wert);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(FEHLER.MULDE_UNGUELTIG);
  });

  test('ein unbekannter Sitzname wird abgelehnt', () => {
    expect(fuehreZugAus(startPartie(), 'links', 0).ok).toBe(false);
  });
});

// == 7. Reinheit und Zufallstest ============================================

describe('T-22: fuehreZugAus verändert die Eingabe nicht', () => {
  test('Ausgangsbrett und Ausgangspartie bleiben unberührt', () => {
    const partie = startPartie();
    const vorher = JSON.stringify(partie);

    fuehreZugAus(partie, 'unten', 2);

    expect(JSON.stringify(partie)).toBe(vorher);
  });

  test('auch bei Klauen bleibt das Ausgangsbrett stehen', () => {
    const partie = partieMit([
      [0, 4, 6, 4, 4, 4, 4],
      [1, 0, 4, 4, 4, 4, 5],
    ]);
    const vorher = JSON.stringify(partie.brett);

    fuehreZugAus(partie, 'unten', 0);

    expect(JSON.stringify(partie.brett)).toBe(vorher);
  });

  test('brettVorher im Bericht zeigt den Zustand vor dem Zug', () => {
    const { bericht } = zug(startPartie(), 'unten', 0);
    expect(bericht.brettVorher).toEqual(neuesBrett());
  });
});

describe('T-20: Zufallstest über vollständige Partien', () => {
  /**
   * Zufällige gültige Züge verbinden mehrere Regeln in einem Ablauf.
   * Nach jedem Zug müssen Kugelzahl, Feldwerte und Sitz weiterhin stimmen.
   */
  test('die Invarianten halten über 200 Züge', () => {
    let partie = startPartie();
    let gespielteZuege = 0;
    let beendetePartien = 0;

    for (let i = 0; i < 200; i += 1) {
      if (partie.status !== STATUS.LAEUFT) {
        beendetePartien += 1;
        partie = startPartie();
      }

      const zuege = moeglicheZuege(partie, partie.amZug);

      // Solange die Partie läuft, muss der Spieler am Zug etwas spielen
      // können – sonst hätte die Endeerkennung versagt.
      expect(zuege.length).toBeGreaterThan(0);

      const gewaehlt = zuege[Math.floor(Math.random() * zuege.length)];
      const ergebnis = fuehreZugAus(partie, partie.amZug, gewaehlt);

      expect(ergebnis.ok).toBe(true);
      partie = ergebnis.partie;
      gespielteZuege += 1;

      // Kein Zug darf Kugeln verlieren oder negative Zahlen erzeugen.
      expect(gesamtSumme(partie.brett)).toBe(48);
      expect(partie.brett.flat().every((feld) => feld >= 0)).toBe(true);
      expect(['unten', 'oben']).toContain(partie.amZug);
    }

    expect(gespielteZuege).toBe(200);
    // Die Stichprobe soll auch den Übergang zur nächsten Partie prüfen.
    expect(beendetePartien).toBeGreaterThan(0);
  });
});

describe('pruefeZug ohne Seiteneffekte', () => {
  test('liefert die Zelle, aber verändert nichts', () => {
    const partie = startPartie();
    const vorher = JSON.stringify(partie.brett);

    const ergebnis = pruefeZug(partie, 'unten', 3);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.zelle).toEqual([1, 3]);
    expect(JSON.stringify(partie.brett)).toBe(vorher);
  });

  test('moeglicheZuege liefert im Startzustand alle sechs Mulden', () => {
    expect(moeglicheZuege(startPartie(), 'unten')).toEqual([0, 1, 2, 3, 4, 5]);
    expect(moeglicheZuege(startPartie(), 'oben')).toEqual([]);   // nicht am Zug
  });
});

// == 8. Beschädigte Bretter und beide Sitze =================================

describe('T-23: kaputtes Brett im Zug', () => {
  test('49 Kugeln: der Zug wird mit INTERNER_FEHLER und Begründung abgelehnt', () => {
    const partie = partieMit([
      [0, 4, 4, 4, 4, 4, 4],
      [4, 4, 4, 4, 4, 4, 1],
    ]);

    const ergebnis = fuehreZugAus(partie, 'unten', 0);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(FEHLER.INTERNER_FEHLER);
    expect(ergebnis.verletzungen.join(' ')).toContain('I-1');
  });
});

describe('T-24 bis T-26: Klauen und Spielende für den Sitz oben', () => {
  test('T-24: oben klaut aus der gegenüberliegenden unteren Mulde', () => {
    // Oben spielt Mulde 0 = [0,6] mit 1 Kugel; sie fällt in die leere [0,5],
    // gegenüber liegt [1,4] mit 7 Kugeln.
    const partie = partieMit([
      [3, 4, 4, 4, 4, 0, 1],
      [4, 4, 4, 4, 7, 5, 0],
    ], 'oben');

    const { partie: neu, bericht } = zug(partie, 'oben', 0);

    expect(bericht.beute).toEqual({ eigeneZelle: [0, 5], gegnerZelle: [1, 4], anzahl: 8 });
    expect(neu.brett[OBEN][0]).toBe(11);
    expect(neu.amZug).toBe('unten');
  });

  test('T-25: oben, Gegenmulde leer – die Kugel bleibt liegen', () => {
    const partie = partieMit([
      [6, 4, 4, 4, 4, 0, 1],
      [5, 5, 5, 5, 0, 5, 0],
    ], 'oben');

    const { partie: neu, bericht } = zug(partie, 'oben', 0);

    expect(bericht.beute).toBeNull();
    expect(neu.brett[OBEN][5]).toBe(1);
    expect(neu.amZug).toBe('unten');
  });

  test('T-26: oben leert mit einem Extrazug die eigene Reihe – Spielende', () => {
    const partie = partieMit([
      [30, 1, 0, 0, 0, 0, 0],
      [3, 3, 3, 3, 3, 2, 0],
    ], 'oben');

    const { partie: neu, bericht } = zug(partie, 'oben', 5);

    expect(neu.status).toBe(STATUS.BEENDET);
    expect(bericht.extrazug).toBe(false);
    expect(bericht.abrechnung).toEqual({ unten: 17, oben: 0 });
    expect(neu.ergebnis).toEqual({
      punkte: { unten: 17, oben: 31 },
      sieger: 'oben',
      grund: GRUND.REGULAER,
    });
  });
});

describe('T-27: ein normaler Zug leert die eigene Reihe', () => {
  test('die Restkugeln gehen an den Gegner, er gewinnt 26:22', () => {
    const partie = partieMit([
      [0, 4, 4, 4, 4, 4, 4],
      [0, 0, 0, 0, 0, 3, 21],
    ]);

    const { partie: neu, bericht } = zug(partie, 'unten', 5);

    expect(neu.status).toBe(STATUS.BEENDET);
    expect(bericht.extrazug).toBe(false);
    expect(bericht.beute).toBeNull();
    expect(bericht.abrechnung).toEqual({ unten: 0, oben: 26 });
    expect(neu.ergebnis.punkte).toEqual({ unten: 22, oben: 26 });
    expect(neu.ergebnis.sieger).toBe('oben');
    expect(neu.amZug).toBe('unten');   // bleibt beim Ziehenden
  });
});

describe('T-34: kaputter Sitzname', () => {
  test('ein Sitz namens __proto__ führt nicht zum Absturz', () => {
    const partie = startPartie('__proto__');

    expect(pruefeZug(partie, '__proto__', 0)).toEqual({ ok: false, code: FEHLER.NICHT_AM_ZUG });
  });
});
