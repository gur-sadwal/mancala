/**
 * partie.js – Zustand einer einzelnen Partie.
 *
 * Speichert Kennungen und Namen, keine Socket-Objekte. Tests können eine
 * Partie deshalb ohne laufenden Server anlegen, lesen und beenden.
 *
 * Inhalt:
 *   == 1. Neue Partie
 *   == 2. Sitz und öffentlicher Spielstand
 *   == 3. Vorzeitiges Ende und Aktivität
 *
 * Benutzt von: Manager und Handler. Benutzt brett.js, engine.js und das
 * Protokoll.
 */

import { neuesBrett, SITZ_NAMEN } from './brett.js';
import { ergebnisVon } from './engine.js';
import { STATUS, GRUND } from '../../shared/protokoll.js';

// == 1. Neue Partie ======================================================
// Unten beginnt; die zufällige Sitzvergabe macht manager.js (starte).
export function neuePartie(id, spielerUnten, spielerOben) {
  return {
    id,
    status: STATUS.LAEUFT,
    brett: neuesBrett(),
    amZug: 'unten',
    zugNr: 0,
    spieler: {
      unten: { socketId: spielerUnten.socketId, name: spielerUnten.name },
      oben: { socketId: spielerOben.socketId, name: spielerOben.name },
    },
    ergebnis: null,
    letzteAktivitaet: Date.now(),
  };
}

// == 2. Sitz und öffentlicher Spielstand =================================
export function sitzVon(partie, socketId) {
  return SITZ_NAMEN.find((sitz) => partie.spieler[sitz].socketId === socketId)
    ?? null;
}

// SCHUTZ: Nur benötigte Felder senden, keine Socket-Kennungen oder Zeiten.
export function spielstandVon(partie) {
  return {
    spielId: partie.id,
    status: partie.status,
    brett: partie.brett,
    amZug: partie.amZug,
    zugNr: partie.zugNr,
    spieler: {
      unten: { name: partie.spieler.unten.name },
      oben: { name: partie.spieler.oben.name },
    },
  };
}

// == 3. Vorzeitiges Ende und Aktivität ===================================
/**
 * Beendet ohne Restabrechnung; die Häuser behalten den Stand beim Abbruch.
 * @param {object} partie
 * @param {string} grund Wert aus GRUND
 * @param {string|null} sieger Gegner bei Aufgabe/Trennung, sonst keine Wertung
 */
export function beendeVorzeitig(partie, grund, sieger = null) {
  partie.status = grund === GRUND.AUFGEGEBEN
    ? STATUS.BEENDET : STATUS.ABGEBROCHEN;

  partie.ergebnis = { ...ergebnisVon(partie.brett, grund), sieger };

  return partie.ergebnis;
}

// In laufenden Partien verlängern nur gültige Züge die Frist.
export function beruehre(partie) {
  partie.letzteAktivitaet = Date.now();
}
