/**
 * warten.test.js – Wartezeit und Raumcode in der Warteansicht.
 *
 * Die Uhr ist nur Anzeige: Sie startet beim Einblenden, läuft bei
 * Positionsänderungen weiter und steht still, sobald die Ansicht weg ist.
 * Der Raumcode erscheint gruppiert, der Link bleibt unverändert.
 * Jest ersetzt Zeit und Takt, Elemente sind einfache Attrappen.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { jest } from '@jest/globals';
import {
  erzeugeWarteAnsicht, wartezeitText, gruppiereCode,
} from '../client/js/warten.js';
import { normalisiereCode, hatCodeForm } from '../shared/protokoll.js';
import { neuerEinladungsCode } from '../server/util/ids.js';

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

  test('eine zurückgestellte Systemuhr ergibt keine negative Wartezeit', () => {
    const ansicht = neueAnsicht();
    ansicht.zeige(true);

    jest.setSystemTime(Date.now() - 60_000);
    jest.advanceTimersByTime(1_000);
    expect(elemente.get('#warten-zeit').textContent).toBe('0:00');
  });
});

describe('Raumcode in der Warteansicht', () => {
  beforeEach(() => {
    global.window = {
      location: { origin: 'http://localhost:3000', pathname: '/' },
    };
  });

  afterEach(() => {
    delete global.window;
  });

  test('gruppiert in Dreiergruppen mit Bindestrich', () => {
    expect(gruppiereCode('ABC234')).toBe('ABC-234');
    expect(gruppiereCode('ABCDEFGH')).toBe('ABC-DEF-GH');
    expect(gruppiereCode('ABC')).toBe('ABC');
    expect(gruppiereCode('')).toBe('');
  });

  test('die gruppierte Anzeige ergibt eingetippt wieder denselben Code', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = neuerEinladungsCode();
      const angezeigt = gruppiereCode(code);

      expect(normalisiereCode(angezeigt)).toBe(code);
      expect(normalisiereCode(angezeigt.toLowerCase())).toBe(code);
      expect(hatCodeForm(normalisiereCode(angezeigt))).toBe(true);
    }
  });

  test('privat: Code gruppiert, Link wie bisher ohne Bindestrich', () => {
    const ansicht = neueAnsicht();
    ansicht.zeige(true);

    ansicht.aktualisiere({ name: 'Anna', position: null, einladung: 'ABC234' });

    expect(elemente.get('#warten-privat').hidden).toBe(false);
    expect(elemente.get('#warten-code').textContent).toBe('ABC-234');
    expect(elemente.get('#feld-link').value)
      .toBe('http://localhost:3000/?spiel=ABC234');
  });

  test('in der öffentlichen Warteschlange bleibt der Block versteckt', () => {
    const ansicht = neueAnsicht();
    ansicht.zeige(true);

    ansicht.aktualisiere({ name: 'Anna', position: 1, einladung: null });

    expect(elemente.get('#warten-privat').hidden).toBe(true);
  });
});

describe('Fehlermeldung in der Warteansicht', () => {
  test('ein Positionsupdate überschreibt die Fehlermeldung nicht', () => {
    const ansicht = neueAnsicht();
    ansicht.zeige(true);
    ansicht.melde('Zu viele Anfragen.');
    ansicht.aktualisiere({ name: 'Anna', position: 2, einladung: null });

    const fehler = elemente.get('#warten-fehler');
    expect(fehler.textContent).toBe('Zu viele Anfragen.');
    expect(fehler.hidden).toBe(false);
    expect(elemente.get('#warten-position').textContent)
      .toBe('Du bist auf Platz 2 der Warteschlange.');
  });

  test('ein neues Warten beginnt ohne die alte Fehlermeldung', () => {
    const ansicht = neueAnsicht();
    ansicht.zeige(true);
    ansicht.melde('Zu viele Anfragen.');
    ansicht.zeige(false);
    ansicht.zeige(true);

    expect(elemente.get('#warten-fehler').hidden).toBe(true);
    expect(elemente.get('#warten-fehler').textContent).toBe('');
  });
});
