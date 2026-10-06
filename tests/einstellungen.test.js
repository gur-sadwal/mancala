/**
 * Tests der Einstellungen (client/js/einstellungen.js).
 *
 * Getestet wird die reine Funktion `ausSpeichertext`: Sie entscheidet, was aus
 * dem Inhalt des localStorage wird. Dialog und Speicher selbst brauchen einen
 * Browser und werden dort von Hand geprueft.
 */

import { ausSpeichertext } from '../client/js/einstellungen.js';

const STANDARD = { grosseSchrift: false, wenigerAnimation: false };

describe('Einstellungen aus dem Speicher lesen', () => {
  test('nie gespeichert heisst: erster Besuch', () => {
    expect(ausSpeichertext(null, STANDARD)).toBeNull();
  });

  test('uebernimmt gespeicherte Werte', () => {
    const gespeichert = { grosseSchrift: true, wenigerAnimation: true };

    expect(ausSpeichertext(JSON.stringify(gespeichert), STANDARD)).toEqual(gespeichert);
  });

  test('fuellt fehlende Werte mit dem Standard auf', () => {
    expect(ausSpeichertext('{"grosseSchrift":true}', STANDARD)).toEqual({
      grosseSchrift: true,
      wenigerAnimation: false,
    });
  });

  test('zaehlt nur echte true/false-Werte', () => {
    // "ja" und 1 sind keine Wahrheitswerte – es gilt der Standard.
    expect(ausSpeichertext('{"grosseSchrift":"ja","wenigerAnimation":1}', STANDARD))
      .toEqual(STANDARD);
  });

  test('ignoriert unbekannte und alte Namen', () => {
    // "tastaturhilfe" war frueher eine Einstellung – alte Eintraege stoeren nicht.
    expect(ausSpeichertext('{"grosseSchrift":true,"tastaturhilfe":false,"boese":"<script>"}', STANDARD))
      .toEqual({ ...STANDARD, grosseSchrift: true });
  });

  test('kaputter Inhalt gilt als erster Besuch', () => {
    expect(ausSpeichertext('{kaputt', STANDARD)).toBeNull();
    expect(ausSpeichertext('null', STANDARD)).toBeNull();
    expect(ausSpeichertext('42', STANDARD)).toBeNull();
  });
});
