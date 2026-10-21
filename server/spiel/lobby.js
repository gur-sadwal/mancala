/**
 * lobby.js – Warteschlange, private Plätze und Revanchen.
 *
 * Merkt Wartende und Revanchewünsche. Gibt Ergebnisse zurück; Nachrichten
 * an die Browser sendet ausschließlich handlers.js.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Zustände und Fristen
 *   == 2. Zustand und Schnittstelle
 *   == 3. In die Warteschlange
 *   == 4. Private Plätze
 *   == 5. Wartende verwalten
 *   == 6. Revanchen
 *   == 7. Anzahl und Grenze
 *
 * Benutzt von: Handler und Gateway. Benutzt das Protokoll und util/ids.js.
 */

import { FEHLER, GRENZEN } from '../../shared/protokoll.js';
import { neuerEinladungsCode } from '../util/ids.js';

// == 1. Zustände und Fristen =============================================
// Diese Rückgaben kennt nur der Server; sie gehören nicht ins Protokoll.
export const REVANCHE_STATUS = Object.freeze({
  KEINE: 'KEINE',
  ABGELAUFEN: 'ABGELAUFEN',
  WARTET: 'WARTET',
  SCHON_GEWUENSCHT: 'SCHON_GEWUENSCHT',
  START: 'START',
});

// EINSTELLBAR: Puffer über die Frist, die der Browser anzeigt. Ein Klick kurz
// vor Ablauf zählt so trotz Laufzeit im Netz noch.
const REVANCHE_KULANZ_MS = 2000;
export const REVANCHE_FRIST_MS = GRENZEN.REVANCHE_SEKUNDEN * 1000
  + REVANCHE_KULANZ_MS;

// EINSTELLBAR: So oft sucht gateway.js nach abgelaufenen Revanchen.
export const REVANCHE_TAKT_MS = 1000;

// EINSTELLBAR: Höchstens so viele Wartende (öffentlich und privat).
// SCHUTZ: Ohne Grenze könnten wenige Verbindungen beliebig viele private
// Plätze anlegen. Tests übergeben eine kleinere Grenze.
const WARTENDE_MAX = 100;

