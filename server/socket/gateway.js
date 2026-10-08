import { Server } from 'socket.io';
import { REVANCHE_TAKT_MS } from '../spiel/lobby.js';
import { erzeugeRatenbegrenzer } from './rateLimit.js';
import { erzeugeHandler } from './handlers.js';
import { logger } from '../util/logger.js';
import { GRUND } from '../../shared/protokoll.js';

const AUFRAEUM_TAKT_MS = 60 * 1000;
const SOCKET_OPTIONEN = {
  maxHttpBufferSize: 1024,
  pingInterval: 20000,
  pingTimeout: 20000,
  cors: { origin: false },
};

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
    await io.close();
  }
}

function registriereVerbindung(socket, handler) {
  try {
    handler.registriere(socket);
  } catch (fehler) {
    logger.error('Registrierung fehlgeschlagen', fehler);
    socket.disconnect(true);
  }
}

function starteTakt(aktion, taktMs, fehlermeldung) {
  const takt = setInterval(() => {
    try {
      aktion();
    } catch (fehler) {
      logger.error(fehlermeldung, fehler);
    }
  }, taktMs);
  takt.unref();
  return takt;
}
