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
import { neuePartie } from './partie.js';
import { STATUS } from '../../shared/protokoll.js';

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

  return {
    starte,
    holeNachSocket,
    entferne,
    findeRuhendePartien,
    anzahl,
    alle,
  };

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

    // Zwei gleiche IDs sind extrem unwahrscheinlich, aber nicht unmoeglich –
    // dann einfach eine neue ziehen (wie beim Einladungscode in lobby.js).
    let id = neueSpielId();
    while (partien.has(id)) {
      id = neueSpielId();
    }
    const partie = neuePartie(id, unten, oben);

    partien.set(id, partie);
    zuordnung.set(unten.socketId, id);
    zuordnung.set(oben.socketId, id);

    return partie;
  }

  /** Partie zu einer Kennung. */

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
   * Partien, in denen seit `maxRuheMs` kein Zug kam – oder die schon beendet,
   * aber noch nicht aufgeloest sind (nur nach einem Fehler moeglich).
   *
   * Entfernt nichts: Beendet werden sie in handlers.js (raeumeAuf), damit
   * beide Spieler eine Nachricht bekommen und den Raum verlassen.
   *
   * @param {number} jetzt  aktuelle Zeit; im Test frei wählbar
   * @returns {object[]} die gefundenen Partien
   */
  function findeRuhendePartien(maxRuheMs, jetzt = Date.now()) {
    const grenze = jetzt - maxRuheMs;
    const ruhend = [];

    for (const partie of partien.values()) {
      // Einschliessende Grenze, aus demselben Grund wie in lobby.js.
      const abgelaufen = partie.letzteAktivitaet <= grenze;
      const erledigt = partie.status === STATUS.BEENDET
        || partie.status === STATUS.ABGEBROCHEN;

      if (abgelaufen || erledigt) ruhend.push(partie);
    }
    return ruhend;
  }

  /** Anzahl verwalteter Partien – fuer `/gesundheit` (Konzept 7.3). */
  function anzahl() {
    return partien.size;
  }

  /** Alle Partien – fuer das geordnete Herunterfahren (SIGTERM, Konzept 7.7). */
  function alle() {
    return [...partien.values()];
  }


}
