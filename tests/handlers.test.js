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
import { EREIGNIS, FEHLER, GRUND, GRENZEN, STATUS } from '../shared/protokoll.js';

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
 * fuer `io`, die Raeume kennt und Nachrichten an die Sockets verteilt.
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

    anna.sende(EREIGNIS.ABBRECHEN);   // der Klick war unterwegs, als START kam

    expect(anna.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(ben.letzte(EREIGNIS.ABBRUCH)).toBeUndefined();
    expect(manager.holeNachSocket('a')).not.toBeNull();
    expect(imProtokoll('ignoriert')).toBe(true);
  });

  test('ebenso nach dem Start einer Revanche (Esc im Ergebnisdialog)', () => {
    const { anna, ben, manager } = schnellesSpiel();
    anna.sende(EREIGNIS.AUFGEBEN);
    anna.sende(EREIGNIS.REVANCHE);
    ben.sende(EREIGNIS.REVANCHE);   // die Revanche startet

    ben.sende(EREIGNIS.ABBRECHEN);  // Ben schloss den Dialog, bevor START ankam

    expect(anna.alle(EREIGNIS.ABBRUCH)).toHaveLength(1);   // nur die erste Partie
    expect(manager.holeNachSocket('b')).not.toBeNull();
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

    amZug.sende(EREIGNIS.ZUG, { mulde: 0 });

    for (const spieler of [amZug, wartet]) {
      const { spielstand, bericht } = spieler.letzte(EREIGNIS.STAND).daten;
      expect(spielstand.zugNr).toBe(1);
      expect(bericht).toBeDefined();
    }
  });

  test('wer nicht am Zug ist, wird abgelehnt – nur er erfährt es', () => {
    const { amZug, wartet } = schnellesSpiel();

    wartet.sende(EREIGNIS.ZUG, { mulde: 0 });

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

    amZug.sende(EREIGNIS.ZUG, { mulde: 0 });

    expect(amZug.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.MULDE_LEER);
  });

  test('ohne Partie gibt es keinen Zug', () => {
    const { verbinde } = erzeugeUmgebung();
    const anna = verbinde('a');

    anna.sende(EREIGNIS.ZUG, { mulde: 0 });

    expect(anna.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.KEINE_PARTIE);
  });

  test('ein kaputter Spielstand beendet nur diese Partie – beide erfahren es', () => {
    const { amZug, wartet, manager } = schnellesSpiel();
    manager.holeNachSocket(amZug.id).brett[1][0] = 3;   // 47 statt 48 Kugeln

    amZug.sende(EREIGNIS.ZUG, { mulde: 0 });

    for (const spieler of [amZug, wartet]) {
      expect(spieler.letzte(EREIGNIS.ABBRUCH).daten.grund).toBe(GRUND.INTERNER_FEHLER);
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

    amZug.sende(EREIGNIS.ZUG, { mulde: 5 });

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

    for (let i = 0; i < 4; i += 1) anna.sende(EREIGNIS.ZUG, { mulde: 0 });

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

    for (let i = 0; i < 25; i += 1) anna.sende(EREIGNIS.ZUG, { mulde: 0 });

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
    manager.holeNachSocket(amZug.id).brett = null;   // simulierter Programmierfehler

    expect(() => amZug.sende(EREIGNIS.ZUG, { mulde: 0 })).not.toThrow();

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

    amZug.sende(EREIGNIS.ZUG, { mulde: 0 });

    for (const spieler of [amZug, wartet]) {
      expect(spieler.letzte(EREIGNIS.ABBRUCH).daten.grund).toBe(GRUND.INTERNER_FEHLER);
      expect(spieler.alle(EREIGNIS.FEHLER)).toHaveLength(0);
    }
  });

  test('scheitert auch das Beenden, ist die Partie trotzdem aufgelöst', () => {
    const { anna, amZug, wartet, manager, raeume } = schnellesSpiel();
    const { spielId } = anna.letzte(EREIGNIS.START).daten;
    manager.holeNachSocket(amZug.id).brett = null;

    amZug.sende(EREIGNIS.ZUG, { mulde: 0 });

    expect(imProtokoll('nach Fehler fehlgeschlagen')).toBe(true);
    expect(manager.anzahl()).toBe(0);
    expect(raeume.get(spielId).size).toBe(0);
    // Der nächste Klick des Gegners führt sichtbar zurück zur Anmeldung.
    wartet.sende(EREIGNIS.AUFGEBEN);
    expect(wartet.letzte(EREIGNIS.FEHLER).daten.code).toBe(FEHLER.KEINE_PARTIE);
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
      expect(abbruch.revanche).toBe(false);
    }
    expect(manager.anzahl()).toBe(0);
    expect(raeume.get(spielId).size).toBe(0);
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

describe('Handler: Ratenbegrenzung – das nächste Fenster', () => {
  test('nach Ablauf des Fensters wird wieder bearbeitet', () => {
    let jetzt = 0;
    const ratenbegrenzer = erzeugeRatenbegrenzer(1, 1000, () => jetzt);
    const { verbinde } = erzeugeUmgebung({ ratenbegrenzer });
    const anna = verbinde('a');

    anna.sende(EREIGNIS.ZUG, { mulde: 0 });
    anna.sende(EREIGNIS.ZUG, { mulde: 0 });
    jetzt = 1000;
    anna.sende(EREIGNIS.ZUG, { mulde: 0 });

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
    expect(anna.letzte(EREIGNIS.PRIVAT).daten.code).toBe(code);   // kein neuer Code
  });
});
