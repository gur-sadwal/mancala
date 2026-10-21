/**
 * main.test.js – Überlappende Clientabläufe und sichtbare Fehler.
 *
 * Store und Netzverteilung sind echt; Ansichten und Socket sind
 * Attrappen. So treffen Nachrichten gezielt während einer Animation ein.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { jest } from '@jest/globals';
import * as protokoll from '../shared/protokoll.js';

let socket;
let ansichten;
let rueckrufe;
let elemente;

function ansicht() {
  return {
    zeige: jest.fn(),
    verstecke: jest.fn(),
    aktualisiere: jest.fn(),
    starte: jest.fn(),
    spieleZug: jest.fn(() => Promise.resolve()),
    melde: jest.fn(),
    beende: jest.fn(),
    zeigeEnde: jest.fn(),
  };
}

jest.mock('/shared/protokoll.js', () => ({}), { virtual: true });
jest.unstable_mockModule('/shared/protokoll.js', () => protokoll, { virtual: true });
jest.mock('/socket.io/socket.io.esm.min.js', () => ({}), { virtual: true });
jest.unstable_mockModule('/socket.io/socket.io.esm.min.js',
  () => ({ io: () => socket }), { virtual: true });
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
  // connected wie bei einem echten Socket; kern.js sendet sonst nach einer
  // Unterbrechung bewusst nichts.
  socket = {
    connected: true,
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn(),
  };
  ansichten = Object.fromEntries(
    ['anmelden', 'warten', 'spiel', 'ende'].map((name) => [name, ansicht()]),
  );
  rueckrufe = {};
  elemente = {
    '#verbindungshinweis': { hidden: true },
    '#ladehinweis': { hidden: false },
  };
  global.document = { querySelector: (auswahl) => elemente[auswahl] };
  global.window = Object.assign(new EventTarget(), {
    history: { replaceState: jest.fn() },
    location: { pathname: '/' },
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
  return {
    status,
    spieler: { unten: { name: 'Anna' }, oben: { name: 'Ben' } },
  };
}

function starte() {
  sende('connect');
  sende(protokoll.EREIGNIS.START, {
    sitz: 'unten',
    gegner: { name: 'Ben' },
    spielstand: spielstand(),
  });
}

async function beende() {
  await sende(protokoll.EREIGNIS.ENDE, {
    spielstand: spielstand(protokoll.STATUS.BEENDET),
    ergebnis: {
      punkte: { unten: 25, oben: 23 },
      sieger: 'unten',
      grund: protokoll.GRUND.REGULAER,
    },
    revanche: true,
  });
}

// == 2. Testfälle ===========================================================

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
  test('Esc im Ergebnis nimmt die Revanche zurück und führt zur Anmeldung',
    async () => {
      starte();
      await beende();
      rueckrufe.ende.beiSchliessen();

      expect(socket.emit)
        .toHaveBeenLastCalledWith(protokoll.EREIGNIS.ABBRECHEN);
      expect(ansichten.anmelden.zeige).toHaveBeenLastCalledWith(true);
    });

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
    ansichten.spiel.spieleZug.mockReturnValue(new Promise((resolve) => {
      fertig = resolve;
    }));
    sende(protokoll.EREIGNIS.STAND, {
      spielstand: spielstand(protokoll.STATUS.BEENDET),
      bericht: {},
    });
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

  test('„Partie beendet“ erst nach der Schlussanimation', async () => {
    starte();
    const fertig = halteAnimationAn();
    const ende = beende();
    expect(ansichten.spiel.zeigeEnde).not.toHaveBeenCalled();

    fertig();
    await ende;
    expect(ansichten.spiel.zeigeEnde).toHaveBeenCalledTimes(1);
  });

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
    protokoll.FEHLER.BEREITS_IN_PARTIE, protokoll.FEHLER.SERVER_VOLL,
  ].includes(code)))('zeigt %s im Spiel als Text', (code) => {
    starte();
    sende(protokoll.EREIGNIS.FEHLER, { code });
    expect(ansichten.spiel.melde).toHaveBeenLastCalledWith(protokoll.FEHLER_TEXT[code], {
      ruetteln: [protokoll.FEHLER.MULDE_LEER, protokoll.FEHLER.NICHT_AM_ZUG].includes(code),
    });
  });

  test.each(['anmelden', 'warten', 'ende'])('zeigt Fehler in %s an der sichtbaren Ansicht', async (name) => {
    if (name === 'warten') sende(protokoll.EREIGNIS.WARTESCHLANGE, { position: 1 });
    if (name === 'ende') {
      starte();
      await beende();
    }
    sende(protokoll.EREIGNIS.FEHLER, { code: protokoll.FEHLER.ZU_VIELE_ANFRAGEN });
    expect(ansichten[name].melde).toHaveBeenLastCalledWith(
      protokoll.FEHLER_TEXT[protokoll.FEHLER.ZU_VIELE_ANFRAGEN]);
  });
});

describe('Doppelt abgeschickter Beitritt', () => {
  test('BEREITS_IN_PARTIE im Spiel ersetzt nicht die Zuganzeige', () => {
    starte();
    sende(protokoll.EREIGNIS.FEHLER, {
      code: protokoll.FEHLER.BEREITS_IN_PARTIE,
    });

    expect(ansichten.spiel.melde).not.toHaveBeenCalled();
    expect(ansichten.spiel.zeige).toHaveBeenLastCalledWith(true);
  });

  test.each([
    [protokoll.EREIGNIS.WARTESCHLANGE, { position: 1 }],
    [protokoll.EREIGNIS.PRIVAT, { code: 'K7M2QX' }],
  ])('nach %s bleibt BEREITS_IN_WARTESCHLANGE still', (ereignis, daten) => {
    sende(ereignis, daten);
    sende(protokoll.EREIGNIS.FEHLER, {
      code: protokoll.FEHLER.BEREITS_IN_WARTESCHLANGE,
    });

    expect(ansichten.warten.melde).not.toHaveBeenCalled();
    expect(ansichten.warten.zeige).toHaveBeenLastCalledWith(true);
  });

  test('BEREITS_IN_PARTIE außerhalb des Spiels wird weiter angezeigt', () => {
    sende(protokoll.EREIGNIS.FEHLER, {
      code: protokoll.FEHLER.BEREITS_IN_PARTIE,
    });

    expect(ansichten.anmelden.melde).toHaveBeenLastCalledWith(
      protokoll.FEHLER_TEXT[protokoll.FEHLER.BEREITS_IN_PARTIE]);
  });

  test('außerhalb des Wartens führt dieselbe Meldung ins Warten', () => {
    sende(protokoll.EREIGNIS.FEHLER, {
      code: protokoll.FEHLER.BEREITS_IN_WARTESCHLANGE,
    });

    expect(ansichten.warten.zeige).toHaveBeenLastCalledWith(true);
    expect(ansichten.warten.melde).toHaveBeenLastCalledWith(
      protokoll.FEHLER_TEXT[protokoll.FEHLER.BEREITS_IN_WARTESCHLANGE]);
  });
});

describe('Ergebnis nach einem Abbruch', () => {
  test('ein Abbruch zeigt das Ende und öffnet das Ergebnis', async () => {
    starte();
    const aufgegeben = protokoll.GRUND.AUFGEGEBEN;
    await sende(protokoll.EREIGNIS.ABBRUCH, {
      grund: aufgegeben,
      spielstand: spielstand(protokoll.STATUS.BEENDET),
      ergebnis: {
        punkte: { unten: 10, oben: 8 }, sieger: 'unten', grund: aufgegeben,
      },
      revanche: true,
    });

    expect(ansichten.spiel.zeigeEnde).toHaveBeenCalledTimes(1);
    expect(ansichten.ende.zeige.mock.lastCall[0].ergebnis.sieger)
      .toBe('unten');
  });
});

describe('Rückfrage beim Verlassen', () => {
  /** Ein abbrechbares beforeunload wie beim Schließen oder Neuladen. */
  function verlasseSeite() {
    const ereignis = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ereignis);
    return ereignis.defaultPrevented;
  }

  test('vor der Partie fragt der Browser nicht nach', () => {
    sende('connect');
    expect(verlasseSeite()).toBe(false);
  });

  test('während der Partie fragt der Browser nach', () => {
    starte();
    expect(verlasseSeite()).toBe(true);
  });

  test('nach dem Ergebnis und nach der Rückkehr zur Anmeldung nicht mehr', async () => {
    starte();
    await beende();
    expect(verlasseSeite()).toBe(false);

    rueckrufe.ende.beiAbmelden();
    expect(verlasseSeite()).toBe(false);
  });

  test('eine Revanche schützt die neue Partie wieder', async () => {
    starte();
    await beende();
    starte();
    expect(verlasseSeite()).toBe(true);
  });
});

