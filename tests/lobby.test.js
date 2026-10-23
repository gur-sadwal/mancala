/**
 * lobby.test.js – Warteschlange, Einladungen und Partieverwaltung.
 *
 * Sockets sind hier Kennungen; die Uhrzeit wird vorgegeben. Dadurch
 * lassen sich Paarung, Revanche und Fristen ohne Netzwerk prüfen.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { REVANCHE_STATUS, erzeugeLobby, REVANCHE_FRIST_MS } from '../server/spiel/lobby.js';
import { erzeugeManager } from '../server/spiel/manager.js';
import { sitzVon, spielstandVon, beendeVorzeitig } from '../server/spiel/partie.js';
import { STATUS, FEHLER, GRUND, GRENZEN, CODE_ZEICHEN } from '../shared/protokoll.js';
import { gesamtSumme } from '../server/spiel/brett.js';

// == 2. Testfälle ===========================================================

describe('Warteschlange', () => {
  test('nimmt Spieler in der Reihenfolge ihres Eintreffens auf', () => {
    const lobby = erzeugeLobby();

    expect(lobby.beitreten('a', 'Anna')).toEqual({ ok: true });
    expect(lobby.beitreten('b', 'Ben')).toEqual({ ok: true });
    expect(lobby.anzahl()).toBe(2);
  });

  test('lehnt einen doppelten Beitritt desselben Sockets ab', () => {
    const lobby = erzeugeLobby();
    lobby.beitreten('a', 'Anna');

    const zweiter = lobby.beitreten('a', 'Anna');
    expect(zweiter.ok).toBe(false);
    expect(zweiter.code).toBe(FEHLER.BEREITS_IN_WARTESCHLANGE);
    expect(lobby.anzahl()).toBe(1);
  });

  test('entfernt Einträge und meldet, ob etwas entfernt wurde', () => {
    const lobby = erzeugeLobby();
    lobby.beitreten('a', 'Anna');

    expect(lobby.entferne('a')).toBe(true);
    expect(lobby.entferne('a')).toBe(false);   // zweiter Aufruf fällt ins Leere
    expect(lobby.anzahl()).toBe(0);
  });

  test('gibt das älteste Paar heraus und entfernt es dabei', () => {
    const lobby = erzeugeLobby();
    lobby.beitreten('a', 'Anna');
    lobby.beitreten('b', 'Ben');
    lobby.beitreten('c', 'Cem');

    const paar = lobby.naechstesPaar();

    expect(paar.map((e) => e.socketId)).toEqual(['a', 'b']);
    expect(lobby.anzahl()).toBe(1);       // Cem wartet weiter
    expect(lobby.enthaelt('c')).toBe(true);
  });

  test('liefert kein Paar, solange nur einer wartet', () => {
    const lobby = erzeugeLobby();
    lobby.beitreten('a', 'Anna');
    expect(lobby.naechstesPaar()).toBeNull();
  });

  test('rückt Positionen nach, wenn jemand die Schlange verlässt', () => {
    const lobby = erzeugeLobby();
    lobby.beitreten('a', 'Anna');
    lobby.beitreten('b', 'Ben');
    lobby.beitreten('c', 'Cem');

    lobby.entferne('a');

    expect(lobby.positionen()).toEqual([
      { socketId: 'b', position: 1 },
      { socketId: 'c', position: 2 },
    ]);
  });

  test('räumt alte Einträge ab', () => {
    const lobby = erzeugeLobby();
    lobby.beitreten('a', 'Anna');

    // maxAlter 0 heißt: alles ist zu alt.
    expect(lobby.raeumeAuf(0)).toEqual(['a']);
    expect(lobby.anzahl()).toBe(0);
  });

  test('zwei Spieler mit gleichem Namen werden ganz normal gepaart', () => {
    const lobby = erzeugeLobby();

    // Gleiche Anzeigenamen dürfen verschiedene Spieler nicht zusammenlegen:
    // Die Socket-Kennung unterscheidet ihre Warteplätze.
    expect(lobby.beitreten('a', 'Anna').ok).toBe(true);
    expect(lobby.beitreten('b', 'Anna').ok).toBe(true);
    expect(lobby.naechstesPaar().map((e) => e.socketId)).toEqual(['a', 'b']);
  });
});

describe('Wartefrist (die Zeit wird hereingereicht)', () => {
  const FRIST = 1000;

  test('genau an der Frist wird entfernt, knapp davor nicht', () => {
    const lobby = erzeugeLobby();
    lobby.beitreten('a', 'Anna', 0);
    lobby.beitreten('b', 'Ben', 500);

    expect(lobby.raeumeAuf(FRIST, FRIST - 1)).toEqual([]);
    expect(lobby.raeumeAuf(FRIST, FRIST)).toEqual(['a']);
    expect(lobby.enthaelt('b')).toBe(true);
  });

  test('auch ein privater Link läuft zur Frist ab', () => {
    const lobby = erzeugeLobby();
    const { einladung } = lobby.erstellePrivat('a', 'Anna', 0);

    expect(lobby.raeumeAuf(FRIST, FRIST)).toEqual(['a']);
    expect(lobby.nimmPrivat(einladung)).toBeNull();
  });
});

describe('Privates Spiel', () => {
  test('legt einen Warteplatz mit einem 6-stelligen Code an', () => {
    const lobby = erzeugeLobby();

    const ergebnis = lobby.erstellePrivat('a', 'Anna');

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.einladung).toHaveLength(GRENZEN.CODE_LAENGE);
    // Jedes Zeichen stammt aus dem erlaubten Alphabet (ohne 0, O, 1, I und L).
    for (const zeichen of ergebnis.einladung) {
      expect(CODE_ZEICHEN).toContain(zeichen);
    }
    expect(lobby.enthaelt('a')).toBe(true);
    expect(lobby.anzahl()).toBe(1);
  });

  test('der private Platz steht nicht in der öffentlichen Warteschlange', () => {
    const lobby = erzeugeLobby();
    lobby.erstellePrivat('a', 'Anna');
    lobby.beitreten('b', 'Ben');

    // Anna darf nicht mit einem zufälligen Spieler gepaart werden.
    expect(lobby.naechstesPaar()).toBeNull();
    expect(lobby.positionen()).toEqual([{ socketId: 'b', position: 1 }]);
  });

  test('nimmPrivat liefert den Ersteller genau einmal', () => {
    const lobby = erzeugeLobby();
    const { einladung } = lobby.erstellePrivat('a', 'Anna');

    expect(lobby.nimmPrivat(einladung)).toMatchObject({ socketId: 'a', name: 'Anna' });
    // Ein zweiter Spieler mit demselben Link kommt nicht mehr hinein.
    expect(lobby.nimmPrivat(einladung)).toBeNull();
    expect(lobby.anzahl()).toBe(0);
  });

  test('ein unbekannter Code liefert null', () => {
    const lobby = erzeugeLobby();
    lobby.erstellePrivat('a', 'Anna');

    expect(lobby.nimmPrivat('XXXXXX')).toBeNull();
    expect(lobby.nimmPrivat('')).toBeNull();
    expect(lobby.anzahl()).toBe(1);
  });

  test('wer schon wartet, kann kein zweites Spiel erstellen oder anstellen', () => {
    const lobby = erzeugeLobby();
    lobby.erstellePrivat('a', 'Anna');

    expect(lobby.erstellePrivat('a', 'Anna')).toEqual({
      ok: false,
      code: FEHLER.BEREITS_IN_WARTESCHLANGE,
    });
    expect(lobby.beitreten('a', 'Anna').ok).toBe(false);
  });

  test('Abbrechen oder Verbindungsabbruch löscht den privaten Platz', () => {
    const lobby = erzeugeLobby();
    const { einladung } = lobby.erstellePrivat('a', 'Anna');

    expect(lobby.entferne('a')).toBe(true);
    expect(lobby.enthaelt('a')).toBe(false);
    // Der Link ist damit ungültig.
    expect(lobby.nimmPrivat(einladung)).toBeNull();
  });

  test('räumt alte private Plätze ab', () => {
    const lobby = erzeugeLobby();
    lobby.erstellePrivat('a', 'Anna');

    expect(lobby.raeumeAuf(0)).toEqual(['a']);
    expect(lobby.anzahl()).toBe(0);
  });
});

describe('Revanche nach einer Partie', () => {
  const anna = { socketId: 'a', name: 'Anna' };
  const ben = { socketId: 'b', name: 'Ben' };
  const carl = { socketId: 'c', name: 'Carl' };

  test('der erste Wunsch wartet, der zweite startet die Partie', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben);

    expect(lobby.wuenscheRevanche('a')).toEqual({ status: REVANCHE_STATUS.WARTET, gegnerId: 'b' });
    expect(lobby.wuenscheRevanche('b')).toEqual({ status: REVANCHE_STATUS.START, paar: [anna, ben] });

    // Erst der Handler vergisst das Paar, wenn die Partie wirklich startet.
    lobby.vergissRevanche('a');
    expect(lobby.wuenscheRevanche('a')).toEqual({ status: REVANCHE_STATUS.KEINE });
  });

  test('ein weiterer Klick nach START liefert START erneut, bis das Paar vergessen ist', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben);
    lobby.wuenscheRevanche('a');
    lobby.wuenscheRevanche('b');

    expect(lobby.wuenscheRevanche('a'))
      .toEqual({ status: REVANCHE_STATUS.START, paar: [ben, anna] });
  });

  test('zweimal drücken startet nichts – es braucht den Gegner', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben);

    lobby.wuenscheRevanche('a');
    expect(lobby.wuenscheRevanche('a')).toEqual({ status: REVANCHE_STATUS.SCHON_GEWUENSCHT });
  });

  test('ohne vorherige Partie gibt es keine Revanche', () => {
    const lobby = erzeugeLobby();
    expect(lobby.wuenscheRevanche('x')).toEqual({ status: REVANCHE_STATUS.KEINE });
  });

  test('wer geht, lässt die Revanche verfallen – der Gegner wird genannt', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben);

    expect(lobby.vergissRevanche('a')).toBe('b');
    // Bens Knopf führt jetzt ins Leere und meldet das auch.
    expect(lobby.wuenscheRevanche('b')).toEqual({ status: REVANCHE_STATUS.KEINE });
    expect(lobby.vergissRevanche('niemand')).toBeNull();
  });

  test('spielt jemand schon gegen einen anderen, verfällt die alte Revanche', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben);
    // Anna hat inzwischen gegen Carl gespielt.
    lobby.merkeRevanche(anna, carl);

    expect(lobby.wuenscheRevanche('b')).toEqual({ status: REVANCHE_STATUS.KEINE });
    expect(lobby.vergissRevanche('a')).toBe('c');
  });

  test('wer geht, nennt keinen alten Gegner, der schon eine neue Revanche hat', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben);
    // Ben hat inzwischen gegen Carl gespielt – sein Eintrag zeigt auf Carl.
    lobby.merkeRevanche(ben, carl);

    expect(lobby.vergissRevanche('a')).toBeNull();
    expect(lobby.wuenscheRevanche('b')).toEqual({ status: REVANCHE_STATUS.WARTET, gegnerId: 'c' });
  });
});

describe('Revanche-Frist direkt beim Wunsch', () => {
  test('ein Wunsch genau an der Grenze startet keine verspätete Partie', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche({ socketId: 'a' }, { socketId: 'b' }, 1000);
    expect(lobby.wuenscheRevanche('a', 1000 + REVANCHE_FRIST_MS - 1).status)
      .toBe(REVANCHE_STATUS.WARTET);
    expect(lobby.wuenscheRevanche('b', 1000 + REVANCHE_FRIST_MS).status)
      .toBe(REVANCHE_STATUS.ABGELAUFEN);
    expect(lobby.wuenscheRevanche('a', 1000 + REVANCHE_FRIST_MS).status)
      .toBe(REVANCHE_STATUS.KEINE);
  });

  test('ein Wunsch nach Fristende nennt den Gegner', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche({ socketId: 'a' }, { socketId: 'b' }, 1000);

    expect(lobby.wuenscheRevanche('a', 1000 + REVANCHE_FRIST_MS))
      .toEqual({ status: REVANCHE_STATUS.ABGELAUFEN, gegnerId: 'b' });
    // Beide Einträge sind weg; der Takt meldet nichts doppelt.
    expect(lobby.abgelaufeneRevanchen(1000 + REVANCHE_FRIST_MS)).toEqual([]);
  });
});

describe('Revanche-Frist im Prüftakt', () => {
  const anna = { socketId: 'a', name: 'Anna' };
  const ben = { socketId: 'b', name: 'Ben' };

  // Alle Zeiten sind ausgedacht (Millisekunden) und werden hineingereicht –
  // so muss kein Test 17 Sekunden warten.
  const ENDE = 1000;

  test('die Frist ist die angezeigte Zeit plus Kulanz', () => {
    expect(GRENZEN.REVANCHE_SEKUNDEN).toBe(15);
    expect(REVANCHE_FRIST_MS).toBe(17000);
  });

  test('ohne offene Revanche läuft nichts ab', () => {
    const lobby = erzeugeLobby();
    expect(lobby.abgelaufeneRevanchen(ENDE)).toEqual([]);
  });

  test('vor dem Fristende bleibt die Revanche bestehen', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben, ENDE);

    expect(lobby.abgelaufeneRevanchen(ENDE + REVANCHE_FRIST_MS - 1)).toEqual([]);
    expect(lobby.wuenscheRevanche('a', ENDE)).toEqual({ status: REVANCHE_STATUS.WARTET, gegnerId: 'b' });
  });

  test('zum Fristende verfallen beide Einträge – auch ein schon gedrückter', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben, ENDE);
    lobby.wuenscheRevanche('a', ENDE);   // Anna wollte, Ben hat nicht reagiert

    expect(lobby.abgelaufeneRevanchen(ENDE + REVANCHE_FRIST_MS).sort()).toEqual(['a', 'b']);
  });

  test('nach Ablauf startet ein später Wunsch nichts mehr', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben, ENDE);
    lobby.abgelaufeneRevanchen(ENDE + REVANCHE_FRIST_MS);

    expect(lobby.wuenscheRevanche('a', ENDE)).toEqual({ status: REVANCHE_STATUS.KEINE });
    expect(lobby.wuenscheRevanche('b', ENDE)).toEqual({ status: REVANCHE_STATUS.KEINE });
  });

  test('jede abgelaufene Revanche wird genau einmal gemeldet', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben, ENDE);

    expect(lobby.abgelaufeneRevanchen(ENDE + REVANCHE_FRIST_MS)).toHaveLength(2);
    expect(lobby.abgelaufeneRevanchen(ENDE + 2 * REVANCHE_FRIST_MS)).toEqual([]);
  });

  test('nach dem Start der Revanche läuft nichts mehr ab', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben, ENDE);
    lobby.wuenscheRevanche('a', ENDE);
    lobby.wuenscheRevanche('b', ENDE);   // START
    lobby.vergissRevanche('a');          // der Handler vergisst das Paar nach dem Start

    expect(lobby.abgelaufeneRevanchen(ENDE + REVANCHE_FRIST_MS)).toEqual([]);
  });
});

describe('Partieverwaltung', () => {
  /** Legt Manager und eine Partie aus zwei Wartenden an. */
  function mitPartie() {
    const manager = erzeugeManager();
    const partie = manager.starte(
      { socketId: 'a', name: 'Anna' },
      { socketId: 'b', name: 'Ben' },
    );
    return { manager, partie };
  }

  test('wer anfängt, ist zufällig – kein fester Vorteil für den Ersten', () => {
    const manager = erzeugeManager();
    const DURCHLAEUFE = 2000;
    let annaBeginnt = 0;

    for (let i = 0; i < DURCHLAEUFE; i += 1) {
      // Anna wird immer zuerst übergeben – so, als hätte sie zuerst
      // gewartet oder das private Spiel erstellt.
      const partie = manager.starte(
        { socketId: `a${i}`, name: 'Anna' },
        { socketId: `b${i}`, name: 'Ben' },
      );
      if (partie.spieler[partie.amZug].name === 'Anna') annaBeginnt += 1;
    }

    // Die breite Spanne erkennt eine feste Bevorzugung, ohne einen
    // exakten Zufallsanteil zu verlangen. Sie beweist keine perfekte Fairness.
    expect(annaBeginnt).toBeGreaterThan(DURCHLAEUFE * 0.4);
    expect(annaBeginnt).toBeLessThan(DURCHLAEUFE * 0.6);
  });

  test('gleiche Namen stören nicht: der Sitz hängt an der Socket-Kennung', () => {
    const manager = erzeugeManager();
    const partie = manager.starte(
      { socketId: 'a', name: 'Anna' },
      { socketId: 'b', name: 'Anna' },
    );

    // Beide heißen Anna, sitzen aber auf verschiedenen Plätzen.
    expect([sitzVon(partie, 'a'), sitzVon(partie, 'b')].sort()).toEqual(['oben', 'unten']);
    expect(manager.holeNachSocket('b')).toBe(partie);
  });

  test('verteilt beide Spieler auf die beiden Sitze', () => {
    const { partie } = mitPartie();

    const namen = [partie.spieler.unten.name, partie.spieler.oben.name].sort();
    expect(namen).toEqual(['Anna', 'Ben']);

    const ids = [partie.spieler.unten.socketId, partie.spieler.oben.socketId].sort();
    expect(ids).toEqual(['a', 'b']);
  });

  test('startet mit dem korrekten Brett und dem Sitz unten am Zug', () => {
    const { partie } = mitPartie();

    expect(partie.status).toBe(STATUS.LAEUFT);
    expect(partie.amZug).toBe('unten');
    expect(partie.zugNr).toBe(0);
    expect(gesamtSumme(partie.brett)).toBe(48);
  });

  test('findet die Partie über beide Socket-Kennungen', () => {
    const { manager, partie } = mitPartie();

    expect(manager.holeNachSocket('a').id).toBe(partie.id);
    expect(manager.holeNachSocket('b').id).toBe(partie.id);
    expect(manager.holeNachSocket('unbekannt')).toBeNull();
  });

  test('kennt den Sitz zu jedem Socket', () => {
    const { manager, partie } = mitPartie();

    expect(sitzVon(manager.holeNachSocket('a'), 'a')).toBe(sitzVon(partie, 'a'));
    expect(['unten', 'oben']).toContain(sitzVon(manager.holeNachSocket('a'), 'a'));
    expect(sitzVon(partie, 'unbekannt')).toBeNull();
  });

  test('hält mehrere Partien voneinander getrennt', () => {
    const manager = erzeugeManager();
    const eins = manager.starte({ socketId: 'a', name: 'A' }, { socketId: 'b', name: 'B' });
    const zwei = manager.starte({ socketId: 'c', name: 'C' }, { socketId: 'd', name: 'D' });

    expect(eins.id).not.toBe(zwei.id);
    expect(manager.holeNachSocket('c').id).toBe(zwei.id);
    expect(manager.anzahl()).toBe(2);
  });

  test('liefert alle Partien – für das Herunterfahren', () => {
    const manager = erzeugeManager();
    const eins = manager.starte({ socketId: 'a', name: 'A' }, { socketId: 'b', name: 'B' });
    const zwei = manager.starte({ socketId: 'c', name: 'C' }, { socketId: 'd', name: 'D' });

    expect(manager.alle()).toEqual([eins, zwei]);
  });

  test('ein fremder Socket hat in der Partie keinen Sitz', () => {
    const { partie } = mitPartie();

    expect(sitzVon(partie, 'fremd')).toBeNull();
  });

  test('entfernt beim Auflösen beide Einträge aus beiden Maps', () => {
    const { manager, partie } = mitPartie();

    manager.entferne(partie.id);

    expect(manager.anzahl()).toBe(0);
    expect(manager.holeNachSocket('a')).toBeNull();
    expect(manager.holeNachSocket('b')).toBeNull();
  });

  test('eine unbekannte Spiel-ID zu entfernen ändert nichts', () => {
    const { manager } = mitPartie();

    expect(() => manager.entferne('g-gibt-es-nicht')).not.toThrow();
    expect(manager.anzahl()).toBe(1);
  });

  test('findet ruhende Partien genau ab der Frist, ohne sie zu entfernen', () => {
    const { manager, partie } = mitPartie();
    partie.letzteAktivitaet = 1000;

    expect(manager.findeRuhendePartien(500, 1499)).toEqual([]);
    expect(manager.findeRuhendePartien(500, 1500)).toEqual([partie]);
    // Erst der Handler entfernt die Partie und benachrichtigt beide Spieler.
    expect(manager.anzahl()).toBe(1);
  });

  test('findet auch beendete, aber noch nicht aufgelöste Partien', () => {
    const { manager, partie } = mitPartie();
    partie.status = STATUS.ABGEBROCHEN;

    expect(manager.findeRuhendePartien(60000, partie.letzteAktivitaet)).toEqual([partie]);
  });
});

