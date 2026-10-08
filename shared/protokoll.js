/**
 * protokoll.js – gemeinsame Begriffe von Server und Browser.
 *
 * Beide Seiten laden dieselbe Datei: Ereignisse, Fehlertexte, Gründe und
 * Namensregel. Hier dürfen keine Node-Funktionen oder Browserzugriffe stehen.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Ereignisnamen
 *   == 2. Fehler und sichtbare Texte
 *   == 3. Status, Endegründe und Grenzen
 *   == 4. Gemeinsame Namensregel
 *   == 5. Zeichen im Einladungscode
 *
 * Benutzt von: Server und client/js. Wird über /shared/protokoll.js
 * ausgeliefert.
 */

// == 1. Ereignisnamen ====================================================
// spiel:zug mit { mulde } entspricht { type: "MOVE", pitIndex }:
// Der Socket.io-Ereignisname trägt die Typangabe, nur die Nummer wird gesendet.
export const EREIGNIS = Object.freeze({
  // Vom Browser zum Server. Der Zug enthält nur { mulde: 0..5 }.
  BEITRETEN: 'spiel:beitreten',
  ABBRECHEN: 'spiel:abbrechen',
  ZUG: 'spiel:zug',
  AUFGEBEN: 'spiel:aufgeben',
  ERNEUT: 'spiel:erneut',
  REVANCHE: 'spiel:revanche',

  // Vom Server zum Browser. Stand und Ergebnis stammen immer vom Server.
  WARTESCHLANGE: 'warteschlange',
  PRIVAT: 'spiel:privat',
  START: 'spiel:start',
  STAND: 'spiel:stand',
  ENDE: 'spiel:ende',
  ABBRUCH: 'spiel:abbruch',
  REVANCHE_ANGEBOT: 'spiel:revanche-angebot',
  REVANCHE_WEG: 'spiel:revanche-weg',
  REVANCHE_ABGELAUFEN: 'spiel:revanche-abgelaufen',
  FEHLER: 'spiel:fehler',
});

// == 2. Fehler und sichtbare Texte =======================================
export const FEHLER = Object.freeze({
  NUTZDATEN_UNGUELTIG: 'NUTZDATEN_UNGUELTIG',
  NICHT_AM_ZUG: 'NICHT_AM_ZUG',
  MULDE_UNGUELTIG: 'MULDE_UNGUELTIG',
  MULDE_LEER: 'MULDE_LEER',
  PARTIE_NICHT_AKTIV: 'PARTIE_NICHT_AKTIV',
  KEINE_PARTIE: 'KEINE_PARTIE',
  ZU_VIELE_ANFRAGEN: 'ZU_VIELE_ANFRAGEN',
  BEREITS_IN_WARTESCHLANGE: 'BEREITS_IN_WARTESCHLANGE',
  BEREITS_IN_PARTIE: 'BEREITS_IN_PARTIE',
  CODE_UNBEKANNT: 'CODE_UNBEKANNT',
  INTERNER_FEHLER: 'INTERNER_FEHLER',
  WARTEZEIT_ABGELAUFEN: 'WARTEZEIT_ABGELAUFEN',
});

export const FEHLER_TEXT = Object.freeze({
  [FEHLER.NUTZDATEN_UNGUELTIG]: 'Die Nachricht war fehlerhaft aufgebaut.',
  [FEHLER.NICHT_AM_ZUG]: 'Du bist gerade nicht am Zug.',
  [FEHLER.MULDE_UNGUELTIG]: 'Diese Mulde gibt es nicht.',
  [FEHLER.MULDE_LEER]: 'Diese Mulde ist leer.',
  [FEHLER.PARTIE_NICHT_AKTIV]: 'Diese Partie läuft nicht mehr.',
  [FEHLER.KEINE_PARTIE]: 'Du bist in keiner laufenden Partie.',
  [FEHLER.ZU_VIELE_ANFRAGEN]: 'Zu viele Anfragen. Bitte kurz warten.',
  [FEHLER.BEREITS_IN_WARTESCHLANGE]: 'Du suchst bereits nach einem Gegner.',
  [FEHLER.BEREITS_IN_PARTIE]: 'Du bist bereits in einer Partie.',
  [FEHLER.CODE_UNBEKANNT]: 'Dieses private Spiel gibt es nicht mehr. Bitte um einen neuen Link.',
  [FEHLER.INTERNER_FEHLER]: 'Es ist ein interner Fehler aufgetreten.',
  [FEHLER.WARTEZEIT_ABGELAUFEN]: 'Die Wartezeit ist abgelaufen. Bitte starte ein neues Spiel.',
});

