/**
 * Tests der reinen Funktionen der Spielansicht (client/js/spiel.js), die
 * nichts mit der Drehung des Bretts zu tun haben (die steht in
 * tests/sicht.test.js). Brett und Klicks selbst prüfen die Browsertests.
 */

import { hinweisText, schritteDesZuges, muldeAusTaste, hausVon } from '../client/js/spiel.js';
import { neuesBrett, fuehreZugAus, moeglicheZuege } from '../server/spiel/engine.js';
import { STATUS } from '../shared/protokoll.js';

describe('Hinweis zu den Sonderregeln', () => {
  const klauen = { sitz: 'unten', beute: { eigeneZelle: [1, 2], gegnerZelle: [0, 2], anzahl: 5 } };
  const extrazug = { sitz: 'unten', extrazug: true, beute: null };

  test('Klauen: nennt die Kugeln, die ins Haus wandern – die eigene mitgezählt', () => {
    // 4 Kugeln gegenüber + die eigene letzte Kugel = anzahl 5 (Regelwerk 3.4).
    expect(hinweisText(klauen, 'unten')).toBe('Du klaust! 5 Kugeln wandern in dein Haus.');
    expect(hinweisText(klauen, 'oben')).toBe('Gegner klaut! 5 Kugeln wandern in sein Haus.');
  });

  test('Extrazug: eigener und gegnerischer Text', () => {
    expect(hinweisText(extrazug, 'unten')).toBe('Extrazug! Du bist noch einmal dran.');
    expect(hinweisText(extrazug, 'oben')).toBe('Extrazug für den Gegner.');
  });

  test('ohne Sonderregel gibt es keinen Hinweis', () => {
    expect(hinweisText({ sitz: 'oben', beute: null, extrazug: false }, 'oben')).toBe('');
  });
});

describe('Tastenkürzel und Häuser', () => {
  test('nur die vollständigen Tasten 1 bis 6 spielen eine Mulde', () => {
    for (let nummer = 1; nummer <= 6; nummer += 1) {
      expect(muldeAusTaste(String(nummer))).toBe(nummer - 1);
    }
    for (const taste of ['0', '7', '12', '1x', ' ', 'Enter', 'F1']) {
      expect(muldeAusTaste(taste)).toBe(-1);
    }
    expect(hausVon('unten')).toEqual([1, 6]);
    expect(hausVon('oben')).toEqual([0, 0]);
  });
});

describe('Animationsbilder aus echten Serverberichten', () => {
  function beginn(sitz) {
    return { brett: neuesBrett(), amZug: sitz, status: STATUS.LAEUFT, zugNr: 0 };
  }

  test.each(['unten', 'oben'])('folgt für %s genau dem gelieferten Pfad, ohne den Bericht zu ändern', (sitz) => {
    const { bericht, partie } = fuehreZugAus(beginn(sitz), sitz, 2);
    const vorher = JSON.stringify(bericht);
    const bilder = schritteDesZuges(bericht);

    expect(JSON.stringify(bericht)).toBe(vorher);
    expect(bilder[0].brett[bericht.vonZelle[0]][bericht.vonZelle[1]]).toBe(0);
    expect(bilder.filter((bild) => bild.klasse === 'zelle--saat').map((bild) => bild.hervorheben[0]))
      .toEqual(bericht.pfad);
    expect(bilder.at(-1).brett).toEqual(partie.brett);
    expect(bilder.at(-1).klasse).toBe('zelle--extrazug');
    bilder[0].brett[0][0] = 999;
    expect(bilder[1].brett[0][0]).not.toBe(999);
    expect(bericht.brettVorher[0][0]).not.toBe(999);
  });

  test('alle Bilder bleiben in einer vollständigen Partie beim Serverbericht', () => {
    let partie = beginn('unten');
    let gesehenesKlauen = false;
    let schluss = null;
    for (let zugNr = 0; zugNr < 500 && partie.status === STATUS.LAEUFT; zugNr += 1) {
      const legal = moeglicheZuege(partie, partie.amZug);
      const ergebnis = fuehreZugAus(partie, partie.amZug, legal[zugNr % legal.length]);
      expect(ergebnis.ok).toBe(true);
      partie = ergebnis.partie;
      const bilder = schritteDesZuges(ergebnis.bericht);
      if (ergebnis.bericht.beute) {
        gesehenesKlauen = true;
        expect(bilder.some((bild) => bild.klasse === 'zelle--beute')).toBe(true);
      }
      if (ergebnis.bericht.abrechnung) schluss = bilder.at(-1);
      else expect(bilder.at(-1).brett).toEqual(partie.brett);
    }
    expect(gesehenesKlauen).toBe(true);
    expect(partie.status).toBe(STATUS.BEENDET);
    expect(schluss.dauer).toBe(700);
  });
});
