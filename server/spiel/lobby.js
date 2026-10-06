/**
 * Warteschlange und Zusammenfuehrung zweier Spieler (Konzept 7.4).
 *
 * Zwei Wege in eine Partie:
 *
 *   schnelles Spiel  oeffentliche Warteschlange – wer zuerst kommt, spielt
 *                    zuerst. Kein Bewertungssystem, keine Vorlieben (Konzept 1.2).
 *   privates Spiel   ein Warteplatz mit Einladungscode. Nur wer den Code
 *                    (den Link) kennt, kann dazukommen.
 *
 * Dazu die Revanche: Nach jeder Partie koennen dieselben zwei noch einmal
 * gegeneinander spielen – aber nur, wenn BEIDE das wollen, und nur innerhalb
 * einer kurzen Frist.
 *
 * Das Modul kennt Sockets nur als Kennungen und ist damit ohne Server testbar.
 */

import { FEHLER, GRENZEN } from '../../shared/protokoll.js';
import { neuerEinladungsCode } from '../util/ids.js';

/**
 * So lange gilt ein Revanche-Angebot auf dem Server: die angezeigte Frist
 * plus 2 Sekunden Kulanz.
 *
 * Die Kulanz deckt die Uebertragungszeit ab: Der Zaehler im Browser startet
 * erst, wenn das Ergebnis dort ankommt, und ein Klick bei "noch 1 s" braucht
 * noch einen Moment bis zum Server. Er soll trotzdem zaehlen.
 */
export const REVANCHE_FRIST_MS = (GRENZEN.REVANCHE_SEKUNDEN + 2) * 1000;

/** Abstand, in dem der Server abgelaufene Revanchen sucht (gateway.js). */
export const REVANCHE_TAKT_MS = 1000;

/**
 * Erzeugt eine Warteschlange.
 *
 * Bewusst eine Fabrikfunktion statt eines Moduls mit globalem Array: So kann
 * jeder Test mit einer frischen, leeren Warteschlange arbeiten, ohne dass
 * Zustand aus einem vorherigen Test durchschlaegt.
 */
