/**
 * ids.js – Kennungen für Partien und Einladungen.
 *
 * Zieht zufällige Kennungen. Manager und Lobby prüfen vor der Vergabe,
 * ob sie schon benutzt werden; die Partiezuordnung bleibt serverseitig.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Spiel-ID
 *   == 2. Einladungscode
 *
 * Benutzt von: Manager und Lobby. Benutzt node:crypto und das gemeinsame
 * Protokoll.
 */

import { randomInt, randomUUID } from 'node:crypto';
import { CODE_ZEICHEN, GRENZEN } from '../../shared/protokoll.js';

// == 1. Spiel-ID =========================================================
// Eine Spiel-ID ist kein Zugangsschlüssel; handlers.js benutzt die Socket-Map.
export function neueSpielId() {
  return `g-${randomUUID().slice(0, 8)}`;
}

// == 2. Einladungscode ===================================================
// SCHUTZ: Der Einladungscode ist der Schlüssel zum privaten Warteplatz.
// randomInt liefert dafür kryptografischen Zufall statt Math.random.
export function neuerEinladungsCode() {
  let code = '';
  for (let i = 0; i < GRENZEN.CODE_LAENGE; i += 1) {
    code += CODE_ZEICHEN[randomInt(CODE_ZEICHEN.length)];
  }
  return code;
}
