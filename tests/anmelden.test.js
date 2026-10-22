/**
 * anmelden.test.js – Anmeldeformular, Namensprüfung und Einladungscode.
 *
 * Die echte Ansicht nutzt DOM- und Speicherattrappen. Geprüft werden die
 * Vorprüfung des Namens, der Weg des Einladungscodes aus der Adresse und
 * aus dem Codefeld zum Server und das Verhalten ohne Verbindung.
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

const {
  erzeugeAnmeldeAnsicht, leseEinladung, leseCode,
} = await import('../client/js/anmelden.js');

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

/** Liefert den change-Listener des Formulars (Wechsel der Spielart). */
function wechselListener() {
  return elemente.get('#form-anmelden').addEventListener.mock.calls
    .find(([art]) => art === 'change')[1];
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

  test('ein gruppiert weitergegebener Link funktioniert ebenfalls', () => {
    expect(leseEinladung('?spiel=ABC-234')).toBe('ABC234');
    expect(leseEinladung('?spiel=abc%20234')).toBe('ABC234');
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

describe('Raumcode von Hand eingeben', () => {
  function schickeCodeAb(absenden, code, name = 'Anna') {
    elemente.get('#feld-code').value = code;
    schickeAb(absenden, name);
  }

  test('leseCode nimmt Varianten an und liefert die kanonische Form', () => {
    expect(leseCode('abc-234')).toBe('ABC234');
    expect(leseCode(' A b C 2_3-4 ')).toBe('ABC234');
    expect(leseCode('ABC-23')).toBeNull();
    expect(leseCode('')).toBeNull();
  });

  test('das Codefeld erscheint nur bei „Mit Raumcode beitreten“', () => {
    zeigeAnsicht('code');
    expect(elemente.get('#code-eingabe').hidden).toBe(false);
    expect(elemente.get('#knopf-anmelden').textContent).toBe('Spiel beitreten');

    elemente.clear();
    zeigeAnsicht('privat');
    expect(elemente.get('#code-eingabe').hidden).toBe(true);
    expect(elemente.get('#knopf-anmelden').textContent)
      .toBe('Privates Spiel erstellen');
  });

  test('der Wechsel der Spielart blendet das Feld ein und wieder aus', () => {
    zeigeAnsicht('schnell');
    const spielart = elemente.get('#form-anmelden').elements.spielart;

    spielart.value = 'code';
    wechselListener()();
    expect(elemente.get('#code-eingabe').hidden).toBe(false);

    spielart.value = 'schnell';
    wechselListener()();
    expect(elemente.get('#code-eingabe').hidden).toBe(true);
    expect(elemente.get('#knopf-anmelden').textContent).toBe('Gegner suchen');
  });

  test.each(['ABC234', 'abc234', 'ABC-234', ' abc 234 ', 'a_b-c 2 3 4'])(
    'die Eingabe „%s“ geht kanonisch an den Server',
    (eingabe) => {
      const { absenden } = zeigeAnsicht('code');

      schickeCodeAb(absenden, eingabe);

      expect(aktionen.beitreten)
        .toHaveBeenCalledWith('Anna', { privat: false, code: 'ABC234' });
      expect(elemente.get('#anmelden-fehler').hidden).toBe(true);
    },
  );

  test('ein leeres Codefeld wird gemeldet, nichts wird gesendet', () => {
    const { absenden } = zeigeAnsicht('code');

    schickeCodeAb(absenden, ' - ');

    expect(aktionen.beitreten).not.toHaveBeenCalled();
    expect(beiAnmeldung).not.toHaveBeenCalled();
    expect(elemente.get('#anmelden-fehler').textContent)
      .toBe('Bitte gib den Raumcode ein.');
    expect(elemente.get('#feld-code').focus).toHaveBeenCalled();
  });

  test('ein Code mit falscher Länge oder falschen Zeichen wird erklärt', () => {
    const { absenden } = zeigeAnsicht('code');

    for (const falsch of ['ABC-23', 'ABC-2345', 'ABO-234']) {
      schickeCodeAb(absenden, falsch);
      expect(elemente.get('#anmelden-fehler').textContent)
        .toContain('kein gültiger Raumcode');
    }
    expect(aktionen.beitreten).not.toHaveBeenCalled();
  });

  test('ein fehlender Name wird vor dem Code gemeldet', () => {
    const { absenden } = zeigeAnsicht('code');

    schickeCodeAb(absenden, '', '  ');

    expect(elemente.get('#anmelden-fehler').textContent)
      .toBe('Bitte gib einen Namen ein.');
    expect(elemente.get('#feld-name').focus).toHaveBeenCalled();
  });

  test('ein Code aus dem Link hat Vorrang; das Feld bleibt versteckt', () => {
    suchtext = '?spiel=ABC234';
    const { absenden } = zeigeAnsicht('code');
    expect(elemente.get('#code-eingabe').hidden).toBe(true);

    schickeCodeAb(absenden, 'falsch');

    expect(aktionen.beitreten)
      .toHaveBeenCalledWith('Anna', { privat: false, code: 'ABC234' });
  });

  test('schnelles und privates Spiel ignorieren einen alten Feldinhalt', () => {
    const { absenden } = zeigeAnsicht('privat');

    schickeCodeAb(absenden, 'ABC-234');

    expect(aktionen.beitreten)
      .toHaveBeenCalledWith('Anna', { privat: true, code: null });
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
