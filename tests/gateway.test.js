/**
 * gateway.test.js – Socket.io am echten HTTP-Server.
 *
 * Ein roher WebSocket spricht die benötigten Socket.io-Nachrichten.
 * So lassen sich Verbindungen und Aufräumtakte ohne Browser prüfen.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import http from 'node:http';

import { erzeugeGateway } from '../server/socket/gateway.js';
import { erzeugeLobby } from '../server/spiel/lobby.js';
import { erzeugeManager } from '../server/spiel/manager.js';
import { EREIGNIS, GRUND } from '../shared/protokoll.js';

/** Längste Wartezeit auf eine Nachricht, bevor der Test scheitert. */
const WARTEN_MAX_MS = 2000;

// Der Server protokolliert jede Verbindung – im Test nur Rauschen. Die
// Fehlerzeilen werden gesammelt, damit ein Test sie prüfen kann.
const fehlerzeilen = [];
const echteKonsole = { log: console.log, warn: console.warn, error: console.error };
beforeAll(() => {
  console.log = () => {};
  console.warn = () => {};
  console.error = (zeile) => fehlerzeilen.push(zeile);
});
afterAll(() => {
  Object.assign(console, echteKonsole);
});

let httpServer;
let gateway;
let manager;
let port;
const browser = [];

beforeEach(async () => {
  manager = erzeugeManager();
  httpServer = http.createServer();
  gateway = erzeugeGateway(httpServer, { lobby: erzeugeLobby(), manager });
  await new Promise((fertig) => httpServer.listen(0, '127.0.0.1', fertig));
  port = httpServer.address().port;
});

afterEach(async () => {
  for (const b of browser.splice(0)) b.schliesse();
  if (httpServer.listening) await gateway.herunterfahren();
  await warteBis(() => !httpServer.listening);
});

/** Wartet, bis `bedingung()` wahr ist – höchstens WARTEN_MAX_MS. */
async function warteBis(bedingung) {
  const ende = Date.now() + WARTEN_MAX_MS;
  while (!bedingung()) {
    if (Date.now() > ende) throw new Error('Zeit abgelaufen');
    await new Promise((weiter) => setTimeout(weiter, 10));
  }
}

/** Ein nachgebauter Browser; `bereit` erfüllt sich, sobald er dabei ist. */
function verbindeRoh() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
  const zustand = { empfangen: [], dabei: false, getrennt: false };

  ws.addEventListener('message', ({ data }) => {
    if (data === '2') ws.send('3');
    else if (data.startsWith('0')) ws.send('40');
    else if (data.startsWith('40')) zustand.dabei = true;
    else if (data.startsWith('42')) zustand.empfangen.push(JSON.parse(data.slice(2)));
  });
  ws.addEventListener('close', () => { zustand.getrennt = true; });

  const b = {
    zustand,
    bereit: warteBis(() => zustand.dabei),
    sende(ereignis, daten) {
      ws.send(`42${JSON.stringify([ereignis, daten])}`);
    },
    /** Wartet auf das erste Ereignis dieses Namens und liefert seine Daten. */
    async erhalte(ereignis) {
      await warteBis(() => zustand.empfangen.some(([name]) => name === ereignis));
      return zustand.empfangen.find(([name]) => name === ereignis)[1];
    },
    schliesse() {
      ws.close();
    },
  };
  browser.push(b);
  return b;
}

// == 2. Testfälle ===========================================================

describe('Gateway: Verbindungen', () => {
  test('ein Browser verbindet sich und wartet auf einen Gegner', async () => {
    const anna = verbindeRoh();
    await anna.bereit;

    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });

    expect(await anna.erhalte(EREIGNIS.WARTESCHLANGE)).toEqual({ position: 1 });
  });

  test('zwei Browser bekommen eine gemeinsame Partie', async () => {
    const anna = verbindeRoh();
    const ben = verbindeRoh();
    await Promise.all([anna.bereit, ben.bereit]);

    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });
    await anna.erhalte(EREIGNIS.WARTESCHLANGE);
    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben' });

    const startAnna = await anna.erhalte(EREIGNIS.START);
    const startBen = await ben.erhalte(EREIGNIS.START);
    expect(startAnna.spielId).toBe(startBen.spielId);
    expect(manager.anzahl()).toBe(1);
  });

  test('eine zu große Nachricht trennt nur diese eine Verbindung', async () => {
    const anna = verbindeRoh();
    const ben = verbindeRoh();
    await Promise.all([anna.bereit, ben.bereit]);

    anna.sende(EREIGNIS.BEITRETEN, { name: 'A'.repeat(2000) });
    await warteBis(() => anna.zustand.getrennt);

    // Ben merkt davon nichts, der Server antwortet ihm weiter.
    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben' });
    expect(await ben.erhalte(EREIGNIS.WARTESCHLANGE)).toEqual({ position: 1 });
    expect(ben.zustand.getrennt).toBe(false);
  });
});

