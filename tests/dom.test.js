/**
 * Tests der reinen Hilfsfunktion `restSekunden` (client/js/dom.js).
 *
 * Sie rechnet den Zaehler der Revanche aus: Wie viele Sekunden zeigt der
 * Ergebnisdialog noch an? Alles andere in dom.js braucht einen Browser und
 * wird dort von Hand geprueft.
 */

import { restSekunden } from '../client/js/dom.js';

describe('Restzeit der Revanche', () => {
  test('am Anfang steht die volle Dauer', () => {
    expect(restSekunden(1000, 1000, 15)).toBe(15);
  });

  test('angebrochene Sekunden werden aufgerundet', () => {
    // 2,3 s vergangen, 12,7 s uebrig: Anzeige "13".
    expect(restSekunden(0, 2300, 15)).toBe(13);
    // 14,6 s vergangen, 0,4 s uebrig: Anzeige "1", noch nicht "0".
    expect(restSekunden(0, 14600, 15)).toBe(1);
  });

  test('nach Ablauf steht 0 – nie eine negative Zahl', () => {
    expect(restSekunden(0, 15000, 15)).toBe(0);
    expect(restSekunden(0, 99000, 15)).toBe(0);
  });

  test('eine zurueckgestellte Uhr ergibt nie mehr als die volle Dauer', () => {
    // "jetzt" liegt vor dem Start – etwa weil die Uhr des Rechners gestellt wurde.
    expect(restSekunden(5000, 1000, 15)).toBe(15);
  });
});
