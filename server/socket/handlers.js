/**
 * Die Ereignis-Handler (Konzept 6 und 7).
 *
 * Dies ist das EINZIGE Modul, das `emit` aufruft. Alles darunter – Manager,
 * Lobby, Partie, Engine, Brett – gibt Ergebnisse nur zurueck (Konzept 3.4).
 * Genau deshalb laesst sich die Spiellogik ohne Server testen.
 *
 * Jeder Handler wird ueber `registriereSicher()` angemeldet und ist damit
 * gekapselt: Schicht 2 der Absturzsicherung
 * (Konzept 7.7). Ein Fehler beim Verarbeiten eines Zuges beendet hoechstens
 * diese eine Partie, nie den Prozess.
 */

import { fuehreZugAus } from '../spiel/engine.js';
import {
  sitzVon,
  spielstandVon,
  beendeVorzeitig,
  beruehre,
} from '../spiel/partie.js';
import { istGueltig, saubererName } from './validation.js';
import { logger } from '../util/logger.js';
import {
  EREIGNIS,
  FEHLER,
  FEHLER_TEXT,
  GRENZEN,
  GRUND,
  STATUS,
} from '../../shared/protokoll.js';

// Fristen in Millisekunden. EINSTELLBAR sind die Minuten in
// shared/protokoll.js (GRENZEN); hier wird nur umgerechnet.
const PARTIE_RUHE_MS = GRENZEN.PARTIE_RUHE_MINUTEN * 60 * 1000;
const WARTEN_MS = GRENZEN.WARTEN_MINUTEN * 60 * 1000;

/**
 * Verdrahtet alle Ereignisse eines Sockets.
 *
 * @param {object} deps
 * @param {import('socket.io').Server} deps.io
 * @param {object} deps.lobby
 * @param {object} deps.manager
 * @param {object} deps.ratenbegrenzer
 */
