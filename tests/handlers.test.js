/**
 * handlers.test.js – Nachrichten, Partieabläufe und Absturzschutz.
 *
 * Socket-Attrappen merken sich Antworten; Lobby, Manager und
 * Ratenbegrenzung sind echte Module. Fehler lassen sich gezielt auslösen.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { erzeugeHandler } from '../server/socket/handlers.js';
import { erzeugeLobby, REVANCHE_FRIST_MS } from '../server/spiel/lobby.js';
import { erzeugeManager } from '../server/spiel/manager.js';
import { erzeugeRatenbegrenzer } from '../server/socket/rateLimit.js';
import { EREIGNIS, FEHLER, GRUND, GRENZEN, STATUS } from '../shared/protokoll.js';

/** Ein Zug in der Form, die der Browser sendet: { type: "MOVE", pitIndex }. */
const zug = (pitIndex) => ({ type: 'MOVE', pitIndex });

/*
 * Die Protokollausgabe wird gesammelt, damit sie den Testlauf nicht
 * überlagert. Fehlerfälle prüfen zusätzlich, dass ein Eintrag entsteht.
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

// Jeder Test sieht nur seine eigenen Protokollzeilen.
beforeEach(() => {
  protokoll.length = 0;
});

/** Steht eine Zeile mit diesem Text im Protokoll? */
function imProtokoll(text) {
  return protokoll.some((zeile) => zeile.includes(text));
}

/**
 * Baut eine Testumgebung: echte Lobby und echter Manager, dazu eine Attrappe
 * für `io`, die Räume kennt und Nachrichten an die Sockets verteilt.
 *
 * Lobby, Manager und Ratenbegrenzer lassen sich ersetzen – etwa durch eine
 * Lobby, die absichtlich wirft, oder einen Ratenbegrenzer mit kleiner Grenze.
 */
function erzeugeUmgebung({
  lobby = erzeugeLobby(),
  manager = erzeugeManager(),
  ratenbegrenzer = erzeugeRatenbegrenzer(),
} = {}) {
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

  const handler = erzeugeHandler({ io, lobby, manager, ratenbegrenzer });

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

      // --- Hilfen für die Tests ---
      /** Schickt ein Ereignis "vom Browser" an den Server. */
      sende(ereignis, daten) {
        angemeldet.get(ereignis)(daten);
      },
      // Socket.io entfernt die Kennung vor dem disconnect-Handler.
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

  return { handler, lobby, manager, ratenbegrenzer, io, raeume, verbinde };
}

/**
 * Zwei Spieler treten dem schnellen Spiel bei und werden gepaart.
 *
 * `amZug` ist der Spieler auf dem Sitz unten (er beginnt), `wartet` der
 * andere – die Sitze verteilt der Server zufällig.
 */
function schnellesSpiel(optionen) {
  const umgebung = erzeugeUmgebung(optionen);
  const anna = umgebung.verbinde('a');
  const ben = umgebung.verbinde('b');

  anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });
  ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben' });

  const annaUnten = anna.letzte(EREIGNIS.START).daten.sitz === 'unten';
  const amZug = annaUnten ? anna : ben;
  const wartet = annaUnten ? ben : anna;

  return { ...umgebung, anna, ben, amZug, wartet };
}

/** Anna erstellt ein privates Spiel; `code` ist der Code für den Link. */
function privatesSpiel() {
  const umgebung = erzeugeUmgebung();
  const anna = umgebung.verbinde('a');

  anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna', privat: true });

  return { ...umgebung, anna, code: anna.letzte(EREIGNIS.PRIVAT).daten.code };
}

// == 2. Testfälle ===========================================================

