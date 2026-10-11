/**
 * protokoll.test.js – Gemeinsame Ereignisse, Fehler und Namen.
 *
 * Die Prüfungen sichern die Tabellen, die Server und Browser teilen.
 * Die Bereinigung von Namen wird zusätzlich in validation.test.js geprüft.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { EREIGNIS, FEHLER, FEHLER_TEXT, GRUND, STATUS } from '../shared/protokoll.js';

// == 2. Testfälle ===========================================================

describe('Protokoll', () => {
  test('jeder Fehlercode hat einen Text für Menschen', () => {
    for (const code of Object.values(FEHLER)) {
      expect(typeof FEHLER_TEXT[code]).toBe('string');
      expect(FEHLER_TEXT[code].length).toBeGreaterThan(0);
    }
  });

  test('jeder Fehlercode, jeder Grund und jeder Zustand heißt wie sein Schlüssel', () => {
    for (const tabelle of [FEHLER, GRUND, STATUS]) {
      for (const [schluessel, wert] of Object.entries(tabelle)) {
        expect(wert).toBe(schluessel);
      }
    }
  });

  test('kein Ereignisname kommt doppelt vor', () => {
    const namen = Object.values(EREIGNIS);
    expect(new Set(namen).size).toBe(namen.length);
  });

  test('die Tabellen sind eingefroren und lassen sich nicht ändern', () => {
    for (const tabelle of [EREIGNIS, FEHLER, FEHLER_TEXT, GRUND, STATUS]) {
      expect(Object.isFrozen(tabelle)).toBe(true);
    }
  });
});
