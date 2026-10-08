/**
 * Tests von server/util/logger.js: Format der Zeilen und Absturzsicherheit.
 *
 * Die Ausgabe landet sonst in der Konsole; hier wird sie je Ebene gesammelt.
 * Die Schwelle (LOG_LEVEL) liest der Logger beim Laden – im Test ist sie
 * nicht gesetzt, es gilt also der Standard `info`.
 */

import { logger } from '../server/util/logger.js';

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