export function erzeugeLobby() {
  /** @type {{socketId: string, name: string, seit: number}[]} */
  const warteschlange = [];

  /**
   * Private Warteplaetze: Einladungscode -> Ersteller.
   *
   * Eine Map statt eines Arrays, weil hier nicht nach Reihenfolge, sondern
   * direkt nach dem Code gesucht wird.
   *
   * @type {Map<string, {socketId: string, name: string, seit: number}>}
   */
  const privat = new Map();

  /**
   * Nimmt einen Spieler auf.
   * @returns {{ok: true, position: number} | {ok: false, code: string}}
   */
  function beitreten(socketId, name) {
    // Doppelte Eintraege verhindern – etwa bei einem doppelt gesendeten
    // Formular oder einem Skript, das mehrfach beitritt. Gilt fuer beide
    // Wege: Wer privat wartet, steht nicht zusaetzlich in der Schlange.
    if (enthaelt(socketId)) {
      return { ok: false, code: FEHLER.BEREITS_IN_WARTESCHLANGE };
    }

    warteschlange.push({ socketId, name, seit: Date.now() });
    return { ok: true, position: warteschlange.length };
  }

  /**
   * Legt einen privaten Warteplatz an.
   *
   * @returns {{ok: true, einladung: string} | {ok: false, code: string}}
   *          `einladung` ist der Code fuer den Link, z. B. "K7M2QX"
   */
  function erstellePrivat(socketId, name) {
    if (enthaelt(socketId)) {
      return { ok: false, code: FEHLER.BEREITS_IN_WARTESCHLANGE };
    }

    // Zwei gleiche Codes sind extrem unwahrscheinlich, aber nicht unmoeglich –
    // dann einfach einen neuen ziehen.
    let einladung = neuerEinladungsCode();
    while (privat.has(einladung)) {
      einladung = neuerEinladungsCode();
    }

    privat.set(einladung, { socketId, name, seit: Date.now() });
    return { ok: true, einladung };
  }

  /**
   * Holt den Ersteller zu einem Einladungscode und gibt den Platz frei.
   *
   * Holen und Entfernen in einem Schritt: So kann ein Link nur EINMAL
   * benutzt werden – ein dritter Spieler mit demselben Link bekommt null.
   *
   * @returns {{socketId: string, name: string, seit: number} | null}
   */
  function nimmPrivat(einladung) {
    const eintrag = privat.get(einladung);
    if (!eintrag) return null;

    privat.delete(einladung);
    return eintrag;
  }

  /**
   * Entfernt einen Spieler.
   *
   * Ein Eintrag wird an DREI Stellen entfernt: bei `spiel:abbrechen`, beim
   * Zusammenfuehren und bei `disconnect`. Alle drei Wege laufen ueber genau
   * diese Funktion, damit kein Pfad vergessen wird (Konzept 7.4).
   *
   * @returns {boolean} true, wenn wirklich jemand entfernt wurde
   */
  function entferne(socketId) {
    const index = warteschlange.findIndex((e) => e.socketId === socketId);
    if (index !== -1) {
      warteschlange.splice(index, 1);
      return true;
    }

    // Nicht in der Schlange? Dann vielleicht auf einem privaten Platz.
    for (const [einladung, eintrag] of privat) {
      if (eintrag.socketId === socketId) {
        privat.delete(einladung);
        return true;
      }
    }
    return false;
  }

  /** Wartet dieser Socket – oeffentlich oder privat? */
  function enthaelt(socketId) {
    if (warteschlange.some((e) => e.socketId === socketId)) return true;

    for (const eintrag of privat.values()) {
      if (eintrag.socketId === socketId) return true;
    }
    return false;
  }

  /**
   * Nimmt die beiden aeltesten Wartenden heraus – oder null.
   * `splice` entfernt sie zugleich aus der Warteschlange.
   */
  function naechstesPaar() {
    return warteschlange.length >= 2 ? warteschlange.splice(0, 2) : null;
  }

  /**
   * Aktuelle Positionen aller Wartenden (1-basiert).
   *
   * Nach jeder Aenderung erhalten alle Wartenden ihre neue Position. Bei 30
   * Personen ist das eine vernachlaessigbare Zahl kleiner Nachrichten und
   * verhindert den Eindruck eines eingefrorenen Wartebildschirms.
   */
  function positionen() {
    return warteschlange.map((e, i) => ({ socketId: e.socketId, position: i + 1 }));
  }

  /**
   * Entfernt Eintraege, die MINDESTENS `maxAlterMs` alt sind.
   *
   * Rueckversicherung gegen vergessene Aufraeumpfade (Konzept 7.6, NFA-10).
   *
   * Die Grenze ist bewusst einschliessend (`<=`): Bei einem Aufruf mit 0
   * wird alles entfernt, statt dass das Ergebnis davon abhaengt, ob der
   * Eintrag in derselben Millisekunde entstanden ist. Im Betrieb (30 Minuten)
   * macht das keinen Unterschied, im Test aber den zwischen deterministisch
   * und zufaellig.
   *
   * @returns {string[]} Kennungen der entfernten Eintraege
   */
  function raeumeAuf(maxAlterMs) {
    const grenze = Date.now() - maxAlterMs;
    const entfernt = [];

    // Rueckwaerts laufen, damit das Entfernen die noch zu pruefenden Indizes
    // nicht verschiebt.
    for (let i = warteschlange.length - 1; i >= 0; i -= 1) {
      if (warteschlange[i].seit <= grenze) {
        entfernt.push(warteschlange[i].socketId);
        warteschlange.splice(i, 1);
      }
    }

    // Vergessene private Plaetze ebenso – sonst bliebe ein alter Link ewig gueltig.
    for (const [einladung, eintrag] of privat) {
      if (eintrag.seit <= grenze) {
        entfernt.push(eintrag.socketId);
        privat.delete(einladung);
      }
    }
    return entfernt;
  }

  /**
   * Revanche-Buch: Wer darf nach einer Partie gegen wen noch einmal?
   *
   * Je Spieler ein Eintrag: er selbst, sein letzter Gegner, ob er schon
   * "Revanche" gedrueckt hat und bis wann das Angebot gilt (`bis`, in ms).
   * Ein Eintrag verschwindet, wenn der Spieler etwas Neues anfaengt oder die
   * Verbindung trennt (vergissRevanche) – spaetestens aber, wenn die Frist
   * vorbei ist (abgelaufeneRevanchen).
   *
   * @type {Map<string, {ich: object, gegner: object, gewuenscht: boolean, bis: number}>}
   */
  const revanchen = new Map();

  /**
   * Nach dem Ende einer Partie: beide duerfen eine Revanche wuenschen.
   *
   * @param {number} jetzt  Zeitpunkt des Partieendes; im Test frei waehlbar,
   *                        damit kein Test die ganze Frist abwarten muss
   */
  function merkeRevanche(a, b, jetzt = Date.now()) {
    const bis = jetzt + REVANCHE_FRIST_MS;
    revanchen.set(a.socketId, { ich: a, gegner: b, gewuenscht: false, bis });
    revanchen.set(b.socketId, { ich: b, gegner: a, gewuenscht: false, bis });
  }

  /**
   * Ein Spieler drueckt "Revanche".
   *
   *   KEINE    kein Eintrag, oder der Gegner wartet schon auf jemand anderen
   *   WARTET   erster Wunsch – der Gegner soll davon erfahren
   *   START    beide wollen – `paar` spielt noch einmal gegeneinander
   *
   * @returns {{status: 'KEINE'} | {status: 'WARTET', gegnerId: string}
   *          | {status: 'START', paar: object[]}}
   */
  function wuenscheRevanche(socketId) {
    const eintrag = revanchen.get(socketId);
    const gegenueber = eintrag ? revanchen.get(eintrag.gegner.socketId) : null;

    // Der Gegner muss noch auf GENAU DIESE Revanche warten – nicht etwa schon
    // auf eine mit einem anderen Spieler.
    if (!eintrag || !gegenueber || gegenueber.gegner.socketId !== socketId) {
      revanchen.delete(socketId);
      return { status: 'KEINE' };
    }

    eintrag.gewuenscht = true;
    if (!gegenueber.gewuenscht) {
      return { status: 'WARTET', gegnerId: eintrag.gegner.socketId };
    }

    revanchen.delete(socketId);
    revanchen.delete(eintrag.gegner.socketId);
    return { status: 'START', paar: [gegenueber.ich, eintrag.ich] };
  }

  /**
   * Revanche verfaellt: neues Spiel, Abbrechen, Abmelden, Verbindungsabbruch.
   *
   * Der Eintrag des Gegners faellt mit weg, damit dessen Knopf nicht ins
   * Leere fuehrt.
   *
   * @returns {string|null} Kennung des alten Gegners, der noch wartete
   */
  function vergissRevanche(socketId) {
    const eintrag = revanchen.get(socketId);
    if (!eintrag) return null;
    revanchen.delete(socketId);

    const gegnerId = eintrag.gegner.socketId;
    const gegenueber = revanchen.get(gegnerId);
    if (gegenueber && gegenueber.gegner.socketId === socketId) {
      revanchen.delete(gegnerId);
      return gegnerId;
    }
    return null;
  }

  /**
   * Entfernt alle Revanchen, deren Frist vorbei ist – auch die, bei denen
   * einer schon "Revanche" gedrueckt hat.
   *
   * Beide Eintraege einer Partie haben denselben Ablaufzeitpunkt und
   * verschwinden deshalb im selben Aufruf.
   *
   * @param {number} jetzt  aktuelle Zeit; im Test frei waehlbar
   * @returns {string[]} Kennungen der Spieler, deren Revanche verfallen ist
   */
  function abgelaufeneRevanchen(jetzt = Date.now()) {
    const abgelaufen = [];

    for (const [socketId, eintrag] of revanchen) {
      // Einschliessende Grenze, aus demselben Grund wie in raeumeAuf.
      if (eintrag.bis <= jetzt) {
        abgelaufen.push(socketId);
        revanchen.delete(socketId);
      }
    }
    return abgelaufen;
  }

  /** Anzahl Wartender (oeffentlich und privat) – fuer `/gesundheit` und Protokollausgaben. */
  function anzahl() {
    return warteschlange.length + privat.size;
  }

  return {
    beitreten,
    erstellePrivat,
    nimmPrivat,
    entferne,
    enthaelt,
    naechstesPaar,
    positionen,
    raeumeAuf,
    anzahl,
    merkeRevanche,
    wuenscheRevanche,
    vergissRevanche,
    abgelaufeneRevanchen,
  };
}
