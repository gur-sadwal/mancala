/**
 * Tests der Ereignis-Handler (server/socket/handlers.js).
 *
 * Ohne echten Server und ohne Netzwerk: `io` und die Sockets sind kleine
 * Attrappen, die sich jede gesendete Nachricht merken. Lobby, Manager und
 * Ratenbegrenzer sind die echten Module. So laesst sich pruefen, was die
 * Handler an wen schicken – und dass der Prozess bei Unsinn nicht stirbt.
 */

import { erzeugeHandler } from '../server/socket/handlers.js';
import { erzeugeLobby, REVANCHE_FRIST_MS } from '../server/spiel/lobby.js';
import { erzeugeManager } from '../server/spiel/manager.js';
import { erzeugeRatenbegrenzer } from '../server/socket/rateLimit.js';
import { EREIGNIS, FEHLER, GRUND } from '../shared/protokoll.js';

/*
 * Die Handler protokollieren jeden Schritt (Konzept 7.10). Im Test waere das
 * nur Rauschen – die Zeilen werden deshalb gesammelt statt ausgegeben. Ein
 * Test prueft damit sogar, dass ein Fehler protokolliert wurde.
 */
const protokoll = [];
const echteKonsole = { log: console.log, warn: console.warn, error: console.error };

beforeAll(() => {
  console.log = (zeile) => protokoll.push(zeile);
  console.warn = (zeile) => protokoll.push(zeile);
  console.error = (zeile) => protokoll.push(zeile);
});

afterAll(() => {
  Object.assign(console, echteKonsole);
});

/**
 * Baut eine Testumgebung: echte Lobby und echter Manager, dazu eine Attrappe
 * fuer `io`, die Raeume kennt und Nachrichten an die Sockets verteilt.
 *
 * @param {object} lobby  normalerweise eine echte Lobby – oder eine, die
 *                        absichtlich wirft
 */
function erzeugeUmgebung(lobby = erzeugeLobby()) {
  const manager = erzeugeManager();
  const sockets = new Map();   // socketId -> Attrappe, wie io.sockets.sockets
  const raeume = new Map();    // Raum (= Spiel-ID) -> Menge der socketIds

  const io = {
    sockets: { sockets },
    to(raum) {
      return {
        emit(ereignis, daten) {
          for (const id of raeume.get(raum) ?? []) {
            sockets.get(id)?.empfangen.push({ ereignis, daten });
          }
        },
      };
    },
  };

  const handler = erzeugeHandler({
    io,
    lobby,
    manager,
    ratenbegrenzer: erzeugeRatenbegrenzer(),
  });

  /** Ein verbundener Browser: merkt sich alles, was bei ihm ankommt. */
  function verbinde(id) {
    const angemeldet = new Map();   // Ereignisname -> Handler des Servers

    const socket = {
      id,
      data: {},
      empfangen: [],

      // --- das, was handlers.js von einem Socket benutzt ---
      on(ereignis, handlerFunktion) {
        angemeldet.set(ereignis, handlerFunktion);
      },
      emit(ereignis, daten) {
        socket.empfangen.push({ ereignis, daten });
      },
      join(raum) {
        if (!raeume.has(raum)) raeume.set(raum, new Set());
        raeume.get(raum).add(id);
      },
      leave(raum) {
        raeume.get(raum)?.delete(id);
      },

      // --- Hilfen fuer die Tests ---
      /** Schickt ein Ereignis "vom Browser" an den Server. */
      sende(ereignis, daten) {
        angemeldet.get(ereignis)(daten);
      },
      /** Tab zu: Wie bei Socket.io ist der Socket weg, BEVOR `disconnect` laeuft. */
      trenne() {
        sockets.delete(id);
        angemeldet.get('disconnect')('transport close');
      },
      /** Alle empfangenen Nachrichten eines Typs. */
      alle(ereignis) {
        return socket.empfangen.filter((n) => n.ereignis === ereignis);
      },
      /** Die zuletzt empfangene Nachricht eines Typs – oder undefined. */
      letzte(ereignis) {
        return socket.alle(ereignis).at(-1);
      },
    };

    sockets.set(id, socket);
    handler.registriere(socket);
    return socket;
  }

  return { handler, manager, verbinde };
}

/** Zwei Spieler treten dem schnellen Spiel bei und werden gepaart. */
function schnellesSpiel() {
  const umgebung = erzeugeUmgebung();
  const anna = umgebung.verbinde('a');
  const ben = umgebung.verbinde('b');

  anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });
  ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben' });

  return { ...umgebung, anna, ben };
}