describe('Voller Server', () => {
  test('SERVER_VOLL führt aus dem Warten mit Erklärung zur Anmeldung', async () => {
    starte();
    await beende();
    rueckrufe.ende.beiNeuemSpiel();

    sende(protokoll.EREIGNIS.FEHLER, { code: protokoll.FEHLER.SERVER_VOLL });

    expect(ansichten.anmelden.zeige).toHaveBeenLastCalledWith(true);
    expect(ansichten.anmelden.melde).toHaveBeenLastCalledWith(
      protokoll.FEHLER_TEXT[protokoll.FEHLER.SERVER_VOLL]);
  });
});

describe('Verspätete Nachrichten nach „Suche abbrechen“', () => {
  /** Die Anmeldung schickt den Beitritt; main.js erfährt davon so. */
  function sucheGegner() {
    sende('connect');
    rueckrufe.anmelden.beiAnmeldung('Anna');
  }

  test.each([
    [protokoll.EREIGNIS.WARTESCHLANGE, { position: 1 }],
    [protokoll.EREIGNIS.PRIVAT, { code: 'K7M2QX' }],
  ])('ein spätes %s holt die Warteansicht nicht zurück', (ereignis, daten) => {
    sucheGegner();
    sende(ereignis, daten);
    rueckrufe.warten.beiAbbrechen();

    sende(ereignis, daten);

    expect(ansichten.anmelden.zeige).toHaveBeenLastCalledWith(true);
    expect(ansichten.warten.zeige).toHaveBeenLastCalledWith(false);
  });

  test('aus dem Ergebnis: neue Suche, sofort abbrechen, dann späte Position', async () => {
    starte();
    await beende();
    rueckrufe.ende.beiNeuemSpiel();
    rueckrufe.warten.beiAbbrechen();

    sende(protokoll.EREIGNIS.WARTESCHLANGE, { position: 1 });

    expect(ansichten.anmelden.zeige).toHaveBeenLastCalledWith(true);
    expect(ansichten.warten.zeige).toHaveBeenLastCalledWith(false);
  });

  test('ein spätes BEREITS_IN_WARTESCHLANGE nach dem Abbrechen bleibt still', () => {
    sucheGegner();
    sende(protokoll.EREIGNIS.WARTESCHLANGE, { position: 1 });
    rueckrufe.warten.beiAbbrechen();

    sende(protokoll.EREIGNIS.FEHLER, {
      code: protokoll.FEHLER.BEREITS_IN_WARTESCHLANGE,
    });

    expect(ansichten.anmelden.zeige).toHaveBeenLastCalledWith(true);
    expect(ansichten.warten.zeige).toHaveBeenLastCalledWith(false);
    expect(ansichten.anmelden.melde).not.toHaveBeenCalled();
  });

  test('eine neue Suche nach dem Abbrechen zeigt ihre Position wieder', () => {
    sucheGegner();
    sende(protokoll.EREIGNIS.WARTESCHLANGE, { position: 1 });
    rueckrufe.warten.beiAbbrechen();
    rueckrufe.anmelden.beiAnmeldung('Anna');

    sende(protokoll.EREIGNIS.WARTESCHLANGE, { position: 2 });

    expect(ansichten.warten.zeige).toHaveBeenLastCalledWith(true);
    expect(ansichten.warten.aktualisiere.mock.lastCall[0].position).toBe(2);
  });
});

