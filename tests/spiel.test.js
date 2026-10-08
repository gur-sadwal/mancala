/**
 * Tests der reinen Funktionen der Spielansicht (client/js/spiel.js), die
 * nichts mit der Drehung des Bretts zu tun haben (die steht in
 * tests/sicht.test.js). Brett und Klicks selbst prüfen die Browsertests.
 */

import { hinweisText } from '../client/js/spiel.js';

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
