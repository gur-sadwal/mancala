/**
 * validation.js – Nutzdaten vor der Spiellogik prüfen.
 *
 * Prüft Typen und Felder ohne Umwandlung. Müll wird zurückgewiesen;
 * Namen werden mit derselben Regel wie im Browser bereinigt.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Prüfhilfen
 *   == 2. Spielernamen
 *   == 3. Schema je Ereignis
 *   == 4. Schema anwenden
 *
 * Benutzt von: Handler. Benutzt shared/protokoll.js; braucht keinen Server.
 */

import { EREIGNIS, GRENZEN, bereinigeName } from '../../shared/protokoll.js';

// == 1. Prüfhilfen =======================================================
// EINSTELLBAR: Ersatzname, wenn keine sichtbaren Zeichen übrig bleiben.
const ERSATZ_NAME = 'Spieler';

// SCHUTZ: typeof allein lässt auch null und Arrays als object durch.
export const istObjekt = (wert) => typeof wert === 'object'
  && wert !== null
  && !Array.isArray(wert);

// SCHUTZ: Keine Umwandlung; auch "3", NaN und Infinity werden abgelehnt.
export const istGanzzahlZwischen = (wert, min, max) => Number.isInteger(wert)
  && wert >= min
  && wert <= max;

// == 2. Spielernamen =====================================================
// Auf dem Server verbindlich. Der Browser kann seine Vorprüfung weglassen.
export function ermittleSpielername(wert) {
  if (typeof wert !== 'string') return ERSATZ_NAME;

  const bereinigt = bereinigeName(wert);
  return bereinigt.length > 0 ? bereinigt : ERSATZ_NAME;
}

// == 3. Schema je Ereignis ===============================================
// Abbrechen, Aufgeben und Revanche brauchen keine Nutzdaten.
// Beim erneuten Suchen ist das Objekt Pflicht, der Name darin freiwillig.
const SCHEMA = Object.freeze({
  [EREIGNIS.BEITRETEN]: (d) => istObjekt(d)
    && typeof d.name === 'string'
    && (d.privat === undefined || typeof d.privat === 'boolean')
    && (d.code === undefined || typeof d.code === 'string'),
  [EREIGNIS.ZUG]: (d) => istObjekt(d)
    && istGanzzahlZwischen(d.mulde, GRENZEN.MULDE_MIN, GRENZEN.MULDE_MAX),
  [EREIGNIS.ABBRECHEN]: () => true,
  [EREIGNIS.AUFGEBEN]: () => true,

  [EREIGNIS.ERNEUT]: (d) => istObjekt(d)
    && (d.name === undefined || typeof d.name === 'string'),
  [EREIGNIS.REVANCHE]: () => true,
});

// == 4. Schema anwenden ==================================================
export function istGueltig(ereignis, nutzdaten) {
  const pruefer = SCHEMA[ereignis];
  if (!pruefer) return false;

  try {
    return pruefer(nutzdaten) === true;
  } catch {
    // SCHUTZ: Auch ein Getter, der beim Lesen wirft, ist ungültige Eingabe.
    return false;
  }
}