describe('Ergebnisdialog ohne Verbindung', () => {
  test('„Neues Spiel suchen“ täuscht ohne Verbindung keine Suche vor', async () => {
    starte();
    await beende();
    socket.connected = false;
    ansichten.ende.verstecke.mockClear();

    rueckrufe.ende.beiNeuemSpiel();

    expect(socket.emit).not.toHaveBeenCalledWith(
      protokoll.EREIGNIS.ERNEUT, expect.anything());
    expect(ansichten.warten.zeige).not.toHaveBeenCalledWith(true);
    expect(ansichten.ende.verstecke).not.toHaveBeenCalled();
    expect(ansichten.ende.melde)
      .toHaveBeenLastCalledWith(expect.stringContaining('Ohne Verbindung'));
  });

  test('„Revanche“ ohne Verbindung wartet nicht auf den Gegner', async () => {
    starte();
    await beende();
    socket.connected = false;

    rueckrufe.ende.beiRevanche();

    expect(ansichten.ende.zeige.mock.lastCall[0].revanche).toBe('moeglich');
    expect(ansichten.ende.melde)
      .toHaveBeenLastCalledWith(expect.stringContaining('Ohne Verbindung'));
  });

  test('mit Verbindung schließt erst der Dialog, dann beginnt das Warten', async () => {
    starte();
    await beende();
    ansichten.ende.verstecke.mockClear();
    ansichten.warten.zeige.mockClear();

    rueckrufe.ende.beiNeuemSpiel();

    // Ein offener modaler Dialog ließe die Warteansicht nicht fokussieren.
    const [geschlossen] = ansichten.ende.verstecke.mock.invocationCallOrder;
    const [wartet] = ansichten.warten.zeige.mock.invocationCallOrder;
    expect(geschlossen).toBeLessThan(wartet);
    expect(ansichten.warten.zeige).toHaveBeenLastCalledWith(true);
  });
});

describe('Verbindungshinweis bei Funkloch', () => {
  test('„offline“ zeigt den Hinweis sofort, „online“ blendet ihn bei laufendem Socket aus', () => {
    sende('connect');

    window.dispatchEvent(new Event('offline'));
    expect(elemente['#verbindungshinweis'].hidden).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(elemente['#verbindungshinweis'].hidden).toBe(true);
  });

  test('„online“ lässt den Hinweis stehen, solange der Socket getrennt ist', () => {
    sende('connect');
    socket.connected = false;

    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));

    expect(elemente['#verbindungshinweis'].hidden).toBe(false);
  });
});
