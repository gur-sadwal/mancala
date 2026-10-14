/**
 * spiel.test.js – Hinweise, Animationsschritte und Ansichtslaufzeit.
 *
 * Reine Funktionen und die echte Ansicht mit Elementattrappen werden
 * geprüft. Serverberichte liefern die Daten für die Animationsbilder.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { jest } from '@jest/globals';
import { hinweisText, schritteDesZuges, muldeAusTaste, hausVon,
  erzeugeSpielAnsicht } from '../client/js/spiel.js';
import { fuehreZugAus } from '../server/spiel/engine.js';
import { moeglicheZuege } from './zuege.js';
import { neuesBrett } from '../server/spiel/brett.js';
import { neuePartie, spielstandVon } from '../server/spiel/partie.js';
import { STATUS } from '../shared/protokoll.js';

/**
 * Kleine DOM-Attrappe für die echte Spielansicht: Elemente mit Klassen,
 * Kindern und Text. querySelector kennt nur „.klasse“ und „#id“; andere
 * Selektoren liefern null, wie ein Fund ohne Treffer.
 */
function falschesElement(tag) {
  const klassen = new Set();
  const element = {
    tag, kinder: [], eltern: null, textContent: '', title: '',
    disabled: false, hidden: false, open: false,
    classList: {
      add: (...namen) => namen.forEach((name) => klassen.add(name)),
      remove: (...namen) => namen.forEach((name) => klassen.delete(name)),
      toggle: (name, an) => (an ? klassen.add(name) : klassen.delete(name)),
      contains: (name) => klassen.has(name),
    },
    setAttribute: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    focus: () => {},
    append: (...neu) => neu.forEach((kind) => {
      kind.eltern = element;
      element.kinder.push(kind);
    }),
    replaceChildren: () => { element.kinder = []; },
    remove: () => {
      const geschwister = element.eltern.kinder;
      geschwister.splice(geschwister.indexOf(element), 1);
    },
    get childElementCount() { return element.kinder.length; },
    get lastElementChild() { return element.kinder.at(-1) ?? null; },
    querySelector: (auswahl) => alleUnter(element)
      .find((kind) => auswahl.startsWith('.')
        && kind.classList.contains(auswahl.slice(1))) ?? null,
    querySelectorAll: (auswahl) => alleUnter(element)
      .filter((kind) => kind.classList.contains(auswahl.slice(1))),
  };
  return element;
}

function alleUnter(element) {
  return element.kinder.flatMap((kind) => [kind, ...alleUnter(kind)]);
}

/** Echte Spielansicht mit Attrappen; ids liefert ein fester Satz Elemente. */
function baueEchteAnsicht() {
  const nachId = new Map();
  global.document = {
    activeElement: null,
    createElement: falschesElement,
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: (auswahl) => {
      if (!nachId.has(auswahl)) nachId.set(auswahl, falschesElement('div'));
      return nachId.get(auswahl);
    },
  };
  return { ansicht: erzeugeSpielAnsicht({ aktionen: {} }), nachId };
}

function startstand(nameUnten, nameOben) {
  const partie = neuePartie('T', { socketId: 'a', name: nameUnten },
    { socketId: 'b', name: nameOben });
  return spielstandVon(partie);
}

// == 2. Testfälle ===========================================================

describe('Hinweis zu den Sonderregeln', () => {
  const klauen = { sitz: 'unten', beute: { eigeneZelle: [1, 2], gegnerZelle: [0, 2], anzahl: 5 } };
  const extrazug = { sitz: 'unten', extrazug: true, beute: null };

  test('Klauen: nennt die Kugeln, die ins Haus wandern – die eigene mitgezählt', () => {
    // 4 Kugeln gegenüber + die eigene letzte Kugel = anzahl 5 (Regelwerk 3.4).
    expect(hinweisText(klauen, 'unten')).toBe('Du klaust! 5 Kugeln wandern in dein Haus.');
    expect(hinweisText(klauen, 'oben')).toBe('Gegner klaut! 5 Kugeln wandern in sein Haus.');
  });

  test('Extrazug: eigener und gegnerischer Text', () => {
    expect(hinweisText(extrazug, 'unten')).toBe('Extrazug! Du bist noch einmal dran.');
    expect(hinweisText(extrazug, 'oben')).toBe('Extrazug für den Gegner.');
  });

  test('ohne Sonderregel gibt es keinen Hinweis', () => {
    expect(hinweisText({ sitz: 'oben', beute: null, extrazug: false }, 'oben')).toBe('');
  });
});

