/**
 * manager.js – alle laufenden Partien.
 *
 * Sucht eine Partie anhand ihrer Socket-Kennung. Die Zuordnung bleibt auf
 * dem Server; eine mitgeschickte Spiel-ID entscheidet niemals über den Zugriff.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Zustand und Schnittstelle
 *   == 2. Partie starten
 *   == 3. Partie eines Sockets
 *   == 4. Partie auflösen
 *   == 5. Fristen, Anzahl und Herunterfahren
 *
 * Benutzt von: Handler, Express und Gateway. Benutzt partie.js und util/ids.js.
 */

import { neueSpielId } from '../util/ids.js';
import { neuePartie } from './partie.js';
import { STATUS } from '../../shared/protokoll.js';

// == 1. Zustand und Schnittstelle ========================================
export function erzeugeManager() {
  const partien = new Map();

  const zuordnung = new Map();

  return {
    starte,
    holeNachSocket,
    entferne,
    findeRuhendePartien,
    anzahl,
    alle,
  };

  // == 2. Partie starten =================================================
  // Implementationsentscheidung: Unten beginnt. Die Sitze werden ausgelost.
  function starte(a, b) {
    const [unten, oben] = Math.random() < 0.5 ? [a, b] : [b, a];

    // SCHUTZ: Eine zufällige Kollision darf keine laufende Partie ersetzen.
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

  // == 3. Partie eines Sockets ===========================================
  // SCHUTZ: Die Zuordnung kommt aus dieser Map und nicht vom Client.
  function holeNachSocket(socketId) {
    const spielId = zuordnung.get(socketId);
    if (!spielId) return null;
    return partien.get(spielId) ?? null;
  }

  // == 4. Partie auflösen ================================================
  function entferne(spielId) {
    const partie = partien.get(spielId);
    if (!partie) return null;

    // Auch bei kaputten Spielerfeldern alle Zuordnungen dieser Partie
    // entfernen.
    for (const [socketId, id] of zuordnung) {
      if (id === spielId) zuordnung.delete(socketId);
    }
    partien.delete(spielId);

    return partie;
  }

  // == 5. Fristen, Anzahl und Herunterfahren =============================
  // Entfernt nichts: Erst handlers.js benachrichtigt beide und verlässt den
  // Raum.
  function findeRuhendePartien(maxRuheMs, jetzt = Date.now()) {
    const grenze = jetzt - maxRuheMs;
    const ruhend = [];

    for (const partie of partien.values()) {
      const abgelaufen = partie.letzteAktivitaet <= grenze;
      const erledigt = partie.status === STATUS.BEENDET
        || partie.status === STATUS.ABGEBROCHEN;

      if (abgelaufen || erledigt) ruhend.push(partie);
    }
    return ruhend;
  }

  function anzahl() {
    return partien.size;
  }

  function alle() {
    return [...partien.values()];
  }
}