describe('Handler: Obergrenzen für Partien und Warteplätze', () => {
  test('sind alle Partien belegt, lehnt der Server jeden neuen Beitritt ab', () => {
    const { verbinde, lobby, manager } = schnellesSpiel({
      manager: erzeugeManager({ partienMax: 1 }),
    });
    const cem = verbinde('c');

    cem.sende(EREIGNIS.BEITRETEN, { name: 'Cem' });
    cem.sende(EREIGNIS.BEITRETEN, { name: 'Cem', privat: true });

    expect(cem.alle(EREIGNIS.FEHLER).map((n) => n.daten.code))
      .toEqual([FEHLER.SERVER_VOLL, FEHLER.SERVER_VOLL]);
    expect(lobby.enthaelt('c')).toBe(false);
    expect(manager.anzahl()).toBe(1);
  });

  test('ein Link bleibt gültig, wenn er bei vollem Server abgelehnt wurde', () => {
    const manager = erzeugeManager({ partienMax: 1 });
    const { verbinde } = erzeugeUmgebung({ manager });
    const anna = verbinde('a');
    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna', privat: true });
    const { code } = anna.letzte(EREIGNIS.PRIVAT).daten;
    const voll = manager.starte({ socketId: 'x', name: 'X' },
      { socketId: 'y', name: 'Y' });

    const ben = verbinde('b');
    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben', code });
    expect(ben.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.SERVER_VOLL);

    manager.entferne(voll.id);
    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben', code });
    expect(ben.letzte(EREIGNIS.START)).toBeDefined();
  });

  test('eine Revanche bei vollem Server meldet beiden SERVER_VOLL', () => {
    const manager = erzeugeManager({ partienMax: 1 });
    const { anna, ben, verbinde } = schnellesSpiel({ manager });
    anna.sende(EREIGNIS.AUFGEBEN);
    const cem = verbinde('c');
    const dora = verbinde('d');
    cem.sende(EREIGNIS.BEITRETEN, { name: 'Cem' });
    dora.sende(EREIGNIS.BEITRETEN, { name: 'Dora' });

    anna.sende(EREIGNIS.REVANCHE);
    ben.sende(EREIGNIS.REVANCHE);

    for (const spieler of [anna, ben]) {
      expect(spieler.letzte(EREIGNIS.FEHLER).daten.code)
        .toBe(FEHLER.SERVER_VOLL);
    }
    expect(manager.anzahl()).toBe(1);
  });

  test('bei vollem Server bleibt der Revanchewunsch bestehen und gilt später', () => {
    const manager = erzeugeManager({ partienMax: 1 });
    const { anna, ben, verbinde } = schnellesSpiel({ manager });
    anna.sende(EREIGNIS.AUFGEBEN);
    const cem = verbinde('c');
    const dora = verbinde('d');
    cem.sende(EREIGNIS.BEITRETEN, { name: 'Cem' });
    dora.sende(EREIGNIS.BEITRETEN, { name: 'Dora' });
    anna.sende(EREIGNIS.REVANCHE);
    ben.sende(EREIGNIS.REVANCHE);

    // Cem und Dora enden: der einzige Platz ist wieder frei.
    manager.entferne(manager.holeNachSocket('c').id);
    anna.sende(EREIGNIS.REVANCHE);

    expect(anna.alle(EREIGNIS.REVANCHE_WEG)).toHaveLength(0);
    for (const spieler of [anna, ben]) {
      expect(spieler.alle(EREIGNIS.START)).toHaveLength(2);
    }
    expect(manager.holeNachSocket('a')).toBe(manager.holeNachSocket('b'));
  });

  test('nach dem Start der Revanche bleibt kein Wunsch in der Lobby zurück', () => {
    const { anna, ben, lobby } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);
    anna.sende(EREIGNIS.REVANCHE);
    ben.sende(EREIGNIS.REVANCHE);

    // Weit nach der Frist dürfte nichts mehr ablaufen: sonst bekäme jemand in
    // der laufenden Folgepartie ein REVANCHE_ABGELAUFEN.
    const spaeter = Date.now() + 10 * REVANCHE_FRIST_MS;
    expect(lobby.abgelaufeneRevanchen(spaeter)).toEqual([]);
  });

  test('ist ein Socket der Revanche schon weg, bleibt kein Wunsch zurück', () => {
    const { anna, ben, io, lobby } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);
    anna.sende(EREIGNIS.REVANCHE);
    io.sockets.sockets.delete('a');

    ben.sende(EREIGNIS.REVANCHE);

    expect(ben.letzte(EREIGNIS.REVANCHE_WEG)).toBeDefined();
    const spaeter = Date.now() + 10 * REVANCHE_FRIST_MS;
    expect(lobby.abgelaufeneRevanchen(spaeter)).toEqual([]);
  });

  test('eine volle Lobby lehnt einen weiteren Warteplatz ab', () => {
    const { verbinde } = erzeugeUmgebung({
      lobby: erzeugeLobby({ wartendeMax: 1 }),
    });
    verbinde('a').sende(EREIGNIS.BEITRETEN, { name: 'Anna', privat: true });
    const ben = verbinde('b');

    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben' });
    expect(ben.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.SERVER_VOLL);
    expect(ben.letzte(EREIGNIS.WARTESCHLANGE)).toBeUndefined();
  });
});

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

  test('nach dem regulären Ende eines schnellen Spiels ebenso', () => {
    const { anna, ben, manager } = schnellesSpiel();

    // Wer unten sitzt, beginnt. Das Brett wird so gestellt, dass sein Zug aus
    // Mulde 5 die letzte Kugel ins eigene Haus legt und damit die eigene Reihe
    // leert – die Partie endet regulär. Summe weiterhin 48.
    const unten = anna.letzte(EREIGNIS.START).daten.sitz === 'unten' ? anna : ben;
    manager.holeNachSocket(unten.id).brett = [
      [15, 2, 2, 2, 2, 2, 2],   // oben: Haus 15, sechs Mulden mit je 2
      [0, 0, 0, 0, 0, 1, 20],   // unten: eine Kugel in Mulde 5, Haus 20
    ];

    unten.sende(EREIGNIS.ZUG, zug(5));

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

  test('nach Ablauf erfahren es beide, und ein später Wunsch startet nichts', () => {
    const { anna, ben, handler } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);
    anna.sende(EREIGNIS.REVANCHE);   // Anna wollte, Ben hat nicht reagiert

    handler.pruefeRevanchen(Date.now() + REVANCHE_FRIST_MS);

    expect(anna.letzte(EREIGNIS.REVANCHE_ABGELAUFEN)).toBeDefined();
    expect(ben.letzte(EREIGNIS.REVANCHE_ABGELAUFEN)).toBeDefined();

    // Ben drückt zu spät: keine neue Partie.
    ben.sende(EREIGNIS.REVANCHE);
    expect(ben.letzte(EREIGNIS.REVANCHE_WEG)).toBeDefined();
    expect(ben.alle(EREIGNIS.START)).toHaveLength(1);
  });

  test('ein später Wunsch vor dem Takt meldet beiden den Ablauf', () => {
    const { anna, ben } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);

    const nachDerFrist = Date.now() + REVANCHE_FRIST_MS;
    const uhr = import.meta.jest.spyOn(Date, 'now')
      .mockReturnValue(nachDerFrist);
    try {
      ben.sende(EREIGNIS.REVANCHE);
    } finally {
      uhr.mockRestore();
    }

    expect(ben.letzte(EREIGNIS.REVANCHE_ABGELAUFEN)).toBeDefined();
    expect(anna.letzte(EREIGNIS.REVANCHE_ABGELAUFEN)).toBeDefined();
    expect(ben.letzte(EREIGNIS.REVANCHE_WEG)).toBeUndefined();
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
  test('Müll-Nutzdaten werden abgelehnt – nur beim Verursacher, ohne Absturz', () => {
    const { anna, ben, manager } = schnellesSpiel();
    const muell = [
      undefined, null, 42, 'zug', [], zug('3'), zug(99), zug(-1), zug(2.5),
      // Die frühere Form ohne Typangabe gilt ebenfalls nicht mehr.
      { mulde: 0 }, { type: 'move', pitIndex: 0 },
    ];

    for (const daten of muell) {
      expect(() => anna.sende(EREIGNIS.ZUG, daten)).not.toThrow();
    }

    const fehler = anna.alle(EREIGNIS.FEHLER).map((n) => n.daten.code);
    expect(fehler).toEqual(muell.map(() => FEHLER.NUTZDATEN_UNGUELTIG));
    // Der Gegner erfährt davon nichts, und die Partie läuft weiter.
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
    const { verbinde } = erzeugeUmgebung({ lobby: kaputteLobby });
    const anna = verbinde('a');

    expect(() => anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' })).not.toThrow();
    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.INTERNER_FEHLER);
    expect(protokoll.some((zeile) => zeile.includes('[ERROR]'))).toBe(true);
  });
});

