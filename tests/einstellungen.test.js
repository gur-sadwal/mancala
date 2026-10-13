/**
 * einstellungen.test.js – Gespeicherte Einstellungen einlesen.
 *
 * Geprüft wird ausSpeichertext ohne echten Speicher und der Erstbesuch mit
 * Attrappen für Seite und Speicher. Dialog, Speichern und erneutes Laden
 * prüfen zusätzlich die automatisierten Browsertests.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { jest } from '@jest/globals';
import {
  ausSpeichertext, erzeugeEinstellungen,
} from '../client/js/einstellungen.js';

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

describe('Erstbesuch-Dialog', () => {
  /** Baut nur die Elemente nach, die einstellungen.js tatsächlich benutzt. */
  function baueSeite(speicher) {
    const dialog = { showModal: jest.fn(), addEventListener: jest.fn() };
    const elemente = {
      '#dialog-einstellungen': dialog,
      '#form-einstellungen': {
        addEventListener: jest.fn(),
        elements: {
          grosseSchrift: { checked: false },
          wenigerAnimation: { checked: false },
        },
      },
      '#knopf-einstellungen': { addEventListener: jest.fn() },
    };
    global.document = {
      querySelector: (auswahl) => elemente[auswahl],
      documentElement: { dataset: {} },
    };
    global.window = { localStorage: speicher };
    return dialog;
  }

  afterEach(() => {
    delete global.document;
    delete global.window;
  });

  test('ohne gespeicherte Wahl öffnet sich der Dialog', () => {
    const dialog = baueSeite({ getItem: () => null, setItem: jest.fn() });
    erzeugeEinstellungen().zeigeBeimErstenBesuch();

    expect(dialog.showModal).toHaveBeenCalledTimes(1);
  });

  test('gesperrter Speicher öffnet den Dialog nicht bei jedem Laden', () => {
    const gesperrt = () => {
      throw new Error('SecurityError');
    };
    const dialog = baueSeite({ getItem: gesperrt, setItem: gesperrt });
    erzeugeEinstellungen().zeigeBeimErstenBesuch();

    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(document.documentElement.dataset)
      .toEqual({ schrift: 'normal', bewegung: 'normal' });
  });
});
