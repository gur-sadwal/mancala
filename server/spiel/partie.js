/**
 * Zustandsobjekt einer Partie und seine Uebergaenge (Konzept 4.7).
 *
 * Dieses Modul kennt Sockets nur als undurchsichtige Kennungen (`socketId` als
 * String), nicht als Objekte (Konzept 3.4). Damit laesst sich eine vollstaendige
 * Partie in einem Test durchspielen, ohne einen Server zu starten.
 */

import { neuesBrett } from './brett.js';
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
      unten: { socketId: spielerUnten.socketId, name: spielerUnten.name, verbunden: true },
      oben: { socketId: spielerOben.socketId, name: spielerOben.name, verbunden: true },
    },
    ergebnis: null,
    begonnenAm: Date.now(),
    letzteAktivitaet: Date.now(),
  };
}

/**
 * Welchen Sitz belegt dieser Socket in dieser Partie?
 *
 * @returns {'unten'|'oben'|null}
 */
export function sitzVon(partie, socketId) {
  if (partie.spieler.unten.socketId === socketId) return 'unten';
  if (partie.spieler.oben.socketId === socketId) return 'oben';
  return null;
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
 * Beendet eine Partie vorzeitig: Aufgabe, Verbindungsabbruch, interner Fehler.
 *
 * Im Unterschied zum regulaeren Ende (Engine, Konzept 5.6) findet hier KEINE
 * Restabrechnung statt. Das Brett bleibt stehen, wie es war; gewertet wird der
 * Stand, und der Grund macht kenntlich, dass die Partie nicht ausgespielt
 * wurde.
 *
 * @param {object} partie
 * @param {string} grund      GRUND.GEGNER_WEG | AUFGEGEBEN | INTERNER_FEHLER | SERVER_ENDE
 * @param {'unten'|'oben'|null} sieger  bei Aufgabe/Verbindungsabbruch: der verbliebene Spieler
 */
export function beendeVorzeitig(partie, grund, sieger = null) {
  // Eine Aufgabe ist ein regulaeres Partieende. Alles andere gilt als Abbruch:
  // Beim Verbindungsabbruch gewinnt trotzdem der verbliebene Spieler (der
  // Aufrufer uebergibt ihn als `sieger`); bei internem Fehler oder
  // Serverende gibt es keinen Sieger, gewertet wird nur der Stand.
  partie.status = grund === GRUND.AUFGEGEBEN ? STATUS.BEENDET : STATUS.ABGEBROCHEN;

  const ergebnis = ergebnisVon(partie.brett, grund);
  // Bei Aufgabe gewinnt der verbliebene Spieler unabhaengig vom Punktestand.
  partie.ergebnis = sieger ? { ...ergebnis, sieger } : ergebnis;
  partie.letzteAktivitaet = Date.now();

  return partie.ergebnis;
}

/** Merkt sich, dass gerade etwas passiert ist – Grundlage des Aufraeumens (7.6). */
export function beruehre(partie) {
  partie.letzteAktivitaet = Date.now();
}
