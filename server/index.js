/**
 * Startpunkt des Servers: Port lesen, binden, Prozesswaechter (Konzept 7.2).
 *
 * Aufruf:
 *     npm run start 3000
 *     node server/index.js 3000
 *
 * Faellt das Argument weg, wird PORT aus der Umgebung genommen, sonst 3000.
 */

import http from 'node:http';

import { erzeugeApp } from './http/app.js';
import { erzeugeGateway } from './socket/gateway.js';
import { erzeugeLobby } from './spiel/lobby.js';
import { erzeugeManager } from './spiel/manager.js';
import { logger } from './util/logger.js';

/** Standardport, wenn weder Argument noch Umgebungsvariable gesetzt sind. */
const STANDARD_PORT = 3000;

// ---------------------------------------------------------------------------
// Port bestimmen
// ---------------------------------------------------------------------------

const portText = process.argv[2] ?? process.env.PORT ?? String(STANDARD_PORT);
const port = Number.parseInt(portText, 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Ungueltiger Port: "${portText}". Aufruf: npm run start 3000`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Server zusammensetzen
// ---------------------------------------------------------------------------

/*
 * REIHENFOLGE – hier steckt eine Falle, die genau einmal Zeit kostet:
 *
 * Socket.io uebernimmt beim Anhaengen die bereits registrierten
 * `request`-Listener des HTTP-Servers, entfernt sie und ruft sie kuenftig
 * selbst auf – aber nur fuer Anfragen ausserhalb von `/socket.io/`. Wird die
 * Express-App erst NACH dem Gateway angehaengt, bearbeiten beide jede Anfrage
 * parallel; das Ausliefern der Client-Bibliothek scheitert dann an bereits
 * gesendeten Kopfzeilen, und der Browser bekommt eine leere Antwort.
 *
 * Deshalb: Lobby und Manager zuerst, damit die App sie fuer `/gesundheit`
 * hat; dann der HTTP-Server MIT der App; erst danach das Gateway.
 */
const lobby = erzeugeLobby();
const manager = erzeugeManager();

const app = erzeugeApp({ manager, lobby });
const httpServer = http.createServer(app);

const { herunterfahren } = erzeugeGateway(httpServer, { lobby, manager });

// ---------------------------------------------------------------------------
// Schicht 5 der Absturzsicherung: der Prozesswaechter (Konzept 7.7)
// ---------------------------------------------------------------------------

/**
 * ABWAEGUNG – im Review die wichtigste Stelle dieser Datei.
 *
 * Normalerweise gilt es als schlechte Praxis, nach einer nicht behandelten
 * Ausnahme weiterzulaufen, weil der Prozesszustand unklar sein kann. Hier ist
 * die Abwaegung anders:
 *
 *   - Der Zustand besteht aus voneinander unabhaengigen Partien im
 *     Arbeitsspeicher. Ein Fehler in Partie A macht Partie B nicht kaputt.
 *   - Die Vorgabe des Dozenten verlangt ausdruecklich einen Server, der nicht
 *     abstuerzt (Regelwerk 5.2).
 *   - Ein Prozessende wuerde ALLE laufenden Partien des Kurses beenden – der
 *     deutlich groessere Schaden.
 *
 * Die Schichten 1 bis 4 (Schemapruefung, Handler-Kapselung, Engine ohne
 * throw, Invariantenpruefung) sorgen dafuer, dass diese Schicht im
 * Normalbetrieb nie greift. Greift sie doch, ist das ein Fehler, der
 * protokolliert und nachtraeglich behoben wird.
 */
process.on('uncaughtException', (fehler) => {
  logger.error('uncaughtException – Prozess laeuft bewusst weiter', fehler);
});

process.on('unhandledRejection', (grund) => {
  logger.error('unhandledRejection – Prozess laeuft bewusst weiter', grund);
});

// ---------------------------------------------------------------------------
// Lauschen
// ---------------------------------------------------------------------------

/**
 * Ein belegter Port wird mit einer verstaendlichen Meldung quittiert, statt
 * einen Stapelabzug auszugeben.
 */
httpServer.on('error', (fehler) => {
  if (fehler.code === 'EADDRINUSE') {
    console.error(`Port ${port} ist bereits belegt. Anderen Port waehlen: npm run start 3001`);
    process.exit(1);
  }
  if (fehler.code === 'EACCES') {
    console.error(`Keine Berechtigung fuer Port ${port}. Ports unter 1024 brauchen Adminrechte.`);
    process.exit(1);
  }
  logger.error('Serverfehler', fehler);
});

// Gebunden wird ausdruecklich auf 0.0.0.0, nicht auf localhost und nicht auf
// den Node-Standard: Ohne diese Angabe bevorzugt Node auf manchen Systemen ::
// (IPv6), und der Server waere ueber IPv4 nicht erreichbar – eine
// ausdrueckliche Vorgabe des Dozenten (NFA-08).
httpServer.listen(port, '0.0.0.0', () => {
  logger.info(`Mancala-Server lauscht auf 0.0.0.0:${port}`);
  logger.info(`Im Browser oeffnen: http://localhost:${port}`);
});

// ---------------------------------------------------------------------------
// Geordnetes Herunterfahren
// ---------------------------------------------------------------------------

/**
 * Laufende Partien bekommen eine Abbruchnachricht, damit niemand vor einem
 * eingefrorenen Brett sitzt. Danach schliesst der Server geordnet.
 *
 * Die Notbremse nach 5 Sekunden verhindert, dass ein haengender Socket das
 * Beenden blockiert.
 */
function beendeGeordnet(signal) {
  logger.info(`${signal} empfangen, fahre herunter`);

  try {
    herunterfahren();
  } catch (fehler) {
    logger.error('Herunterfahren fehlgeschlagen', fehler);
  }

  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => beendeGeordnet('SIGTERM'));
process.on('SIGINT', () => beendeGeordnet('SIGINT'));
