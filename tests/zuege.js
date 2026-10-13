/**
 * zuege.js – Testhelfer: alle erlaubten Mulden eines Sitzes.
 *
 * Die Zufallsspiele in engine.test.js und spiel.test.js wählen daraus ihre
 * Züge. Der Server selbst braucht diese Liste nicht; er prüft nur die eine
 * Mulde, die der Browser schickt.
 *
 * Inhalt:
 *   == 1. Mögliche Züge
 */

import { pruefeZug } from '../server/spiel/engine.js';
import { GRENZEN } from '../shared/protokoll.js';

// == 1. Mögliche Züge =======================================================

/** Liefert die besetzten eigenen Mulden, wenn der Sitz am Zug ist. */
export function moeglicheZuege(partie, sitz) {
  const zuege = [];
  for (let n = GRENZEN.MULDE_MIN; n <= GRENZEN.MULDE_MAX; n += 1) {
    if (pruefeZug(partie, sitz, n).ok) zuege.push(n);
  }
  return zuege;
}
