/**
 * Kollisionen: Was passiert, wenn der Zufall zweimal dieselbe Kennung zieht?
 *
 * Der Zufall lässt sich nicht erzwingen. Deshalb wird server/util/ids.js hier
 * durch eine Attrappe ersetzt, die absichtlich erst zweimal denselben Wert
 * liefert. Die Attrappe muss angemeldet sein, BEVOR Lobby und Manager geladen
 * werden – darum die Importe mit `await import(…)` statt oben in der Datei.
 */

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