describe('Tastenkürzel und Häuser', () => {
  test('nur die vollständigen Tasten 1 bis 6 spielen eine Mulde', () => {
    for (let nummer = 1; nummer <= 6; nummer += 1) {
      expect(muldeAusTaste(String(nummer))).toBe(nummer - 1);
    }
    for (const taste of ['0', '7', '12', '1x', ' ', 'Enter', 'F1']) {
      expect(muldeAusTaste(taste)).toBe(-1);
    }
    expect(hausVon('unten')).toEqual([1, 6]);
    expect(hausVon('oben')).toEqual([0, 0]);
  });
});

describe('Zuganzeige nach dem Spielende', () => {
  /** Nur die Elemente, die zeigeEnde und beende tatsächlich anfassen. */
  function baueAnsicht() {
    const elemente = new Map();
    global.document = {
      querySelector: (auswahl) => {
        if (!elemente.has(auswahl)) {
          elemente.set(auswahl, {
            textContent: '', open: false, classList: { toggle: jest.fn() },
          });
        }
        return elemente.get(auswahl);
      },
    };
    return { ansicht: erzeugeSpielAnsicht({ aktionen: {} }), elemente };
  }

  afterEach(() => {
    delete global.document;
  });

  test('zeigeEnde() zeigt „Partie beendet“ ohne Hervorhebung', () => {
    const { ansicht, elemente } = baueAnsicht();
    ansicht.zeigeEnde();

    const anzeige = elemente.get('#zuganzeige');
    expect(anzeige.textContent).toBe('Partie beendet');
    expect(anzeige.classList.toggle)
      .toHaveBeenCalledWith('zuganzeige--ich', false);
    expect(elemente.get('#stand-eigen').classList.toggle)
      .toHaveBeenCalledWith('stand__spieler--dran', false);
    expect(elemente.get('#stand-gegner').classList.toggle)
      .toHaveBeenCalledWith('stand__spieler--dran', false);
  });

  test('beende() lässt die Zuganzeige stehen, damit ein Hinweis bleibt', () => {
    const { ansicht, elemente } = baueAnsicht();
    ansicht.beende();

    const anzeige = elemente.get('#zuganzeige');
    expect(anzeige.textContent).toBe('');
    expect(anzeige.classList.toggle).not.toHaveBeenCalled();
  });
});

