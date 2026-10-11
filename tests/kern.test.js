/**
 * kern.test.js – Anzeigezustand und Netzverbindung des Clients.
 *
 * Eine Socket-Attrappe merkt sich Listener und gesendete Nachrichten.
 * Damit wird der Clientablauf ohne laufenden Server geprüft.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { jest } from '@jest/globals';
import * as protokoll from '../shared/protokoll.js';

/** Socket-Attrappe; jeder Test erzeugt sie mit neuerSocket() neu. */
let socket = null;

function neuerSocket() {
  const ereignisse = new Map();
  const gesendet = [];
  socket = {
    ereignisse,
    gesendet,
    on: (name, rueckruf) => ereignisse.set(name, rueckruf),
    emit: (name, daten) => gesendet.push(daten === undefined ? [name] : [name, daten]),
    disconnect: jest.fn(),
    connect: jest.fn(),
  };
  return socket;
}

/*
 * kern.js lädt Protokoll und Socket.io über Browserpfade, die nur der Server
 * ausliefert. Je zwei Zeilen sagen Jest, was es stattdessen laden soll (bei
 * ES-Modulen braucht Jest beide: die erste meldet den Pfad an, die zweite
 * liefert den Inhalt).
 */
jest.mock('/shared/protokoll.js', () => ({}), { virtual: true });
jest.unstable_mockModule('/shared/protokoll.js', () => protokoll, { virtual: true });
jest.mock('/socket.io/socket.io.esm.min.js', () => ({}), { virtual: true });
jest.unstable_mockModule('/socket.io/socket.io.esm.min.js', () => ({ io: () => neuerSocket() }),
  { virtual: true });

const { erzeugeStore, verbinde, ANSICHT } = await import('../client/js/kern.js');
const { EREIGNIS } = protokoll;

beforeEach(() => { global.window = new EventTarget(); });
afterEach(() => { delete global.window; });

function seitenwechsel(name, persisted) {
  const ereignis = new Event(name);
  Object.defineProperty(ereignis, 'persisted', { value: persisted });
  window.dispatchEvent(ereignis);
}

// == 2. Testfälle ===========================================================

describe('Store (Anzeigezustand)', () => {
  test('beginnt in der Anmeldeansicht ohne Sitz und Spielstand', () => {
    const zustand = erzeugeStore().lies();

    expect(zustand.ansicht).toBe(ANSICHT.ANMELDEN);
    expect(zustand.sitz).toBeNull();
    expect(zustand.spielstand).toBeNull();
  });

  test('setze übernimmt Änderungen und lässt den Rest stehen', () => {
    const store = erzeugeStore();
    store.setze({ name: 'Anna' });
    store.setze({ ansicht: ANSICHT.WARTEN });

    expect(store.lies().name).toBe('Anna');
    expect(store.lies().ansicht).toBe(ANSICHT.WARTEN);
  });

  test('lies liefert eine Kopie – Ändern der Kopie ändert den Store nicht', () => {
    const store = erzeugeStore();
    store.lies().ansicht = ANSICHT.SPIEL;

    expect(store.lies().ansicht).toBe(ANSICHT.ANMELDEN);
  });

  test('jeder Abonnent bekommt nach setze den neuen Zustand', () => {
    const store = erzeugeStore();
    const gesehen = [];
    store.abonniere((zustand) => gesehen.push(zustand.ansicht));
    store.abonniere((zustand) => gesehen.push(`2:${zustand.ansicht}`));

    store.setze({ ansicht: ANSICHT.SPIEL });

    expect(gesehen).toEqual([ANSICHT.SPIEL, `2:${ANSICHT.SPIEL}`]);
  });

  test('ein scheiternder Abonnent hält die übrigen nicht auf', () => {
    const store = erzeugeStore();
    const gesehen = [];
    const stumm = jest.spyOn(console, 'error').mockImplementation(() => {});
    store.abonniere(() => {
      throw new Error('kaputt');
    });
    store.abonniere((zustand) => gesehen.push(zustand.ansicht));

    store.setze({ ansicht: ANSICHT.ENDE });

    expect(gesehen).toEqual([ANSICHT.ENDE]);
    expect(stumm).toHaveBeenCalled();
    stumm.mockRestore();
  });

  test('nach dem Abmelden bekommt ein Abonnent nichts mehr', () => {
    const store = erzeugeStore();
    let aufrufe = 0;
    const abmelden = store.abonniere(() => {
      aufrufe += 1;
    });

    store.setze({ name: 'a' });
    abmelden();
    store.setze({ name: 'b' });

    expect(aufrufe).toBe(1);
  });
});

