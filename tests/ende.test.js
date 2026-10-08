/**
 * Tests der reinen Textfunktionen des Ergebnisdialogs (client/js/ende.js).
 *
 * Getestet wird, welcher Satz bei welchem Ende erscheint und wie die Bilanz
 * aussieht. Der Dialog selbst braucht einen Browser (Browsertests).
 */

import { jest } from '@jest/globals';
import * as protokoll from '../shared/protokoll.js';

/*
 * ende.js lädt das Protokoll über den Browserpfad '/shared/protokoll.js'.
 * Diesen Pfad liefert nur der Server aus, unter Node gibt es ihn nicht. Die
 * zwei Zeilen sagen Jest: Wer diesen Pfad lädt, bekommt die echte Datei aus
 * shared/. (Bei ES-Modulen braucht Jest beide Zeilen: die erste meldet den
 * Pfad an, die zweite liefert den Inhalt.)
 */
jest.mock('/shared/protokoll.js', () => ({}), { virtual: true });
jest.unstable_mockModule('/shared/protokoll.js', () => protokoll, { virtual: true });

const { bilanzText, revancheText, ohneWertung, grundText } = await import('../client/js/ende.js');
const { GRUND } = protokoll;

describe('Bilanz dieser Sitzung', () => {
  test('mit Namen: „Name, dein Ergebnis: Siege-Niederlagen | Remis“', () => {
    expect(bilanzText('Anna', { siege: 3, niederlagen: 1, remis: 0 }))
      .toBe('Anna, dein Ergebnis: 3-1 | 0 Remis');
  });

  test('ohne Namen beginnt der Satz mit „Dein“', () => {
    expect(bilanzText('', { siege: 0, niederlagen: 2, remis: 1 }))
      .toBe('Dein Ergebnis: 0-2 | 1 Remis');
  });
});

describe('Satz zur Revanche', () => {
  test('solange die Frist läuft, steht die Restzeit dabei', () => {
    expect(revancheText('moeglich', 12)).toBe('Noch 12 s für eine Revanche.');
    expect(revancheText('gewuenscht', 9)).toContain('(noch 9 s)');
    expect(revancheText('angeboten', 3)).toBe('Dein Gegner möchte eine Revanche! (noch 3 s)');
  });

  test('ist die Revanche vorbei, steht keine Zahl dabei', () => {
    expect(revancheText('weg', 5)).toBe('Dein Gegner ist nicht mehr da – eine Revanche geht nicht mehr.');
    expect(revancheText('abgelaufen', 0)).toBe('Die Zeit für eine Revanche ist abgelaufen.');
  });

  test('ohne Revanche (Abbruch) gibt es keinen Satz', () => {
    expect(revancheText(null, 15)).toBe('');
  });
});

describe('Partien ohne Wertung', () => {
  test('interner Fehler und Serverende zählen nicht', () => {
    expect(ohneWertung(GRUND.INTERNER_FEHLER)).toBe(true);
    expect(ohneWertung(GRUND.SERVER_ENDE)).toBe(true);
  });

  test('reguläres Ende, Aufgabe und Verlassen zählen', () => {
    expect(ohneWertung(GRUND.REGULAER)).toBe(false);
    expect(ohneWertung(GRUND.AUFGEGEBEN)).toBe(false);
    expect(ohneWertung(GRUND.GEGNER_WEG)).toBe(false);
  });
});

describe('Satz zum Grund des Endes', () => {
  test('Aufgabe: Wer gewonnen hat, liest, dass der Gegner aufgegeben hat', () => {
    expect(grundText(GRUND.AUFGEGEBEN, true)).toBe('Dein Gegner hat aufgegeben.');
    expect(grundText(GRUND.AUFGEGEBEN, false)).toBe('Du hast aufgegeben.');
  });

  test('Gegner weg, interner Fehler und Serverende haben je einen eigenen Satz', () => {
    expect(grundText(GRUND.GEGNER_WEG, true)).toBe('Der Gegner hat das Spiel verlassen.');
    expect(grundText(GRUND.INTERNER_FEHLER, false))
      .toBe('Die Partie musste wegen eines Fehlers abgebrochen werden.');
    expect(grundText(GRUND.SERVER_ENDE, false)).toBe('Der Server wurde beendet.');
  });

  test('reguläres Ende: eine Reihe ist leer', () => {
    expect(grundText(GRUND.REGULAER, true))
      .toBe('Eine Reihe ist leer – die restlichen Kugeln wurden verteilt.');
  });
});