describe('Gateway: Herunterfahren', () => {
  test('laufende Partien bekommen einen Abbruch, danach schließt der Server', async () => {
    const anna = verbindeRoh();
    const ben = verbindeRoh();
    await Promise.all([anna.bereit, ben.bereit]);
    anna.sende(EREIGNIS.BEITRETEN, { name: 'Anna' });
    await anna.erhalte(EREIGNIS.WARTESCHLANGE);
    ben.sende(EREIGNIS.BEITRETEN, { name: 'Ben' });
    await ben.erhalte(EREIGNIS.START);

    gateway.herunterfahren();

    for (const spieler of [anna, ben]) {
      const abbruch = await spieler.erhalte(EREIGNIS.ABBRUCH);
      expect(abbruch.grund).toBe(GRUND.SERVER_ENDE);
      expect(abbruch.ergebnis.sieger).toBeNull();   // nicht gewertet
    }
    await warteBis(() => !httpServer.listening);
    expect(manager.anzahl()).toBe(0);
  });
});

describe('Gateway: Herunterfahren mit await', () => {
  test('herunterfahren liefert ein Promise – danach ist der Server zu', async () => {
    const versprechen = gateway.herunterfahren();

    expect(versprechen).toBeInstanceOf(Promise);
    await versprechen;
    expect(httpServer.listening).toBe(false);
  });
});

describe('Gateway: Takte', () => {
  test('der Aufräumtakt prüft jede Minute die Fristen', async () => {
    const jest = import.meta.jest;
    const andererManager = erzeugeManager();
    const pruefe = jest.spyOn(andererManager, 'findeRuhendePartien');
    jest.useFakeTimers();
    try {
      const anderer = erzeugeGateway(http.createServer(), {
        lobby: erzeugeLobby(),
        manager: andererManager,
      });

      jest.advanceTimersByTime(60 * 1000 - 1);
      expect(pruefe).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(pruefe).toHaveBeenCalledTimes(1);

      anderer.herunterfahren();
    } finally {
      jest.useRealTimers();
    }
  });

  test('ein Fehler in einem Takt wird nur protokolliert', async () => {
    const jest = import.meta.jest;
    // Ein Manager, der beim Suchen ruhender Partien wirft – wie ein
    // Programmierfehler. Die Uhr ist eine Attrappe: Die Takte laufen sofort.
    const kaputterManager = {
      ...erzeugeManager(),
      findeRuhendePartien() {
        throw new Error('absichtlicher Testfehler');
      },
    };
    jest.useFakeTimers();
    try {
      const anderer = erzeugeGateway(http.createServer(), {
        lobby: erzeugeLobby(),
        manager: kaputterManager,
      });
      expect(() => jest.runOnlyPendingTimers()).not.toThrow();
      expect(fehlerzeilen.some((zeile) => zeile.includes('[ERROR]'))).toBe(true);
      anderer.herunterfahren();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Gateway: Herunterfahren trotz kaputter Partie', () => {
  test('räumt alle Partien auf und schließt HTTP trotz einer beschädigten Partie', async () => {
    const kaputt = manager.starte(
      { socketId: 'kaputt-a', name: 'A' }, { socketId: 'kaputt-b', name: 'B' },
    );
    manager.starte({ socketId: 'c', name: 'C' }, { socketId: 'd', name: 'D' });
    kaputt.brett = null;

    await expect(gateway.herunterfahren()).resolves.toBeUndefined();
    expect(manager.anzahl()).toBe(0);
    expect(httpServer.listening).toBe(false);
  });
});
