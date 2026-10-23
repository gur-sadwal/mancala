/**
 * logger.test.js – Protokollformat, Schwelle und Absturzschutz.
 *
 * Gesammelte Konsolenausgaben lassen sich prüfen. Für eine andere
 * LOG_LEVEL-Schwelle lädt ein eigener Prozess den Logger neu.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { logger } from '../server/util/logger.js';

/** Projektwurzel – eine Ebene über tests/. */
const WURZEL = fileURLToPath(new URL('..', import.meta.url));

const ausgabe = { log: [], warn: [], error: [] };
const echteKonsole = { log: console.log, warn: console.warn, error: console.error };

beforeEach(() => {
  for (const ebene of Object.keys(ausgabe)) {
    ausgabe[ebene] = [];
    console[ebene] = (zeile) => ausgabe[ebene].push(zeile);
  }
});

afterEach(() => {
  Object.assign(console, echteKonsole);
});

// == 2. Testfälle ===========================================================

describe('Logger', () => {
  test('eine Zeile hat Uhrzeit, Ebene, Text und die Zusatzangaben als JSON', () => {
    logger.info('Partie gestartet', { spielId: 'g-1' });

    expect(ausgabe.log).toHaveLength(1);
    expect(ausgabe.log[0]).toMatch(/^\d\d:\d\d:\d\d \[INFO\] Partie gestartet \{"spielId":"g-1"\}$/);
  });

  test('debug erscheint beim Standard info nicht', () => {
    logger.debug('nur beim Entwickeln');

    expect(ausgabe.log).toEqual([]);
  });

  test('warn und error gehen an die passenden Ausgaben', () => {
    logger.warn('Achtung');
    logger.error('Kaputt');

    expect(ausgabe.warn[0]).toContain('[WARN] Achtung');
    expect(ausgabe.error[0]).toContain('[ERROR] Kaputt');
  });

  test('bei error steht der Stacktrace des Fehlers mit in der Zeile', () => {
    logger.error('Handler fehlgeschlagen', new Error('absichtlich'));

    expect(ausgabe.error[0]).toContain('absichtlich');
    expect(ausgabe.error[0]).toContain('logger.test.js');
  });

  test('die Meldung des Fehlers steht nur einmal in der Zeile', () => {
    logger.error('Handler fehlgeschlagen', new Error('absichtlich'));

    expect(ausgabe.error[0].split('absichtlich')).toHaveLength(2);
  });

  test('bei warn genügen Name und Meldung des Fehlers', () => {
    logger.warn('Seltsam', new TypeError('falscher Typ'));

    expect(ausgabe.warn[0]).toContain('TypeError: falscher Typ');
    expect(ausgabe.warn[0]).not.toContain('logger.test.js');
  });

  test('ringförmige Daten bringen den Logger nicht zum Absturz', () => {
    const ring = {};
    ring.selbst = ring;

    expect(() => logger.info('Ring', ring)).not.toThrow();
    expect(ausgabe.log[0]).toContain('[nicht serialisierbar]');
  });
});

describe('Logger: Schwelle aus LOG_LEVEL', () => {
  // Die Schwelle wird beim Laden gelesen – deshalb ein eigener Prozess.
  function protokolliereMit(logLevel) {
    const programm = "import { logger } from './server/util/logger.js';"
      + "logger.debug('fein'); logger.info('normal');";
    const lauf = spawnSync(process.execPath, ['--input-type=module', '-e', programm], {
      cwd: WURZEL,
      env: { ...process.env, LOG_LEVEL: logLevel },
      encoding: 'utf8',
    });
    return lauf.stdout;
  }

  test('mit LOG_LEVEL=debug erscheinen auch debug-Zeilen', () => {
    expect(protokolliereMit('debug')).toContain('[DEBUG] fein');
  });

  test('Groß- und Kleinschreibung spielt keine Rolle', () => {
    expect(protokolliereMit('DEBUG')).toContain('[DEBUG] fein');
    expect(protokolliereMit('WARN')).not.toContain('[INFO] normal');
  });

  test('ein unbekannter Wert fällt auf info zurück', () => {
    const ausgabe = protokolliereMit('quatsch');
    expect(ausgabe).toContain('[INFO] normal');
    expect(ausgabe).not.toContain('[DEBUG]');
  });

  test.each(['constructor', '__proto__'])('geerbter Schlüssel %s ist keine Protokollebene', (wert) => {
    const ausgabe = protokolliereMit(wert);
    expect(ausgabe).toContain('[INFO] normal');
    expect(ausgabe).not.toContain('[DEBUG]');
  });
});