describe('Handler: schnelles Spiel beitreten', () => {
  test('wer allein beitritt, wartet und erfährt seine Position', () => {
    const { verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');

    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    expect(anna.letzte(EREIGNIS.WARTESCHLANGE).daten).toEqual({ position: 1 });
    expect(anna.letzte(EREIGNIS.START)).toBeUndefined();
  });

  test('die Position kommt genau einmal an, nicht doppelt', () => {
    const { verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');

    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    expect(anna.alle(EREIGNIS.WARTESCHLANGE)).toHaveLength(1);
  });

  test('mit dem Zweiten startet die Partie: Sitz, Gegner und Spielstand', () => {
    const { anna, ben } = schnellesSpiel();
    const startAnna = anna.letzte(EREIGNIS.START).daten;
    const startBen = ben.letzte(EREIGNIS.START).daten;

    expect(startAnna.gegner.name).toBe('Ben');
    expect(startBen.gegner.name).toBe('Anna');
    expect(startAnna.spielId).toBe(startBen.spielId);
    expect([startAnna.sitz, startBen.sitz].sort()).toEqual(['oben', 'unten']);
    expect(startAnna.spielstand.zugNr).toBe(0);
  });

  test('beide Spieler sind im Raum ihrer Partie', () => {
    const { anna, raeume } = schnellesSpiel();
    const spielId = anna.letzte(EREIGNIS.START).daten.spielId;

    expect([...raeume.get(spielId)].sort()).toEqual(['a', 'b']);
  });

  test('wer schon wartet, kann nicht noch einmal beitreten', () => {
    const { verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');

    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });
    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.BEREITS_IN_WARTESCHLANGE);
  });

  test('ein abgelehnter zweiter Beitritt überschreibt den gemerkten Namen nicht', () => {
    const { verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');
    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna2' });

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.BEREITS_IN_WARTESCHLANGE);
    expect(anna.data.name).toBe('Anna');
  });

  test('wer schon spielt, kann nicht beitreten', () => {
    const { anna } = schnellesSpiel();

    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.BEREITS_IN_PARTIE);
  });
});

describe('Handler: privates Spiel', () => {
  test('Erstellen liefert einen Code für den Einladungslink', () => {
    const { anna, code, lobby } = privatesSpiel();

    expect(code).toHaveLength(GRENZEN.CODE_LAENGE);
    expect(lobby.enthaelt('a')).toBe(true);
    // Der private Platz steht nicht in der öffentlichen Warteschlange.
    expect(anna.letzte(EREIGNIS.WARTESCHLANGE)).toBeUndefined();
  });

  test('ein zweites Erstellen wird abgelehnt', () => {
    const { anna } = privatesSpiel();

    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna', privat: true });

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.BEREITS_IN_WARTESCHLANGE);
  });

  test('mit dem Code startet die Partie – auch klein geschrieben', () => {
    const { anna, code, verbinde } = privatesSpiel();
    const ben = verbinde('b');

    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben', code: code.toLowerCase() });

    expect(anna.letzte(EREIGNIS.START).daten.gegner.name).toBe('Ben');
    expect(ben.letzte(EREIGNIS.START).daten.gegner.name).toBe('Anna');
  });

  test('ein Link gilt nur einmal', () => {
    const { code, verbinde } = privatesSpiel();
    verbinde('b').sende(EREIGNIS.BEITRETEN, { name: 'Ben', code });
    const carl = verbinde('c');

    carl.sende(EREIGNIS.BEITRETEN, { name: 'Carl', code });

    expect(carl.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.CODE_UNBEKANNT);
    expect(carl.letzte(EREIGNIS.START)).toBeUndefined();
  });

  test('ein unbekannter Code bekommt eine verständliche Meldung', () => {
    const { verbinde } = erzeugeUmgebung();
    const ben = verbinde('b');

    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben', code: 'XXXXXX' });

    expect(ben.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.CODE_UNBEKANNT);
  });

  test('der Ersteller kann seinem eigenen Link nicht beitreten', () => {
    const { anna, code } = privatesSpiel();

    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna', code });

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.BEREITS_IN_WARTESCHLANGE);
    expect(anna.letzte(EREIGNIS.START)).toBeUndefined();
  });

  test('ist der Ersteller weg, gilt sein Link nicht mehr', () => {
    const { anna, code, verbinde } = privatesSpiel();
    anna.trenne();
    const ben = verbinde('b');

    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben', code });

    expect(ben.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.CODE_UNBEKANNT);
  });
});

