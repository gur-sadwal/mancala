/**
 * gateway.js – Socket.io an den HTTP-Server anschließen.
 *
 * Registriert neue Verbindungen, startet die Fristprüfungen und wartet beim
 * Herunterfahren, bis Socket.io auch den HTTP-Server geschlossen hat.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Grenzen
 *   == 2. Gateway und Herunterfahren
 *   == 3. Neue Verbindung absichern
 *   == 4. Gemeinsamer Fristtakt
 *
 * Benutzt von: index.js. Benutzt Handler, Lobbyfristen, Ratenbegrenzer und
 * Logger.
 */

import { Server } from 'socket.io';
import { REVANCHE_TAKT_MS } from '../spiel/lobby.js';
import { erzeugeRatenbegrenzer } from './rateLimit.js';
import { erzeugeHandler } from './handlers.js';
import { logger } from '../util/logger.js';
import { GRUND } from '../../shared/protokoll.js';

// == 1. Grenzen ==========================================================
// EINSTELLBAR: Eine Minute bis zur nächsten Prüfung der Warte-/Zugfristen.
const AUFRAEUM_TAKT_MS = 60 * 1000;
// EINSTELLBAR: Nachrichten höchstens 1 KB, Ping alle 20 s, 20 s Antwortfrist.
// SCHUTZ: Größere Nachrichten trennen nur diese Verbindung vor dem Handler.
const SOCKET_OPTIONEN = {
  maxHttpBufferSize: 1024,
  pingInterval: 20000,
  pingTimeout: 20000,
  // Keine CORS-Freigabe für fremde Browserseiten; kein Schutz vor Rohclients.
  cors: { origin: false },
};

// == 2. Gateway und Herunterfahren =======================================
// ACHTUNG: Der HTTP-Server muss Express bereits als Anfragebehandler haben.
// Socket.io übernimmt vorhandene request-Listener für Nicht-Socket-Anfragen.
export function erzeugeGateway(httpServer, { lobby, manager }) {
  const io = new Server(httpServer, SOCKET_OPTIONEN);
  const ratenbegrenzer = erzeugeRatenbegrenzer();
  const handler = erzeugeHandler({ io, lobby, manager, ratenbegrenzer });
  io.on('connection', (socket) => registriereVerbindung(socket, handler));
  const aufraeumer = starteTakt(
    handler.raeumeAuf, AUFRAEUM_TAKT_MS, 'Aufräumen fehlgeschlagen',
  );
  const revancheTakt = starteTakt(
    handler.pruefeRevanchen, REVANCHE_TAKT_MS,
    'Prüfen der Revanche-Fristen fehlgeschlagen',
  );
  return { herunterfahren };

  async function herunterfahren() {
    clearInterval(aufraeumer);
    clearInterval(revancheTakt);
    for (const partie of manager.alle()) {
      try {
        handler.beendeKontrolliert(partie, GRUND.SERVER_ENDE);
      } catch (fehler) {
        logger.error('Partie beim Herunterfahren fehlgeschlagen', fehler);
      }
    }
    // Trennt die Sockets und schließt den HTTP-Server; nicht zusätzlich
    // schließen.
    await io.close();
  }
}

// == 3. Neue Verbindung absichern ========================================
function registriereVerbindung(socket, handler) {
  try {
    handler.registriere(socket);
  } catch (fehler) {
    logger.error('Registrierung fehlgeschlagen', fehler);
    socket.disconnect(true);
  }
}

// == 4. Gemeinsamer Fristtakt ============================================
function starteTakt(aktion, taktMs, fehlermeldung) {
  const takt = setInterval(() => {
    try {
      aktion();
    } catch (fehler) {
      logger.error(fehlermeldung, fehler);
    }
  }, taktMs);
  // Dieser Takt allein hält einen sonst fertigen Prozess nicht am Leben.
  takt.unref();
  return takt;
}