describe('Netzverbindung: was der Client sendet', () => {
  test('ein Zug schickt nur die Muldennummer', () => {
    const aktionen = verbinde({});
    aktionen.zug(3);

    expect(socket.gesendet).toEqual([[EREIGNIS.ZUG, { mulde: 3 }]]);
  });

  test('Beitreten: schnell, privat oder mit Code – ein Code gewinnt', () => {
    const aktionen = verbinde({});
    aktionen.beitreten('Anna');
    aktionen.beitreten('Anna', { privat: true });
    aktionen.beitreten('Anna', { privat: true, code: 'K7M2QX' });

    expect(socket.gesendet).toEqual([
      [EREIGNIS.BEITRETEN, { name: 'Anna', privat: false }],
      [EREIGNIS.BEITRETEN, { name: 'Anna', privat: true }],
      [EREIGNIS.BEITRETEN, { name: 'Anna', code: 'K7M2QX' }],
    ]);
  });

  test('„Neues Spiel suchen“ schickt den zuletzt benutzten Namen mit', () => {
    const aktionen = verbinde({});
    aktionen.erneut();
    aktionen.beitreten('Ben');
    aktionen.erneut();

    expect(socket.gesendet).toEqual([
      [EREIGNIS.ERNEUT, { name: '' }],
      [EREIGNIS.BEITRETEN, { name: 'Ben', privat: false }],
      [EREIGNIS.ERNEUT, { name: 'Ben' }],
    ]);
  });

  test('Abbrechen, Aufgeben und Revanche schicken keine Nutzdaten', () => {
    const aktionen = verbinde({});
    aktionen.abbrechen();
    aktionen.aufgeben();
    aktionen.revanche();

    expect(socket.gesendet).toEqual([
      [EREIGNIS.ABBRECHEN], [EREIGNIS.AUFGEBEN], [EREIGNIS.REVANCHE],
    ]);
  });
});

describe('Netzverbindung: was beim Client ankommt', () => {
  test('Spielereignisse rufen den passenden Rückruf mit den Daten auf', () => {
    const angekommen = [];
    verbinde({
      beiStart: (daten) => angekommen.push(['start', daten]),
      beiFehler: (daten) => angekommen.push(['fehler', daten]),
      beiRevancheAngebot: () => angekommen.push(['angebot']),
    });

    socket.ereignisse.get(EREIGNIS.START)({ sitz: 'unten' });
    socket.ereignisse.get(EREIGNIS.FEHLER)({ code: 'MULDE_LEER' });
    socket.ereignisse.get(EREIGNIS.REVANCHE_ANGEBOT)();

    expect(angekommen).toEqual([
      ['start', { sitz: 'unten' }],
      ['fehler', { code: 'MULDE_LEER' }],
      ['angebot'],
    ]);
  });

  test('Verbinden und Trennen melden sich, ein Verbindungsfehler mit seinem Text', () => {
    const angekommen = [];
    verbinde({
      beiVerbindung: () => angekommen.push('verbunden'),
      beiTrennung: (grund) => angekommen.push(`getrennt: ${grund}`),
    });

    socket.ereignisse.get('connect')();
    socket.ereignisse.get('disconnect')('transport close');
    socket.ereignisse.get('connect_error')(new Error('xhr poll error'));

    expect(angekommen).toEqual([
      'verbunden', 'getrennt: transport close', 'getrennt: xhr poll error',
    ]);
  });

  test('fehlt ein Rückruf, passiert nichts – kein Absturz', () => {
    verbinde({});

    expect(() => socket.ereignisse.get(EREIGNIS.ENDE)({})).not.toThrow();
    expect(() => socket.ereignisse.get(EREIGNIS.REVANCHE_WEG)()).not.toThrow();
  });
});

describe('Netzverbindung beim Zurück-Cache', () => {
  test.each([false, true])('pagehide trennt vor dem Verlassen (Cache: %s)', (persisted) => {
    verbinde({});
    seitenwechsel('pagehide', persisted);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  test('nur die Wiederherstellung aus dem Cache verbindet denselben Socket neu', () => {
    verbinde({});
    seitenwechsel('pageshow', false);
    expect(socket.connect).not.toHaveBeenCalled();
    seitenwechsel('pagehide', true);
    seitenwechsel('pageshow', true);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });
});