describe('Handler: Abbrechen', () => {
  test('beim Warten: Eintrag weg, die übrigen Wartenden erfahren ihre Position', () => {
    const { lobby, verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');
    const ben = verbinde('b');
    // Direkt über die Lobby, damit beide zugleich warten – über den Handler
    // würden sie sofort gepaart.
    lobby.beitreten('a', 'Anna');
    lobby.beitreten('b', 'Ben');

    anna.sende(EREIGNIS.ABBRECHEN);

    expect(lobby.enthaelt('a')).toBe(false);
    expect(ben.letzte(EREIGNIS.WARTESCHLANGE).daten).toEqual({ position: 1 });
  });

  test('ein privater Warteplatz wird gelöscht, sein Link gilt nicht mehr', () => {
    const { anna, code, lobby, verbinde } = privatesSpiel();

    anna.sende(EREIGNIS.ABBRECHEN);
    const ben = verbinde('b');
    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben', code });

    expect(lobby.enthaelt('a')).toBe(false);
    expect(ben.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.CODE_UNBEKANNT);
  });

  test('im Ergebnisdialog nimmt es die Revanche zurück – der Gegner erfährt es', () => {
    const { anna, ben } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);

    anna.sende(EREIGNIS.ABBRECHEN);   // Esc im Ergebnisdialog

    expect(ben.letzte(EREIGNIS.REVANCHE_WEG)).toBeDefined();
    ben.sende(EREIGNIS.REVANCHE);
    expect(ben.alle(EREIGNIS.START)).toHaveLength(1);
  });

  test('kommt Abbrechen erst nach dem Start an, läuft die Partie normal weiter', () => {
    const { anna, ben, manager } = schnellesSpiel();

    const vorher = anna.empfangen.length;

    anna.sende(EREIGNIS.ABBRECHEN);   // der Klick war unterwegs, als START kam

    // keine Antwort, auch kein Fehler
    expect(anna.empfangen.length).toBe(vorher);
    expect(anna.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(ben.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(manager.holeNachSocket('a')).not.toBeNull();
    // Nur auf Ebene debug: Sonst könnte ein Spieler bis zu 20 Zeilen je
    // Sekunde ins normale Protokoll schreiben.
    expect(imProtokoll('ignoriert')).toBe(false);
  });

  test('ebenso nach dem Start einer Revanche (Esc im Ergebnisdialog)', () => {
    const { anna, ben, manager } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);
    anna.sende(EREIGNIS.REVANCHE);
    ben.sende(EREIGNIS.REVANCHE);   // die Revanche startet

    ben.sende(EREIGNIS.ABBRECHEN);  // Ben schloss den Dialog, bevor START ankam

    // nur die erste Partie
    expect(anna.alle(EREIGNIS.ABBRUCH)).toHaveLength(1);
    expect(manager.holeNachSocket('b')).not.toBeNull();
  });

  test('privat: Abbrechen nach dem Beitritt des Freundes wird ebenso ignoriert', () => {
    const { anna, code, verbinde, manager } = privatesSpiel();
    const ben = verbinde('b');
    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben', code });

    anna.sende(EREIGNIS.ABBRECHEN);

    expect(ben.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(manager.anzahl()).toBe(1);
  });

  test('ein ignoriertes Abbrechen in der Revanche verhindert keine weitere Revanche', () => {
    const { anna, ben } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);
    anna.sende(EREIGNIS.REVANCHE);
    ben.sende(EREIGNIS.REVANCHE);
    anna.sende(EREIGNIS.ABBRECHEN);

    anna.sende(EREIGNIS.AUFGEBEN);

    expect(ben.letzte(EREIGNIS.ABBRUCH).daten.revanche).toBe(true);
  });

  test('ohne Warteplatz und ohne Partie passiert nichts', () => {
    const { verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');

    anna.sende(EREIGNIS.ABBRECHEN);

    expect(anna.empfangen).toEqual([]);
  });
});

describe('Handler: Zug', () => {
  test('ein gültiger Zug geht als neuer Spielstand an beide', () => {
    const { amZug, wartet } = schnellesSpiel();

    amZug.sende(EREIGNIS.ZUG, zug(0));

    for (const spieler of [amZug, wartet]) {
      const { spielstand, bericht } = spieler.letzte(EREIGNIS.STAND).daten;
      expect(spielstand.zugNr).toBe(1);
      expect(bericht).toBeDefined();
    }
  });

  test('wer nicht am Zug ist, wird abgelehnt – nur er erfährt es', () => {
    const { amZug, wartet } = schnellesSpiel();

    wartet.sende(EREIGNIS.ZUG, zug(0));

    expect(wartet.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.NICHT_AM_ZUG);
    expect(amZug.alle(EREIGNIS.FEHLER)).toHaveLength(0);
    expect(amZug.letzte(EREIGNIS.STAND)).toBeUndefined();
  });

  test('eine leere Mulde wird abgelehnt', () => {
    const { amZug, manager } = schnellesSpiel();
    // Unten, Mulde 0 leeren; die 4 Kugeln liegen jetzt im eigenen Haus.
    const brett = manager.holeNachSocket(amZug.id).brett;
    brett[1][0] = 0;
    brett[1][6] = 4;

    amZug.sende(EREIGNIS.ZUG, zug(0));

    expect(amZug.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.MULDE_LEER);
  });

  test('ohne Partie gibt es keinen Zug', () => {
    const { verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');

    anna.sende(EREIGNIS.ZUG, zug(0));

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.KEINE_PARTIE);
  });

  test('ein kaputter Spielstand beendet nur diese Partie – beide erfahren es', () => {
    const { amZug, wartet, manager } = schnellesSpiel();
    manager.holeNachSocket(amZug.id).brett[1][0] = 3;   // 47 statt 48 Kugeln

    amZug.sende(EREIGNIS.ZUG, zug(0));

    for (const spieler of [amZug, wartet]) {
      const abbruch = spieler.letzte(EREIGNIS.ABBRUCH).daten;
      expect(abbruch.grund).toBe(GRUND.INTERNER_FEHLER);
      expect(abbruch.ergebnis.sieger).toBeNull();   // nicht gewertet
    }
    expect(amZug.alle(EREIGNIS.FEHLER)).toHaveLength(0);
    expect(manager.anzahl()).toBe(0);
    expect(imProtokoll('Invariante verletzt')).toBe(true);
  });

  test('nach dem regulären Ende ist die Partie aufgelöst und der Raum leer', () => {
    const { amZug, manager, raeume } = schnellesSpiel();
    const spielId = amZug.letzte(EREIGNIS.START).daten.spielId;
    // Wie oben: die letzte Kugel unten landet im eigenen Haus, Reihe leer.
    manager.holeNachSocket(amZug.id).brett = [
      [15, 2, 2, 2, 2, 2, 2],
      [0, 0, 0, 0, 0, 1, 20],
    ];

    amZug.sende(EREIGNIS.ZUG, zug(5));

    expect(amZug.letzte(EREIGNIS.ENDE).daten.ergebnis.grund).toBe(GRUND.REGULAER);
    expect(manager.anzahl()).toBe(0);
    expect(raeume.get(spielId).size).toBe(0);
  });
});

describe('Handler: Aufgeben', () => {
  test('der Gegner gewinnt, beide erfahren es, die Partie ist aufgelöst', () => {
    const { anna, ben, manager, raeume } = schnellesSpiel();
    const { spielId } = anna.letzte(EREIGNIS.START).daten;
    const sitzBen = ben.letzte(EREIGNIS.START).daten.sitz;

    anna.sende(EREIGNIS.AUFGEBEN);

    for (const spieler of [anna, ben]) {
      const abbruch = spieler.letzte(EREIGNIS.ABBRUCH).daten;
      expect(abbruch.grund).toBe(GRUND.AUFGEGEBEN);
      expect(abbruch.ergebnis.sieger).toBe(sitzBen);
    }
    expect(manager.anzahl()).toBe(0);
    expect(raeume.get(spielId).size).toBe(0);
  });

  test('ein Socket ohne Sitz in der Partie kann nicht aufgeben', () => {
    const { anna, ben, manager } = schnellesSpiel();
    // Simulierter Zuordnungsfehler: Die Partie kennt Annas Kennung nicht mehr.
    const partie = manager.holeNachSocket('a');
    const sitzAnna = anna.letzte(EREIGNIS.START).daten.sitz;
    partie.spieler[sitzAnna].socketId = 'fremd';

    anna.sende(EREIGNIS.AUFGEBEN);

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.KEINE_PARTIE);
    expect(ben.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
  });

  test('ohne Partie gibt es nichts aufzugeben', () => {
    const { verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');

    anna.sende(EREIGNIS.AUFGEBEN);

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.KEINE_PARTIE);
  });
});

describe('Handler: Erneut (nach der Partie neu suchen)', () => {
  test('nimmt den Namen vom Socket, nicht den mitgeschickten', () => {
    const { anna, verbinde } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);

    anna.sende(EREIGNIS.ERNEUT, { name: 'Anders' });
    const carl = verbinde('c');
    carl.sende(EREIGNIS.BEITRETEN, { name: 'Carl' });

    expect(anna.letzte(EREIGNIS.WARTESCHLANGE)).toBeDefined();
    expect(carl.letzte(EREIGNIS.START).daten.gegner.name).toBe('Anna');
  });

  test('ein neuer Socket nimmt den mitgeschickten Namen – sonst „Spieler“', () => {
    const { verbinde } = erzeugeUmgebung();
    // Nach einem Verbindungsabbruch kennt der neue Socket keinen Namen.
    const dora = verbinde('d');
    const emil = verbinde('e');

    dora.sende(EREIGNIS.ERNEUT, { name: 'Dora' });
    emil.sende(EREIGNIS.ERNEUT, {});

    expect(emil.letzte(EREIGNIS.START).daten.gegner.name).toBe('Dora');
    expect(dora.letzte(EREIGNIS.START).daten.gegner.name).toBe('Spieler');
  });

  test('während einer Partie wird es abgelehnt', () => {
    const { anna } = schnellesSpiel();

    anna.sende(EREIGNIS.ERNEUT, { name: 'Anna' });

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.BEREITS_IN_PARTIE);
  });
});

