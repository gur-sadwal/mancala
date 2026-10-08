/**
 * Zustandsobjekt einer Partie und seine Uebergaenge (Konzept 4.7).
 *
 * Dieses Modul kennt Sockets nur als undurchsichtige Kennungen (`socketId` als
 * String), nicht als Objekte (Konzept 3.4). Damit laesst sich eine vollstaendige
 * Partie in einem Test durchspielen, ohne einen Server zu starten.
 */

import { neuesBrett, SITZ_NAMEN } from './brett.js';
import { ergebnisVon } from './engine.js';
import { STATUS, GRUND } from '../../shared/protokoll.js';

/**
 * Legt eine neue, laufende Partie an.
 *
 * Der Sitz `unten` beginnt immer. Damit der Vorteil des ersten Zuges nicht
 * staendig demselben Spieler zufaellt, wird die SITZVERGABE zufaellig
 * vorgenommen – das passiert in der Lobby (Konzept 6.4), nicht hier.
 *
 * @param {string} id
 * @param {{socketId: string, name: string}} spielerUnten
 * @param {{socketId: string, name: string}} spielerOben
 */
export function neuePartie(id, spielerUnten, spielerOben) {
  return {
    id,
    status: STATUS.LAEUFT,
    brett: neuesBrett(),
    amZug: 'unten',           // Sitz `unten` eroeffnet
    zugNr: 0,
    spieler: {
      unten: { socketId: spielerUnten.socketId, name: spielerUnten.name },
      oben: { socketId: spielerOben.socketId, name: spielerOben.name },
    },
    ergebnis: null,
    letzteAktivitaet: Date.now(),
  };
}

/**
 * Welchen Sitz belegt dieser Socket in dieser Partie?
 *
 * @returns {'unten'|'oben'|null}
 */
export function sitzVon(partie, socketId) {
  return SITZ_NAMEN.find((sitz) => partie.spieler[sitz].socketId === socketId) ?? null;
}

/**
 * Der nach aussen sichtbare Teil einer Partie (Konzept 6.3).
 *
 * Bewusst NICHT enthalten: Socket-Kennungen, IP-Adressen, interne
 * Zeitstempel. Was der Client nicht braucht, bekommt er auch nicht – ein
 * manipulierter Client soll aus dem Datenstrom nichts ueber andere Spieler
 * lernen koennen.
 */
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

/**
 * Beendet eine Partie vorzeitig, z. B. bei Aufgabe oder Verbindungsabbruch.
 *
 * Im Unterschied zum regulaeren Ende (Engine, Konzept 5.6) findet hier KEINE
 * Restabrechnung statt. Das Brett bleibt stehen, wie es war; die Punkte sind
 * der Stand beim Abbruch.
 *
 * @param {object} partie
 * @param {string} grund  ein Wert aus GRUND (shared/protokoll.js)
 * @param {'unten'|'oben'|null} sieger  vom Aufrufer vorgegeben; null = keine Wertung
 */
export function beendeVorzeitig(partie, grund, sieger = null) {
  // Eine Aufgabe ist ein echtes Ende (BEENDET), alles andere ein Abbruch.
  partie.status = grund === GRUND.AUFGEGEBEN ? STATUS.BEENDET : STATUS.ABGEBROCHEN;

  // Den Sieger gibt der Aufrufer vor (Aufgabe: der Gegner; Verbindungsabbruch:
  // der Gebliebene) – unabhängig vom Punktestand. Ohne Angabe gibt es keinen
  // Sieger: interner Fehler, Serverende und „zu lange kein Zug“ werden nicht
  // gewertet.
  partie.ergebnis = { ...ergebnisVon(partie.brett, grund), sieger };
  beruehre(partie);

  return partie.ergebnis;
}

/** Merkt sich, dass gerade etwas passiert ist – Grundlage des Aufraeumens (7.6). */
export function beruehre(partie) {
  partie.letzteAktivitaet = Date.now();
}
