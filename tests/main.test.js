/**
 * Prüft echte Client-Abläufe mit einem Socket und Ansichten ohne Browser.
 * Der Store und die Netzwerkverteilung bleiben unverändert; nur Anzeige und
 * Socket.io werden ersetzt, damit Nachrichten gezielt überlappen können.
 */
import { jest } from '@jest/globals';
import * as protokoll from '../shared/protokoll.js';

let socket;
let ansichten;
let rueckrufe;
let elemente;

function ansicht() {
  return {
    zeige: jest.fn(), verstecke: jest.fn(), aktualisiere: jest.fn(),
    starte: jest.fn(), spieleZug: jest.fn(() => Promise.resolve()),
    melde: jest.fn(), beende: jest.fn(),
  };
}

jest.mock('/shared/protokoll.js', () => ({}), { virtual: true });
jest.unstable_mockModule('/shared/protokoll.js', () => protokoll, { virtual: true });
jest.mock('/socket.io/socket.io.esm.min.js', () => ({}), { virtual: true });
jest.unstable_mockModule('/socket.io/socket.io.esm.min.js', () => ({ io: () => socket }),
  { virtual: true });
for (const [datei, name] of [
  ['anmelden', 'erzeugeAnmeldeAnsicht'], ['warten', 'erzeugeWarteAnsicht'],
  ['spiel', 'erzeugeSpielAnsicht'], ['ende', 'erzeugeEndeAnsicht'],
]) {
  jest.unstable_mockModule(`../client/js/${datei}.js`, () => ({
    [name]: (deps) => {
      rueckrufe[datei] = deps;
      return ansichten[datei];
    },
  }));
}
jest.unstable_mockModule('../client/js/einstellungen.js', () => ({
  erzeugeEinstellungen: () => ({ zeigeBeimErstenBesuch() {} }),
}));

beforeEach(async () => {
  jest.resetModules();
  socket = { on: jest.fn(), emit: jest.fn(), disconnect: jest.fn(), connect: jest.fn() };
  ansichten = Object.fromEntries(['anmelden', 'warten', 'spiel', 'ende'].map((name) => [name, ansicht()]));
  rueckrufe = {};
  elemente = { '#verbindungshinweis': { hidden: true }, '#ladehinweis': { hidden: false } };
  global.document = { querySelector: (auswahl) => elemente[auswahl] };
  global.window = { history: { replaceState: jest.fn() }, location: { pathname: '/' } };
  await import('../client/js/main.js');
});

afterEach(() => {
  delete global.document;
  delete global.window;
});

function sende(name, daten) {
  const eintrag = socket.on.mock.calls.find(([ereignis]) => ereignis === name);
  return eintrag[1](daten);
}

function spielstand(status = protokoll.STATUS.LAEUFT) {
  return { status, spieler: { unten: { name: 'Anna' }, oben: { name: 'Ben' } } };
}

function starte() {
  sende('connect');
  sende(protokoll.EREIGNIS.START, { sitz: 'unten', gegner: { name: 'Ben' }, spielstand: spielstand() });
}

async function beende() {
  await sende(protokoll.EREIGNIS.ENDE, {
    spielstand: spielstand(protokoll.STATUS.BEENDET),
    ergebnis: { punkte: { unten: 25, oben: 23 }, sieger: 'unten', grund: protokoll.GRUND.REGULAER },
    revanche: true,
  });
}

describe('Neue Suche nach dem Ergebnis', () => {
  test('bleibt während einer langsamen Antwort im Warten, auch wenn der Gegner Revanche anbietet', async () => {
    starte();
    await beende();
    rueckrufe.ende.beiNeuemSpiel();
    sende(protokoll.EREIGNIS.REVANCHE_ANGEBOT);

    expect(ansichten.warten.zeige).toHaveBeenLastCalledWith(true);
    expect(ansichten.ende.verstecke).toHaveBeenCalled();
    expect(ansichten.ende.zeige).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenLastCalledWith(protokoll.EREIGNIS.ERNEUT, { name: '' });
  });
});

describe('Zurück zur Anmeldung', () => {
  test('Abmelden beendet das Revanche-Angebot und behält die Verbindung', async () => {
    starte();
    await beende();
    rueckrufe.ende.beiAbmelden();

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenLastCalledWith(protokoll.EREIGNIS.ABBRECHEN);
    expect(ansichten.anmelden.zeige).toHaveBeenLastCalledWith(true);
    expect(elemente['#verbindungshinweis'].hidden).toBe(true);
  });
});