export function erzeugeHandler({ io, lobby, manager, ratenbegrenzer }) {
  // -------------------------------------------------------------------------
  // Senden – die einzigen vier Stellen, an denen etwas hinausgeht
  // -------------------------------------------------------------------------

  /**
   * Schickt einen Fehler NUR an den Verursacher.
   *
   * Nie in den Raum: Der Gegner soll nicht erfahren, dass jemand ungueltige
   * Nachrichten schickt (Konzept 6.7).
   */
  function sendeFehler(socket, code) {
    socket.emit(EREIGNIS.FEHLER, {
      code,
      text: FEHLER_TEXT[code] ?? 'Unbekannter Fehler.',
    });
  }

  /** Holt das Socket-Objekt zu einer Kennung – oder null, wenn es weg ist. */
  function socketVon(socketId) {
    return io.sockets.sockets.get(socketId) ?? null;
  }

  /**
   * Teilt allen Wartenden ihre aktuelle Position mit.
   *
   * Verhindert den Eindruck eines eingefrorenen Wartebildschirms (Konzept 7.4).
   */
  function sendePositionen() {
    for (const { socketId, position } of lobby.positionen()) {
      socketVon(socketId)?.emit(EREIGNIS.WARTESCHLANGE, { position });
    }
  }

  /**
   * Loest eine Partie auf: Raum verlassen, Maps leeren.
   *
   * Schritt 2 bis 4 der Aufraeumroutine aus Konzept 7.6. Der Unterschied
   * zwischen einem Server, der einen Vormittag durchhaelt, und einem, der
   * langsam volllaeuft (NFA-10).
   */
  function loeseAuf(partie) {
    for (const sitz of ['unten', 'oben']) {
      socketVon(partie.spieler[sitz].socketId)?.leave(partie.id);
    }
    manager.entferne(partie.id);
  }

  // -------------------------------------------------------------------------
  // Matchmaking
  // -------------------------------------------------------------------------

  /**
   * Startet eine Partie fuer zwei Spieler und teilt es beiden mit.
   *
   * Eine gemeinsame Funktion fuer alle drei Wege in eine Partie – schnelles
   * Spiel (`fuehreZusammen`), privates Spiel (`betreteMitCode`) und Revanche
   * (`aufRevanche`). So gibt es den Partiestart nur einmal im Code.
   *
   * @param {{socketId: string, name: string}} a
   * @param {{socketId: string, name: string}} b
   */
  function starteMitPaar(a, b) {
    const partie = manager.starte(a, b);

    socketVon(a.socketId)?.join(partie.id);
    socketVon(b.socketId)?.join(partie.id);

    const spielstand = spielstandVon(partie);

    // Jeder Spieler erfaehrt seinen eigenen Sitz und den Namen des Gegners.
    // Das ist die einzige personalisierte Nachricht des Protokolls – ab hier
    // genuegt ein Broadcast in den Raum (Konzept 4.6).
    for (const sitz of ['unten', 'oben']) {
      const gegnerSitz = sitz === 'unten' ? 'oben' : 'unten';
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

  /**
   * Fuehrt wartende Spieler zu Partien zusammen, solange mindestens zwei da
   * sind.
   *
   * Die Schleife statt eines einzelnen Versuchs deckt den Fall ab, dass beim
   * Aufraeumen mehrere Paare gleichzeitig zusammenkommen.
   */
  function fuehreZusammen() {
    let paar = lobby.naechstesPaar();

    while (paar) {
      const [a, b] = paar;
      const socketA = socketVon(a.socketId);
      const socketB = socketVon(b.socketId);

      // Zwischen dem Beitritt und diesem Moment kann eine Verbindung
      // weggebrochen sein. Dann kommt der verbliebene Spieler wieder in die
      // Warteschlange (hinten angestellt), statt in einer Partie mit einem
      // Geist zu landen.
      if (!socketA || !socketB) {
        const uebrig = socketA ? a : socketB ? b : null;
        if (uebrig) lobby.beitreten(uebrig.socketId, uebrig.name);
        logger.warn('Zusammenfuehrung abgebrochen, ein Socket war weg');
        paar = lobby.naechstesPaar();
        continue;
      }

      starteMitPaar(a, b);

      paar = lobby.naechstesPaar();
    }

    sendePositionen();
  }

  // -------------------------------------------------------------------------
  // Partieende
  // -------------------------------------------------------------------------

  /**
   * Nach jeder Partie – schnell oder privat –: Beide duerfen eine Revanche
   * wuenschen, allerdings nur fuer kurze Zeit (GRENZEN.REVANCHE_SEKUNDEN,
   * siehe pruefeRevanchen).
   *
   * Nur nach einem echten Ende (regulaer oder Aufgabe) und nur, wenn noch
   * beide verbunden sind – nach einem Verbindungsabbruch ist niemand mehr da,
   * gegen den man noch einmal spielen koennte.
   *
   * @returns {boolean} ob eine Revanche moeglich ist – geht an beide Clients
   */
  function ermoeglicheRevanche(partie, grund) {
    const echtesEnde = grund === GRUND.REGULAER || grund === GRUND.AUFGEGEBEN;
    const { unten, oben } = partie.spieler;

    if (!echtesEnde) return false;
    if (!socketVon(unten.socketId) || !socketVon(oben.socketId)) return false;

    lobby.merkeRevanche(unten, oben);
    return true;
  }

  /**
   * Eine offene Revanche verfaellt. Der alte Gegner erfaehrt es sofort, damit
   * er nicht umsonst wartet.
   */
  function lasseRevancheVerfallen(socketId) {
    const gegnerId = lobby.vergissRevanche(socketId);
    if (gegnerId) socketVon(gegnerId)?.emit(EREIGNIS.REVANCHE_WEG);
  }

  /**
   * Die Frist fuer eine Revanche ist um: Beide Spieler erfahren es, damit ihr
   * Knopf gesperrt wird.
   *
   * Laeuft im Sekundentakt (gateway.js). Ein eigenes Ereignis statt
   * `revanche-weg`, weil der Gegner ja noch da ist – nur die Zeit ist vorbei.
   *
   * @param {number} jetzt  aktuelle Zeit; im Test frei waehlbar, damit kein
   *                        Test die ganze Frist abwarten muss
   */
  function pruefeRevanchen(jetzt = Date.now()) {
    for (const socketId of lobby.abgelaufeneRevanchen(jetzt)) {
      socketVon(socketId)?.emit(EREIGNIS.REVANCHE_ABGELAUFEN);
    }
  }

  /**
   * Prüft die Fristen (Aufräumtakt in gateway.js): Partien ohne Zug enden,
   * zu lange Wartende müssen neu beginnen – beide bekommen eine Nachricht.
   *
   * @param {number} jetzt  aktuelle Zeit; im Test frei wählbar
   */
  function raeumeAuf(jetzt = Date.now()) {
    for (const partie of manager.findeRuhendePartien(PARTIE_RUHE_MS, jetzt)) {
      // SCHUTZ: Ein Fehler bei einer Partie darf die uebrigen Partien und
      // die Wartenden in diesem Takt nicht aufhalten. Aufgeloest ist sie
      // trotzdem (finally in beendeKontrolliert).
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

  /**
   * Beendet eine Partie kontrolliert und benachrichtigt die Beteiligten.
   *
   * Wird von drei Stellen aufgerufen: Aufgabe, Verbindungsabbruch und
   * Fehlerfall (Schicht 2 und 4 der Absturzsicherung). Eine gemeinsame
   * Funktion, damit kein Aufraeumschritt in einem der Pfade fehlt.
   *
   * @param {object} partie
   * @param {string} grund              GRUND.*
   * @param {'unten'|'oben'|null} sieger
   * @param {string|null} ausserSocketId  bekommt keine Nachricht mehr (weil weg)
   */
  function beendeKontrolliert(partie, grund, sieger = null, ausserSocketId = null) {
    if (!partie) return;

    try {
      // Schon beendet, aber noch nicht aufgeloest – nur nach einem Fehler in
      // einem frueheren Schritt moeglich. Dann keine zweite Nachricht.
      if (partie.status !== STATUS.LAEUFT) return;

      const ergebnis = beendeVorzeitig(partie, grund, sieger);
      const spielstand = spielstandVon(partie);
      const revanche = ermoeglicheRevanche(partie, grund);

      for (const sitz of ['unten', 'oben']) {
        const socketId = partie.spieler[sitz].socketId;
        if (socketId === ausserSocketId) continue;

        socketVon(socketId)?.emit(EREIGNIS.ABBRUCH, { grund, spielstand, ergebnis, revanche });
      }

      logger.info('Partie beendet', { spielId: partie.id, grund });
    } finally {
      // SCHUTZ: Auch wenn oben etwas scheitert, bleibt keine halb beendete
      // Partie zurueck.
      loeseAuf(partie);
    }
  }

  // -------------------------------------------------------------------------
  // Handler
  // -------------------------------------------------------------------------

  /**
   * `spiel:beitreten` – drei Faelle:
   *
   *   mit `code`       ueber einen Einladungslink einem privaten Spiel beitreten
   *   mit `privat`     ein privates Spiel erstellen und auf den Freund warten
   *   sonst            schnelles Spiel: oeffentliche Warteschlange
   */
  function aufBeitreten(socket, nutzdaten) {
    // Wer schon spielt, tritt nicht noch einmal bei.
    if (manager.holeNachSocket(socket.id)) {
      sendeFehler(socket, FEHLER.BEREITS_IN_PARTIE);
      return;
    }

    // Wer etwas Neues anfaengt, will keine Revanche mehr.
    lasseRevancheVerfallen(socket.id);

    const name = saubererName(nutzdaten.name);
    let angenommen;
    if (typeof nutzdaten.code === 'string') {
      angenommen = betreteMitCode(socket, name, nutzdaten.code);
    } else if (nutzdaten.privat === true) {
      angenommen = erstellePrivat(socket, name);
    } else {
      angenommen = stelleAn(socket, name);
    }

    // Der Name wird am Socket vermerkt, damit ein spaeteres `spiel:erneut`
    // ohne erneute Namenseingabe funktioniert – erst nach Erfolg, damit ein
    // abgelehnter zweiter Beitritt ihn nicht ueberschreibt.
    if (angenommen) socket.data.name = name;
  }

  /** Schnelles Spiel: anstellen und, wenn moeglich, sofort paaren. */
  function stelleAn(socket, name) {
    const ergebnis = lobby.beitreten(socket.id, name);
    if (!ergebnis.ok) {
      sendeFehler(socket, ergebnis.code);
      return false;
    }

    logger.info('Beitritt', { socketId: socket.id, name });
    // Die Position schickt fuehreZusammen (sendePositionen) – wer sofort
    // gepaart wird, bekommt gleich START.
    fuehreZusammen();
    return true;
  }

  /** Privates Spiel anlegen: Der Ersteller bekommt den Code fuer den Link. */
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

  /**
   * Ueber einen Einladungslink beitreten.
   *
   * Ein falscher Code ist meist kein Angriff, sondern ein alter Link –
   * deshalb gibt es dafuer eine verstaendliche Meldung (`CODE_UNBEKANNT`)
   * statt "Nachricht fehlerhaft". Die Suche in der Map ist fuer jede
   * beliebige Zeichenkette ungefaehrlich.
   */
  function betreteMitCode(socket, name, code) {
    // Wer selbst schon wartet – etwa auf den eigenen Link –, tritt nicht bei.
    if (lobby.enthaelt(socket.id)) {
      sendeFehler(socket, FEHLER.BEREITS_IN_WARTESCHLANGE);
      return false;
    }

    // Grossschreibung angleichen: Ein abgetippter Code "k7m2qx" soll passen.
    const ersteller = lobby.nimmPrivat(code.toUpperCase());

    // Unbekannter Code – oder der Ersteller ist in genau diesem Moment weg.
    if (!ersteller || !socketVon(ersteller.socketId)) {
      sendeFehler(socket, FEHLER.CODE_UNBEKANNT);
      return false;
    }

    starteMitPaar(ersteller, { socketId: socket.id, name });
    return true;
  }

  /** `spiel:abbrechen` – Suche abbrechen. */
  function aufAbbrechen(socket) {
    // Der Klick kam zu spät: Die Partie wurde schon angelegt, während er
    // unterwegs war. Sie läuft normal weiter – der Client wechselt mit START
    // ohnehin ins Spiel. Kein Sieg ohne Zug für den Gegner.
    if (manager.holeNachSocket(socket.id)) {
      logger.debug('Abbrechen ignoriert, Partie läuft schon', { socketId: socket.id });
      return;
    }

    // Auch ein Revanche-Wunsch wird so zurueckgenommen – etwa wenn der
    // Ergebnisdialog mit Esc geschlossen wird.
    lasseRevancheVerfallen(socket.id);

    if (lobby.entferne(socket.id)) {
      logger.info('Suche abgebrochen', { socketId: socket.id });
      sendePositionen();
    }
  }

  /** `spiel:zug` – der eigentliche Spielzug. */
  function aufZug(socket, nutzdaten) {
    const partie = manager.holeNachSocket(socket.id);
    if (!partie) {
      sendeFehler(socket, FEHLER.KEINE_PARTIE);
      return;
    }

    const sitz = sitzVon(partie, socket.id);
    if (!sitz) {
      // Kann nur durch einen Fehler in der Zuordnung entstehen.
      sendeFehler(socket, FEHLER.KEINE_PARTIE);
      return;
    }

    const ergebnis = fuehreZugAus(partie, sitz, nutzdaten.mulde);

    if (!ergebnis.ok) {
      // Invariantenbruch ist etwas anderes als ein Regelverstoss: Der Zustand
      // ist kaputt, die Partie wird kontrolliert beendet (Schicht 4, F-11).
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
      return;
    }

    // Den neuen Zustand in das bestehende Partieobjekt uebernehmen. Die Engine
    // hat eine Kopie geliefert; der Manager haelt aber eine Referenz auf
    // dieses Objekt, deshalb wird hier zugewiesen statt ersetzt.
    Object.assign(partie, ergebnis.partie);
    beruehre(partie);

    const spielstand = spielstandVon(partie);

    // EIN Broadcast an den Raum versorgt beide Spieler. Die unterschiedliche
    // Darstellung entsteht allein durch die Sichttransformation im Client
    // (Entscheidung E-2, Konzept 6.5).
    io.to(partie.id).emit(EREIGNIS.STAND, { spielstand, bericht: ergebnis.bericht });

    if (partie.status === STATUS.BEENDET) {
      const revanche = ermoeglicheRevanche(partie, GRUND.REGULAER);
      io.to(partie.id).emit(EREIGNIS.ENDE, { spielstand, ergebnis: partie.ergebnis, revanche });
      logger.info('Partie regulaer beendet', {
        spielId: partie.id,
        punkte: partie.ergebnis.punkte,
        sieger: partie.ergebnis.sieger,
      });
      loeseAuf(partie);
    }
  }

  /** `spiel:aufgeben` – der Gegner gewinnt. */
  function aufAufgeben(socket) {
    const partie = manager.holeNachSocket(socket.id);
    if (!partie) {
      sendeFehler(socket, FEHLER.KEINE_PARTIE);
      return;
    }

    // SCHUTZ: Ohne Sitz gaebe es keinen Gegner, der gewinnen koennte.
    const sitz = sitzVon(partie, socket.id);
    if (!sitz) {
      sendeFehler(socket, FEHLER.KEINE_PARTIE);
      return;
    }

    const sieger = sitz === 'unten' ? 'oben' : 'unten';
    beendeKontrolliert(partie, GRUND.AUFGEGEBEN, sieger);
  }

  /**
   * `spiel:erneut` – nach Partieende zurueck in die Warteschlange.
   *
   * Auch nach einem privaten Spiel geht es in die oeffentliche Schlange.
   * Wer gegen denselben noch einmal spielen will, nimmt "Revanche"
   * (`aufRevanche`).
   *
   * Der Name kommt bevorzugt vom Socket selbst. Nach einem
   * Verbindungsabbruch ist der Socket aber neu und kennt ihn nicht – dann
   * gilt der mitgeschickte Name, bereinigt wie beim Beitreten.
   */
  function aufErneut(socket, nutzdaten) {
    if (manager.holeNachSocket(socket.id)) {
      sendeFehler(socket, FEHLER.BEREITS_IN_PARTIE);
      return;
    }

    const name = socket.data.name ?? saubererName(nutzdaten.name);
    aufBeitreten(socket, { name });
  }

  /**
   * `spiel:revanche` – nach einer Partie noch einmal gegen denselben.
   *
   * Beide muessen es wollen, und zwar innerhalb der Frist (pruefeRevanchen):
   * Der erste Wunsch wird dem Gegner angeboten, erst der zweite startet die
   * Partie. Die Sitze werden dabei wie immer neu ausgelost (manager.starte) –
   * wer anfaengt, bleibt Zufall.
   */
  function aufRevanche(socket) {
    // Wer schon wieder spielt, braucht keine Revanche.
    if (manager.holeNachSocket(socket.id)) {
      sendeFehler(socket, FEHLER.BEREITS_IN_PARTIE);
      return;
    }

    const ergebnis = lobby.wuenscheRevanche(socket.id);

    if (ergebnis.status === 'KEINE') {
      // Der Gegner ist schon weg, spielt inzwischen etwas anderes, oder die
      // Frist ist vorbei.
      socket.emit(EREIGNIS.REVANCHE_WEG);
      return;
    }

    if (ergebnis.status === 'WARTET') {
      socketVon(ergebnis.gegnerId)?.emit(EREIGNIS.REVANCHE_ANGEBOT);
      return;
    }

    // Noch einmal gedrueckt: Der Gegner hat das Angebot schon.
    if (ergebnis.status === 'SCHON_GEWUENSCHT') return;

    // START: Beide wollen. Zur Sicherheit pruefen, ob noch beide da sind.
    const [a, b] = ergebnis.paar;
    if (!socketVon(a.socketId) || !socketVon(b.socketId)) {
      socket.emit(EREIGNIS.REVANCHE_WEG);
      return;
    }

    logger.info('Revanche', { unten: a.name, oben: b.name });
    starteMitPaar(a, b);
  }

  /**
   * `disconnect` – Tab geschlossen, WLAN weg, Browser abgestuerzt.
   *
   * Pflichtverhalten (Konzept 7.11): Die Partie endet sofort und sauber. Der
   * Prozess laeuft ungestoert weiter; betroffen ist ausschliesslich diese eine
   * Partie (Fall F-01).
   */
  function aufTrennen(socket, grund) {
    logger.info('Verbindung getrennt', { socketId: socket.id, grund });

    // Zuerst den Zaehler der Ratenbegrenzung freigeben: Scheitert ein
    // spaeterer Schritt, bliebe er sonst fuer immer in der Map liegen.
    ratenbegrenzer.vergiss(socket.id);

    // 1. Aus der Warteschlange – einer der drei Pfade aus Konzept 7.4 – und
    //    eine offene Revanche verfallen lassen.
    if (lobby.entferne(socket.id)) sendePositionen();
    lasseRevancheVerfallen(socket.id);

    // 2. Laufende Partie sauber beenden. Der getrennte Socket bekommt nichts
    //    mehr (er ist weg), der Gegner sehr wohl.
    const partie = manager.holeNachSocket(socket.id);
    if (partie) {
      const sitz = sitzVon(partie, socket.id);
      const sieger = sitz === 'unten' ? 'oben' : 'unten';
      beendeKontrolliert(partie, GRUND.GEGNER_WEG, sieger, socket.id);
    }
  }

  // -------------------------------------------------------------------------
  // Schicht 2: Kapselung jedes Handlers
  // -------------------------------------------------------------------------

  /**
   * Registriert einen Handler und legt drei Schutzschichten darum:
   * Ratenbegrenzung, Schemapruefung und try/catch.
   *
   * Das ist der Kern der Anforderung "Der Server darf niemals abstuerzen":
   * Ein Fehler beim Verarbeiten eines Ereignisses bleibt lokal, und beide
   * Spieler bekommen eine verstaendliche Meldung statt einer eingefrorenen
   * Oberflaeche (Konzept 7.7).
   *
   * Weil ALLE eingehenden Ereignisse hier durchlaufen, steht die Absicherung
   * an genau einer Stelle – sie kann bei einem neuen Ereignis nicht vergessen
   * werden.
   *
   * @param {object} socket    die Verbindung, an der registriert wird
   * @param {string} ereignis  Name des Ereignisses, zugleich Schluessel des Schemas
   * @param {Function} handler die eigentliche Fachlogik
   */
  function registriereSicher(socket, ereignis, handler) {
    socket.on(ereignis, (nutzdaten) => {
      try {
        // Ratenbegrenzung vor allem anderen: Eine Flut soll moeglichst frueh
        // versickern (Konzept 7.9).
        if (!ratenbegrenzer.erlaubt(socket.id)) {
          if (ratenbegrenzer.istErsteSperre(socket.id)) {
            sendeFehler(socket, FEHLER.ZU_VIELE_ANFRAGEN);
          }
          return;
        }

        // Schicht 1: Schemapruefung.
        if (!istGueltig(ereignis, nutzdaten)) {
          logger.debug('Nutzdaten abgelehnt', { ereignis, socketId: socket.id });
          sendeFehler(socket, FEHLER.NUTZDATEN_UNGUELTIG);
          return;
        }

        handler(socket, nutzdaten);
      } catch (fehler) {
        logger.error(`Handler ${ereignis} fehlgeschlagen`, fehler);

        // Die betroffene Partie kontrolliert beenden – aber nur diese.
        try {
          // In einer Partie genuegt der Abbruch an beide; sonst bekommt nur
          // der Verursacher eine Fehlermeldung.
          const partie = manager.holeNachSocket(socket.id);
          if (partie) beendeKontrolliert(partie, GRUND.INTERNER_FEHLER);
          else sendeFehler(socket, FEHLER.INTERNER_FEHLER);
        } catch (folgefehler) {
          // Selbst das Aufraeumen darf den Prozess nicht mitreissen.
          logger.error('Aufraeumen nach Fehler fehlgeschlagen', folgefehler);
        }
      }
    });
  }

  /**
   * Registriert alle Ereignisse an einem frisch verbundenen Socket.
   *
   * `disconnect` laeuft bewusst NICHT durch `sicher()`: Es kommt von Socket.io
   * selbst, nicht vom Client, hat also weder Nutzdaten zu pruefen noch eine
   * Rate zu begrenzen. Ein eigenes try/catch hat es trotzdem.
   */
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

  // `beendeKontrolliert` wird auch vom geordneten Herunterfahren gebraucht
  // (SIGTERM, Konzept 7.7), `pruefeRevanchen` vom Sekundentakt – deshalb
  // beide nach aussen gereicht.
  return { registriere, beendeKontrolliert, fuehreZusammen, pruefeRevanchen, raeumeAuf };
}