// == 2. Zustand und Schnittstelle ========================================
// Jede neue Lobby hat eigenen Zustand; ihre inneren Funktionen teilen ihn.
export function erzeugeLobby({ wartendeMax = WARTENDE_MAX } = {}) {
  const warteschlange = [];
  const privat = new Map();
  const revanchen = new Map();

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

  // == 3. In die Warteschlange ===========================================
  // SCHUTZ: Ein Socket darf nicht öffentlich und privat zugleich warten.
  function beitreten(socketId, name, jetzt = Date.now()) {
    if (enthaelt(socketId)) {
      return { ok: false, code: FEHLER.BEREITS_IN_WARTESCHLANGE };
    }

    // Wartet schon jemand, entsteht sofort eine Partie: kein neuer Platz.
    if (istVoll() && warteschlange.length === 0) {
      return { ok: false, code: FEHLER.SERVER_VOLL };
    }

    warteschlange.push({ socketId, name, seit: jetzt });
    return { ok: true };
  }

  // == 4. Private Plätze =================================================
  function erstellePrivat(socketId, name, jetzt = Date.now()) {
    if (enthaelt(socketId)) {
      return { ok: false, code: FEHLER.BEREITS_IN_WARTESCHLANGE };
    }
    if (istVoll()) return { ok: false, code: FEHLER.SERVER_VOLL };

    // SCHUTZ: Ein schon vergebener Zufallscode darf keinen Platz überschreiben.
    let einladung = neuerEinladungsCode();
    while (privat.has(einladung)) {
      einladung = neuerEinladungsCode();
    }

    privat.set(einladung, { socketId, name, seit: jetzt });
    return { ok: true, einladung };
  }

  // Lesen und Entfernen zusammen: Derselbe Link startet keine zweite Partie.
  function nimmPrivat(einladung) {
    const eintrag = privat.get(einladung);
    if (!eintrag) return null;

    privat.delete(einladung);
    return eintrag;
  }

  // == 5. Wartende verwalten =============================================
  function entferne(socketId) {
    const index = warteschlange.findIndex((e) => e.socketId === socketId);
    if (index !== -1) {
      warteschlange.splice(index, 1);
      return true;
    }

    const einladung = findePrivatenCode(socketId);
    return einladung !== null && privat.delete(einladung);
  }

  function enthaelt(socketId) {
    if (warteschlange.some((e) => e.socketId === socketId)) return true;

    return findePrivatenCode(socketId) !== null;
  }

  // Ein gemeinsamer Suchweg für enthaelt und entferne.
  function findePrivatenCode(socketId) {
    for (const [einladung, eintrag] of privat) {
      if (eintrag.socketId === socketId) return einladung;
    }
    return null;
  }

  function naechstesPaar() {
    if (warteschlange.length < 2) return null;
    return warteschlange.splice(0, 2);
  }

  function positionen() {
    return warteschlange.map((e, i) => ({
      socketId: e.socketId,
      position: i + 1,
    }));
  }

  /**
   * Entfernt alle, die maxAlterMs oder länger warten, und liefert ihre
   * Socket-Kennungen.
   * @param {number} maxAlterMs erlaubte Wartezeit
   * @param {number} jetzt Zeitquelle für Grenztests
   */
  function raeumeAuf(maxAlterMs, jetzt = Date.now()) {
    const grenze = jetzt - maxAlterMs;
    const entfernt = [];

    // Rückwärts löschen, damit noch ungeprüfte Einträge nicht verrutschen.
    for (let i = warteschlange.length - 1; i >= 0; i -= 1) {
      if (warteschlange[i].seit <= grenze) {
        entfernt.push(warteschlange[i].socketId);
        warteschlange.splice(i, 1);
      }
    }

    for (const [einladung, eintrag] of privat) {
      if (eintrag.seit <= grenze) {
        entfernt.push(eintrag.socketId);
        privat.delete(einladung);
      }
    }
    return entfernt;
  }

  // == 6. Revanchen ======================================================
  function merkeRevanche(a, b, jetzt = Date.now()) {
    const bis = jetzt + REVANCHE_FRIST_MS;
    revanchen.set(a.socketId, { ich: a, gegner: b, gewuenscht: false, bis });
    revanchen.set(b.socketId, { ich: b, gegner: a, gewuenscht: false, bis });
  }

  // SCHUTZ: Ein Wunsch gilt nur für dasselbe Paar und innerhalb der Frist.
  function wuenscheRevanche(socketId, jetzt = Date.now()) {
    const eintrag = revanchen.get(socketId);
    const gegenueber = eintrag ? revanchen.get(eintrag.gegner.socketId) : null;

    if (!eintrag || !gegenueber || gegenueber.gegner.socketId !== socketId) {
      revanchen.delete(socketId);
      return { status: REVANCHE_STATUS.KEINE };
    }

    // Zwischen zwei Prüftakten abgelaufen: Beide sollen es erfahren.
    if (eintrag.bis <= jetzt) {
      vergissRevanche(socketId);
      return {
        status: REVANCHE_STATUS.ABGELAUFEN,
        gegnerId: eintrag.gegner.socketId,
      };
    }

    // Nur ein Doppelklick ohne Zustimmung des Gegners ist "schon gewünscht".
    if (eintrag.gewuenscht && !gegenueber.gewuenscht) {
      return { status: REVANCHE_STATUS.SCHON_GEWUENSCHT };
    }

    eintrag.gewuenscht = true;
    if (!gegenueber.gewuenscht) {
      return {
        status: REVANCHE_STATUS.WARTET,
        gegnerId: eintrag.gegner.socketId,
      };
    }

    // ACHTUNG: Das Paar bleibt gemerkt, bis handlers.js die Partie wirklich
    // gestartet und vergissRevanche aufgerufen hat. Ist der Server voll,
    // bleiben die Wünsche so bis zum Ende der Frist erhalten; ein weiterer
    // Klick liefert dann erneut START.
    return {
      status: REVANCHE_STATUS.START,
      paar: [gegenueber.ich, eintrag.ich],
    };
  }

  // Beide Seiten vergessen, damit der alte Gegner nicht vergeblich wartet.
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

  // Beim Durchlaufen einer Map darf der aktuelle Eintrag gelöscht werden.
  function abgelaufeneRevanchen(jetzt = Date.now()) {
    const abgelaufen = [];

    for (const [socketId, eintrag] of revanchen) {
      if (eintrag.bis <= jetzt) {
        abgelaufen.push(socketId);
        revanchen.delete(socketId);
      }
    }
    return abgelaufen;
  }

  // == 7. Anzahl und Grenze ==============================================
  function anzahl() {
    return warteschlange.length + privat.size;
  }

  function istVoll() {
    return anzahl() >= wartendeMax;
  }
}
