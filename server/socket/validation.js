/**
 * Schemapruefung eingehender Nutzdaten (Konzept 7.8).
 *
 * Schicht 1 der Absturzsicherung: Falsche Nutzdaten kommen gar nicht erst bei
 * der Spiellogik an. Da keine Validierungsbibliothek hinzugefuegt werden darf
 * (Entscheidung E-8), ist das hier eine kleine eigene Pruefschicht – bewusst
 * klein genug, um im Code-Review vollstaendig erklaerbar zu sein.
 *
 * Das Modul ist frei von Socket.io-Bezuegen und deshalb direkt testbar.
 */

import { EREIGNIS, GRENZEN } from '../../shared/protokoll.js';

/** Hoechster Codepoint des C0-Steuerzeichenbereichs (0 bis 31). */
const LETZTES_C0_ZEICHEN = 31;

/** Codepoint von DEL. */
const DEL = 127;

/**
 * Entfernt alle Steuerzeichen aus einer Zeichenkette.
 *
 * Solche Zeichen haben in einem Spielernamen nichts zu suchen: Ein
 * Zeilenumbruch oder ein Nullbyte wuerde die Anzeige zerlegen, ohne selbst
 * sichtbar zu sein.
 *
 * Bewusst eine Schleife ueber Codepoints statt eines regulaeren Ausdrucks mit
 * Unicode-Escapes: Die Absicht ist so direkt ablesbar, und `for...of` iteriert
 * ueber vollstaendige Codepoints, zerschneidet also keine Emoji.
 */
function ohneSteuerzeichen(text) {
  let ergebnis = '';
  for (const zeichen of text) {
    const code = zeichen.codePointAt(0);
    if (code > LETZTES_C0_ZEICHEN && code !== DEL) {
      ergebnis += zeichen;
    }
  }
  return ergebnis;
}

/**
 * Ist der Wert ein einfaches Objekt?
 *
 * Arrays und `null` sind in JavaScript ebenfalls vom `typeof` her "object" und
 * muessen ausdruecklich ausgeschlossen werden.
 */
export const istObjekt = (wert) => typeof wert === 'object'
  && wert !== null
  && !Array.isArray(wert);

/**
 * Ganzzahl in einem Bereich?
 *
 * `Number.isInteger` schliesst "3" (Zeichenkette), 3.5, NaN, Infinity und
 * `null` gemeinsam aus. Auch ein Objekt mit eigener `valueOf`-Methode kommt
 * hier nicht durch, weil ueberhaupt keine Umwandlung stattfindet.
 */
export const istGanzzahlIm = (wert, min, max) => Number.isInteger(wert)
  && wert >= min
  && wert <= max;

/**
 * Macht aus beliebiger Eingabe einen anzeigbaren Spielernamen.
 *
 *   keine Zeichenkette  ->  'Spieler'
 *   Steuerzeichen       ->  entfernt
 *   Laenge              ->  auf 20 Zeichen gekuerzt
 *   danach leer         ->  'Spieler'
 *
 * HTML wird NICHT maskiert und muss es auch nicht: Der Client setzt Namen
 * ausschliesslich ueber `textContent`, nie ueber `innerHTML` (Konzept 6.2).
 * Ein Name wie `<b>Nico</b>` erscheint also woertlich – unschoen, aber
 * harmlos. Wuerde hier zusaetzlich maskiert, stuenden am Ende doppelt
 * maskierte Zeichen auf dem Bildschirm.
 */
export function saubererName(wert) {
  if (typeof wert !== 'string') return 'Spieler';

  const bereinigt = ohneSteuerzeichen(wert).trim().slice(0, GRENZEN.NAME_MAX);

  return bereinigt.length > 0 ? bereinigt : 'Spieler';
}

/**
 * Schema je Ereignis: liefert true, wenn die Nutzdaten brauchbar sind.
 *
 * Ereignisse ohne Nutzdaten (`abbrechen`, `aufgeben`, `erneut`) stehen
 * absichtlich mit in dieser Tabelle und akzeptieren alles: So bleibt die
 * Pruefung in `istGueltig` eine einzige Stelle ohne Sonderfaelle.
 */
export const SCHEMA = Object.freeze({
  // `privat` und `code` sind freiwillig. Der Code wird hier nur als
  // Zeichenkette geprueft: Ob er stimmt, entscheidet die Lobby – ein falscher
  // Code bekommt dort eine verstaendliche Meldung (siehe handlers.js).
  [EREIGNIS.BEITRETEN]: (d) => istObjekt(d)
    && typeof d.name === 'string'
    && (d.privat === undefined || typeof d.privat === 'boolean')
    && (d.code === undefined || typeof d.code === 'string'),
  [EREIGNIS.ZUG]: (d) => istObjekt(d)
    && istGanzzahlIm(d.mulde, GRENZEN.MULDE_MIN, GRENZEN.MULDE_MAX),
  [EREIGNIS.ABBRECHEN]: () => true,
  [EREIGNIS.AUFGEBEN]: () => true,
  [EREIGNIS.ERNEUT]: () => true,
  [EREIGNIS.REVANCHE]: () => true,
});

/**
 * Prueft Nutzdaten gegen das Schema eines Ereignisses.
 *
 * Ein unbekanntes Ereignis gilt als ungueltig. Socket.io ruft fuer nicht
 * registrierte Ereignisnamen zwar ohnehin keinen Handler auf; die Pruefung
 * steht hier, damit der Aufrufer sich darauf verlassen kann.
 */
export function istGueltig(ereignis, nutzdaten) {
  const pruefer = SCHEMA[ereignis];
  if (!pruefer) return false;

  try {
    return pruefer(nutzdaten) === true;
  } catch {
    // Ein Objekt mit einer werfenden Getter-Eigenschaft
    // (`{ get name() { throw ... } }`) darf die Pruefung nicht zum Absturz
    // bringen – es gilt schlicht als ungueltig.
    return false;
  }
}
