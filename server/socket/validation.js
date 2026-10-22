/**
 * validation.js – Nutzdaten vor der Spiellogik prüfen.
 *
 * Prüft Typen und Felder der Ereignisse mit Nutzdaten ohne Umwandlung.
 * Namen und Raumcodes werden mit derselben Regel wie im Browser bereinigt.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Prüfhilfen
 *   == 2. Spielernamen
 *   == 3. Raumcodes
 *   == 4. Schema je Ereignis
 *   == 5. Schema anwenden
 *
 * Benutzt von: Handler. Benutzt shared/protokoll.js; braucht keinen Server.
 */

import {
  EREIGNIS, GRENZEN, ZUG_TYP, bereinigeName, normalisiereCode, hatCodeForm,
} from '../../shared/protokoll.js';

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
// Verbindlich ist diese Prüfung: Ein veränderter Browser kann seine
// Vorprüfung einfach weglassen.
export function ermittleSpielername(wert) {
  if (typeof wert !== 'string') return ERSATZ_NAME;

  const bereinigt = bereinigeName(wert);
  return bereinigt.length > 0 ? bereinigt : ERSATZ_NAME;
}

// == 3. Raumcodes ========================================================
// SCHUTZ: Verbindlich ist auch hier der Server. Die Lobby sieht nur die
// kanonische Form, wie util/ids.js sie vergibt; alles andere ergibt null.
export function ermittleEinladungsCode(wert) {
  if (typeof wert !== 'string') return null;

  const code = normalisiereCode(wert);
  return hatCodeForm(code) ? code : null;
}

// == 4. Schema je Ereignis ===============================================
// Abbrechen, Aufgeben und Revanche brauchen keine Nutzdaten.
// Beim erneuten Suchen ist das Objekt Pflicht, der Name darin freiwillig.
const SCHEMA = Object.freeze({
  [EREIGNIS.BEITRETEN]: (d) => istObjekt(d)
    && typeof d.name === 'string'
    && (d.privat === undefined || typeof d.privat === 'boolean')
    && (d.code === undefined || typeof d.code === 'string'),
  [EREIGNIS.ZUG]: (d) => istObjekt(d)
    && d.type === ZUG_TYP
    && istGanzzahlZwischen(d.pitIndex, GRENZEN.MULDE_MIN, GRENZEN.MULDE_MAX),
  [EREIGNIS.ABBRECHEN]: () => true,
  [EREIGNIS.AUFGEBEN]: () => true,

  [EREIGNIS.ERNEUT]: (d) => istObjekt(d)
    && (d.name === undefined || typeof d.name === 'string'),
  [EREIGNIS.REVANCHE]: () => true,
});

// == 5. Schema anwenden ==================================================
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
