/**
 * Verwaltung aller laufenden Partien (Konzept 7.6).
 *
 * Zwei Nachschlagewerke, damit sowohl "welche Partie hat diese Kennung" als
 * auch "welche Partie gehoert zu diesem Socket" in konstanter Zeit beantwortet
 * werden. Letzteres ist der Grund, warum ein `disconnect` bei 15 laufenden
 * Partien kein Durchsuchen aller Partien ausloest.
 *
 * Der Manager kennt Socket.io nicht: Er verwaltet Zustand und liefert
 * Ergebnisse zurueck. Gesendet wird ausschliesslich in `handlers.js`
 * (Konzept 3.4).
 */

import { neueSpielId } from '../util/ids.js';
import { neuePartie, sitzVon } from './partie.js';
import { STATUS } from '../../shared/protokoll.js';

/** Partien ohne Aktivitaet seit dieser Zeit werden aufgeraeumt. */
export const PARTIE_MAX_RUHE_MS = 60 * 60 * 1000;   // 60 Minuten

/** Warteschlangeneintraege aelter als diese Zeit werden entfernt. */
export const WARTESCHLANGE_MAX_ALTER_MS = 30 * 60 * 1000;  // 30 Minuten

/** Abstand, in dem die Aufraeumroutine laeuft. */
export const AUFRAEUM_INTERVALL_MS = 5 * 60 * 1000;  // 5 Minuten

/**
 * Erzeugt die Partieverwaltung.
 *
 * Fabrikfunktion aus demselben Grund wie bei der Lobby: Jeder Test bekommt
 * eine frische, leere Verwaltung, ohne dass Zustand aus einem vorherigen
 * Test durchschlaegt.
 */
export function erzeugeManager() {
  /** @type {Map<string, object>} spielId -> Partie */
  const partien = new Map();

  /** @type {Map<string, string>} socketId -> spielId */
  const zuordnung = new Map();

  /**
   * Legt eine Partie aus zwei Wartenden an.
   *
   * Die Sitzvergabe erfolgt ZUFAELLIG, damit der Vorteil des ersten Zuges
   * nicht immer demselben Spieler zufaellt (Konzept 6.4). Der Sitz `unten`
   * beginnt.
   *
   * @param {{socketId: string, name: string}} a
   * @param {{socketId: string, name: string}} b
   */
  function starte(a, b) {
    const [unten, oben] = Math.random() < 0.5 ? [a, b] : [b, a];

    const id = neueSpielId();
    const partie = neuePartie(id, unten, oben);

    partien.set(id, partie);
    zuordnung.set(unten.socketId, id);
    zuordnung.set(oben.socketId, id);

    return partie;
  }

  /** Partie zu einer Kennung. */
  function holeNachId(spielId) {
    return partien.get(spielId) ?? null;
  }

  /**
   * Partie zu einem Socket – der Weg, den jeder Handler geht.
   *
   * Die Zuordnung kommt aus dieser serverseitigen Map, NICHT aus einer vom
   * Client mitgeschickten Spiel-ID (Konzept 7.5). Damit gibt es keine
   * Nachricht, mit der ein manipulierter Client in eine fremde Partie
   * hineinschreiben koennte.
   */
  function holeNachSocket(socketId) {
    const spielId = zuordnung.get(socketId);
    if (!spielId) return null;
    return partien.get(spielId) ?? null;
  }

  /** Welchen Sitz belegt dieser Socket in seiner Partie? */
  function sitzVonSocket(socketId) {
    const partie = holeNachSocket(socketId);
    return partie ? sitzVon(partie, socketId) : null;
  }

  /**
   * Entfernt eine Partie vollstaendig aus beiden Maps.
   *
   * Genau das ist der Unterschied zwischen einem Server, der einen Vormittag
   * durchhaelt, und einem, der langsam volllaeuft (NFA-10). Das Verlassen des
   * Socket.io-Raums geschieht im Aufrufer, weil dafuer die Socket-Objekte
   * gebraucht werden.
   */
  function entferne(spielId) {
    const partie = partien.get(spielId);
    if (!partie) return null;

    zuordnung.delete(partie.spieler.unten.socketId);
    zuordnung.delete(partie.spieler.oben.socketId);
    partien.delete(spielId);

    return partie;
  }

  /**
   * Aufraeumintervall-Arbeit: Partien ohne Aktivitaet entfernen.
   *
   * Rueckversicherung fuer den Fall, dass ein Aufraeumpfad doch einmal
   * uebersehen wurde (Konzept 7.6).
   *
   * @returns {object[]} die entfernten Partien
   */
  function raeumeAuf(maxRuheMs = PARTIE_MAX_RUHE_MS) {
    const grenze = Date.now() - maxRuheMs;
    const entfernt = [];

    for (const [id, partie] of partien) {
      // Einschliessende Grenze, aus demselben Grund wie in lobby.js.
      const abgelaufen = partie.letzteAktivitaet <= grenze;
      const erledigt = partie.status === STATUS.BEENDET
        || partie.status === STATUS.ABGEBROCHEN;

      if (abgelaufen || erledigt) {
        entferne(id);
        entfernt.push(partie);
      }
    }
    return entfernt;
  }

  /** Anzahl verwalteter Partien – fuer `/gesundheit` (Konzept 7.3). */
  function anzahl() {
    return partien.size;
  }

  /** Alle Partien – fuer das geordnete Herunterfahren (SIGTERM, Konzept 7.7). */
  function alle() {
    return [...partien.values()];
  }

  return {
    starte,
    holeNachId,
    holeNachSocket,
    sitzVonSocket,
    entferne,
    raeumeAuf,
    anzahl,
    alle,
  };
}
