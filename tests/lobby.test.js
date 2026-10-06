/**
 * Tests der Warteschlange und der Partieverwaltung (Konzept 7.4 bis 7.6).
 *
 * Beide Module kennen Sockets nur als Zeichenketten – deshalb laesst sich
 * hier ein vollstaendiges Matchmaking ohne laufenden Server durchspielen.
 */

import { erzeugeLobby, REVANCHE_FRIST_MS } from '../server/spiel/lobby.js';
import { erzeugeManager } from '../server/spiel/manager.js';
import { sitzVon, spielstandVon, beendeVorzeitig } from '../server/spiel/partie.js';
import { STATUS, FEHLER, GRUND, GRENZEN, CODE_ZEICHEN } from '../shared/protokoll.js';
import { gesamtSumme } from '../server/spiel/brett.js';

describe('Warteschlange', () => {
  test('nimmt Spieler in der Reihenfolge ihres Eintreffens auf', () => {
    const lobby = erzeugeLobby();

    expect(lobby.beitreten('a', 'Anna')).toEqual({ ok: true, position: 1 });
    expect(lobby.beitreten('b', 'Ben')).toEqual({ ok: true, position: 2 });
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

  test('entfernt Eintraege und meldet, ob etwas entfernt wurde', () => {
    const lobby = erzeugeLobby();
    lobby.beitreten('a', 'Anna');

    expect(lobby.entferne('a')).toBe(true);
    expect(lobby.entferne('a')).toBe(false);   // zweiter Aufruf faellt ins Leere
    expect(lobby.anzahl()).toBe(0);
  });

  test('gibt das aelteste Paar heraus und entfernt es dabei', () => {
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

  test('rueckt Positionen nach, wenn jemand die Schlange verlaesst', () => {
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

  test('raeumt alte Eintraege ab (NFA-10)', () => {
    const lobby = erzeugeLobby();
    lobby.beitreten('a', 'Anna');

    // maxAlter 0 heisst: alles ist zu alt.
    expect(lobby.raeumeAuf(0)).toEqual(['a']);
    expect(lobby.anzahl()).toBe(0);
  });

  test('zwei Spieler mit gleichem Namen werden ganz normal gepaart', () => {
    const lobby = erzeugeLobby();

    // Der Name ist nur eine Anzeige – unterschieden wird nach der Socket-Kennung.
    expect(lobby.beitreten('a', 'Anna').ok).toBe(true);
    expect(lobby.beitreten('b', 'Anna').ok).toBe(true);
    expect(lobby.naechstesPaar().map((e) => e.socketId)).toEqual(['a', 'b']);
  });
});

describe('Privates Spiel', () => {
  test('legt einen Warteplatz mit einem 6-stelligen Code an', () => {
    const lobby = erzeugeLobby();

    const ergebnis = lobby.erstellePrivat('a', 'Anna');

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.einladung).toHaveLength(GRENZEN.CODE_LAENGE);
    // Jedes Zeichen stammt aus dem erlaubten Alphabet (kein 0/O, 1/I).
    for (const zeichen of ergebnis.einladung) {
      expect(CODE_ZEICHEN).toContain(zeichen);
    }
    expect(lobby.enthaelt('a')).toBe(true);
    expect(lobby.anzahl()).toBe(1);
  });

  test('der private Platz steht NICHT in der oeffentlichen Warteschlange', () => {
    const lobby = erzeugeLobby();
    lobby.erstellePrivat('a', 'Anna');
    lobby.beitreten('b', 'Ben');

    // Anna darf nicht mit einem zufaelligen Spieler gepaart werden.
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

  test('Abbrechen oder Verbindungsabbruch loescht den privaten Platz', () => {
    const lobby = erzeugeLobby();
    const { einladung } = lobby.erstellePrivat('a', 'Anna');

    expect(lobby.entferne('a')).toBe(true);
    expect(lobby.enthaelt('a')).toBe(false);
    // Der Link ist damit ungueltig.
    expect(lobby.nimmPrivat(einladung)).toBeNull();
  });

  test('raeumt alte private Plaetze ab (NFA-10)', () => {
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

    expect(lobby.wuenscheRevanche('a')).toEqual({ status: 'WARTET', gegnerId: 'b' });
    expect(lobby.wuenscheRevanche('b')).toEqual({ status: 'START', paar: [anna, ben] });

    // Danach ist das Revanche-Buch fuer beide leer.
    expect(lobby.wuenscheRevanche('a')).toEqual({ status: 'KEINE' });
  });

  test('zweimal druecken startet nichts – es braucht den Gegner', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben);

    lobby.wuenscheRevanche('a');
    expect(lobby.wuenscheRevanche('a')).toEqual({ status: 'WARTET', gegnerId: 'b' });
  });

  test('ohne vorherige Partie gibt es keine Revanche', () => {
    const lobby = erzeugeLobby();
    expect(lobby.wuenscheRevanche('x')).toEqual({ status: 'KEINE' });
  });

  test('wer geht, laesst die Revanche verfallen – der Gegner wird genannt', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben);

    expect(lobby.vergissRevanche('a')).toBe('b');
    // Bens Knopf fuehrt jetzt ins Leere und meldet das auch.
    expect(lobby.wuenscheRevanche('b')).toEqual({ status: 'KEINE' });
    expect(lobby.vergissRevanche('niemand')).toBeNull();
  });

  test('spielt jemand schon gegen einen anderen, verfaellt die alte Revanche', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben);
    // Anna hat inzwischen gegen Carl gespielt.
    lobby.merkeRevanche(anna, carl);

    expect(lobby.wuenscheRevanche('b')).toEqual({ status: 'KEINE' });
    expect(lobby.vergissRevanche('a')).toBe('c');
  });
});

describe('Revanche-Frist', () => {
  const anna = { socketId: 'a', name: 'Anna' };
  const ben = { socketId: 'b', name: 'Ben' };

  // Alle Zeiten sind ausgedacht (Millisekunden) und werden hineingereicht –
  // so muss kein Test 17 Sekunden warten.
  const ENDE = 1000;

  test('die Frist ist die angezeigte Zeit plus Kulanz', () => {
    expect(GRENZEN.REVANCHE_SEKUNDEN).toBe(15);
    expect(REVANCHE_FRIST_MS).toBe(17000);
  });

  test('ohne offene Revanche laeuft nichts ab', () => {
    const lobby = erzeugeLobby();
    expect(lobby.abgelaufeneRevanchen(ENDE)).toEqual([]);
  });

  test('vor dem Fristende bleibt die Revanche bestehen', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben, ENDE);

    expect(lobby.abgelaufeneRevanchen(ENDE + REVANCHE_FRIST_MS - 1)).toEqual([]);
    expect(lobby.wuenscheRevanche('a')).toEqual({ status: 'WARTET', gegnerId: 'b' });
  });

  test('zum Fristende verfallen beide Eintraege – auch ein schon gedrueckter', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben, ENDE);
    lobby.wuenscheRevanche('a');   // Anna wollte, Ben hat nicht reagiert

    expect(lobby.abgelaufeneRevanchen(ENDE + REVANCHE_FRIST_MS).sort()).toEqual(['a', 'b']);
  });

  test('nach Ablauf startet ein spaeter Wunsch nichts mehr', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben, ENDE);
    lobby.abgelaufeneRevanchen(ENDE + REVANCHE_FRIST_MS);

    expect(lobby.wuenscheRevanche('a')).toEqual({ status: 'KEINE' });
    expect(lobby.wuenscheRevanche('b')).toEqual({ status: 'KEINE' });
  });

  test('jede abgelaufene Revanche wird genau einmal gemeldet', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben, ENDE);

    expect(lobby.abgelaufeneRevanchen(ENDE + REVANCHE_FRIST_MS)).toHaveLength(2);
    expect(lobby.abgelaufeneRevanchen(ENDE + 2 * REVANCHE_FRIST_MS)).toEqual([]);
  });

  test('nach dem Start der Revanche laeuft nichts mehr ab', () => {
    const lobby = erzeugeLobby();
    lobby.merkeRevanche(anna, ben, ENDE);
    lobby.wuenscheRevanche('a');
    lobby.wuenscheRevanche('b');   // START – das Revanche-Buch ist leer

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

  test('wer anfaengt, ist zufaellig – kein fester Vorteil fuer den Ersten', () => {
    const manager = erzeugeManager();
    const DURCHLAEUFE = 2000;
    let annaBeginnt = 0;

    for (let i = 0; i < DURCHLAEUFE; i += 1) {
      // Anna wird immer als ERSTE uebergeben – so, als haette sie zuerst
      // gewartet oder das private Spiel erstellt.
      const partie = manager.starte(
        { socketId: `a${i}`, name: 'Anna' },
        { socketId: `b${i}`, name: 'Ben' },
      );
      if (partie.spieler[partie.amZug].name === 'Anna') annaBeginnt += 1;
    }

    // Erwartet ist etwa die Haelfte. Die Spanne 40 bis 60 % ist so breit,
    // dass ein fairer Zufall praktisch nie herausfaellt (rund 9
    // Standardabweichungen). Ein fest eingebauter Vorteil – Anna beginnt
    // immer (100 %) oder nie (0 %) – faellt dagegen sofort auf.
    expect(annaBeginnt).toBeGreaterThan(DURCHLAEUFE * 0.4);
    expect(annaBeginnt).toBeLessThan(DURCHLAEUFE * 0.6);
  });

  test('gleiche Namen stoeren nicht: der Sitz haengt an der Socket-Kennung', () => {
    const manager = erzeugeManager();
    const partie = manager.starte(
      { socketId: 'a', name: 'Anna' },
      { socketId: 'b', name: 'Anna' },
    );

    // Beide heissen Anna, sitzen aber auf verschiedenen Plaetzen.
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

  test('findet die Partie ueber beide Socket-Kennungen', () => {
    const { manager, partie } = mitPartie();

    expect(manager.holeNachSocket('a').id).toBe(partie.id);
    expect(manager.holeNachSocket('b').id).toBe(partie.id);
    expect(manager.holeNachId(partie.id)).toBe(partie);
    expect(manager.holeNachSocket('unbekannt')).toBeNull();
  });

  test('kennt den Sitz zu jedem Socket', () => {
    const { manager, partie } = mitPartie();

    expect(manager.sitzVonSocket('a')).toBe(sitzVon(partie, 'a'));
    expect(['unten', 'oben']).toContain(manager.sitzVonSocket('a'));
    expect(manager.sitzVonSocket('unbekannt')).toBeNull();
  });

  test('haelt mehrere Partien voneinander getrennt (NFA-02)', () => {
    const manager = erzeugeManager();
    const eins = manager.starte({ socketId: 'a', name: 'A' }, { socketId: 'b', name: 'B' });
    const zwei = manager.starte({ socketId: 'c', name: 'C' }, { socketId: 'd', name: 'D' });

    expect(eins.id).not.toBe(zwei.id);
    expect(manager.holeNachSocket('c').id).toBe(zwei.id);
    expect(manager.anzahl()).toBe(2);
  });

  test('entfernt beim Aufloesen beide Eintraege aus beiden Maps', () => {
    const { manager, partie } = mitPartie();

    manager.entferne(partie.id);

    expect(manager.anzahl()).toBe(0);
    expect(manager.holeNachSocket('a')).toBeNull();
    expect(manager.holeNachSocket('b')).toBeNull();
    expect(manager.holeNachId(partie.id)).toBeNull();
  });

  test('raeumt erledigte und verwaiste Partien ab', () => {
    const { manager, partie } = mitPartie();

    // maxRuhe 0: die Partie gilt als zu lange untaetig.
    const entfernt = manager.raeumeAuf(0);

    expect(entfernt).toHaveLength(1);
    expect(entfernt[0].id).toBe(partie.id);
    expect(manager.anzahl()).toBe(0);
  });
});

describe('Spielstand nach aussen', () => {
  test('enthaelt keine Socket-Kennungen (Konzept 6.3)', () => {
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

  test('enthaelt Brett, Zugrecht und Namen', () => {
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
  test('Aufgabe macht den Gegner zum Sieger, unabhaengig vom Punktestand', () => {
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

  test('ein Verbindungsabbruch gilt als Abbruch, nicht als regulaeres Ende', () => {
    const manager = erzeugeManager();
    const partie = manager.starte(
      { socketId: 'a', name: 'Anna' },
      { socketId: 'b', name: 'Ben' },
    );

    beendeVorzeitig(partie, GRUND.GEGNER_WEG, 'oben');

    expect(partie.status).toBe(STATUS.ABGEBROCHEN);
    expect(partie.ergebnis.grund).toBe(GRUND.GEGNER_WEG);
  });
});