describe('Lebensdauer der echten Spielansicht', () => {
  test('zeigt und versteckt das Element und meldet Listener passend an und ab', () => {
    const elemente = new Map();
    global.document = {
      addEventListener: jest.fn(), removeEventListener: jest.fn(),
      querySelector: (auswahl) => {
        if (!elemente.has(auswahl)) elemente.set(auswahl, {
          hidden: true, open: false, addEventListener: jest.fn(),
          removeEventListener: jest.fn(), querySelectorAll: () => [],
        });
        return elemente.get(auswahl);
      },
    };
    try {
      const ansicht = erzeugeSpielAnsicht({ aktionen: {} });
      ansicht.zeige(true);
      expect(elemente.get('#ansicht-spiel').hidden).toBe(false);
      expect(document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
      ansicht.zeige(false);
      expect(elemente.get('#ansicht-spiel').hidden).toBe(true);
      expect(document.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    } finally {
      delete global.document;
    }
  });
});

describe('Rollen, Zugtext und Feldbeschreibungen (Review A2, D3, C1)', () => {
  afterEach(() => {
    delete global.document;
  });

  test('der Gegner darf „Du“ heißen: die Karten zeigen nur die Namen', () => {
    const { ansicht, nachId } = baueEchteAnsicht();
    ansicht.starte(startstand('Anna', 'Du'), 'unten');

    expect(nachId.get('#name-eigen').textContent).toBe('Anna');
    expect(nachId.get('#name-gegner').textContent).toBe('Du');
  });

  test('gleiche Namen werden nicht mehr durch „Du“ ersetzt', () => {
    const { ansicht, nachId } = baueEchteAnsicht();
    ansicht.starte(startstand('Anna', 'Anna'), 'oben');

    expect(nachId.get('#name-eigen').textContent).toBe('Anna');
    expect(nachId.get('#name-gegner').textContent).toBe('Anna');
  });

  test('der Zugtext enthält keinen Namen, auch keinen langen', () => {
    const lang = 'W'.repeat(20);
    const { ansicht, nachId } = baueEchteAnsicht();

    ansicht.starte(startstand(lang, 'Du'), 'oben');
    expect(nachId.get('#zuganzeige').textContent).toBe('Der Gegner ist am Zug');

    ansicht.starte(startstand(lang, 'Du'), 'unten');
    expect(nachId.get('#zuganzeige').textContent).toBe('Du bist am Zug');
  });

  test('Häuser nennen zuerst, wem sie gehören', () => {
    const { ansicht, nachId } = baueEchteAnsicht();
    ansicht.starte(startstand('Anna', 'Ben'), 'unten');

    const haeuser = nachId.get('#brett').querySelectorAll('.haus');
    const texte = haeuser.map((haus) => haus.kinder[0].textContent).sort();
    expect(texte).toEqual(['Dein Haus', 'Haus des Gegners']);
    for (const haus of haeuser) {
      expect(haus.kinder[0].classList.contains('haus__beschriftung')).toBe(true);
    }
  });

  test('eigene Mulden beschreiben Nummer und Kugelzahl im title', () => {
    const { ansicht, nachId } = baueEchteAnsicht();
    const stand = startstand('Anna', 'Ben');
    stand.brett[1][0] = 1;
    stand.brett[1][1] = 0;
    ansicht.starte(stand, 'unten');

    const titel = nachId.get('#brett').querySelectorAll('.mulde--eigen')
      .map((mulde) => mulde.title);
    expect(titel).toEqual([
      'Mulde 1: 1 Kugel', 'Mulde 2: 0 Kugeln', 'Mulde 3: 4 Kugeln',
      'Mulde 4: 4 Kugeln', 'Mulde 5: 4 Kugeln', 'Mulde 6: 4 Kugeln',
    ]);
  });
});

describe('Animationsbilder aus echten Serverberichten', () => {
  function beginn(sitz) {
    return { brett: neuesBrett(), amZug: sitz, status: STATUS.LAEUFT, zugNr: 0 };
  }

  test.each(['unten', 'oben'])('folgt für %s genau dem gelieferten Pfad, ohne den Bericht zu ändern', (sitz) => {
    const { bericht, partie } = fuehreZugAus(beginn(sitz), sitz, 2);
    const vorher = JSON.stringify(bericht);
    const bilder = schritteDesZuges(bericht);

    expect(JSON.stringify(bericht)).toBe(vorher);
    expect(bilder[0].brett[bericht.vonZelle[0]][bericht.vonZelle[1]]).toBe(0);
    expect(bilder.filter((bild) => bild.klasse === 'zelle--saat').map((bild) => bild.hervorheben[0]))
      .toEqual(bericht.pfad);
    expect(bilder.at(-1).brett).toEqual(partie.brett);
    expect(bilder.at(-1).klasse).toBe('zelle--extrazug');
    bilder[0].brett[0][0] = 999;
    expect(bilder[1].brett[0][0]).not.toBe(999);
    expect(bericht.brettVorher[0][0]).not.toBe(999);
  });

  test('alle Bilder bleiben in einer vollständigen Partie beim Serverbericht', () => {
    let partie = beginn('unten');
    let gesehenesKlauen = false;
    let schluss = null;
    for (let zugNr = 0; zugNr < 500 && partie.status === STATUS.LAEUFT; zugNr += 1) {
      const legal = moeglicheZuege(partie, partie.amZug);
      const ergebnis = fuehreZugAus(partie, partie.amZug, legal[zugNr % legal.length]);
      expect(ergebnis.ok).toBe(true);
      partie = ergebnis.partie;
      const bilder = schritteDesZuges(ergebnis.bericht);
      if (ergebnis.bericht.beute) {
        gesehenesKlauen = true;
        expect(bilder.some((bild) => bild.klasse === 'zelle--beute')).toBe(true);
      }
      if (ergebnis.bericht.abrechnung) schluss = bilder.at(-1);
      else expect(bilder.at(-1).brett).toEqual(partie.brett);
    }
    expect(gesehenesKlauen).toBe(true);
    expect(partie.status).toBe(STATUS.BEENDET);
    expect(schluss.dauer).toBe(700);
  });
});
