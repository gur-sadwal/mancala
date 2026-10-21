/**
 * ende.test.js – Ergebnisansicht, Texte und Sitzungsbilanz.
 *
 * Die echte Ansicht nutzt hier DOM-, Speicher- und Uhrattrappen. Damit
 * lassen sich Ergebnis, Revanchefrist und Aufräumen gezielt prüfen.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { jest } from '@jest/globals';
import * as protokoll from '../shared/protokoll.js';

/*
 * ende.js lädt das Protokoll über den Browserpfad '/shared/protokoll.js'.
 * Diesen Pfad liefert nur der Server aus, unter Node gibt es ihn nicht. Die
 * zwei Zeilen sagen Jest: Wer diesen Pfad lädt, bekommt die echte Datei aus
 * shared/. (Bei ES-Modulen braucht Jest beide Zeilen: die erste meldet den
 * Pfad an, die zweite liefert den Inhalt.)
 */
jest.mock('/shared/protokoll.js', () => ({}), { virtual: true });
jest.unstable_mockModule('/shared/protokoll.js', () => protokoll, { virtual: true });

// ende.js holt die Revanche-Stände aus kern.js, und kern.js lädt Socket.io
// über einen Browserpfad. Eine Verbindung braucht hier kein Test.
jest.mock('/socket.io/socket.io.esm.min.js', () => ({}), { virtual: true });
jest.unstable_mockModule('/socket.io/socket.io.esm.min.js',
  () => ({ io: () => null }), { virtual: true });

const {
  bilanzText, bilanzAusSpeichertext, revancheText, ohneWertung, grundText,
  erzeugeEndeAnsicht,
} = await import('../client/js/ende.js');
const { GRUND } = protokoll;

// == 2. Testfälle ===========================================================

describe('Bilanz dieser Sitzung', () => {
  test('mit Namen: „Name, dein Ergebnis: Siege-Niederlagen | Remis“', () => {
    expect(bilanzText('Anna', { siege: 3, niederlagen: 1, remis: 0 }))
      .toBe('Anna, dein Ergebnis: 3-1 | 0 Remis');
  });

  test('ohne Namen beginnt der Satz mit „Dein“', () => {
    expect(bilanzText('', { siege: 0, niederlagen: 2, remis: 1 }))
      .toBe('Dein Ergebnis: 0-2 | 1 Remis');
  });
});

describe('Bilanz aus dem Speicher lesen', () => {
  const LEER = { siege: 0, niederlagen: 0, remis: 0 };

  test('übernimmt eine gültige gespeicherte Bilanz', () => {
    expect(bilanzAusSpeichertext('{"siege":2,"niederlagen":1,"remis":3}'))
      .toEqual({ siege: 2, niederlagen: 1, remis: 3 });
  });

  test('nie gespeichert oder kaputter Text ergibt eine leere Bilanz', () => {
    expect(bilanzAusSpeichertext(null)).toEqual(LEER);
    expect(bilanzAusSpeichertext('{kaputt')).toEqual(LEER);
  });

  test('übernimmt nur ganze Zahlen ab 0 – alles andere wird 0', () => {
    expect(bilanzAusSpeichertext('{"siege":"abc","niederlagen":-2,"remis":1.5}')).toEqual(LEER);
  });

  test('übernimmt keine fremden Namen und keine Texte oder Listen', () => {
    expect(bilanzAusSpeichertext('{"siege":1,"boese":"<b>x</b>"}'))
      .toEqual({ ...LEER, siege: 1 });
    expect(bilanzAusSpeichertext('"abc"')).toEqual(LEER);
    expect(bilanzAusSpeichertext('[5,6]')).toEqual(LEER);
  });
});

describe('Satz zur Revanche', () => {
  test('solange die Frist läuft, steht die Restzeit dabei', () => {
    expect(revancheText('moeglich', 12)).toBe('Noch 12 s für eine Revanche.');
    expect(revancheText('gewuenscht', 9)).toContain('(noch 9 s)');
    expect(revancheText('angeboten', 3)).toBe('Dein Gegner möchte eine Revanche! (noch 3 s)');
  });

  test('ist die Revanche vorbei, steht keine Zahl dabei', () => {
    expect(revancheText('weg', 5)).toBe('Dein Gegner ist nicht mehr da – eine Revanche geht nicht mehr.');
    expect(revancheText('abgelaufen', 0)).toBe('Die Zeit für eine Revanche ist abgelaufen.');
  });

  test('ohne Revanche (Abbruch) gibt es keinen Satz', () => {
    expect(revancheText(null, 15)).toBe('');
  });
});

describe('Partien ohne Wertung', () => {
  test('interner Fehler und Serverende zählen nicht', () => {
    expect(ohneWertung(GRUND.INTERNER_FEHLER)).toBe(true);
    expect(ohneWertung(GRUND.SERVER_ENDE)).toBe(true);
  });

  test('zu lange kein Zug zählt nicht – niemand hat gewonnen oder verloren', () => {
    expect(ohneWertung(GRUND.ZU_LANGE_KEIN_ZUG)).toBe(true);
  });

  test('reguläres Ende, Aufgabe und Verlassen zählen', () => {
    expect(ohneWertung(GRUND.REGULAER)).toBe(false);
    expect(ohneWertung(GRUND.AUFGEGEBEN)).toBe(false);
    expect(ohneWertung(GRUND.GEGNER_WEG)).toBe(false);
  });
});

