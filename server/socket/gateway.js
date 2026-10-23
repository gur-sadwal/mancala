/**
 * gateway.js – Socket.io an den HTTP-Server anschließen.
 *
 * Registriert neue Verbindungen, startet die Fristprüfungen und wartet beim
 * Herunterfahren, bis Socket.io auch den HTTP-Server geschlossen hat.
 *
 * Inhalt:
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
import { FEHLER, GRUND } from '../../shared/protokoll.js';

// == 1. Grenzen ==========================================================
// EINSTELLBAR: Abstand zwischen den Prüfungen der Warte- und Zugfristen.
const AUFRAEUM_TAKT_MS = 60 * 1000;
// EINSTELLBAR: Höchstens so viele gleichzeitige Browserverbindungen; passt
// zu 200 Partien und 100 Wartenden. Tests übergeben eine kleinere Grenze.
const VERBINDUNGEN_MAX = 500;
// EINSTELLBAR: Raumcodes je Verbindung und Minute, genug für Tippfehler.
// SCHUTZ: Ohne diese Grenze gälte nur die allgemeine von 20 Nachrichten je
// Sekunde. Bei höchstens 100 offenen privaten Spielen trifft ein geratener
// Code mit etwa 1 zu 8,9 Millionen (31^6 / 100).
// ACHTUNG: Die Minute nennt auch FEHLER_TEXT in shared/protokoll.js.
const CODE_VERSUCHE_MAX = 5;
const CODE_FENSTER_MS = 60 * 1000;
// EINSTELLBAR: Nachrichten höchstens 1 KB, Ping alle 20 s, 20 s Antwortfrist.
// SCHUTZ: Größere Nachrichten trennen nur diese Verbindung vor dem Handler.
const SOCKET_OPTIONEN = {
  maxHttpBufferSize: 1024,
  pingInterval: 20000,
  pingTimeout: 20000,
  // Keine CORS-Freigabe: Fremde Webseiten können Antworten über HTTP nicht
  // lesen. Den WebSocket-Aufbau und Rohclients hält das nicht auf; ohne
  // Anmeldedaten lässt sich damit aber nichts übernehmen.
  cors: { origin: false },
};

// == 2. Gateway und Herunterfahren =======================================
// ACHTUNG: Der HTTP-Server muss Express bereits als Anfragebehandler haben.
// Socket.io übernimmt vorhandene request-Listener für Nicht-Socket-Anfragen.
export function erzeugeGateway(httpServer, {
  lobby, manager, verbindungenMax = VERBINDUNGEN_MAX,
}) {
  const io = new Server(httpServer, SOCKET_OPTIONEN);
  const ratenbegrenzer = erzeugeRatenbegrenzer();
  const codeBegrenzer = erzeugeRatenbegrenzer(
    CODE_VERSUCHE_MAX, CODE_FENSTER_MS,
  );
  const handler = erzeugeHandler({
    io, lobby, manager, ratenbegrenzer, codeBegrenzer,
  });
  io.use((socket, weiter) => begrenzeVerbindungen(io, verbindungenMax, weiter));
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
    // Socket.io schließt auch den HTTP-Server. Ein zweites Schließen entfällt.
    await io.close();
  }
}

// == 3. Neue Verbindung absichern ========================================
// SCHUTZ: Socket.io fragt diese Middleware vor jeder neuen Verbindung. Der
// neue Socket zählt hier noch nicht mit. Ein Fehler lehnt nur ihn ab.
function begrenzeVerbindungen(io, verbindungenMax, weiter) {
  if (io.of('/').sockets.size >= verbindungenMax) {
    weiter(new Error(FEHLER.SERVER_VOLL));
    return;
  }
  weiter();
}

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