describe('Handler: Revanche – Sonderfälle', () => {
  test('wer schon wieder spielt, braucht keine Revanche', () => {
    const { anna } = schnellesSpiel();

    anna.sende(EREIGNIS.REVANCHE);

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.BEREITS_IN_PARTIE);
  });

  test('ohne vorherige Partie gibt es keine Revanche', () => {
    const { verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');

    anna.sende(EREIGNIS.REVANCHE);

    expect(anna.letzte(EREIGNIS.REVANCHE_WEG)).toBeDefined();
  });

  test('wer zweimal Revanche drückt, schickt dem Gegner nur ein Angebot', () => {
    const { anna, ben } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);

    anna.sende(EREIGNIS.REVANCHE);
    anna.sende(EREIGNIS.REVANCHE);

    expect(ben.alle(EREIGNIS.REVANCHE_ANGEBOT)).toHaveLength(1);
    expect(anna.letzte(EREIGNIS.REVANCHE_WEG)).toBeUndefined();
    // Bens Zusage startet die Revanche trotzdem.
    ben.sende(EREIGNIS.REVANCHE);
    expect(anna.alle(EREIGNIS.START)).toHaveLength(2);
  });

  test('wer etwas Neues anfängt, lässt die Revanche verfallen', () => {
    const { anna, ben } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);

    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    expect(ben.letzte(EREIGNIS.REVANCHE_WEG)).toBeDefined();
  });
});

describe('Handler: Verbindungsabbruch', () => {
  test('der Gebliebene gewinnt, die Partie ist aufgelöst', () => {
    const { anna, ben, manager } = schnellesSpiel();
    const sitzAnna = anna.letzte(EREIGNIS.START).daten.sitz;

    ben.trenne();

    expect(anna.letzte(EREIGNIS.ABBRUCH).daten.ergebnis.sieger).toBe(sitzAnna);
    expect(manager.anzahl()).toBe(0);
  });

  test('beide gehen nacheinander: kein zweiter Abbruch, kein Absturz', () => {
    const { anna, ben, manager } = schnellesSpiel();

    ben.trenne();
    expect(() => anna.trenne()).not.toThrow();

    expect(anna.alle(EREIGNIS.ABBRUCH)).toHaveLength(1);
    expect(manager.anzahl()).toBe(0);
  });

  test('wer wartend geht, verschwindet aus der Warteschlange', () => {
    const { lobby, verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');
    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    anna.trenne();

    expect(lobby.anzahl()).toBe(0);
  });

  test('eine offene Revanche verfällt – der Gegner erfährt es', () => {
    const { anna, ben } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);

    anna.trenne();

    expect(ben.letzte(EREIGNIS.REVANCHE_WEG)).toBeDefined();
  });
});

describe('Handler: Ratenbegrenzung', () => {
  test('über der Grenze wird verworfen und nicht mehr bearbeitet', () => {
    // Grenze 3 je Fenster, die Uhr steht still: alles im selben Fenster.
    const ratenbegrenzer = erzeugeRatenbegrenzer(3, 1000, () => 0);
    const { verbinde } = erzeugeUmgebung({ ratenbegrenzer });
    const anna = verbinde('a');

    for (let i = 0; i < 4; i += 1) anna.sende(EREIGNIS.ZUG, zug(0));

    const codes = anna.alle(EREIGNIS.FEHLER).map((n) => n.daten.code);
    // Die ersten drei werden bearbeitet (ohne Partie: KEINE_PARTIE).
    expect(codes).toEqual([
      FEHLER.KEINE_PARTIE,
      FEHLER.KEINE_PARTIE,
      FEHLER.KEINE_PARTIE,
      FEHLER.ZU_VIELE_ANFRAGEN,
    ]);
  });

  test('eine Flut bekommt je Fenster nur eine Antwort', () => {
    const ratenbegrenzer = erzeugeRatenbegrenzer(3, 1000, () => 0);
    const { verbinde } = erzeugeUmgebung({ ratenbegrenzer });
    const anna = verbinde('a');

    for (let i = 0; i < 25; i += 1) anna.sende(EREIGNIS.ZUG, zug(0));

    const codes = anna.alle(EREIGNIS.FEHLER).map((n) => n.daten.code);
    expect(codes.filter((code) => code === FEHLER.ZU_VIELE_ANFRAGEN)).toHaveLength(1);
  });

  test('beim Verbindungsabbruch wird der Zähler gelöscht', () => {
    const { verbinde, ratenbegrenzer } = erzeugeUmgebung();
    const anna = verbinde('a');
    anna.sende(EREIGNIS.ABBRECHEN);
    expect(ratenbegrenzer.anzahl()).toBe(1);

    anna.trenne();

    expect(ratenbegrenzer.anzahl()).toBe(0);
  });
});

describe('Handler: Absturzsicherung bei Programmierfehlern', () => {
  test('scheitert auch das Aufräumen, läuft der Server weiter', () => {
    const { amZug, manager } = schnellesSpiel();
    // simulierter Programmierfehler
    manager.holeNachSocket(amZug.id).brett = null;

    expect(() => amZug.sende(EREIGNIS.ZUG, zug(0))).not.toThrow();

    expect(imProtokoll('Handler spiel:zug fehlgeschlagen')).toBe(true);
  });

  test('auch nach einem Fehler beim Verbindungsabbruch ist der Zähler weg', () => {
    const { anna, manager, ratenbegrenzer } = schnellesSpiel();
    expect(ratenbegrenzer.anzahl()).toBe(2);   // Anna und Ben sind beigetreten
    manager.holeNachSocket('a').brett = null;

    anna.trenne();

    expect(imProtokoll('disconnect-Handler fehlgeschlagen')).toBe(true);
    expect(ratenbegrenzer.anzahl()).toBe(1);   // nur noch Ben
  });

  test('wirft ein Zug in einer Partie, bekommen beide nur den Abbruch', () => {
    const { amZug, wartet, io } = schnellesSpiel();
    io.to = () => {
      throw new Error('absichtlicher Testfehler');
    };

    amZug.sende(EREIGNIS.ZUG, zug(0));

    for (const spieler of [amZug, wartet]) {
      const abbruch = spieler.letzte(EREIGNIS.ABBRUCH).daten;
      expect(abbruch.grund).toBe(GRUND.INTERNER_FEHLER);
      expect(abbruch.ergebnis.sieger).toBeNull();   // nicht gewertet
      expect(spieler.alle(EREIGNIS.FEHLER)).toHaveLength(0);
    }
  });

  test('scheitert auch das Beenden, ist die Partie trotzdem aufgelöst', () => {
    const { anna, amZug, wartet, manager, raeume } = schnellesSpiel();
    const { spielId } = anna.letzte(EREIGNIS.START).daten;
    manager.holeNachSocket(amZug.id).brett = null;

    amZug.sende(EREIGNIS.ZUG, zug(0));

    expect(imProtokoll('nach Fehler fehlgeschlagen')).toBe(true);
    expect(manager.anzahl()).toBe(0);
    expect(raeume.get(spielId).size).toBe(0);
    // Der nächste Klick des Gegners führt sichtbar zurück zur Anmeldung.
    wartet.sende(EREIGNIS.AUFGEBEN);
    expect(wartet.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.KEINE_PARTIE);
    // Und beide können sofort neu suchen – nicht erst nach dem nächsten Takt.
    amZug.sende(EREIGNIS.BEITRETEN, { name: 'Neu' });
    expect(amZug.letzte(EREIGNIS.WARTESCHLANGE)).toBeDefined();
  });

  test('ein Fehler beim Verbindungsabbruch wird nur protokolliert', () => {
    const { anna, manager } = schnellesSpiel();
    manager.holeNachSocket('a').brett = null;

    expect(() => anna.trenne()).not.toThrow();

    expect(imProtokoll('disconnect-Handler fehlgeschlagen')).toBe(true);
  });
});

