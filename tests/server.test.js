/**
 * Rauchtest des Startpunkts (server/index.js): Der Server läuft hier als
 * eigener Prozess – genau so, wie ihn `npm run start <port>` startet.
 *
 * Geprüft wird nur das, was index.js selbst tut: Port lesen, lauschen und
 * sich bei SIGTERM geordnet beenden. Die Spiellogik testen die anderen
 * Dateien ohne Netzwerk.
 */

import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

/** Projektwurzel – eine Ebene über tests/. */
const WURZEL = fileURLToPath(new URL('..', import.meta.url));

/** Großzügige Zeitgrenze je Test: Ein Prozessstart dauert etwas. */
const ZEITGRENZE_MS = 10000;

/** Der zuletzt gestartete Prozess – wird nach jedem Test sicher beendet. */
let kind = null;

afterEach(() => {
  if (kind && kind.exitCode === null) kind.kill('SIGKILL');
  kind = null;
});

/** Fragt das Betriebssystem nach einem gerade freien Port. */
function freierPort() {
  return new Promise((fertig) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => fertig(port));
    });
  });
}

/**
 * Startet `node server/index.js <argument>` und sammelt die Ausgaben.
 *
 * @returns {{ausgabe: () => string, ende: Promise<number|null>}}
 *          `ende` liefert den Exit-Code, sobald der Prozess endet
 */
function starte(argument) {
  kind = spawn(process.execPath, ['server/index.js', argument], { cwd: WURZEL });
  let text = '';
  kind.stdout.on('data', (stueck) => { text += stueck; });
  kind.stderr.on('data', (stueck) => { text += stueck; });
  const ende = new Promise((fertig) => kind.on('exit', (code) => fertig(code)));
  return { ausgabe: () => text, ende };
}

/** Wartet, bis der Text in der Ausgabe steht (oder der Prozess endet). */
async function warteAuf(lauf, gesucht) {
  let beendet = false;
  lauf.ende.then(() => { beendet = true; });
  while (!lauf.ausgabe().includes(gesucht)) {
    if (beendet) throw new Error(`Prozess beendet, Ausgabe:\n${lauf.ausgabe()}`);
    await new Promise((weiter) => setTimeout(weiter, 20));
  }
}

describe('Startpunkt server/index.js', () => {
  test('lauscht, antwortet und endet bei SIGTERM mit Code 0', async () => {
    const port = await freierPort();
    const lauf = starte(String(port));
    await warteAuf(lauf, 'lauscht');

    const antwort = await fetch(`http://127.0.0.1:${port}/gesundheit`);
    expect((await antwort.json()).status).toBe('ok');

    kind.kill('SIGTERM');
    expect(await lauf.ende).toBe(0);
  }, ZEITGRENZE_MS);
});

describe('Startpunkt: falsche Aufrufe', () => {
  test('ein Port ohne Zahl wird abgelehnt (Code 1)', async () => {
    const lauf = starte('abc');

    expect(await lauf.ende).toBe(1);
    expect(lauf.ausgabe()).toContain('Port');
  }, ZEITGRENZE_MS);

  test('ein belegter Port wird verständlich gemeldet (Code 1)', async () => {
    const port = await freierPort();
    const belegt = net.createServer();
    await new Promise((fertig) => belegt.listen(port, '0.0.0.0', fertig));

    try {
      const lauf = starte(String(port));
      expect(await lauf.ende).toBe(1);
      expect(lauf.ausgabe()).toContain('belegt');
    } finally {
      await new Promise((fertig) => belegt.close(fertig));
    }
  }, ZEITGRENZE_MS);

  test('auch SIGINT (Control+C) beendet geordnet mit Code 0', async () => {
    const port = await freierPort();
    const lauf = starte(String(port));
    await warteAuf(lauf, 'lauscht');

    kind.kill('SIGINT');

    expect(await lauf.ende).toBe(0);
  }, ZEITGRENZE_MS);
});
