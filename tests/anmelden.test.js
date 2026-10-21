/**
 * anmelden.test.js – Anmeldeformular, Namensprüfung und Einladungscode.
 *
 * Die echte Ansicht nutzt DOM- und Speicherattrappen. Geprüft werden die
 * Vorprüfung des Namens, der Weg des Einladungscodes aus der Adresse zum
 * Server und das Verhalten ohne Verbindung.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { jest } from '@jest/globals';
import * as protokoll from '../shared/protokoll.js';

/*
 * anmelden.js lädt das Protokoll über den Browserpfad '/shared/protokoll.js'.
 * Diesen Pfad liefert nur der Server aus; die zwei Zeilen sagen Jest, dass es
 * stattdessen die echte Datei aus shared/ nehmen soll.
 */
jest.mock('/shared/protokoll.js', () => ({}), { virtual: true });
jest.unstable_mockModule('/shared/protokoll.js', () => protokoll, { virtual: true });

const { erzeugeAnmeldeAnsicht, leseEinladung } = await import('../client/js/anmelden.js');

let elemente;
let speicher;
let suchtext;
let aktionen;
let beiAnmeldung;

function neuesElement() {
  return {
    textContent: '',
    hidden: true,
    value: '',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    focus: jest.fn(),
  };
}

beforeEach(() => {
  elemente = new Map();
  speicher = new Map();
  suchtext = '';
  global.document = {
    querySelector: (auswahl) => {
      if (!elemente.has(auswahl)) elemente.set(auswahl, neuesElement());
      return elemente.get(auswahl);
    },
  };
  global.window = {
    get location() { return { search: suchtext, pathname: '/' }; },
    history: { replaceState: jest.fn() },
    localStorage: {
      getItem: (name) => speicher.get(name) ?? null,
      setItem: (name, wert) => speicher.set(name, wert),
    },
  };
  aktionen = { beitreten: jest.fn(() => true) };
  beiAnmeldung = jest.fn();
});

afterEach(() => {
  delete global.document;
  delete global.window;
});

/** Baut die Ansicht, blendet sie ein und liefert den Absende-Listener. */
function zeigeAnsicht(spielart = 'schnell') {
  const ansicht = erzeugeAnmeldeAnsicht({ aktionen, beiAnmeldung });
  const formular = elemente.get('#form-anmelden');
  formular.elements = { spielart: { value: spielart } };
  ansicht.zeige(true);
  const absenden = formular.addEventListener.mock.calls
    .find(([art]) => art === 'submit')[1];
  return { ansicht, absenden };
}

function schickeAb(absenden, name) {
  elemente.get('#feld-name').value = name;
  absenden({ preventDefault: jest.fn() });
}

// == 2. Testfälle ===========================================================

describe('Einladungscode aus der Adresse', () => {
  test('ein gültiger Code wird übernommen, Kleinschreibung wird angehoben', () => {
    expect(leseEinladung('?spiel=ABC234')).toBe('ABC234');
    expect(leseEinladung('?spiel=abc234')).toBe('ABC234');
  });

  test('Leerzeichen am Rand (typisch bei Chat-Links) stören den Code nicht', () => {
    expect(leseEinladung('?spiel=%20ABC234')).toBe('ABC234');
    expect(leseEinladung('?spiel=ABC234%20')).toBe('ABC234');
  });

  test('kein Code, leerer Code oder fremde Parameter ergeben null', () => {
    expect(leseEinladung('')).toBeNull();
    expect(leseEinladung('?spiel=')).toBeNull();
    expect(leseEinladung('?anderes=ABC234')).toBeNull();
  });

  test('falsche Länge oder nicht erlaubte Zeichen ergeben null', () => {
    expect(leseEinladung('?spiel=ABC23')).toBeNull();
    expect(leseEinladung('?spiel=ABC2345')).toBeNull();
    // 0, O, 1 und I fehlen im Zeichensatz der Server-Codes.
    expect(leseEinladung('?spiel=ABC0O1')).toBeNull();
    expect(leseEinladung('?spiel=ABC%3C%3E2')).toBeNull();
  });

  test('ein 3000 Zeichen langer Code wird nicht verwendet', () => {
    expect(leseEinladung(`?spiel=${'A'.repeat(3000)}`)).toBeNull();
  });

  test('beim Absenden geht der gültige Code mit dem Namen an den Server', () => {
    suchtext = '?spiel=ABC234';
    const { absenden } = zeigeAnsicht();

    schickeAb(absenden, 'Anna');

    expect(aktionen.beitreten).toHaveBeenCalledWith('Anna', { privat: false, code: 'ABC234' });
    expect(elemente.get('#knopf-anmelden').textContent).toBe('Spiel beitreten');
  });

  test('ein überlanger Code wird behandelt, als gäbe es keinen', () => {
    suchtext = `?spiel=${'A'.repeat(3000)}`;
    const { absenden } = zeigeAnsicht();

    schickeAb(absenden, 'Anna');

    expect(aktionen.beitreten).toHaveBeenCalledWith('Anna', { privat: false, code: null });
    expect(elemente.get('#einladung').hidden).toBe(true);
    expect(elemente.get('#spielart').hidden).toBe(false);
    expect(elemente.get('#knopf-anmelden').textContent).toBe('Gegner suchen');
  });
});

