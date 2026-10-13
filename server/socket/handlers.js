/**
 * handlers.js – Ereignisse empfangen und Nachrichten senden.
 *
 * Verbindet Lobby, Manager und Engine mit Socket.io. Registrierte
 * Spielereignisse werden begrenzt und geprüft; Handlerfehler werden abgefangen.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Ereignisse registrieren
 *   == 2. Ein Handler je Ereignis
 *   == 3. Partie starten und beenden
 *   == 4. Nachrichten senden
 *
 * Benutzt von: Gateway. Benutzt Spiellogik, Validierung, Logger und das
 * Protokoll.
 */

import { SITZE, SITZ_NAMEN } from '../spiel/brett.js';
import { REVANCHE_STATUS } from '../spiel/lobby.js';
import { fuehreZugAus } from '../spiel/engine.js';
import {
  sitzVon,
  spielstandVon,
  beendeVorzeitig,
  beruehre,
} from '../spiel/partie.js';
import { istGueltig, ermittleSpielername } from './validation.js';
import { logger } from '../util/logger.js';
import {
  EREIGNIS,
  FEHLER,
  FEHLER_TEXT,
  GRENZEN,
  GRUND,
  STATUS,
} from '../../shared/protokoll.js';

// EINSTELLBAR: Minuten stehen in shared/protokoll.js; hier nur umrechnen.
const PARTIE_RUHE_MS = GRENZEN.PARTIE_RUHE_MINUTEN * 60 * 1000;
const WARTEN_MS = GRENZEN.WARTEN_MINUTEN * 60 * 1000;

