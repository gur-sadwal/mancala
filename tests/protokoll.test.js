/**
 * protokoll.test.js – Gemeinsame Ereignisse, Fehler, Gründe und Status.
 *
 * Die Prüfungen sichern die Tabellen, die Server und Browser teilen, und
 * die gemeinsame Regel für Raumcodes. Die Namensbereinigung prüft
 * validation.test.js.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import {
  EREIGNIS, FEHLER, FEHLER_TEXT, GRUND, STATUS, GRENZEN, CODE_ZEICHEN,
  normalisiereCode, hatCodeForm,
} from '../shared/protokoll.js';

// Heutiger Schlüsselraum: 31 Zeichen an 6 Stellen. Er darf nicht kleiner
// werden, sonst ließe sich ein privates Spiel leichter erraten.
const SCHLUESSELRAUM_HEUTE = 31 ** 6;

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

describe('Zeichensatz der Raumcodes', () => {
  test('enthält keine leicht verwechselbaren Zeichen', () => {
    for (const zeichen of '0O1IL') {
      expect(CODE_ZEICHEN).not.toContain(zeichen);
    }
  });

  test('nur Großbuchstaben und Ziffern, jedes Zeichen einmal', () => {
    expect(CODE_ZEICHEN).toMatch(/^[A-Z2-9]+$/);
    expect(new Set(CODE_ZEICHEN).size).toBe(CODE_ZEICHEN.length);
  });

  test('der Schlüsselraum ist mindestens so groß wie heute', () => {
    const schluesselraum = CODE_ZEICHEN.length ** GRENZEN.CODE_LAENGE;
    expect(schluesselraum).toBeGreaterThanOrEqual(SCHLUESSELRAUM_HEUTE);
  });
});

describe('normalisiereCode – eine Regel für Browser und Server', () => {
  test.each([
    ['Kleinschreibung', 'abc234'],
    ['Bindestrich der Anzeige', 'ABC-234'],
    ['Leerzeichen innen und am Rand', ' abc 234 '],
    ['Unterstrich', 'abc_234'],
    ['Tabulator und Zeilenumbruch', 'ABC\t234\n'],
    ['geschütztes Leerzeichen', 'ABC 234'],
    ['Gedankenstrich aus der Autokorrektur', 'ABC–234'],
    ['geschützter Bindestrich', 'ABC‑234'],
    ['gemischt', ' a-B_c 2-3-4 '],
  ])('%s ergibt die kanonische Form', (titel, eingabe) => {
    expect(normalisiereCode(eingabe)).toBe('ABC234');
  });

  test('andere Zeichen bleiben stehen; die Prüfung lehnt sie ab', () => {
    expect(normalisiereCode('ABC.234')).toBe('ABC.234');
    // Ein Nullbreiten-Leerzeichen ist kein Leerzeichen, sondern unsichtbar.
    expect(normalisiereCode('​ABC234')).toBe('​ABC234');
  });

  test('ein zweites Normalisieren ändert nichts mehr', () => {
    for (const eingabe of ['abc-234', ' X y z ', 'ABC.234', '']) {
      const einmal = normalisiereCode(eingabe);
      expect(normalisiereCode(einmal)).toBe(einmal);
    }
  });

  test('ohne verwechselbare Zeichen gibt es nichts umzudeuten', () => {
    // O, I und L stehen nicht im Zeichensatz, 0 und 1 auch nicht. Eine
    // Umdeutung wie O zu 0 würde also nie einen gültigen Code ergeben.
    expect(normalisiereCode('abo-1il')).toBe('ABO1IL');
    expect(hatCodeForm(normalisiereCode('abo-1il'))).toBe(false);
  });
});

describe('hatCodeForm – strenge Prüfung der kanonischen Form', () => {
  test('nimmt sechs erlaubte Großbuchstaben und Ziffern an', () => {
    expect(hatCodeForm('ABC234')).toBe(true);
    expect(hatCodeForm('ZZZZZZ')).toBe(true);
  });

  test('lehnt jede nicht kanonische oder falsche Form ab', () => {
    const falsch = ['abc234', 'ABC-234', 'ABC 234', 'ABC23', 'ABC2345', '',
      'ABC0O1', 'ABCIL2', 'ABC<>2', '​ABC23', 'ＡＢＣ２３４'];
    for (const code of falsch) {
      expect(hatCodeForm(code)).toBe(false);
    }
  });

  test('lehnt alles ab, was keine Zeichenkette ist', () => {
    for (const wert of [null, undefined, 123456, ['ABC234'], {}]) {
      expect(hatCodeForm(wert)).toBe(false);
    }
  });
});
