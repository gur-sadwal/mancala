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
  global.window = Object.assign(new EventTarget(), {
    history: { replaceState: jest.fn() }, location: { pathname: '/' },
  });
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

describe('Nachrichten während der Schlussanimation', () => {
  function halteAnimationAn() {
    let fertig;
    ansichten.spiel.spieleZug.mockReturnValue(new Promise((resolve) => { fertig = resolve; }));
    sende(protokoll.EREIGNIS.STAND, { spielstand: spielstand(protokoll.STATUS.BEENDET), bericht: {} });
    return fertig;
  }

  test.each([protokoll.EREIGNIS.ENDE, protokoll.EREIGNIS.ABBRUCH])(
    'ein altes %s öffnet nach Wiederverbindung keinen Dialog', async (ereignis) => {
      starte();
      const fertig = halteAnimationAn();
      const ende = sende(ereignis, { spielstand: spielstand(), ergebnis: {}, revanche: true });
      sende('disconnect', 'transport close');
      sende('connect');
      fertig();
      await ende;

      expect(ansichten.anmelden.zeige).toHaveBeenLastCalledWith(true);
      expect(ansichten.ende.zeige).not.toHaveBeenCalled();
      expect(ansichten.anmelden.melde).toHaveBeenLastCalledWith(
        'Die Verbindung war unterbrochen. Bitte tritt erneut bei.');
    },
  );

  test.each([
    [protokoll.EREIGNIS.REVANCHE_WEG, 'weg'],
    [protokoll.EREIGNIS.REVANCHE_ABGELAUFEN, 'abgelaufen'],
    [protokoll.EREIGNIS.REVANCHE_ANGEBOT, 'angeboten'],
  ])('bewahrt %s bis zum Ergebnis', async (ereignis, stand) => {
    starte();
    const fertig = halteAnimationAn();
    const ende = beende();
    sende(ereignis);
    fertig();
    await ende;

    expect(ansichten.ende.zeige.mock.lastCall[0].revanche).toBe(stand);
  });
});

describe('Sichtbare Serverfehler', () => {
  test('abgelaufene Wartezeit führt mit Meldung zur Anmeldung', () => {
    sende(protokoll.EREIGNIS.PRIVAT, { code: 'K7M2QX' });
    sende(protokoll.EREIGNIS.FEHLER, { code: protokoll.FEHLER.WARTEZEIT_ABGELAUFEN });

    expect(ansichten.anmelden.zeige).toHaveBeenLastCalledWith(true);
    expect(ansichten.anmelden.melde).toHaveBeenLastCalledWith(
      protokoll.FEHLER_TEXT[protokoll.FEHLER.WARTEZEIT_ABGELAUFEN]);
  });

  test('fehlende Partie führt mit Erklärung zur Anmeldung', () => {
    starte();
    sende(protokoll.EREIGNIS.FEHLER, { code: protokoll.FEHLER.KEINE_PARTIE });
    expect(ansichten.anmelden.zeige).toHaveBeenLastCalledWith(true);
    expect(ansichten.anmelden.melde).toHaveBeenLastCalledWith(
      protokoll.FEHLER_TEXT[protokoll.FEHLER.KEINE_PARTIE]);
  });

  test.each(Object.values(protokoll.FEHLER).filter((code) => ![
    protokoll.FEHLER.KEINE_PARTIE, protokoll.FEHLER.CODE_UNBEKANNT,
    protokoll.FEHLER.WARTEZEIT_ABGELAUFEN, protokoll.FEHLER.BEREITS_IN_WARTESCHLANGE,
  ].includes(code)))('zeigt %s im Spiel als Text', (code) => {
    starte();
    sende(protokoll.EREIGNIS.FEHLER, { code });
    expect(ansichten.spiel.melde).toHaveBeenLastCalledWith(protokoll.FEHLER_TEXT[code], {
      ruetteln: [protokoll.FEHLER.MULDE_LEER, protokoll.FEHLER.NICHT_AM_ZUG].includes(code),
    });
  });

  test.each(['anmelden', 'warten', 'ende'])('zeigt Fehler in %s an der sichtbaren Ansicht', async (name) => {
    if (name === 'warten') sende(protokoll.EREIGNIS.WARTESCHLANGE, { position: 1 });
    if (name === 'ende') { starte(); await beende(); }
    sende(protokoll.EREIGNIS.FEHLER, { code: protokoll.FEHLER.ZU_VIELE_ANFRAGEN });
    expect(ansichten[name].melde).toHaveBeenLastCalledWith(
      protokoll.FEHLER_TEXT[protokoll.FEHLER.ZU_VIELE_ANFRAGEN]);
  });
});
