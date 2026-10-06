/**
 * Aufsetzen von Socket.io (Konzept 7.9).
 *
 * Dieses Modul verbindet die Bausteine: Es erzeugt Lobby, Manager und
 * Ratenbegrenzer, haengt die Handler an jede neue Verbindung und startet das
 * Aufraeumintervall sowie den Sekundentakt fuer die Revanche-Frist.
 */

import { Server } from 'socket.io';

import {
  AUFRAEUM_INTERVALL_MS,
  WARTESCHLANGE_MAX_ALTER_MS,
} from '../spiel/manager.js';
import { REVANCHE_TAKT_MS } from '../spiel/lobby.js';
import { erzeugeRatenbegrenzer } from './rateLimit.js';
import { erzeugeHandler } from './handlers.js';
import { logger } from '../util/logger.js';
import { GRUND } from '../../shared/protokoll.js';

/**
 * Haengt Socket.io an einen bestehenden HTTP-Server.
 *
 * WICHTIG – Reihenfolge: Der HTTP-Server muss seinen Anfragebehandler (die
 * Express-App) BEREITS haben, wenn diese Funktion aufgerufen wird. Socket.io
 * uebernimmt beim Anhaengen die vorhandenen `request`-Listener, entfernt sie
 * und ruft sie kuenftig selbst auf – aber nur fuer Anfragen, die nicht an
 * `/socket.io/` gehen. Wird die App erst NACH dem Anhaengen registriert,
 * bearbeiten beide jede Anfrage parallel, und das Ausliefern der
 * Client-Bibliothek scheitert an bereits gesendeten Kopfzeilen.
 *
 * Lobby und Manager werden hereingereicht und nicht hier erzeugt, weil die
 * Express-App sie fuer `/gesundheit` schon vorher braucht.
 *
 * @param {import('node:http').Server} httpServer
 * @param {{lobby: object, manager: object}} bausteine
 * @returns {{io: object, herunterfahren: Function}}
 */
export function erzeugeGateway(httpServer, { lobby, manager }) {
  const io = new Server(httpServer, {
    // 1 KB reicht fuer jede Nachricht dieses Protokolls – die groesste ist
    // `{ name: "<20 Zeichen>" }`. Alles Groessere ist kein gueltiger Client
    // und wird von Socket.io verworfen, bevor eigener Code laeuft.
    maxHttpBufferSize: 1024,

    // Bestimmt, wie schnell ein abgestuerzter Browser als verschwunden gilt:
    // lang genug fuer ein kurzes Netzloch im Hoersaal-WLAN, kurz genug, dass
    // niemand vor einem toten Brett wartet (Konzept 7.9).
    pingInterval: 20000,
    pingTimeout: 20000,

    // Der Client wird vom selben Server ausgeliefert, es gibt also keinen
    // legitimen fremden Ursprung.
    cors: { origin: false },
  });

  const ratenbegrenzer = erzeugeRatenbegrenzer();

  const handler = erzeugeHandler({ io, lobby, manager, ratenbegrenzer });

  io.on('connection', (socket) => {
    try {
      handler.registriere(socket);
    } catch (fehler) {
      // Selbst ein Fehler beim Verdrahten darf den Prozess nicht beenden.
      logger.error('Registrierung fehlgeschlagen', fehler);
      socket.disconnect(true);
    }
  });

  /**
   * Aufraeumintervall (Konzept 7.6).
   *
   * Rueckversicherung fuer den Fall, dass ein Aufraeumpfad uebersehen wurde.
   * `unref()` sorgt dafuer, dass dieses Intervall den Prozess nicht am Leben
   * haelt, wenn sonst nichts mehr laeuft.
   */
  const aufraeumer = setInterval(() => {
    try {
      const partien = manager.raeumeAuf();
      const wartende = lobby.raeumeAuf(WARTESCHLANGE_MAX_ALTER_MS);

      if (partien.length > 0 || wartende.length > 0) {
        logger.info('Aufgeraeumt', {
          partien: partien.length,
          wartende: wartende.length,
        });
      }
    } catch (fehler) {
      logger.error('Aufraeumen fehlgeschlagen', fehler);
    }
  }, AUFRAEUM_INTERVALL_MS);
  aufraeumer.unref();

  /**
   * Sekundentakt fuer die Revanche-Frist.
   *
   * EIN Takt fuer alle statt eines eigenen setTimeout je Revanche: Die Lobby
   * merkt sich nur den Ablaufzeitpunkt. So bleiben keine Zeitgeber zurueck,
   * die in jedem Abbruchpfad (neues Spiel, Abmelden, Verbindungsabbruch)
   * wieder geloescht werden muessten. Ein Fehler hier darf den Prozess ebenso
   * wenig beenden wie einer im Aufraeumer.
   */
  const revancheTakt = setInterval(() => {
    try {
      handler.pruefeRevanchen();
    } catch (fehler) {
      logger.error('Pruefen der Revanche-Fristen fehlgeschlagen', fehler);
    }
  }, REVANCHE_TAKT_MS);
  revancheTakt.unref();

  /**
   * Geordnetes Herunterfahren (SIGTERM/SIGINT, Konzept 7.7).
   *
   * Laufende Partien bekommen `spiel:abbruch`, damit niemand vor einem
   * eingefrorenen Brett sitzt, danach schliesst der Server.
   */
  function herunterfahren() {
    clearInterval(aufraeumer);
    clearInterval(revancheTakt);

    for (const partie of manager.alle()) {
      handler.beendeKontrolliert(partie, GRUND.SERVER_ENDE);
    }
    io.close();
  }

  return { io, herunterfahren };
}
