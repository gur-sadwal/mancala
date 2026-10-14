/**
 * warten.test.js – Wartezeit in der Warteansicht (Review B3).
 *
 * Die Uhr ist nur Anzeige: Sie startet beim Einblenden, läuft bei
 * Positionsänderungen weiter und steht still, sobald die Ansicht weg ist.
 * Jest ersetzt Zeit und Takt, Elemente sind einfache Attrappen.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { jest } from '@jest/globals';
import { erzeugeWarteAnsicht, wartezeitText } from '../client/js/warten.js';

let elemente;

beforeEach(() => {
  jest.useFakeTimers({ now: 1_000_000 });
  elemente = new Map();
  global.document = {
    querySelector: (auswahl) => {
      if (!elemente.has(auswahl)) elemente.set(auswahl, neuesElement());
      return elemente.get(auswahl);
    },
  };
});

afterEach(() => {
  jest.useRealTimers();
  delete global.document;
});

function neuesElement() {
  const attribute = {};
  return {
    hidden: true,
    textContent: '',
    attribute,
    setAttribute: (name, wert) => { attribute[name] = wert; },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    focus: jest.fn(),
  };
}

function neueAnsicht() {
  return erzeugeWarteAnsicht({ aktionen: {}, beiAbbrechen: () => {} });
}

// == 2. Testfälle ===========================================================

describe('Text der Wartezeit', () => {
  test('Minuten und zweistellige Sekunden', () => {
    expect(wartezeitText(0)).toBe('0:00');
    expect(wartezeitText(59)).toBe('0:59');
    expect(wartezeitText(60)).toBe('1:00');
    expect(wartezeitText(754)).toBe('12:34');
  });
});

describe('Uhr der Warteansicht', () => {
  test('startet beim Einblenden bei 0:00 und zählt aus der vergangenen Zeit', () => {
    const ansicht = neueAnsicht();
    ansicht.zeige(true);
    const zeit = elemente.get('#warten-zeit');
    expect(zeit.textContent).toBe('0:00');

    jest.advanceTimersByTime(61_000);
    expect(zeit.textContent).toBe('1:01');
    expect(zeit.attribute.datetime).toBe('PT61S');
  });

  test('ein Positionsupdate (erneutes zeige) startet die Uhr nicht neu', () => {
    const ansicht = neueAnsicht();
    ansicht.zeige(true);
    jest.advanceTimersByTime(12_000);

    ansicht.zeige(true);
    jest.advanceTimersByTime(1_000);
    expect(elemente.get('#warten-zeit').textContent).toBe('0:13');
    expect(jest.getTimerCount()).toBe(1);
  });

  test('versteckt läuft kein Takt mehr; neues Warten beginnt bei 0:00', () => {
    const ansicht = neueAnsicht();
    ansicht.zeige(true);
    jest.advanceTimersByTime(30_000);

    ansicht.zeige(false);
    expect(jest.getTimerCount()).toBe(0);

    jest.advanceTimersByTime(30_000);
    ansicht.zeige(true);
    expect(elemente.get('#warten-zeit').textContent).toBe('0:00');
  });

  test('ein gedrosselter Hintergrund-Tab zeigt danach trotzdem die echte Zeit', () => {
    const ansicht = neueAnsicht();
    ansicht.zeige(true);

    // Der Browser lässt den Takt aus; nur die Uhr läuft weiter.
    jest.setSystemTime(Date.now() + 95_000);
    jest.advanceTimersByTime(1_000);
    expect(elemente.get('#warten-zeit').textContent).toBe('1:36');
  });
});
