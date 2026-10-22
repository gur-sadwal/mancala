/**
 * validation.test.js – Eingabeform, Namensregel und Ratenbegrenzung.
 *
 * Falsche Typen und manipulierte Nutzdaten werden direkt geprüft, damit
 * der Server sie vor einer Partieaktion sicher ablehnen kann.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import {
  istObjekt,
  istGanzzahlZwischen,
  ermittleSpielername,
  ermittleEinladungsCode,
  istGueltig,
} from '../server/socket/validation.js';

import { erzeugeRatenbegrenzer } from '../server/socket/rateLimit.js';
import { EREIGNIS, bereinigeName } from '../shared/protokoll.js';

// == 2. Testfälle ===========================================================

describe('istObjekt', () => {
  test('akzeptiert einfache Objekte', () => {
    expect(istObjekt({})).toBe(true);
    expect(istObjekt({ mulde: 1 })).toBe(true);
  });

  test('lehnt null, Arrays und Grundwerte ab', () => {
    // null und Arrays sind vom typeof her ebenfalls "object" – der häufigste
    // Fallstrick bei selbstgebauten Prüfungen.
    expect(istObjekt(null)).toBe(false);
    expect(istObjekt([])).toBe(false);
    expect(istObjekt('x')).toBe(false);
    expect(istObjekt(3)).toBe(false);
    expect(istObjekt(undefined)).toBe(false);
  });
});

describe('istGanzzahlZwischen', () => {
  test('akzeptiert Ganzzahlen im Bereich', () => {
    expect(istGanzzahlZwischen(0, 0, 5)).toBe(true);
    expect(istGanzzahlZwischen(5, 0, 5)).toBe(true);
  });

  test('lehnt alles ab, was keine Ganzzahl im Bereich ist', () => {
    const schlecht = [6, -1, 1.5, '3', null, undefined, NaN, Infinity, {}, []];
    for (const wert of schlecht) {
      expect(istGanzzahlZwischen(wert, 0, 5)).toBe(false);
    }
  });

  test('lässt sich nicht von einer eigenen valueOf-Methode täuschen', () => {
    // Ein Objekt, das sich als 3 ausgeben will: Da gar keine Umwandlung
    // stattfindet, kommt es nicht durch.
    const tarnung = { valueOf: () => 3 };
    expect(istGanzzahlZwischen(tarnung, 0, 5)).toBe(false);
  });
});

describe('ermittleSpielername', () => {
  test('behält einen normalen Namen', () => {
    expect(ermittleSpielername('Gursharan')).toBe('Gursharan');
  });

  test('entfernt umgebende Leerzeichen', () => {
    expect(ermittleSpielername('  Nico  ')).toBe('Nico');
  });

  test('kürzt auf 20 Zeichen', () => {
    const lang = 'A'.repeat(500);
    expect(ermittleSpielername(lang)).toHaveLength(20);
  });

  test('ersetzt leere und falsch getypte Eingaben durch "Spieler"', () => {
    expect(ermittleSpielername('')).toBe('Spieler');
    expect(ermittleSpielername('   ')).toBe('Spieler');
    expect(ermittleSpielername(null)).toBe('Spieler');
    expect(ermittleSpielername(42)).toBe('Spieler');
    expect(ermittleSpielername({})).toBe('Spieler');
    expect(ermittleSpielername(undefined)).toBe('Spieler');
  });

  test('entfernt Steuerzeichen', () => {
    // Zeilenumbruch und Nullbyte würden die Anzeige zerlegen, ohne selbst
    // sichtbar zu sein.
    const mitSteuerzeichen = `Ni${String.fromCharCode(10)}co${String.fromCharCode(0)}`;
    expect(ermittleSpielername(mitSteuerzeichen)).toBe('Nico');
  });

  test('entfernt < und > – ohne sie gibt es kein HTML-Tag (XSS)', () => {
    // Der Browser meldet diese Zeichen schon vor dem Absenden. Kommen sie
    // trotzdem an (manipulierter Client), entfernt der Server sie.
    expect(ermittleSpielername('<b>Nico</b>')).toBe('bNico/b');
    expect(ermittleSpielername('<script>alert(1)</script>')).not.toMatch(/[<>]/);
    expect(ermittleSpielername('<>')).toBe('Spieler');
  });

  test('behält das einfache Würfel-Emoji im Namen', () => {
    expect(ermittleSpielername('Anna 🎲')).toBe('Anna 🎲');
  });
});

describe('bereinigeName – dieselbe Regel im Browser und auf dem Server', () => {
  test('liefert eine leere Zeichenkette, wenn nichts übrig bleibt', () => {
    // Der Browser meldet dann "Bitte gib einen Namen ein.", der Server setzt
    // "Spieler" ein – das entscheidet jede Seite selbst.
    expect(bereinigeName('')).toBe('');
    expect(bereinigeName('   ')).toBe('');
    expect(bereinigeName(String.fromCharCode(0, 7, 10))).toBe('');
    expect(bereinigeName('<>')).toBe('');
  });

  test('Browser und Server kommen zum selben Namen', () => {
    // Was der Browser ins Feld schreibt, muss genau das sein, was der Server
    // daraus macht – sonst stünde auf dem Brett ein anderer Name.
    const eingaben = ['Gursharan', '  Nico  ', 'A'.repeat(30), 'Anna 🎲',
      `Ni${String.fromCharCode(10)}co`, '<b>Nico</b>', 'Ölmühle Ärger'];
    for (const eingabe of eingaben) {
      expect(ermittleSpielername(eingabe)).toBe(bereinigeName(eingabe));
    }
  });

  test('Umlaute und Satzzeichen bleiben erlaubt', () => {
    expect(bereinigeName('Jörg-Ümit & Co.')).toBe('Jörg-Ümit & Co.');
  });

  test('gekürzt wird nach Codepunkten: ein Emoji an Stelle 20 bleibt ganz', () => {
    const name = 'A'.repeat(19) + '🎲';

    expect(bereinigeName(name)).toBe(name);
    expect(bereinigeName(`${name}xyz`)).toBe(name);
  });

  test('nach dem Kürzen steht kein Leerzeichen am Ende', () => {
    expect(bereinigeName(`${'A'.repeat(19)} B`)).toBe('A'.repeat(19));
  });

  test('unsichtbare Zeichen werden entfernt', () => {
    // Nullbreite-Leerzeichen
    expect(bereinigeName('\u200B')).toBe('');
    expect(bereinigeName('Ni\u0085co')).toBe('Nico');   // Steuerzeichen NEL
    // dreht die Leserichtung
    expect(bereinigeName('Anna\u202Etxet')).toBe('Annatxet');
    // weiches Trennzeichen, BOM
    expect(bereinigeName('Ni\u00ADco\uFEFF')).toBe('Nico');
  });

  test('ein Name nur aus unsichtbaren Zeichen wird auf dem Server zu „Spieler“', () => {
    expect(ermittleSpielername('\u200B\u202E')).toBe('Spieler');
  });

  test('Füllzeichen ohne Bild und Zeilentrenner werden entfernt', () => {
    // Hangul-Füllzeichen und Braille-Leerzeichen sehen leer aus.
    expect(bereinigeName('\u3164')).toBe('');
    expect(bereinigeName('\u115F\u1160\uFFA0\u2800')).toBe('');
    expect(ermittleSpielername('\u3164\u3164')).toBe('Spieler');
    // Zeilen- und Absatztrenner: WebKit bricht den Namen daran um.
    expect(bereinigeName('An\u2028na\u2029Ben')).toBe('AnnaBen');
  });

  test('sichtbare Sonderzeichen und Emoji-Varianten bleiben', () => {
    expect(bereinigeName('Jörg 🎲')).toBe('Jörg 🎲');
    expect(bereinigeName('Herz ❤\uFE0F')).toBe('Herz ❤\uFE0F');
  });

  test('zusammengesetzte Emoji zerfallen in ihre Teile (Verbindungszeichen ist unsichtbar)', () => {
    expect(bereinigeName('👨\u200D👩')).toBe('👨👩');
  });
});

describe('bereinigeName – Akzente, Normalform und Leserichtung', () => {
  test('Zalgo: höchstens drei Akzente hintereinander bleiben stehen', () => {
    const zalgo = `X${'\u0301'.repeat(19)}`;
    expect(bereinigeName(zalgo)).toBe(`X${'\u0301'.repeat(3)}`);
  });

  test('ein unsichtbares Zeichen zwischen Akzenten hebt die Grenze nicht auf', () => {
    // x statt a: Für a mit Akzent gibt es ein fertiges á, das NFC einsetzt.
    const versteckt = 'x\u0301\u200B\u0301\u0301\u0301\u0301';
    expect(bereinigeName(versteckt)).toBe(`x${'\u0301'.repeat(3)}`);
  });

  test('ein Name nur aus Akzenten bleibt leer; der Server setzt „Spieler“ ein', () => {
    expect(bereinigeName('\u0301\u0302\u0303')).toBe('');
    expect(bereinigeName(' \u0301 ')).toBe('');
    expect(ermittleSpielername('\u0301\u0301')).toBe('Spieler');
  });

  test('ein zerlegtes ö wird zum gewöhnlichen ö zusammengesetzt (NFC)', () => {
    expect(bereinigeName('Jo\u0308rg')).toBe('J\u00F6rg');
  });

  test('gewöhnliche Namen anderer Schriften behalten ihre Zeichen', () => {
    // Arabisch mit Vokalzeichen, Vietnamesisch zerlegt, Hindi, Polnisch.
    const namen = ['\u0639\u064E\u0644\u0650\u064A\u0651',
      'Nguye\u0302\u0303n', '\u0939\u093F\u0928\u094D\u0926\u0940',
      'Zo\u00EB', '\u0141ukasz'];
    for (const name of namen) {
      expect(bereinigeName(name)).toBe(name.normalize('NFC'));
    }
  });

  test('die Grenze gilt je Buchstabe, nicht für den ganzen Namen', () => {
    // Muhammad mit Vokalzeichen: vier Zeichen insgesamt, höchstens zwei je
    // Buchstabe. Alle müssen bleiben.
    const name = 'مُحَمَّد';
    expect(bereinigeName(name)).toBe(name.normalize('NFC'));
  });

  test('Steuerzeichen der Leserichtung werden entfernt (U+2066 bis U+2069)', () => {
    const name = '\u2066Anna\u2069 \u2067Ben\u2068';
    expect(bereinigeName(name)).toBe('Anna Ben');
  });
});

describe('ermittleEinladungsCode – verbindliche Prüfung', () => {
  test('macht aus erlaubten Schreibweisen die kanonische Form', () => {
    const schreibweisen = ['ABC234', 'abc234', 'ABC-234', ' abc 234 ',
      'a_b-c 234'];
    for (const eingabe of schreibweisen) {
      expect(ermittleEinladungsCode(eingabe)).toBe('ABC234');
    }
  });

  test('lehnt falsche Länge und nicht erlaubte Zeichen ab', () => {
    const falsch = ['', '   ', 'ABC23', 'ABC2345', 'ABC-2345', 'ABC0O1',
      'ABC.234', '​ABC234', '<b>ABC</b>', 'A'.repeat(1000)];
    for (const eingabe of falsch) {
      expect(ermittleEinladungsCode(eingabe)).toBeNull();
    }
  });

  test('lehnt falsche Typen ohne Umwandlung ab', () => {
    const tarnung = { toString: () => 'ABC234' };
    for (const wert of [null, undefined, 123456, ['ABC234'], tarnung]) {
      expect(ermittleEinladungsCode(wert)).toBeNull();
    }
  });
});

describe('Schemaprüfung der Ereignisse', () => {
  test('spiel:zug verlangt { type: "MOVE", pitIndex } mit 0 bis 5', () => {
    expect(istGueltig(EREIGNIS.ZUG, { type: 'MOVE', pitIndex: 0 })).toBe(true);
    expect(istGueltig(EREIGNIS.ZUG, { type: 'MOVE', pitIndex: 5 })).toBe(true);

    expect(istGueltig(EREIGNIS.ZUG, { type: 'MOVE', pitIndex: 6 })).toBe(false);
    const alsText = { type: 'MOVE', pitIndex: '3' };
    expect(istGueltig(EREIGNIS.ZUG, alsText)).toBe(false);
    expect(istGueltig(EREIGNIS.ZUG, { pitIndex: 3 })).toBe(false);
    expect(istGueltig(EREIGNIS.ZUG, { type: 'move', pitIndex: 3 })).toBe(false);
    expect(istGueltig(EREIGNIS.ZUG, { mulde: 3 })).toBe(false);
    expect(istGueltig(EREIGNIS.ZUG, {})).toBe(false);
    expect(istGueltig(EREIGNIS.ZUG, null)).toBe(false);
    expect(istGueltig(EREIGNIS.ZUG, [1])).toBe(false);
  });

  test('spiel:beitreten verlangt eine Zeichenkette als Name', () => {
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna' })).toBe(true);
    // wird zu "Spieler"
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: '' })).toBe(true);

    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 42 })).toBe(false);
    expect(istGueltig(EREIGNIS.BEITRETEN, {})).toBe(false);

    // Privates Spiel: `privat` und `code` sind freiwillig, aber typgeprüft.
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna', privat: true })).toBe(true);
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna', code: 'K7M2QX' })).toBe(true);
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna', privat: 'ja' })).toBe(false);
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna', code: 123456 })).toBe(false);
    expect(istGueltig(EREIGNIS.BEITRETEN, { name: 'Anna', code: ['K7M2QX'] })).toBe(false);
  });

  test('Abbrechen, Aufgabe und Revanche benötigen keine Daten; erneute Suche erlaubt Zusatzfelder', () => {
    expect(istGueltig(EREIGNIS.ABBRECHEN, undefined)).toBe(true);
    expect(istGueltig(EREIGNIS.AUFGEBEN, null)).toBe(true);
    expect(istGueltig(EREIGNIS.ERNEUT, { unfug: true })).toBe(true);
    expect(istGueltig(EREIGNIS.REVANCHE, undefined)).toBe(true);
  });

  test('spiel:erneut: der Name ist freiwillig, aber wenn, dann eine Zeichenkette', () => {
    expect(istGueltig(EREIGNIS.ERNEUT, { name: 'Anna' })).toBe(true);
    expect(istGueltig(EREIGNIS.ERNEUT, {})).toBe(true);

    expect(istGueltig(EREIGNIS.ERNEUT, { name: 42 })).toBe(false);
    expect(istGueltig(EREIGNIS.ERNEUT, null)).toBe(false);
    expect(istGueltig(EREIGNIS.ERNEUT, 'Anna')).toBe(false);
  });

  test('ein unbekanntes Ereignis gilt als ungültig', () => {
    expect(istGueltig('spiel:hack', { mulde: 1 })).toBe(false);
  });

  test('__proto__ in den Nutzdaten hat keine Wirkung', () => {
    // Es findet keine Objekt-Verschmelzung statt; gelesen werden nur die
    // benannten Felder `type` und `pitIndex`.
    const boesartig = JSON.parse(
      '{"type": "MOVE", "pitIndex": 2, "__proto__": {"gehackt": true}}',
    );

    expect(istGueltig(EREIGNIS.ZUG, boesartig)).toBe(true);
    expect({}.gehackt).toBeUndefined();
  });

  test('ein werfender Getter bringt die Prüfung nicht zum Absturz', () => {
    const boesartig = {
      type: 'MOVE',
      get pitIndex() { throw new Error('boom'); },
    };
    expect(istGueltig(EREIGNIS.ZUG, boesartig)).toBe(false);
  });
});

describe('Ratenbegrenzung', () => {
  test('lässt bis zur Grenze durch und bremst danach', () => {
    // Feste Uhr: Alle Ereignisse fallen in dasselbe Fenster, ohne dass der
    // Test eine Sekunde lang warten müsste.
    const begrenzer = erzeugeRatenbegrenzer(3, 1000, () => 1000);

    expect(begrenzer.erlaubt('a')).toBe(true);
    expect(begrenzer.erlaubt('a')).toBe(true);
    expect(begrenzer.erlaubt('a')).toBe(true);
    expect(begrenzer.erlaubt('a')).toBe(false);
    expect(begrenzer.erlaubt('a')).toBe(false);
  });

  test('beginnt im nächsten Fenster von vorn', () => {
    let jetzt = 1000;
    const begrenzer = erzeugeRatenbegrenzer(2, 1000, () => jetzt);

    begrenzer.erlaubt('a');
    begrenzer.erlaubt('a');
    expect(begrenzer.erlaubt('a')).toBe(false);

    jetzt += 1000;   // neues Fenster
    expect(begrenzer.erlaubt('a')).toBe(true);
  });

  test('zählt jede Verbindung getrennt', () => {
    const begrenzer = erzeugeRatenbegrenzer(1, 1000, () => 1000);

    expect(begrenzer.erlaubt('a')).toBe(true);
    expect(begrenzer.erlaubt('b')).toBe(true);   // b ist von a unbeeinflusst
    expect(begrenzer.erlaubt('a')).toBe(false);
  });

  test('vergisst getrennte Verbindungen', () => {
    const begrenzer = erzeugeRatenbegrenzer();

    begrenzer.erlaubt('a');
    expect(begrenzer.anzahl()).toBe(1);

    begrenzer.vergiss('a');
    expect(begrenzer.anzahl()).toBe(0);
  });
});
