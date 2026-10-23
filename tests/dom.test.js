/**
 * dom.test.js – DOM-Helfer, Wartezeit und Bewegungsreduktion.
 *
 * Einfache Element- und Uhrattrappen machen die Helfer ohne Browser
 * prüfbar. Die vollständige Bedienung ergänzen die Browsertests.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { jest } from '@jest/globals';
import {
  restSekunden, $, erzeuge, setzeText, schalte, zeige, warte, wenigerBewegung,
} from '../client/js/dom.js';

// == 2. Testfälle ===========================================================

describe('Restzeit der Revanche', () => {
  test('am Anfang steht die volle Dauer', () => {
    expect(restSekunden(1000, 1000, 15)).toBe(15);
  });

  test('angebrochene Sekunden werden aufgerundet', () => {
    // 2,3 s vergangen, 12,7 s übrig: Anzeige „13“.
    expect(restSekunden(0, 2300, 15)).toBe(13);
    // 14,6 s vergangen, 0,4 s übrig: Anzeige „1“, noch nicht „0“.
    expect(restSekunden(0, 14600, 15)).toBe(1);
  });

  test('nach Ablauf steht 0 – nie eine negative Zahl', () => {
    expect(restSekunden(0, 15000, 15)).toBe(0);
    expect(restSekunden(0, 99000, 15)).toBe(0);
  });

  test('eine zurückgestellte Uhr ergibt nie mehr als die volle Dauer', () => {
    // Start bei 5 s, jetzt erst 1 s: Die Frist darf dadurch nicht wachsen.
    expect(restSekunden(5000, 1000, 15)).toBe(15);
  });
});

/** Attrappe für createElement: merkt sich Klassen, Attribute und Kinder. */
function falschesElement(tag) {
  const klassen = [];
  const attribute = {};
  const kinder = [];
  return {
    tag,
    klassen,
    attribute,
    kinder,
    textContent: '',
    classList: { add: (...namen) => klassen.push(...namen) },
    setAttribute: (name, wert) => {
      attribute[name] = wert;
    },
    append: (...neu) => kinder.push(...neu),
  };
}

describe('Element suchen ($)', () => {
  test('liefert das gefundene Element', () => {
    const element = { id: 'brett' };
    expect($('#brett', { querySelector: () => element })).toBe(element);
  });

  test('scheitert laut, wenn es das Element nicht gibt', () => {
    expect(() => $('#fehlt', { querySelector: () => null }))
      .toThrow('Element nicht gefunden: #fehlt');
  });
});

describe('Element erzeugen', () => {
  beforeEach(() => {
    globalThis.document = { createElement: falschesElement };
  });

  afterEach(() => {
    delete globalThis.document;
  });

  test('setzt Klassen, Text, Attribute und Kinder', () => {
    const kind = { name: 'kind' };
    const element = erzeuge('span', {
      klassen: ['mulde', 'mulde--eigen'],
      text: 4,
      attribute: { 'data-mulde': 2 },
    }, [kind]);

    expect(element.tag).toBe('span');
    expect(element.klassen).toEqual(['mulde', 'mulde--eigen']);
    expect(element.textContent).toBe('4');
    expect(element.attribute).toEqual({ 'data-mulde': '2' });
    expect(element.kinder).toEqual([kind]);
  });

  test('ein Name mit spitzen Klammern bleibt reiner Text', () => {
    expect(erzeuge('p', { text: '<b>Anna</b>' }).textContent).toBe('<b>Anna</b>');
  });

  test('ohne Text bleibt der Inhalt leer', () => {
    expect(erzeuge('li').textContent).toBe('');
  });
});

describe('Text setzen', () => {
  test('schreibt nur, wenn sich der Text ändert', () => {
    let inhalt = '3';
    let schreibvorgaenge = 0;
    const element = {
      get textContent() {
        return inhalt;
      },
      set textContent(wert) {
        schreibvorgaenge += 1;
        inhalt = wert;
      },
    };

    setzeText(element, 3);
    expect(schreibvorgaenge).toBe(0);

    setzeText(element, 4);
    expect(schreibvorgaenge).toBe(1);
    expect(inhalt).toBe('4');
  });
});

describe('Klasse schalten und Element zeigen', () => {
  test('schalte macht aus der Bedingung ein echtes true oder false', () => {
    const aufrufe = [];
    const element = { classList: { toggle: (klasse, an) => aufrufe.push([klasse, an]) } };

    schalte(element, 'mulde--leer', 0);
    schalte(element, 'mulde--leer', 'ja');

    expect(aufrufe).toEqual([['mulde--leer', false], ['mulde--leer', true]]);
  });

  test('zeige schaltet das hidden-Attribut', () => {
    const element = { hidden: true };
    zeige(element, true);
    expect(element.hidden).toBe(false);
    zeige(element, false);
    expect(element.hidden).toBe(true);
  });
});

describe('Warten', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('das Promise erfüllt sich erst nach der angegebenen Zeit', async () => {
    jest.useFakeTimers();
    let fertig = false;
    const versprechen = warte(500).then(() => {
      fertig = true;
    });

    jest.advanceTimersByTime(499);
    await Promise.resolve();
    expect(fertig).toBe(false);

    jest.advanceTimersByTime(1);
    await versprechen;
    expect(fertig).toBe(true);
  });
});

describe('Weniger Bewegung', () => {
  /** Setzt Spiel-Einstellung und Systemeinstellung für einen Test. */
  function stelleEin(einstellung, system) {
    globalThis.document = { documentElement: { dataset: { bewegung: einstellung } } };
    globalThis.window = { matchMedia: () => ({ matches: system }) };
  }

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
  });

  test('gilt, wenn die Einstellung im Spiel „wenig“ sagt', () => {
    stelleEin('wenig', false);
    expect(wenigerBewegung()).toBe(true);
  });

  test('gilt auch, wenn nur das System „Bewegung reduzieren“ meldet', () => {
    stelleEin('normal', true);
    expect(wenigerBewegung()).toBe(true);
  });

  test('gilt nicht, wenn beide nichts sagen', () => {
    stelleEin('normal', false);
    expect(wenigerBewegung()).toBe(false);
  });
});
