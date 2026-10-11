/**
 * kollision.test.js – Wiederholte Kennungen bei Lobby und Manager.
 *
 * Die ID-Attrappe liefert absichtlich doppelte Werte. Sie muss vor den
 * Modulen geladen werden, damit echte Zufälle die Prüfung nicht beeinflussen.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

/** Liefert der Reihe nach die vorgegebenen Werte, danach immer den letzten. */
function folge(...werte) {
  let i = 0;
  return () => {
    const wert = werte[Math.min(i, werte.length - 1)];
    i += 1;
    return wert;
  };
}

import.meta.jest.unstable_mockModule('../server/util/ids.js', () => ({
  neueSpielId: folge('g-gleich', 'g-gleich', 'g-anders'),
  neuerEinladungsCode: folge('AAAAAA', 'AAAAAA', 'BBBBBB'),
}));

const { erzeugeLobby } = await import('../server/spiel/lobby.js');
const { erzeugeManager } = await import('../server/spiel/manager.js');

// == 2. Testfälle ===========================================================

describe('Kollision bei der Spiel-ID', () => {
  test('eine schon vergebene Spiel-ID überschreibt keine laufende Partie', () => {
    const manager = erzeugeManager();

    const erste = manager.starte({ socketId: 'a', name: 'A' }, { socketId: 'b', name: 'B' });
    const zweite = manager.starte({ socketId: 'c', name: 'C' }, { socketId: 'd', name: 'D' });

    expect(erste.id).toBe('g-gleich');
    expect(zweite.id).toBe('g-anders');
    expect(manager.anzahl()).toBe(2);
    expect(manager.holeNachSocket('a')).toBe(erste);
  });
});

describe('Kollision beim Einladungscode', () => {
  test('ein schon vergebener Code wird nicht ein zweites Mal vergeben', () => {
    const lobby = erzeugeLobby();

    const erster = lobby.erstellePrivat('a', 'Anna');
    const zweiter = lobby.erstellePrivat('b', 'Ben');

    expect(erster.einladung).toBe('AAAAAA');
    expect(zweiter.einladung).toBe('BBBBBB');
    expect(lobby.nimmPrivat('AAAAAA').socketId).toBe('a');
  });
});