describe('Spielstand nach außen', () => {
  test('enthält keine internen Socket-Kennungen', () => {
    const manager = erzeugeManager();
    const partie = manager.starte(
      { socketId: 'geheim-a', name: 'Anna' },
      { socketId: 'geheim-b', name: 'Ben' },
    );

    const text = JSON.stringify(spielstandVon(partie));

    expect(text).not.toContain('geheim-a');
    expect(text).not.toContain('geheim-b');
    expect(text).not.toContain('socketId');
    expect(text).toContain('Anna');
  });

  test('enthält Brett, Zugrecht und Namen', () => {
    const manager = erzeugeManager();
    const partie = manager.starte(
      { socketId: 'a', name: 'Anna' },
      { socketId: 'b', name: 'Ben' },
    );
    const stand = spielstandVon(partie);

    expect(stand.brett).toEqual(partie.brett);
    expect(stand.amZug).toBe('unten');
    expect(stand.spieler.unten).toHaveProperty('name');
  });
});

describe('vorzeitiges Partieende', () => {
  test('Aufgabe macht den Gegner zum Sieger, unabhängig vom Punktestand', () => {
    const manager = erzeugeManager();
    const partie = manager.starte(
      { socketId: 'a', name: 'Anna' },
      { socketId: 'b', name: 'Ben' },
    );

    // Sitz oben liegt vorne, gibt aber auf.
    partie.brett[0][0] = 10;
    partie.brett[1][6] = 2;
    partie.brett[1][0] = 0;
    partie.brett[1][1] = 0;
    partie.brett[1][2] = 0;

    const ergebnis = beendeVorzeitig(partie, GRUND.AUFGEGEBEN, 'unten');

    expect(ergebnis.sieger).toBe('unten');
    expect(ergebnis.grund).toBe(GRUND.AUFGEGEBEN);
    expect(partie.status).toBe(STATUS.BEENDET);
  });

  test('ein Verbindungsabbruch gilt als Abbruch, nicht als reguläres Ende', () => {
    const manager = erzeugeManager();
    const partie = manager.starte(
      { socketId: 'a', name: 'Anna' },
      { socketId: 'b', name: 'Ben' },
    );

    beendeVorzeitig(partie, GRUND.GEGNER_WEG, 'oben');

    expect(partie.status).toBe(STATUS.ABGEBROCHEN);
    expect(partie.ergebnis.grund).toBe(GRUND.GEGNER_WEG);
  });

  test.each([GRUND.INTERNER_FEHLER, GRUND.SERVER_ENDE, GRUND.ZU_LANGE_KEIN_ZUG])(
    'ohne Wertung (%s) gibt es keinen Sieger – auch nicht nach Punkten',
    (grund) => {
      const manager = erzeugeManager();
      const partie = manager.starte(
        { socketId: 'a', name: 'Anna' },
        { socketId: 'b', name: 'Ben' },
      );
      // Oben führt 3:0 (Summe bleibt 48).
      partie.brett[0][0] = 3;
      partie.brett[0][1] = 1;

      const ergebnis = beendeVorzeitig(partie, grund);

      expect(ergebnis.sieger).toBeNull();
      expect(ergebnis.punkte).toEqual({ unten: 0, oben: 3 });
      expect(partie.status).toBe(STATUS.ABGEBROCHEN);
    },
  );
});

