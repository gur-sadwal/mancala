/**
 * Tests der Ratenbegrenzung (server/socket/rateLimit.js).
 *
 * Die Uhr wird hereingereicht: Der Test stellt die Zeit selbst ein, statt
 * eine Sekunde lang zu warten.
 */

import { erzeugeRatenbegrenzer } from '../server/socket/rateLimit.js';

describe('Ratenbegrenzung', () => {
  test('lässt bis zur Grenze durch und verwirft dann', () => {
    const begrenzer = erzeugeRatenbegrenzer(3, 1000, () => 0);

    const antworten = [1, 2, 3, 4, 5].map(() => begrenzer.erlaubt('a'));

    expect(antworten).toEqual([true, true, true, false, false]);
  });

  test('nach Ablauf des Fensters beginnt die Zählung neu', () => {
    let jetzt = 0;
    const begrenzer = erzeugeRatenbegrenzer(2, 1000, () => jetzt);
    begrenzer.erlaubt('a');
    begrenzer.erlaubt('a');

    jetzt = 999;
    expect(begrenzer.erlaubt('a')).toBe(false);

    jetzt = 1000;
    expect(begrenzer.erlaubt('a')).toBe(true);
  });

  test('jede Verbindung zählt für sich', () => {
    const begrenzer = erzeugeRatenbegrenzer(1, 1000, () => 0);

    expect(begrenzer.erlaubt('a')).toBe(true);
    expect(begrenzer.erlaubt('b')).toBe(true);
    expect(begrenzer.erlaubt('a')).toBe(false);
  });

  test('vergiss löscht den Zähler einer Verbindung', () => {
    const begrenzer = erzeugeRatenbegrenzer(1, 1000, () => 0);
    begrenzer.erlaubt('a');
    begrenzer.erlaubt('b');

    begrenzer.vergiss('a');

    expect(begrenzer.anzahl()).toBe(1);
    expect(begrenzer.erlaubt('a')).toBe(true);
  });

  test('istErsteSperre meldet nur die erste verworfene Nachricht im Fenster', () => {
    let jetzt = 0;
    const begrenzer = erzeugeRatenbegrenzer(2, 1000, () => jetzt);
    const ersteSperren = [];

    for (let i = 0; i < 5; i += 1) {
      begrenzer.erlaubt('a');
      ersteSperren.push(begrenzer.istErsteSperre('a'));
    }
    expect(ersteSperren).toEqual([false, false, true, false, false]);

    jetzt = 1000;   // neues Fenster: wieder genau einmal
    for (let i = 0; i < 3; i += 1) begrenzer.erlaubt('a');
    expect(begrenzer.istErsteSperre('a')).toBe(true);
    expect(begrenzer.istErsteSperre('unbekannt')).toBe(false);
  });

  test('ohne Angaben gilt: 20 Ereignisse je Sekunde', () => {
    let jetzt = 0;
    const begrenzer = erzeugeRatenbegrenzer(undefined, undefined, () => jetzt);

    for (let i = 0; i < 20; i += 1) begrenzer.erlaubt('a');
    expect(begrenzer.erlaubt('a')).toBe(false);

    jetzt = 1000;
    expect(begrenzer.erlaubt('a')).toBe(true);
  });
});