describe('Satz zum Grund des Endes', () => {
  test('Aufgabe: Wer gewonnen hat, liest, dass der Gegner aufgegeben hat', () => {
    expect(grundText(GRUND.AUFGEGEBEN, true)).toBe('Dein Gegner hat aufgegeben.');
    expect(grundText(GRUND.AUFGEGEBEN, false)).toBe('Du hast aufgegeben.');
  });

  test('Gegner weg, interner Fehler und Serverende haben je einen eigenen Satz', () => {
    expect(grundText(GRUND.GEGNER_WEG, true)).toBe('Der Gegner hat das Spiel verlassen.');
    expect(grundText(GRUND.INTERNER_FEHLER, false))
      .toBe('Die Partie musste wegen eines Fehlers abgebrochen werden.');
    expect(grundText(GRUND.SERVER_ENDE, false)).toBe('Der Server wurde beendet.');
  });

  test('zu lange kein Zug: der Satz nennt die Frist, nicht eine leere Reihe', () => {
    const satz = grundText(GRUND.ZU_LANGE_KEIN_ZUG, false);

    expect(satz).toBe(`${protokoll.GRENZEN.PARTIE_RUHE_MINUTEN} Minuten lang kam kein Zug – `
      + 'die Partie wurde beendet und zählt nicht.');
  });

  test('reguläres Ende: eine Reihe ist leer', () => {
    expect(grundText(GRUND.REGULAER, true))
      .toBe('Eine Reihe ist leer – die restlichen Kugeln wurden verteilt.');
  });
});