// == 3. Status, Endegründe und Grenzen ===================================
// Eine Partie entsteht erst mit zwei Spielern; Wartende stehen in der Lobby.
export const STATUS = Object.freeze({
  LAEUFT: 'LAEUFT',
  BEENDET: 'BEENDET',
  ABGEBROCHEN: 'ABGEBROCHEN',
});

export const GRUND = Object.freeze({
  REGULAER: 'REGULAER',
  GEGNER_WEG: 'GEGNER_WEG',
  AUFGEGEBEN: 'AUFGEGEBEN',
  INTERNER_FEHLER: 'INTERNER_FEHLER',
  SERVER_ENDE: 'SERVER_ENDE',
  ZU_LANGE_KEIN_ZUG: 'ZU_LANGE_KEIN_ZUG',
});

/** Wert von ergebnis.sieger bei gleichen Hauspunkten. */
export const REMIS = 'remis';

// EINSTELLBAR: Gemeinsame Fristen und Eingabegrenzen stehen an einer Stelle.
export const GRENZEN = Object.freeze({
  // ACHTUNG: Zählt ganze Unicode-Zeichen. HTML maxlength zählt UTF-16-Hälften.
  NAME_MAX: 20,
  MULDE_MIN: 0,
  MULDE_MAX: 5,
  CODE_LAENGE: 6,
  REVANCHE_SEKUNDEN: 15,

  PARTIE_RUHE_MINUTEN: 15,

  WARTEN_MINUTEN: 7.5,
});

// == 4. Gemeinsame Namensregel ===========================================
// Cc sind Steuerzeichen, Cf unsichtbare Formatzeichen wie die Leserichtung.
const UNSICHTBAR = /[\p{Cc}\p{Cf}]/u;

// SCHUTZ: Ohne spitze Klammern enthält ein Name kein vollständiges HTML-Tag.
// Der Client setzt Namen zusätzlich nur über textContent.
export const NAME_VERBOTEN = '<>';

/**
 * Entfernt unsichtbare/verbotene Zeichen und kürzt auf ganze Unicode-Zeichen.
 * Kann leer liefern: Der Browser meldet es, der Server setzt einen Ersatz ein.
 * Familien-Emoji zerfallen, weil ihr unsichtbares Verbindungszeichen entfällt.
 * @param {string} text
 * @returns {string}
 */
export function bereinigeName(text) {
  let erlaubt = '';
  for (const zeichen of text) {
    if (!UNSICHTBAR.test(zeichen) && !NAME_VERBOTEN.includes(zeichen)) {
      erlaubt += zeichen;
    }
  }

  // Array.from erhält ganze Zeichen; slice direkt auf Text halbiert Emoji.
  const zeichenListe = Array.from(erlaubt.trim());
  const gekuerzt = zeichenListe.slice(0, GRENZEN.NAME_MAX).join('');

  // Durch das Kürzen kann ein Leerzeichen neu ans Ende geraten.
  return gekuerzt.trim();
}

// == 5. Zeichen im Einladungscode ========================================
// Leicht verwechselbare Zeichen wie 0/O und 1/I fehlen beim Abtippen.
export const CODE_ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
