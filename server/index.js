import http from 'node:http';
import { erzeugeApp } from './http/app.js';
import { erzeugeGateway } from './socket/gateway.js';
import { erzeugeLobby } from './spiel/lobby.js';
import { erzeugeManager } from './spiel/manager.js';
import { logger } from './util/logger.js';

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

function liesPort() {
  const portText = process.argv[2] ?? process.env.PORT ?? String(STANDARD_PORT);
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
  const httpServer = http.createServer(app);
  const { herunterfahren } = erzeugeGateway(httpServer, { lobby, manager });
  return { httpServer, herunterfahren };
}

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

function meldeBereit() {
  logger.info(`Mancala-Server lauscht auf 0.0.0.0:${port}`);
  logger.info(`Im Browser öffnen: http://localhost:${port}`);
}

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