describe('Ergebnisdialog und Bilanz', () => {
  let elemente;
  let speicher;
  let ansicht;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1000);
    elemente = new Map();
    global.document = {
      querySelector: (auswahl) => {
        if (!elemente.has(auswahl)) {
          const element = {
            textContent: '',
            hidden: false,
            open: false,
            disabled: false,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            focus: jest.fn(),
          };
          element.showModal = () => { element.open = true; };
          element.close = () => { element.open = false; };
          elemente.set(auswahl, element);
        }
        return elemente.get(auswahl);
      },
    };
    speicher = new Map();
    global.window = {
      sessionStorage: {
        getItem: (name) => speicher.get(name) ?? null,
        setItem: (name, text) => speicher.set(name, text),
      },
    };
    ansicht = erzeugeEndeAnsicht({});
  });

  afterEach(() => {
    ansicht.verstecke();
    jest.useRealTimers();
    delete global.document;
    delete global.window;
  });

  function zeigeErgebnis(ergebnis, sitz = 'unten', revanche = 'moeglich') {
    ansicht.zeige({ ergebnis, sitz, revanche, revancheSeit: Date.now(), name: 'Anna' });
  }

  test.each(['unten', 'oben'])('Timeout zählt für %s auch bei ungleichem Stand nicht als Niederlage', (sitz) => {
    zeigeErgebnis({
      grund: GRUND.ZU_LANGE_KEIN_ZUG,
      sieger: null,
      punkte: { unten: 0, oben: 3 },
    }, sitz, null);

    expect(elemente.get('#t-ende').textContent).toBe('Partie abgebrochen');
    expect(elemente.get('#ende-bilanz').textContent).toContain('0-0 | 0 Remis');
    expect(speicher.size).toBe(0);
  });

  test('wiederholtes Zeichnen zählt dasselbe Ergebnis genau einmal', () => {
    const ergebnis = {
      grund: GRUND.REGULAER,
      sieger: 'unten',
      punkte: { unten: 25, oben: 23 },
    };
    zeigeErgebnis(ergebnis);
    zeigeErgebnis(ergebnis);
    expect(JSON.parse(speicher.get('mancala.bilanz')).siege).toBe(1);
  });

  test('Serverfehler bleibt trotz Sekundentakt sichtbar, ein neuer Revanche-Stand ersetzt ihn', () => {
    const ergebnis = {
      grund: GRUND.REGULAER,
      sieger: 'unten',
      punkte: { unten: 25, oben: 23 },
    };
    zeigeErgebnis(ergebnis);
    ansicht.melde('Bitte kurz warten.');
    jest.advanceTimersByTime(1000);
    expect(elemente.get('#revanche-hinweis').textContent).toBe('Bitte kurz warten.');
    zeigeErgebnis(ergebnis, 'unten', 'angeboten');
    expect(elemente.get('#revanche-hinweis').textContent).toContain('Dein Gegner möchte');
  });

  const regulaer = {
    grund: GRUND.REGULAER,
    sieger: 'unten',
    punkte: { unten: 25, oben: 23 },
  };

  test('„Revanche“ per Tastatur: die Überschrift fängt den Fokus auf (WCAG)', () => {
    zeigeErgebnis(regulaer);
    const knopfErneut = elemente.get('#knopf-erneut');
    knopfErneut.focus.mockClear();
    global.document.activeElement = elemente.get('#knopf-revanche');

    zeigeErgebnis(regulaer, 'unten', 'gewuenscht');

    expect(elemente.get('#knopf-revanche').disabled).toBe(true);
    expect(elemente.get('#t-ende').focus).toHaveBeenCalledTimes(1);
    // Ein zweites Enter darf nicht „Neues Spiel suchen“ treffen.
    expect(knopfErneut.focus).not.toHaveBeenCalled();
  });

  test('liegt der Fokus woanders, bleibt er beim Sperren der Revanche dort', () => {
    zeigeErgebnis(regulaer);
    global.document.activeElement = elemente.get('#knopf-abmelden');

    zeigeErgebnis(regulaer, 'unten', 'gewuenscht');

    expect(elemente.get('#t-ende').focus).not.toHaveBeenCalled();
  });

  /** Zeigt das Ergebnis mit einer eigenen Ansicht und liefert ihre Dialog-Listener. */
  function zeigeMitEscListenern(beiSchliessen) {
    const eigene = erzeugeEndeAnsicht({ beiSchliessen });
    eigene.zeige({
      ergebnis: regulaer, sitz: 'unten', revanche: 'moeglich', revancheSeit: Date.now(), name: 'Anna',
    });
    const dialog = elemente.get('#dialog-ende');
    const holeListener = (art) => dialog.addEventListener.mock.calls
      .filter(([name]) => name === art).pop()[1];
    return { eigene, dialog, abbruch: holeListener('cancel'), zu: holeListener('close') };
  }

  test('Esc meldet erst im close-Ereignis, wenn der Dialog wirklich zu ist (Fokus der Anmeldung)', () => {
    // Solange der modale Dialog offen ist, ist der Rest der Seite inert und
    // der Fokus der Anmeldung ginge verloren (WebKit: auch im cancel-Ereignis).
    let offenBeimAufruf = null;
    const beiSchliessen = jest.fn(() => {
      offenBeimAufruf = elemente.get('#dialog-ende').open;
    });
    const { eigene, dialog, abbruch, zu } = zeigeMitEscListenern(beiSchliessen);

    abbruch({});
    expect(beiSchliessen).not.toHaveBeenCalled();

    dialog.open = false;
    zu({});

    expect(beiSchliessen).toHaveBeenCalledTimes(1);
    expect(offenBeimAufruf).toBe(false);
    eigene.verstecke();
  });

  test('ein Schließen ohne Esc (neue Suche, Abmelden) führt nicht zu beiSchliessen', () => {
    const beiSchliessen = jest.fn();
    const { eigene, zu } = zeigeMitEscListenern(beiSchliessen);

    zu({});

    expect(beiSchliessen).not.toHaveBeenCalled();
    eigene.verstecke();
  });

  test('verstecke meldet genau die angemeldeten Dialog-Listener wieder ab', () => {
    const { eigene, dialog, abbruch, zu } = zeigeMitEscListenern(jest.fn());

    eigene.verstecke();

    expect(dialog.removeEventListener).toHaveBeenCalledWith('cancel', abbruch);
    expect(dialog.removeEventListener).toHaveBeenCalledWith('close', zu);
  });

  test('Abbruch ohne Wertung nennt den Stand beim Abbruch', () => {
    const abbruch = { grund: GRUND.INTERNER_FEHLER, sieger: null, punkte: { unten: 4, oben: 7 } };

    zeigeErgebnis(abbruch, 'unten', null);
    expect(elemente.get('#ende-text').textContent).toBe('Stand beim Abbruch: 4 zu 7.');

    zeigeErgebnis(abbruch, 'oben', null);
    expect(elemente.get('#ende-text').textContent).toBe('Stand beim Abbruch: 7 zu 4.');
  });

  test('Aufgabe nach Extrazug: neutraler Stand statt Glückwunsch oder Trostsatz', () => {
    // Anna (unten) führt 1:0 durch den Extrazug und gibt auf: Ben (oben) gewinnt.
    const aufgabe = { grund: GRUND.AUFGEGEBEN, sieger: 'oben', punkte: { unten: 1, oben: 0 } };

    zeigeErgebnis(aufgabe, 'oben');
    expect(elemente.get('#t-ende').textContent).toBe('Du hast gewonnen!');
    expect(elemente.get('#ende-text').textContent).toBe('Stand beim Ende: 0 zu 1.');

    zeigeErgebnis(aufgabe, 'unten');
    expect(elemente.get('#t-ende').textContent).toBe('Du hast verloren');
    expect(elemente.get('#ende-text').textContent).toBe('Stand beim Ende: 1 zu 0.');
  });

  test('Gegner weg: ebenfalls neutraler Stand beim Ende', () => {
    const weg = { grund: GRUND.GEGNER_WEG, sieger: 'unten', punkte: { unten: 2, oben: 5 } };

    zeigeErgebnis(weg, 'unten');

    expect(elemente.get('#t-ende').textContent).toBe('Du hast gewonnen!');
    expect(elemente.get('#ende-text').textContent).toBe('Stand beim Ende: 2 zu 5.');
  });
});
