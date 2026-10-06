/**
 * Tests der Eingabevalidierung und der Ratenbegrenzung (Konzept 7.8 und 7.9).
 *
 * Das ist die Anti-Cheating-Schicht: Jede Zeile hier entspricht einer Zeile
 * der Gefahrentabelle aus Konzept 7.8.
 */

import {
  istObjekt,
  istGanzzahlIm,
  saubererName,
  istGueltig,
} from '../server/socket/validation.js';

import { erzeugeRatenbegrenzer } from '../server/socket/rateLimit.js';
import { EREIGNIS } from '../shared/protokoll.js';

describe('istObjekt', () => {
  test('akzeptiert einfache Objekte', () => {
    expect(istObjekt({})).toBe(true);
    expect(istObjekt({ mulde: 1 })).toBe(true);
  });

  test('lehnt null, Arrays und Grundwerte ab', () => {
    // null und Arrays sind vom typeof her ebenfalls "object" – der haeufigste
    // Fallstrick bei selbstgebauten Pruefungen.
    expect(istObjekt(null)).toBe(false);
    expect(istObjekt([])).toBe(false);
    expect(istObjekt('x')).toBe(false);
    expect(istObjekt(3)).toBe(false);
    expect(istObjekt(undefined)).toBe(false);
  });
});

describe('istGanzzahlIm', () => {
  test('akzeptiert Ganzzahlen im Bereich', () => {
    expect(istGanzzahlIm(0, 0, 5)).toBe(true);
    expect(istGanzzahlIm(5, 0, 5)).toBe(true);
  });

  test('lehnt alles ab, was keine Ganzzahl im Bereich ist', () => {
    const schlecht = [6, -1, 1.5, '3', null, undefined, NaN, Infinity, {}, []];
    for (const wert of schlecht) {
      expect(istGanzzahlIm(wert, 0, 5)).toBe(false);
    }
  });

  test('laesst sich nicht von einer eigenen valueOf-Methode taeuschen', () => {
    // Ein Objekt, das sich als 3 ausgeben will: Da gar keine Umwandlung
    // stattfindet, kommt es nicht durch.
    const tarnung = { valueOf: () => 3 };
    expect(istGanzzahlIm(tarnung, 0, 5)).toBe(false);
  });
});

describe('saubererName', () => {
  test('behaelt einen normalen Namen', () => {
    expect(saubererName('Gursharan')).toBe('Gursharan');
  });

  test('entfernt umgebende Leerzeichen', () => {
    expect(saubererName('  Nico  ')).toBe('Nico');
  });

  test('kuerzt auf 20 Zeichen', () => {
    const lang = 'A'.repeat(500);
    expect(saubererName(lang)).toHaveLength(20);
  });

  test('ersetzt leere und falsch getypte Eingaben durch "Spieler"', () => {
    expect(saubererName('')).toBe('Spieler');
    expect(saubererName('   ')).toBe('Spieler');
    expect(saubererName(null)).toBe('Spieler');
    expect(saubererName(42)).toBe('Spieler');
    expect(saubererName({})).toBe('Spieler');
    expect(saubererName(undefined)).toBe('Spieler');
  });

  test('entfernt Steuerzeichen', () => {
    // Zeilenumbruch und Nullbyte wuerden die Anzeige zerlegen, ohne selbst
    // sichtbar zu sein.
    const mitSteuerzeichen = `Ni${String.fromCharCode(10)}co${String.fromCharCode(0)}`;
    expect(saubererName(mitSteuerzeichen)).toBe('Nico');
  });

  test('laesst HTML woertlich stehen – der Client setzt nur textContent', () => {
    // Bewusste Entscheidung (Konzept 7.8): Maskiert wird nicht hier, sondern
    // es wird gar kein HTML interpretiert.
    expect(saubererName('<b>Nico</b>')).toBe('<b>Nico</b>');
  });

  test('zerschneidet keine Emoji', () => {
    expect(saubererName('Anna 🎲')).toBe('Anna 🎲');
  });
});

