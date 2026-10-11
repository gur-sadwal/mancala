/**
 * einstellungen.test.js – Gespeicherte Einstellungen einlesen.
 *
 * Geprüft wird ausSpeichertext ohne echten Speicher. Dialog, Speichern
 * und erneutes Laden prüfen zusätzlich die automatisierten Browsertests.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { ausSpeichertext } from '../client/js/einstellungen.js';

const STANDARD = { grosseSchrift: false, wenigerAnimation: false };

// == 2. Testfälle ===========================================================

describe('Einstellungen aus dem Speicher lesen', () => {
  test('nie gespeichert heißt: erster Besuch', () => {
    expect(ausSpeichertext(null, STANDARD)).toBeNull();
  });

  test('übernimmt gespeicherte Werte', () => {
    const gespeichert = { grosseSchrift: true, wenigerAnimation: true };

    expect(ausSpeichertext(JSON.stringify(gespeichert), STANDARD)).toEqual(gespeichert);
  });

  test('füllt fehlende Werte mit dem Standard auf', () => {
    expect(ausSpeichertext('{"grosseSchrift":true}', STANDARD)).toEqual({
      grosseSchrift: true,
      wenigerAnimation: false,
    });
  });

  test('zählt nur echte true/false-Werte', () => {
    // "ja" und 1 sind keine Wahrheitswerte – es gilt der Standard.
    expect(ausSpeichertext('{"grosseSchrift":"ja","wenigerAnimation":1}', STANDARD))
      .toEqual(STANDARD);
  });

  test('ignoriert unbekannte und alte Namen', () => {
    // "tastaturhilfe" war früher eine Einstellung – alte Einträge stören nicht.
    expect(ausSpeichertext('{"grosseSchrift":true,"tastaturhilfe":false,"boese":"<script>"}', STANDARD))
      .toEqual({ ...STANDARD, grosseSchrift: true });
  });

  test('kaputter Inhalt gilt als erster Besuch', () => {
    expect(ausSpeichertext('{kaputt', STANDARD)).toBeNull();
    expect(ausSpeichertext('null', STANDARD)).toBeNull();
    expect(ausSpeichertext('42', STANDARD)).toBeNull();
    expect(ausSpeichertext('[]', STANDARD)).toBeNull();
  });
});