describe('Handler: Revanche nach jedem Spiel', () => {
  test('nach einer Aufgabe im schnellen Spiel wird beiden eine Revanche angeboten', () => {
    const { anna, ben } = schnellesSpiel();
    expect(anna.letzte(EREIGNIS.START)).toBeDefined();

    anna.sende(EREIGNIS.AUFGEBEN);

    for (const spieler of [anna, ben]) {
      const abbruch = spieler.letzte(EREIGNIS.ABBRUCH).daten;
      expect(abbruch.grund).toBe(GRUND.AUFGEGEBEN);
      expect(abbruch.revanche).toBe(true);
    }
  });

  test('nach dem regulaeren Ende eines schnellen Spiels ebenso', () => {
    const { anna, ben, manager } = schnellesSpiel();

    // Wer unten sitzt, beginnt. Das Brett wird so gestellt, dass sein Zug aus
    // Mulde 5 die letzte Kugel ins eigene Haus legt und damit die eigene Reihe
    // leert – die Partie endet regulaer. Summe weiterhin 48.
    const unten = anna.letzte(EREIGNIS.START).daten.sitz === 'unten' ? anna : ben;
    manager.holeNachSocket(unten.id).brett = [
      [15, 2, 2, 2, 2, 2, 2],   // oben: Haus 15, sechs Mulden mit je 2
      [0, 0, 0, 0, 0, 1, 20],   // unten: eine Kugel in Mulde 5, Haus 20
    ];

    unten.sende(EREIGNIS.ZUG, { mulde: 5 });

    for (const spieler of [anna, ben]) {
      expect(spieler.letzte(EREIGNIS.ENDE).daten.revanche).toBe(true);
    }
  });

  test('wollen beide, startet sofort eine neue Partie', () => {
    const { anna, ben } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);

    anna.sende(EREIGNIS.REVANCHE);
    expect(ben.letzte(EREIGNIS.REVANCHE_ANGEBOT)).toBeDefined();

    ben.sende(EREIGNIS.REVANCHE);

    // Je zwei START-Nachrichten: die erste Partie und die Revanche.
    expect(anna.alle(EREIGNIS.START)).toHaveLength(2);
    expect(ben.alle(EREIGNIS.START)).toHaveLength(2);
  });

  test('nach einem Verbindungsabbruch gibt es keine Revanche', () => {
    const { anna, ben } = schnellesSpiel();

    ben.trenne();

    const abbruch = anna.letzte(EREIGNIS.ABBRUCH).daten;
    expect(abbruch.grund).toBe(GRUND.GEGNER_WEG);
    expect(abbruch.revanche).toBe(false);
  });
});

describe('Handler: Revanche-Frist', () => {
  test('vor Ablauf der Frist passiert nichts', () => {
    const { anna, ben, handler } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);

    // Eine Sekunde vor dem Fristende.
    handler.pruefeRevanchen(Date.now() + REVANCHE_FRIST_MS - 1000);

    expect(anna.letzte(EREIGNIS.REVANCHE_ABGELAUFEN)).toBeUndefined();
    expect(ben.letzte(EREIGNIS.REVANCHE_ABGELAUFEN)).toBeUndefined();
  });

  test('nach Ablauf erfahren es beide, und ein spaeter Wunsch startet nichts', () => {
    const { anna, ben, handler } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);
    anna.sende(EREIGNIS.REVANCHE);   // Anna wollte, Ben hat nicht reagiert

    handler.pruefeRevanchen(Date.now() + REVANCHE_FRIST_MS);

    expect(anna.letzte(EREIGNIS.REVANCHE_ABGELAUFEN)).toBeDefined();
    expect(ben.letzte(EREIGNIS.REVANCHE_ABGELAUFEN)).toBeDefined();

    // Ben drueckt zu spaet: keine neue Partie.
    ben.sende(EREIGNIS.REVANCHE);
    expect(ben.letzte(EREIGNIS.REVANCHE_WEG)).toBeDefined();
    expect(ben.alle(EREIGNIS.START)).toHaveLength(1);
  });
});

describe('Handler: gleiche Namen', () => {
  test('zwei Spieler namens Anna bekommen verschiedene Sitze', () => {
    const { verbinde } = erzeugeUmgebung();
    const erste = verbinde('a');
    const zweite = verbinde('b');

    erste.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });
    zweite.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    const sitze = [erste, zweite].map((s) => s.letzte(EREIGNIS.START).daten.sitz);
    expect(sitze.sort()).toEqual(['oben', 'unten']);
  });
});

describe('Handler: Absturzsicherung', () => {
  test('Muell-Nutzdaten werden abgelehnt – nur beim Verursacher, ohne Absturz', () => {
    const { anna, ben, manager } = schnellesSpiel();
    const muell = [undefined, null, 42, 'zug', [], { mulde: '3' }, { mulde: 99 }, { mulde: -1 }, { mulde: 2.5 }];

    for (const daten of muell) {
      expect(() => anna.sende(EREIGNIS.ZUG, daten)).not.toThrow();
    }

    const fehler = anna.alle(EREIGNIS.FEHLER).map((n) => n.daten.code);
    expect(fehler).toEqual(muell.map(() => FEHLER.NUTZDATEN_UNGUELTIG));
    // Der Gegner erfaehrt davon nichts, und die Partie laeuft weiter.
    expect(ben.alle(EREIGNIS.FEHLER)).toHaveLength(0);
    expect(manager.holeNachSocket('a')).not.toBeNull();
  });

  test('wirft ein Handler, bleibt der Fehler bei diesem einen Ereignis', () => {
    // Eine Lobby, die beim Beitreten absichtlich wirft.
    const kaputteLobby = {
      ...erzeugeLobby(),
      beitreten() {
        throw new Error('absichtlicher Testfehler');
      },
    };
    const { verbinde } = erzeugeUmgebung(kaputteLobby);
    const anna = verbinde('a');

    expect(() => anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' })).not.toThrow();
    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.INTERNER_FEHLER);
    expect(protokoll.some((zeile) => zeile.includes('[ERROR]'))).toBe(true);
  });
});
