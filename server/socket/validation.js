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

import { EREIGNIS, GRENZEN, bereinigeName } from '../../shared/protokoll.js';

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
 *   keine Zeichenkette     ->  'Spieler'
 *   Steuerzeichen, < und > ->  entfernt  } die gemeinsame Namensregel
 *   Laenge                 ->  auf 20    } bereinigeName (shared/protokoll.js)
 *   danach leer            ->  'Spieler'
 *
 * Der Browser hat den Namen mit derselben Regel schon vor dem Absenden
 * geprueft (client/js/anmelden.js). Hier gilt sie VERBINDLICH: Ein
 * manipulierter Client kann seine Pruefung einfach weglassen – dem Client
 * wird nie vertraut.
 *
 * Gegen Cross-Site-Scripting gibt es damit zwei Absicherungen: Der Client
 * setzt Namen ausschliesslich ueber `textContent`, nie ueber `innerHTML`
 * (Konzept 6.2), und ohne `<` und `>` kann ein Name gar kein HTML-Tag
 * enthalten.
 */
export function saubererName(wert) {
  if (typeof wert !== 'string') return 'Spieler';

  const bereinigt = bereinigeName(wert);

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