/** Die inneren Funktionen teilen io, Lobby, Manager und Ratenbegrenzer. */
export function erzeugeHandler({ io, lobby, manager, ratenbegrenzer }) {
  // Funktionsdeklarationen gelten schon vor ihrer Textstelle weiter unten.
  return { registriere, beendeKontrolliert, pruefeRevanchen, raeumeAuf };

  // == 1. Ereignisse registrieren ========================================
  // disconnect kommt von Socket.io selbst: ohne Schema oder Ratenbegrenzung.
  function registriere(socket) {
    logger.info('Verbindung aufgebaut', { socketId: socket.id });

    registriereSicher(socket, EREIGNIS.BEITRETEN, aufBeitreten);
    registriereSicher(socket, EREIGNIS.ABBRECHEN, aufAbbrechen);
    registriereSicher(socket, EREIGNIS.ZUG, aufZug);
    registriereSicher(socket, EREIGNIS.AUFGEBEN, aufAufgeben);
    registriereSicher(socket, EREIGNIS.ERNEUT, aufErneut);
    registriereSicher(socket, EREIGNIS.REVANCHE, aufRevanche);

    socket.on('disconnect', (grund) => {
      try {
        aufTrennen(socket, grund);
      } catch (fehler) {
        logger.error('disconnect-Handler fehlgeschlagen', fehler);
      }
    });
  }

  // SCHUTZ: Erst Rate, dann Schema, dann Fachlogik innerhalb von try/catch.
  function registriereSicher(socket, ereignis, handler) {
    socket.on(ereignis, (nutzdaten) => {
      try {
        if (!ratenbegrenzer.erlaubt(socket.id)) {
          if (ratenbegrenzer.istErsteSperre(socket.id)) {
            sendeFehler(socket, FEHLER.ZU_VIELE_ANFRAGEN);
          }
          return;
        }

        if (!istGueltig(ereignis, nutzdaten)) {
          logger.debug('Nutzdaten abgelehnt', {
            ereignis,
            socketId: socket.id,
          });
          sendeFehler(socket, FEHLER.NUTZDATEN_UNGUELTIG);
          return;
        }

        handler(socket, nutzdaten);
      } catch (fehler) {
        behandleHandlerfehler(socket, ereignis, fehler);
      }
    });
  }

  // In einer Partie genügt der Abbruch; sonst nur dem Verursacher antworten.
  function behandleHandlerfehler(socket, ereignis, fehler) {
    logger.error(`Handler ${ereignis} fehlgeschlagen`, fehler);
    try {
      const partie = manager.holeNachSocket(socket.id);
      if (partie) beendeKontrolliert(partie, GRUND.INTERNER_FEHLER);
      else sendeFehler(socket, FEHLER.INTERNER_FEHLER);
    } catch (folgefehler) {
      logger.error('Aufräumen nach Fehler fehlgeschlagen', folgefehler);
    }
  }

  // == 2. Ein Handler je Ereignis ========================================
  function aufBeitreten(socket, nutzdaten) {
    if (manager.holeNachSocket(socket.id)) {
      sendeFehler(socket, FEHLER.BEREITS_IN_PARTIE);
      return;
    }

    lasseRevancheVerfallen(socket.id);

    const name = ermittleSpielername(nutzdaten.name);
    let angenommen;
    if (typeof nutzdaten.code === 'string') {
      angenommen = betreteMitCode(socket, name, nutzdaten.code);
    } else if (nutzdaten.privat === true) {
      angenommen = erstellePrivat(socket, name);
    } else {
      angenommen = stelleAn(socket, name);
    }

    // Einen abgelehnten zweiten Namen nicht für das nächste Spiel übernehmen.
    if (angenommen) socket.data.name = name;
  }

  function stelleAn(socket, name) {
    const ergebnis = lobby.beitreten(socket.id, name);
    if (!ergebnis.ok) {
      sendeFehler(socket, ergebnis.code);
      return false;
    }

    logger.info('Beitritt', { socketId: socket.id, name });

    fuehreZusammen();
    return true;
  }

  function erstellePrivat(socket, name) {
    const ergebnis = lobby.erstellePrivat(socket.id, name);

    if (!ergebnis.ok) {
      sendeFehler(socket, ergebnis.code);
      return false;
    }

    socket.emit(EREIGNIS.PRIVAT, { code: ergebnis.einladung });
    logger.info('Privates Spiel erstellt', { socketId: socket.id, name });
    return true;
  }

  // Ein alter oder falscher Link bekommt eine verständliche Fehlermeldung.
  function betreteMitCode(socket, name, code) {
    if (lobby.enthaelt(socket.id)) {
      sendeFehler(socket, FEHLER.BEREITS_IN_WARTESCHLANGE);
      return false;
    }

    const ersteller = lobby.nimmPrivat(code.toUpperCase());

    if (!ersteller || !socketVon(ersteller.socketId)) {
      sendeFehler(socket, FEHLER.CODE_UNBEKANNT);
      return false;
    }

    starteMitPaar(ersteller, { socketId: socket.id, name });
    return true;
  }

  // SCHUTZ: Ein verspätetes Abbrechen nach START ist keine Aufgabe.
  function aufAbbrechen(socket) {
    if (manager.holeNachSocket(socket.id)) {
      logger.debug('Abbrechen ignoriert, Partie läuft schon', {
        socketId: socket.id,
      });
      return;
    }

    lasseRevancheVerfallen(socket.id);

    if (lobby.entferne(socket.id)) {
      logger.info('Suche abgebrochen', { socketId: socket.id });
      sendePositionen();
    }
  }

  // SCHUTZ: Partie und Sitz immer aus dem Serverzustand lesen.
  function aufZug(socket, nutzdaten) {
    const partie = manager.holeNachSocket(socket.id);
    if (!partie) {
      sendeFehler(socket, FEHLER.KEINE_PARTIE);
      return;
    }

    const sitz = sitzVon(partie, socket.id);
    if (!sitz) {
      sendeFehler(socket, FEHLER.KEINE_PARTIE);
      return;
    }

    // pitIndex ist der Name in der Zugnachricht; die Engine sagt mulde.
    const ergebnis = fuehreZugAus(partie, sitz, nutzdaten.pitIndex);

    if (!ergebnis.ok) {
      lehneZugAb(socket, partie, ergebnis);
      return;
    }
    uebernehmeZug(partie, ergebnis);
  }

  // Ein kaputtes Brett beendet die Partie; ein Regelverstoß nur diesen Versuch.
  function lehneZugAb(socket, partie, ergebnis) {
    if (ergebnis.code === FEHLER.INTERNER_FEHLER) {
      logger.error('Invariante verletzt', {
        spielId: partie.id,
        verletzungen: ergebnis.verletzungen,
      });
      beendeKontrolliert(partie, GRUND.INTERNER_FEHLER);
      return;
    }
    logger.debug('Zug abgelehnt', { socketId: socket.id, code: ergebnis.code });
    sendeFehler(socket, ergebnis.code);
  }

  function uebernehmeZug(partie, ergebnis) {
    // Die Engine liefert eine Kopie; der Manager hält weiterhin dieses Objekt.
    Object.assign(partie, ergebnis.partie);
    beruehre(partie);
    const spielstand = spielstandVon(partie);
    io.to(partie.id).emit(EREIGNIS.STAND, {
      spielstand,
      bericht: ergebnis.bericht,
    });
    if (partie.status === STATUS.BEENDET) beendeRegulaer(partie, spielstand);
  }

  function aufAufgeben(socket) {
    const partie = manager.holeNachSocket(socket.id);
    if (!partie) {
      sendeFehler(socket, FEHLER.KEINE_PARTIE);
      return;
    }

    const sitz = sitzVon(partie, socket.id);
    if (!sitz) {
      sendeFehler(socket, FEHLER.KEINE_PARTIE);
      return;
    }

    const sieger = SITZE[sitz].gegner;
    beendeKontrolliert(partie, GRUND.AUFGEGEBEN, sieger);
  }

  // Der Socket merkt den Namen; nach Neuverbindung gilt der mitgeschickte Name.
  function aufErneut(socket, nutzdaten) {
    const name = socket.data.name ?? ermittleSpielername(nutzdaten.name);
    aufBeitreten(socket, { name });
  }

  function aufRevanche(socket) {
    if (manager.holeNachSocket(socket.id)) {
      sendeFehler(socket, FEHLER.BEREITS_IN_PARTIE);
      return;
    }

    const ergebnis = lobby.wuenscheRevanche(socket.id);

    if (ergebnis.status === REVANCHE_STATUS.KEINE) {
      socket.emit(EREIGNIS.REVANCHE_WEG);
      return;
    }

    if (ergebnis.status === REVANCHE_STATUS.WARTET) {
      socketVon(ergebnis.gegnerId)?.emit(EREIGNIS.REVANCHE_ANGEBOT);
      return;
    }

    // Doppelklicks erzeugen kein zweites Angebot an den Gegner.
    if (ergebnis.status === REVANCHE_STATUS.SCHON_GEWUENSCHT) return;

    const [a, b] = ergebnis.paar;
    if (!socketVon(a.socketId) || !socketVon(b.socketId)) {
      socket.emit(EREIGNIS.REVANCHE_WEG);
      return;
    }

    starteMitPaar(a, b);
  }

  // SCHUTZ: Den Ratenzähler vor Lobby und Partie vergessen. So bleibt er
  // auch bei einem späteren Aufräumfehler nicht liegen.
  function aufTrennen(socket, grund) {
    // Der getrennte Socket ist bereits aus io.sockets entfernt.
    logger.info('Verbindung getrennt', { socketId: socket.id, grund });

    ratenbegrenzer.vergiss(socket.id);

    if (lobby.entferne(socket.id)) sendePositionen();
    lasseRevancheVerfallen(socket.id);

    const partie = manager.holeNachSocket(socket.id);
    if (partie) {
      const sitz = sitzVon(partie, socket.id);
      if (!sitz) {
        beendeKontrolliert(partie, GRUND.INTERNER_FEHLER);
        return;
      }
      beendeKontrolliert(partie, GRUND.GEGNER_WEG, SITZE[sitz].gegner);
    }
  }

  // == 3. Partie starten und beenden =====================================
  function starteMitPaar(a, b) {
    const partie = manager.starte(a, b);

    socketVon(a.socketId)?.join(partie.id);
    socketVon(b.socketId)?.join(partie.id);

    const spielstand = spielstandVon(partie);

    for (const sitz of SITZ_NAMEN) {
      const gegnerSitz = SITZE[sitz].gegner;
      socketVon(partie.spieler[sitz].socketId)?.emit(EREIGNIS.START, {
        spielId: partie.id,
        sitz,
        gegner: { name: partie.spieler[gegnerSitz].name },
        spielstand,
      });
    }

    logger.info('Partie gestartet', {
      spielId: partie.id,
      unten: partie.spieler.unten.name,
      oben: partie.spieler.oben.name,
    });
  }

  function fuehreZusammen() {
    let paar = lobby.naechstesPaar();

    while (paar) {
      const [a, b] = paar;
      const socketA = socketVon(a.socketId);
      const socketB = socketVon(b.socketId);

      // SCHUTZ: Nach einem Fehler beim Trennen kann ein alter Platz übrig sein.
      if (!socketA || !socketB) {
        let uebrig = null;
        if (socketA) uebrig = a;
        if (socketB) uebrig = b;
        if (uebrig) lobby.beitreten(uebrig.socketId, uebrig.name);
        logger.warn('Zusammenführung abgebrochen, ein Socket war weg');
        paar = lobby.naechstesPaar();
        continue;
      }

      starteMitPaar(a, b);

      paar = lobby.naechstesPaar();
    }

    sendePositionen();
  }

  // REGEL 3.5: Die Engine hat die Restkugeln bereits abgerechnet.
  // Revanche vorm Auflösen merken; diese Option gehört zum Onlinebetrieb.
  function beendeRegulaer(partie, spielstand) {
    try {
      const revanche = ermoeglicheRevanche(partie, GRUND.REGULAER);
      io.to(partie.id).emit(EREIGNIS.ENDE, {
        spielstand, ergebnis: partie.ergebnis, revanche,
      });
      logger.info('Partie regulär beendet', {
        spielId: partie.id,
        punkte: partie.ergebnis.punkte,
        sieger: partie.ergebnis.sieger,
      });
    } finally {
      loeseAuf(partie);
    }
  }

  // SCHUTZ: Auch eine schon beendete, nicht aufgelöste Partie wird entfernt.
  function beendeKontrolliert(partie, grund, sieger = null) {
    if (!partie) return;

    try {
      if (partie.status !== STATUS.LAEUFT) return;

      const ergebnis = beendeVorzeitig(partie, grund, sieger);
      const spielstand = spielstandVon(partie);
      const revanche = ermoeglicheRevanche(partie, grund);

      for (const sitz of SITZ_NAMEN) {
        const socketId = partie.spieler[sitz].socketId;

        socketVon(socketId)?.emit(EREIGNIS.ABBRUCH, {
          grund,
          spielstand,
          ergebnis,
          revanche,
        });
      }

      logger.info('Partie beendet', { spielId: partie.id, grund });
    } finally {
      loeseAuf(partie);
    }
  }

  // Nach Aufgabe oder regulärem Ende dürfen dieselben Spieler neu beginnen.
  // Bei Trennung oder technischem Abbruch ist das alte Paar nicht geeignet.
  function ermoeglicheRevanche(partie, grund) {
    const echtesEnde = grund === GRUND.REGULAER || grund === GRUND.AUFGEGEBEN;
    const { unten, oben } = partie.spieler;

    if (!echtesEnde) return false;
    if (!socketVon(unten.socketId) || !socketVon(oben.socketId)) return false;

    lobby.merkeRevanche(unten, oben);
    return true;
  }

  function lasseRevancheVerfallen(socketId) {
    const gegnerId = lobby.vergissRevanche(socketId);
    if (gegnerId) socketVon(gegnerId)?.emit(EREIGNIS.REVANCHE_WEG);
  }

  function pruefeRevanchen(jetzt = Date.now()) {
    for (const socketId of lobby.abgelaufeneRevanchen(jetzt)) {
      socketVon(socketId)?.emit(EREIGNIS.REVANCHE_ABGELAUFEN);
    }
  }

  // SCHUTZ: Ein Fehler bei einer Partie hält die anderen Fristen nicht auf.
  function raeumeAuf(jetzt = Date.now()) {
    for (const partie of manager.findeRuhendePartien(PARTIE_RUHE_MS, jetzt)) {
      try {
        beendeKontrolliert(partie, GRUND.ZU_LANGE_KEIN_ZUG);
      } catch (fehler) {
        logger.error('Fristende einer Partie fehlgeschlagen', fehler);
      }
    }

    const wartende = lobby.raeumeAuf(WARTEN_MS, jetzt);
    for (const socketId of wartende) {
      const socket = socketVon(socketId);
      if (socket) sendeFehler(socket, FEHLER.WARTEZEIT_ABGELAUFEN);
    }
    if (wartende.length > 0) {
      logger.info('Wartezeit abgelaufen', { wartende: wartende.length });
      sendePositionen();
    }
  }

  // SCHUTZ: Ein Fehler beim Raumverlassen darf die Maps nicht festhalten.
  function loeseAuf(partie) {
    for (const sitz of SITZ_NAMEN) {
      try {
        socketVon(partie.spieler[sitz].socketId)?.leave(partie.id);
      } catch (fehler) {
        logger.error('Raumverlassen fehlgeschlagen', fehler);
      }
    }
    manager.entferne(partie.id);
  }

  // == 4. Nachrichten senden =============================================
  // Fehler gehen an den Verursacher, nie an den Raum.
  function sendeFehler(socket, code) {
    socket.emit(EREIGNIS.FEHLER, {
      code,
      text: FEHLER_TEXT[code] ?? 'Unbekannter Fehler.',
    });
  }

  function sendePositionen() {
    for (const { socketId, position } of lobby.positionen()) {
      socketVon(socketId)?.emit(EREIGNIS.WARTESCHLANGE, { position });
    }
  }

  function socketVon(socketId) {
    return io.sockets.sockets.get(socketId) ?? null;
  }
}
