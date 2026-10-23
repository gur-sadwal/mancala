/**
 * ids.js – Kennungen für Partien und Einladungen.
 *
 * Zieht zufällige Kennungen. Ob eine schon vergeben ist, prüfen Manager und
 * Lobby selbst.
 *
 * Inhalt:
 *   == 1. Spiel-ID
 *   == 2. Einladungscode
 *
 * Benutzt von: Manager und Lobby. Benutzt node:crypto und das gemeinsame
 * Protokoll.
 */

import { randomInt, randomUUID } from 'node:crypto';
import { CODE_ZEICHEN, GRENZEN } from '../../shared/protokoll.js';

// == 1. Spiel-ID =========================================================
// Acht Hexzeichen reichen: Die Spiel-ID ist kein Zugangsschlüssel, denn
// welcher Socket zu welcher Partie gehört, weiß nur der Manager.
export function neueSpielId() {
  return `g-${randomUUID().slice(0, 8)}`;
}

// == 2. Einladungscode ===================================================
// SCHUTZ: Anders als die Spiel-ID öffnet dieser Code einen privaten
// Warteplatz. Deshalb randomInt mit kryptografischem Zufall statt Math.random.
export function neuerEinladungsCode() {
  let code = '';
  for (let i = 0; i < GRENZEN.CODE_LAENGE; i += 1) {
    code += CODE_ZEICHEN[randomInt(CODE_ZEICHEN.length)];
  }
  return code;
}
