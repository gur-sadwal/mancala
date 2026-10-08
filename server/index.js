/**
 * index.js – Startpunkt des Servers.
 *
 * Start: npm run start 3000. Ohne Argument gilt PORT, danach Port 3000.
 * Bindet IPv4, protokolliert Prozessfehler und beendet bei SIGTERM/SIGINT
 * geordnet.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Grenzen und Start
 *   == 2. Port und Bausteine
 *   == 3. Prozess- und Serverfehler
 *   == 4. Bereitmeldung und Herunterfahren
 *
 * Benutzt von: Node beim Start. Benutzt Express-App, Gateway, Lobby, Manager
 * und Logger.
 */

import http from 'node:http';
import { erzeugeApp } from './http/app.js';
import { erzeugeGateway } from './socket/gateway.js';
import { erzeugeLobby } from './spiel/lobby.js';
import { erzeugeManager } from './spiel/manager.js';
import { logger } from './util/logger.js';

// == 1. Grenzen und Start ================================================
// EINSTELLBAR: Standardport und Notbremse bei hängendem Herunterfahren.
const STANDARD_PORT = 3000;
const BEENDEN_MAX_MS = 5000;

const port = liesPort();
const { httpServer, herunterfahren } = baueServer();
process.on('uncaughtException', beiUncaughtException);
process.on('unhandledRejection', beiUnhandledRejection);
process.on('SIGTERM', () => beendeGeordnet('SIGTERM'));
process.on('SIGINT', () => beendeGeordnet('SIGINT'));
httpServer.on('error', meldeServerfehler);
httpServer.listen(port, '0.0.0.0', meldeBereit);

// == 2. Port und Bausteine ===============================================
function liesPort() {
  const portText = process.argv[2] ?? process.env.PORT ?? String(STANDARD_PORT);
  // Number weist 3000abc zurück; parseInt würde still 3000 daraus machen.
  const gelesen = Number(portText);
  if (!Number.isInteger(gelesen) || gelesen < 1 || gelesen > 65535) {
    logger.error(`Ungültiger Port: "${portText}". Aufruf: npm run start 3000`);
    process.exit(1);
  }
  return gelesen;
}

function baueServer() {
  const lobby = erzeugeLobby();
  const manager = erzeugeManager();
  const app = erzeugeApp({ manager, lobby });
  // ACHTUNG: Express vor Socket.io anhängen, siehe gateway.js == 2.
  const httpServer = http.createServer(app);
  const { herunterfahren } = erzeugeGateway(httpServer, { lobby, manager });
  return { httpServer, herunterfahren };
}

// == 3. Prozess- und Serverfehler ========================================
// SCHUTZ: Nach Regelwerk 5.2 bleibt der Prozess am Leben. Der Fehler wird
// protokolliert und muss behoben werden; die Handler fangen Fehler schon vorher
// ab.
function beiUncaughtException(fehler) {
  logger.error('uncaughtException – Prozess läuft bewusst weiter', fehler);
}

function beiUnhandledRejection(grund) {
  logger.error('unhandledRejection – Prozess läuft bewusst weiter', grund);
}

function meldeServerfehler(fehler) {
  if (fehler.code === 'EADDRINUSE') {
    logger.error(`Port ${port} ist bereits belegt. Anderen Port wählen: npm run start 3001`);
    process.exit(1);
  }
  if (fehler.code === 'EACCES') {
    logger.error(`Keine Berechtigung für Port ${port}. Ports unter 1024 brauchen Adminrechte.`);
    process.exit(1);
  }
  logger.error('Serverfehler', fehler);
}

// == 4. Bereitmeldung und Herunterfahren =================================
function meldeBereit() {
  logger.info(`Mancala-Server lauscht auf 0.0.0.0:${port}`);
  logger.info(`Im Browser öffnen: http://localhost:${port}`);
}

// SCHUTZ: Auf das Schließen warten; die Notbremse löst einen hängenden Vorgang.
async function beendeGeordnet(signal) {
  logger.info(`${signal} empfangen, fahre herunter`);
  setTimeout(() => process.exit(0), BEENDEN_MAX_MS).unref();
  try {
    await herunterfahren();
  } catch (fehler) {
    logger.error('Herunterfahren fehlgeschlagen', fehler);
  }
  process.exit(0);
}