describe('Schemapruefung der Ereignisse', () => {
  test('spiel:zug verlangt eine Muldennummer von 0 bis 5', () => {
    expect(istGueltig(EREIGNIS.ZUG, { mulde: 0 })).toBe(true);
    expect(istGueltig(EREIGNIS.ZUG, { mulde: 5 })).toBe(true);

    expect(istGueltig(EREIGNIS.ZUG, { mulde: 6 })).toBe(false);
    expect(istGueltig(EREIGNIS.ZUG, { mulde: '3' })).toBe(false);
    expect(istGueltig(EREIGNIS.ZUG, {})).toBe(false);
    expect(istGueltig(EREIGNIS.ZUG, null)).toBe(false);
    expect(istGueltig(EREIGNIS.ZUG, [1])).toBe(false);
  });

  test('spiel:beitreten verlangt eine Zeichenkette als Name', () => {
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna' })).toBe(true);
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: '' })).toBe(true);   // wird zu "Spieler"

    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 42 })).toBe(false);
    expect(istGueltig(EREIGNIS.BEITRETEN, {})).toBe(false);

    // Privates Spiel: `privat` und `code` sind freiwillig, aber typgeprueft.
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna', privat: true })).toBe(true);
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna', code: 'K7M2QX' })).toBe(true);
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna', privat: 'ja' })).toBe(false);
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna', code: 123456 })).toBe(false);
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna', code: ['K7M2QX'] })).toBe(false);
  });

  test('Ereignisse ohne Nutzdaten akzeptieren alles', () => {
    expect(istGueltig(EREIGNIS.ABBRECHEN, undefined)).toBe(true);
    expect(istGueltig(EREIGNIS.AUFGEBEN, null)).toBe(true);
    expect(istGueltig(EREIGNIS.ERNEUT, { unfug: true })).toBe(true);
    expect(istGueltig(EREIGNIS.REVANCHE, undefined)).toBe(true);
  });

  test('ein unbekanntes Ereignis gilt als ungueltig', () => {
    expect(istGueltig('spiel:hack', { mulde: 1 })).toBe(false);
  });

  test('__proto__ in den Nutzdaten hat keine Wirkung', () => {
    // Es findet keine Objekt-Verschmelzung statt; gelesen wird nur das
    // benannte Feld `mulde` (Konzept 7.8).
    const boesartig = JSON.parse('{"mulde": 2, "__proto__": {"gehackt": true}}');

    expect(istGueltig(EREIGNIS.ZUG, boesartig)).toBe(true);
    expect({}.gehackt).toBeUndefined();
  });

  test('ein werfender Getter bringt die Pruefung nicht zum Absturz', () => {
    const boesartig = {
      get mulde() { throw new Error('boom'); },
    };
    expect(istGueltig(EREIGNIS.ZUG, boesartig)).toBe(false);
  });
});

describe('Ratenbegrenzung', () => {
  test('laesst bis zur Grenze durch und bremst danach', () => {
    // Feste Uhr: Alle Ereignisse fallen in dasselbe Fenster, ohne dass der
    // Test eine Sekunde lang warten muesste.
    const begrenzer = erzeugeRatenbegrenzer(3, 1000, () => 1000);

    expect(begrenzer.erlaubt('a')).toBe(true);
    expect(begrenzer.erlaubt('a')).toBe(true);
    expect(begrenzer.erlaubt('a')).toBe(true);
    expect(begrenzer.erlaubt('a')).toBe(false);
    expect(begrenzer.erlaubt('a')).toBe(false);
  });

  test('beginnt im naechsten Fenster von vorn', () => {
    let jetzt = 1000;
    const begrenzer = erzeugeRatenbegrenzer(2, 1000, () => jetzt);

    begrenzer.erlaubt('a');
    begrenzer.erlaubt('a');
    expect(begrenzer.erlaubt('a')).toBe(false);

    jetzt += 1000;   // neues Fenster
    expect(begrenzer.erlaubt('a')).toBe(true);
  });

  test('zaehlt jede Verbindung getrennt', () => {
    const begrenzer = erzeugeRatenbegrenzer(1, 1000, () => 1000);

    expect(begrenzer.erlaubt('a')).toBe(true);
    expect(begrenzer.erlaubt('b')).toBe(true);   // b ist von a unbeeinflusst
    expect(begrenzer.erlaubt('a')).toBe(false);
  });

  test('vergisst getrennte Verbindungen (NFA-10)', () => {
    const begrenzer = erzeugeRatenbegrenzer();

    begrenzer.erlaubt('a');
    expect(begrenzer.anzahl()).toBe(1);

    begrenzer.vergiss('a');
    expect(begrenzer.anzahl()).toBe(0);
  });
});