describe('Handler: Aufräumen nach Fristen', () => {
  const MINUTE = 60 * 1000;
  const PARTIE_FRIST = GRENZEN.PARTIE_RUHE_MINUTEN * MINUTE;
  const WARTE_FRIST = GRENZEN.WARTEN_MINUTEN * MINUTE;

  test('eine Partie ohne Zug endet nach der Frist – beide erfahren es', () => {
    const { anna, ben, handler, manager, raeume } = schnellesSpiel();
    const { spielId } = anna.letzte(EREIGNIS.START).daten;

    handler.raeumeAuf(Date.now() + PARTIE_FRIST);

    for (const spieler of [anna, ben]) {
      const abbruch = spieler.letzte(EREIGNIS.ABBRUCH).daten;
      expect(abbruch.grund).toBe(GRUND.ZU_LANGE_KEIN_ZUG);
      expect(abbruch.ergebnis.sieger).toBeNull();   // nicht gewertet
      expect(abbruch.revanche).toBe(false);
    }
    expect(manager.anzahl()).toBe(0);
    expect(raeume.get(spielId).size).toBe(0);
  });

  test('ein gültiger Zug setzt die Frist zurück – sie läuft ab dem letzten Zug', () => {
    const { amZug, wartet, handler, manager } = schnellesSpiel();
    manager.holeNachSocket(amZug.id).letzteAktivitaet = 0;   // Start 1970

    amZug.sende(EREIGNIS.ZUG, zug(0));
    handler.raeumeAuf(Date.now() + MINUTE);

    expect(wartet.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(manager.anzahl()).toBe(1);
  });

  test('abgelehnte Züge und Müll verlängern die Frist nicht', () => {
    const { amZug, wartet, handler, manager } = schnellesSpiel();
    manager.holeNachSocket(amZug.id).letzteAktivitaet = 0;

    wartet.sende(EREIGNIS.ZUG, zug(0));     // nicht am Zug
    amZug.sende(EREIGNIS.ZUG, zug(99));     // Schema verletzt
    handler.raeumeAuf();

    expect(amZug.letzte(EREIGNIS.ABBRUCH).daten.grund).toBe(GRUND.ZU_LANGE_KEIN_ZUG);
  });

  test('Grenze: 1 ms vor der Frist bleibt die Partie, genau an der Frist endet sie', () => {
    const { anna, handler, manager } = schnellesSpiel();
    const letzte = manager.holeNachSocket('a').letzteAktivitaet;

    handler.raeumeAuf(letzte + PARTIE_FRIST - 1);
    expect(anna.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();

    handler.raeumeAuf(letzte + PARTIE_FRIST);
    expect(anna.letzte(EREIGNIS.ABBRUCH).daten.grund).toBe(GRUND.ZU_LANGE_KEIN_ZUG);
  });

  test('zweimal aufräumen: kein zweiter Abbruch', () => {
    const { anna, handler } = schnellesSpiel();
    handler.raeumeAuf(Date.now() + PARTIE_FRIST);

    expect(() => handler.raeumeAuf(Date.now() + 2 * PARTIE_FRIST)).not.toThrow();
    expect(anna.alle(EREIGNIS.ABBRUCH)).toHaveLength(1);
  });

  test('ist ein Socket schon weg, erfährt es der andere trotzdem', () => {
    const { anna, ben, handler, manager, io } = schnellesSpiel();
    io.sockets.sockets.delete('a');

    expect(() => handler.raeumeAuf(Date.now() + PARTIE_FRIST)).not.toThrow();
    expect(ben.letzte(EREIGNIS.ABBRUCH).daten.grund).toBe(GRUND.ZU_LANGE_KEIN_ZUG);
    expect(anna.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(manager.anzahl()).toBe(0);
  });

  test('Abbrechen nach dem Fristende bewirkt nichts', () => {
    const { anna, handler } = schnellesSpiel();
    handler.raeumeAuf(Date.now() + PARTIE_FRIST);
    const vorher = anna.empfangen.length;

    anna.sende(EREIGNIS.ABBRECHEN);

    expect(anna.empfangen.length).toBe(vorher);
  });

  test('eine kaputte Partie hält die Fristprüfung der anderen nicht auf', () => {
    const { verbinde, handler, manager, lobby } = erzeugeUmgebung();
    const [anna, ben, carl, dora, emil] = ['a', 'b', 'c', 'd', 'e'].map((id) => verbinde(id));
    for (const spieler of [anna, ben, carl, dora]) {
      spieler.sende(EREIGNIS.BEITRETEN, { name: spieler.id });
    }
    lobby.beitreten('e', 'Emil', 0);                   // wartet seit 1970
    // Programmierfehler in Partie 1
    manager.holeNachSocket('a').brett = null;
    manager.holeNachSocket('a').letzteAktivitaet = 0;
    manager.holeNachSocket('c').letzteAktivitaet = 0;

    expect(() => handler.raeumeAuf()).not.toThrow();

    expect(carl.letzte(EREIGNIS.ABBRUCH).daten.grund).toBe(GRUND.ZU_LANGE_KEIN_ZUG);
    expect(emil.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.WARTEZEIT_ABGELAUFEN);
    expect(manager.anzahl()).toBe(0);
    expect(imProtokoll('[ERROR]')).toBe(true);
  });

  test('eine Minute vor der Frist bleibt die Partie unberührt', () => {
    const { anna, handler, manager } = schnellesSpiel();

    handler.raeumeAuf(Date.now() + PARTIE_FRIST - MINUTE);

    expect(anna.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(manager.anzahl()).toBe(1);
  });

  test('nur die ruhende Partie endet, eine frische läuft weiter', () => {
    const { verbinde, handler, manager } = erzeugeUmgebung();
    const [anna, ben, carl, dora] = ['a', 'b', 'c', 'd'].map((id) => verbinde(id));
    for (const spieler of [anna, ben, carl, dora]) {
      spieler.sende(EREIGNIS.BEITRETEN, { name: spieler.id });
    }
    manager.holeNachSocket('a').letzteAktivitaet = 0;   // letzter Zug 1970

    handler.raeumeAuf();

    expect(anna.letzte(EREIGNIS.ABBRUCH).daten.grund).toBe(GRUND.ZU_LANGE_KEIN_ZUG);
    expect(carl.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(manager.anzahl()).toBe(1);
  });

  test('Wartende und Ersteller privater Spiele bekommen nach der Frist eine Meldung', () => {
    const { verbinde, handler, lobby } = erzeugeUmgebung();
    const anna = verbinde('a');
    const pia = verbinde('p');
    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });
    pia.sende(EREIGNIS.BEITRETEN, { name: 'Pia', privat: true });

    handler.raeumeAuf(Date.now() + WARTE_FRIST);

    for (const spieler of [anna, pia]) {
      expect(spieler.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.WARTEZEIT_ABGELAUFEN);
    }
    expect(lobby.anzahl()).toBe(0);
  });

  test('Grenze: 1 ms vor der Wartefrist bleibt man, genau an der Frist nicht', () => {
    const { verbinde, handler, lobby } = erzeugeUmgebung();
    const anna = verbinde('a');
    lobby.beitreten('a', 'Anna', 1000);

    handler.raeumeAuf(1000 + WARTE_FRIST - 1);
    expect(lobby.enthaelt('a')).toBe(true);

    handler.raeumeAuf(1000 + WARTE_FRIST);
    expect(lobby.enthaelt('a')).toBe(false);
    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.WARTEZEIT_ABGELAUFEN);
  });

  test('Wartende, deren Socket schon weg ist, bringen das Aufräumen nicht zum Absturz', () => {
    const { handler, lobby } = erzeugeUmgebung();
    lobby.beitreten('geist', 'Geist', 0);

    expect(() => handler.raeumeAuf()).not.toThrow();
    expect(lobby.anzahl()).toBe(0);
  });

  test('die Wartefrist trifft keine laufende Partie', () => {
    const { anna, handler } = schnellesSpiel();

    handler.raeumeAuf(Date.now() + WARTE_FRIST);

    expect(anna.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(anna.letzte(EREIGNIS.FEHLER)).toBeUndefined();
  });

  test('eine Minute vor der Wartefrist passiert nichts', () => {
    const { verbinde, handler, lobby } = erzeugeUmgebung();
    const anna = verbinde('a');
    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    handler.raeumeAuf(Date.now() + WARTE_FRIST - MINUTE);

    expect(anna.letzte(EREIGNIS.FEHLER)).toBeUndefined();
    expect(lobby.anzahl()).toBe(1);
  });

  test('danach erfahren die übrigen Wartenden ihre neue Position', () => {
    const { verbinde, handler, lobby } = erzeugeUmgebung();
    verbinde('a');
    const ben = verbinde('b');
    // Direkt über die Lobby: Anna wartet seit 1970, Ben erst seit eben.
    lobby.beitreten('a', 'Anna', 0);
    lobby.beitreten('b', 'Ben');

    handler.raeumeAuf();

    expect(lobby.enthaelt('a')).toBe(false);
    expect(ben.letzte(EREIGNIS.WARTESCHLANGE).daten).toEqual({ position: 1 });
  });

  test('der Link eines abgelaufenen privaten Spiels gilt nicht mehr', () => {
    const { code, handler, verbinde } = privatesSpiel();
    handler.raeumeAuf(Date.now() + WARTE_FRIST);
    const ben = verbinde('b');

    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben', code });

    expect(ben.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.CODE_UNBEKANNT);
  });
});

describe('Handler: Partie von außen beenden (Herunterfahren, Takt)', () => {
  test('beim Herunterfahren erfahren beide davon – ohne Sieger, ohne Revanche', () => {
    const { anna, ben, handler, manager } = schnellesSpiel();

    handler.beendeKontrolliert(manager.holeNachSocket('a'), GRUND.SERVER_ENDE);

    for (const spieler of [anna, ben]) {
      const abbruch = spieler.letzte(EREIGNIS.ABBRUCH).daten;
      expect(abbruch.grund).toBe(GRUND.SERVER_ENDE);
      expect(abbruch.ergebnis.sieger).toBeNull();
      expect(abbruch.revanche).toBe(false);
    }
    expect(manager.anzahl()).toBe(0);
  });

  test('eine beendete, aber nicht aufgelöste Partie löst der Takt still auf', () => {
    const { anna, ben, handler, manager, raeume } = schnellesSpiel();
    const { spielId } = anna.letzte(EREIGNIS.START).daten;
    manager.holeNachSocket('a').status = STATUS.ABGEBROCHEN;

    handler.raeumeAuf();

    expect(anna.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(ben.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(manager.anzahl()).toBe(0);
    expect(raeume.get(spielId).size).toBe(0);
  });
});

describe('Handler: Verbindung weg, disconnect noch nicht verarbeitet', () => {
  // Socket.io nimmt einen Socket aus io.sockets.sockets, bevor es
  // `disconnect` meldet. Der Test stellt genau diesen Augenblick nach.

  test('der Link eines nicht mehr verbundenen Erstellers gilt nicht', () => {
    const { code, io, verbinde } = privatesSpiel();
    io.sockets.sockets.delete('a');
    const ben = verbinde('b');

    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben', code });

    expect(ben.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.CODE_UNBEKANNT);
    expect(ben.letzte(EREIGNIS.START)).toBeUndefined();
  });

  test('eine Revanche startet nicht, wenn einer schon weg ist', () => {
    const { anna, ben, io } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);
    anna.sende(EREIGNIS.REVANCHE);
    io.sockets.sockets.delete('a');

    ben.sende(EREIGNIS.REVANCHE);

    expect(ben.letzte(EREIGNIS.REVANCHE_WEG)).toBeDefined();
    expect(ben.alle(EREIGNIS.START)).toHaveLength(1);
  });

  test('nach einer Aufgabe gibt es keine Revanche, wenn der Gegner schon weg ist', () => {
    const { anna, ben, io } = schnellesSpiel();
    io.sockets.sockets.delete('b');

    anna.sende(EREIGNIS.AUFGEBEN);

    expect(anna.letzte(EREIGNIS.ABBRUCH).daten.revanche).toBe(false);
    expect(ben.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
  });
});

describe('Handler: Zusammenführung mit fehlendem Socket', () => {
  test('scheitert das erneute Einreihen, bekommt der Übrige eine Fehlermeldung', () => {
    const echteLobby = erzeugeLobby();
    let beitritteVonBen = 0;
    const lobby = {
      ...echteLobby,
      // Erster Beitritt klappt; das erneute Einreihen scheitert an der vollen Lobby.
      beitreten(socketId, name) {
        if (socketId !== 'b') return echteLobby.beitreten(socketId, name);
        beitritteVonBen += 1;
        if (beitritteVonBen === 1) return echteLobby.beitreten(socketId, name);
        return { ok: false, code: FEHLER.SERVER_VOLL };
      },
    };
    const { io, verbinde } = erzeugeUmgebung({ lobby });
    const anna = verbinde('a');
    const ben = verbinde('b');
    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });
    io.sockets.sockets.delete('a');

    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben' });

    expect(ben.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.SERVER_VOLL);
    expect(ben.letzte(EREIGNIS.START)).toBeUndefined();
  });
});

describe('Handler: Ratenbegrenzung – das nächste Fenster', () => {
  test('nach Ablauf des Fensters wird wieder bearbeitet', () => {
    let jetzt = 0;
    const ratenbegrenzer = erzeugeRatenbegrenzer(1, 1000, () => jetzt);
    const { verbinde } = erzeugeUmgebung({ ratenbegrenzer });
    const anna = verbinde('a');

    anna.sende(EREIGNIS.ZUG, zug(0));
    anna.sende(EREIGNIS.ZUG, zug(0));
    jetzt = 1000;
    anna.sende(EREIGNIS.ZUG, zug(0));

    const codes = anna.alle(EREIGNIS.FEHLER).map((n) => n.daten.code);
    expect(codes).toEqual([
      FEHLER.KEINE_PARTIE,
      FEHLER.ZU_VIELE_ANFRAGEN,
      FEHLER.KEINE_PARTIE,
    ]);
  });

  test('die Grenze greift vor der Schemaprüfung', () => {
    const ratenbegrenzer = erzeugeRatenbegrenzer(1, 1000, () => 0);
    const { verbinde } = erzeugeUmgebung({ ratenbegrenzer });
    const anna = verbinde('a');

    anna.sende(EREIGNIS.ZUG, 'Müll');
    anna.sende(EREIGNIS.ZUG, 'Müll');

    const codes = anna.alle(EREIGNIS.FEHLER).map((n) => n.daten.code);
    expect(codes).toEqual([FEHLER.NUTZDATEN_UNGUELTIG, FEHLER.ZU_VIELE_ANFRAGEN]);
  });
});

describe('Handler: Erneut – weitere Fälle', () => {
  test('wer schon wartet, bekommt BEREITS_IN_WARTESCHLANGE', () => {
    const { verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');
    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    anna.sende(EREIGNIS.ERNEUT, { name: 'Anna' });

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.BEREITS_IN_WARTESCHLANGE);
  });

  test('nach einem privaten Spiel geht es in die öffentliche Warteschlange', () => {
    const { anna, code, verbinde } = privatesSpiel();
    const ben = verbinde('b');
    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben', code });
    anna.sende(EREIGNIS.AUFGEBEN);

    anna.sende(EREIGNIS.ERNEUT, { name: 'Anna' });

    expect(anna.letzte(EREIGNIS.WARTESCHLANGE).daten).toEqual({ position: 1 });
    // kein neuer Code
    expect(anna.letzte(EREIGNIS.PRIVAT).daten.code).toBe(code);
  });
});

describe('Handler: Auflösen trotz zusätzlichem Fehler', () => {
  test('ein Fehler beim Raumverlassen hält Maps und den anderen Socket nicht fest', () => {
    const { anna, ben, manager, raeume } = schnellesSpiel();
    const partie = manager.holeNachSocket('a');
    const spielId = partie.id;
    const kaputterSocket = partie.spieler.unten.socketId === anna.id ? anna : ben;
    const andererSocket = kaputterSocket === anna ? ben : anna;
    kaputterSocket.leave = () => { throw new Error('Absichtlicher Testfehler'); };

    expect(() => anna.sende(EREIGNIS.AUFGEBEN)).not.toThrow();
    expect(manager.anzahl()).toBe(0);
    expect(raeume.get(spielId).has(andererSocket.id)).toBe(false);
  });

  test('ein getrennter Socket ohne Sitz verursacht keinen falschen Sieg', () => {
    const { anna, ben, manager } = schnellesSpiel();
    const partie = manager.holeNachSocket('a');
    const sitz = anna.letzte(EREIGNIS.START).daten.sitz;
    partie.spieler[sitz].socketId = 'fremd';

    anna.trenne();

    expect(ben.letzte(EREIGNIS.ABBRUCH).daten.grund).toBe(GRUND.INTERNER_FEHLER);
    expect(ben.letzte(EREIGNIS.ABBRUCH).daten.ergebnis.sieger).toBeNull();
    expect(manager.anzahl()).toBe(0);
  });
});

describe('Handler: Doppelwunsch bleibt vollständig still', () => {
  test('weder Sender noch Gegner erhalten eine zusätzliche Nachricht', () => {
    const { anna, ben } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);
    anna.sende(EREIGNIS.REVANCHE);
    const vorherAnna = anna.empfangen.length;
    const vorherBen = ben.empfangen.length;

    anna.sende(EREIGNIS.REVANCHE);

    expect(anna.empfangen).toHaveLength(vorherAnna);
    expect(ben.empfangen).toHaveLength(vorherBen);
  });
});

describe('Handler: Protokollierte Sitzvergabe', () => {
  test('jeder Sitz im Protokoll stimmt mit der ausgelosten neuen Partie überein', () => {
    const zufall = import.meta.jest.spyOn(Math, 'random').mockReturnValue(0.9);
    try {
      const { anna, ben, manager } = schnellesSpiel();
      anna.sende(EREIGNIS.AUFGEBEN);
      protokoll.length = 0;
      anna.sende(EREIGNIS.REVANCHE);
      ben.sende(EREIGNIS.REVANCHE);
      const partie = manager.holeNachSocket('a');
      const sitzZeilen = protokoll.filter((zeile) => zeile.includes('"unten"'));
      expect(sitzZeilen.length).toBeGreaterThan(0);
      for (const zeile of sitzZeilen) {
        const daten = JSON.parse(zeile.slice(zeile.indexOf('{')));
        expect(daten.unten).toBe(partie.spieler.unten.name);
        expect(daten.oben).toBe(partie.spieler.oben.name);
      }
    } finally {
      zufall.mockRestore();
    }
  });
});