describe('Ungültiger Einladungslink', () => {
  const UNGUELTIG = 'Der Einladungslink ist ungültig oder unvollständig. '
    + 'Du kannst stattdessen ein neues Spiel suchen.';

  test.each([
    ['abgeschnittenem Code', '?spiel=ABC23'],
    ['3000 Zeichen langem Code', `?spiel=${'A'.repeat(3000)}`],
    ['Nullbreiten-Zeichen vor dem Code', '?spiel=%E2%80%8BABC234'],
  ])(
    'bei %s steht eine Meldung in der Anmeldung und die Adresse wird bereinigt',
    (titel, such) => {
      suchtext = such;
      zeigeAnsicht();

      expect(elemente.get('#anmelden-fehler').textContent).toBe(UNGUELTIG);
      expect(elemente.get('#anmelden-fehler').hidden).toBe(false);
      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/');
    },
  );

  test('ein gültiger Link und ein Aufruf ohne Link zeigen keine Meldung', () => {
    suchtext = '?spiel=ABC234';
    zeigeAnsicht();
    expect(elemente.get('#anmelden-fehler').hidden).toBe(true);
    expect(window.history.replaceState).not.toHaveBeenCalled();

    elemente.clear();
    suchtext = '';
    zeigeAnsicht();
    expect(elemente.get('#anmelden-fehler').hidden).toBe(true);
  });

  test('ein erneutes Zeichnen (Store-Update) löscht die Meldung nicht', () => {
    suchtext = '?spiel=ABC23';
    const { ansicht } = zeigeAnsicht();

    ansicht.zeige(true);

    expect(elemente.get('#anmelden-fehler').textContent).toBe(UNGUELTIG);
  });
});

describe('Namensprüfung und Beitritt', () => {
  test('ein leerer Name erzeugt eine Meldung und sendet nichts', () => {
    const { absenden } = zeigeAnsicht();

    schickeAb(absenden, '   ');

    expect(aktionen.beitreten).not.toHaveBeenCalled();
    expect(beiAnmeldung).not.toHaveBeenCalled();
    expect(elemente.get('#anmelden-fehler').textContent).toBe('Bitte gib einen Namen ein.');
    expect(elemente.get('#anmelden-fehler').hidden).toBe(false);
    expect(elemente.get('#feld-name').focus).toHaveBeenCalled();
  });

  test('die Zeichen < und > werden erklärt statt still entfernt', () => {
    const { absenden } = zeigeAnsicht();

    schickeAb(absenden, 'A<b>');

    expect(aktionen.beitreten).not.toHaveBeenCalled();
    expect(elemente.get('#anmelden-fehler').textContent)
      .toBe('Die Zeichen < und > sind im Namen nicht erlaubt.');
  });

  test('ein gültiger Name wird bereinigt, gemerkt und gesendet', () => {
    const { absenden } = zeigeAnsicht('privat');

    schickeAb(absenden, '  Anna  ');

    expect(beiAnmeldung).toHaveBeenCalledWith('Anna');
    expect(aktionen.beitreten).toHaveBeenCalledWith('Anna', { privat: true, code: null });
    expect(speicher.get('mancala.name')).toBe('Anna');
    expect(elemente.get('#feld-name').value).toBe('Anna');
    expect(elemente.get('#anmelden-fehler').hidden).toBe(true);
  });

  test('ohne Verbindung steht die Meldung in der Anmeldung', () => {
    aktionen.beitreten = jest.fn(() => false);
    const { absenden } = zeigeAnsicht();

    schickeAb(absenden, 'Anna');

    expect(elemente.get('#anmelden-fehler').textContent).toContain('Ohne Verbindung');
    expect(elemente.get('#anmelden-fehler').hidden).toBe(false);
  });

  test('der gemerkte Name steht beim nächsten Besuch im Feld', () => {
    speicher.set('mancala.name', 'Ben');

    zeigeAnsicht();

    expect(elemente.get('#feld-name').value).toBe('Ben');
  });
});

describe('Lebensdauer der Anmeldeansicht', () => {
  test('Listener werden beim Einblenden an- und beim Verstecken abgemeldet', () => {
    const { ansicht } = zeigeAnsicht();
    const formular = elemente.get('#form-anmelden');
    expect(formular.addEventListener).toHaveBeenCalledWith('submit', expect.any(Function));

    ansicht.zeige(false);

    expect(formular.removeEventListener).toHaveBeenCalledWith('submit', expect.any(Function));
    expect(elemente.get('#ansicht-anmelden').hidden).toBe(true);
  });

  test('der Fokus geht nur beim echten Einblenden auf die Überschrift', () => {
    const { ansicht } = zeigeAnsicht();
    const titel = elemente.get('#t-anmelden');
    expect(titel.focus).toHaveBeenCalledTimes(1);

    ansicht.zeige(true);

    expect(titel.focus).toHaveBeenCalledTimes(1);
  });

  test('melde zeigt einen Serverfehler in der Anmeldung', () => {
    const { ansicht } = zeigeAnsicht();

    ansicht.melde('Der Server ist gerade voll.');

    expect(elemente.get('#anmelden-fehler').textContent).toBe('Der Server ist gerade voll.');
    expect(elemente.get('#anmelden-fehler').hidden).toBe(false);
  });
});