describe('Manager: Speicher beim Auflösen freigeben', () => {
  test('alle angelegten Maps sind danach leer, auch die Socket-Zuordnung', () => {
    const echteMap = globalThis.Map;
    const maps = [];
    const konstruktor = import.meta.jest.spyOn(globalThis, 'Map').mockImplementation(() => {
      const map = new echteMap();
      maps.push(map);
      return map;
    });
    let manager;
    try {
      manager = erzeugeManager();
    } finally {
      konstruktor.mockRestore();
    }
    const partie = manager.starte({ socketId: 'a', name: 'A' }, { socketId: 'b', name: 'B' });
    expect(maps.some((map) => map.size > 0)).toBe(true);

    manager.entferne(partie.id);

    expect(maps.every((map) => map.size === 0)).toBe(true);
  });
});

describe('Obergrenzen für Warteplätze und Partien', () => {
  test('eine volle Lobby lehnt weitere Warteplätze mit SERVER_VOLL ab', () => {
    const lobby = erzeugeLobby({ wartendeMax: 2 });
    expect(lobby.erstellePrivat('a', 'Anna').ok).toBe(true);
    expect(lobby.erstellePrivat('b', 'Ben').ok).toBe(true);

    expect(lobby.erstellePrivat('c', 'Cem'))
      .toEqual({ ok: false, code: FEHLER.SERVER_VOLL });
    expect(lobby.beitreten('c', 'Cem'))
      .toEqual({ ok: false, code: FEHLER.SERVER_VOLL });
    expect(lobby.anzahl()).toBe(2);
  });

  test('wer sofort einen Gegner findet, braucht keinen neuen Platz', () => {
    const lobby = erzeugeLobby({ wartendeMax: 2 });
    lobby.beitreten('a', 'Anna');
    lobby.erstellePrivat('b', 'Ben');

    expect(lobby.beitreten('c', 'Cem')).toEqual({ ok: true });
    expect(lobby.naechstesPaar().map((e) => e.socketId)).toEqual(['a', 'c']);
  });

  test('ein freigewordener Platz lässt sich wieder belegen', () => {
    const lobby = erzeugeLobby({ wartendeMax: 1 });
    lobby.erstellePrivat('a', 'Anna');
    expect(lobby.beitreten('b', 'Ben').ok).toBe(false);

    lobby.entferne('a');
    expect(lobby.beitreten('b', 'Ben')).toEqual({ ok: true });
  });

  test('der Beitritt über einen Link braucht keinen freien Platz', () => {
    const lobby = erzeugeLobby({ wartendeMax: 1 });
    const { einladung } = lobby.erstellePrivat('a', 'Anna');

    expect(lobby.nimmPrivat(einladung).socketId).toBe('a');
  });

  test('ohne Angabe nimmt die Lobby mindestens 99 private Plätze an', () => {
    const lobby = erzeugeLobby();
    for (let i = 0; i < 99; i += 1) {
      expect(lobby.erstellePrivat(`p${i}`, 'P').ok).toBe(true);
    }
    expect(lobby.anzahl()).toBe(99);
  });

  test('der Manager meldet, wann keine weitere Partie mehr passt', () => {
    const manager = erzeugeManager({ partienMax: 1 });
    expect(manager.istVoll()).toBe(false);

    const partie = manager.starte({ socketId: 'a', name: 'A' },
      { socketId: 'b', name: 'B' });
    expect(manager.istVoll()).toBe(true);

    manager.entferne(partie.id);
    expect(manager.istVoll()).toBe(false);
  });
});
