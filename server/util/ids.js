/**
 * Erzeugung von Partie-Kennungen (Konzept 7.5).
 *
 * Die Kennung muss zufaellig und nicht erratbar sein, weil sie zugleich der
 * Name des Socket.io-Raums ist. Sie ist allerdings KEIN Sicherheitsmerkmal:
 * Die Zuordnung Socket -> Partie kommt aus einer serverseitigen Map, nie aus
 * einer vom Client mitgeschickten Kennung. Selbst wer eine fremde Kennung
 * erriete, koennte damit nichts anfangen.
 */

import { randomInt, randomUUID } from 'node:crypto';
import { CODE_ZEICHEN, GRENZEN } from '../../shared/protokoll.js';

/** Erzeugt eine Partie-Kennung der Form `g-7f3a2b1c`. */
export function neueSpielId() {
  return `g-${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

/**
 * Erzeugt einen Einladungscode fuer ein privates Spiel, z. B. `K7M2QX`.
 *
 * `randomInt` aus node:crypto statt `Math.random()`: Der Code ist der
 * "Schluessel" zum Warteplatz und soll nicht vorhersagbar sein. Bei 31
 * Zeichen und 6 Stellen gibt es rund 887 Millionen Moeglichkeiten.
 */
export function neuerEinladungsCode() {
  let code = '';
  for (let i = 0; i < GRENZEN.CODE_LAENGE; i += 1) {
    code += CODE_ZEICHEN[randomInt(CODE_ZEICHEN.length)];
  }
  return code;
}
