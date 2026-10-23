/**
 * protokoll.js – gemeinsame Begriffe von Server und Browser.
 *
 * Beide Seiten laden dieselbe Datei: Ereignisse, Zugform, Fehlertexte,
 * Gründe, Namensregel und Coderegel. Hier dürfen keine Node-Funktionen oder
 * Browserzugriffe stehen.
 *
 * Inhalt:
 *   == 1. Ereignisnamen und Zugform
 *   == 2. Fehler und sichtbare Texte
 *   == 3. Status, Endegründe und Grenzen
 *   == 4. Gemeinsame Namensregel
 *   == 5. Gemeinsame Coderegel
 *
 * Benutzt von: Server und client/js. Wird über /shared/protokoll.js
 * ausgeliefert.
 */

// == 1. Ereignisnamen und Zugform ========================================
export const EREIGNIS = Object.freeze({
  // Vom Browser zum Server.
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

// SCHUTZ: Ein Zug meldet genau { type: "MOVE", pitIndex: 0..5 }, wie es die
// Aufgabenstellung verlangt. pitIndex ist die Nummer der eigenen Mulde; Brett
// und Punkte rechnet nur der Server.
export const ZUG_TYP = 'MOVE';

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
  ZU_VIELE_CODEVERSUCHE: 'ZU_VIELE_CODEVERSUCHE',
  INTERNER_FEHLER: 'INTERNER_FEHLER',
  WARTEZEIT_ABGELAUFEN: 'WARTEZEIT_ABGELAUFEN',
  SERVER_VOLL: 'SERVER_VOLL',
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
  // Tippfehler, abgelaufen oder schon benutzt: Für alle gilt derselbe Text.
  [FEHLER.CODE_UNBEKANNT]: 'Zu diesem Raumcode gibt es kein offenes Spiel. '
    + 'Prüfe den Code oder bitte um einen neuen Link.',
  // ACHTUNG: „eine Minute“ wie CODE_FENSTER_MS in server/socket/gateway.js.
  [FEHLER.ZU_VIELE_CODEVERSUCHE]: 'Zu viele Codeversuche. Bitte warte eine '
    + 'Minute und versuche es dann erneut.',
  [FEHLER.INTERNER_FEHLER]: 'Es ist ein interner Fehler aufgetreten.',
  [FEHLER.WARTEZEIT_ABGELAUFEN]:
    'Die Wartezeit ist abgelaufen. Bitte starte ein neues Spiel.',
  [FEHLER.SERVER_VOLL]:
    'Der Server ist gerade voll. Bitte versuche es in ein paar Minuten erneut.',
});

// == 3. Status, Endegründe und Grenzen ===================================
// Kein Status „wartet“: Eine Partie entsteht erst mit zwei Spielern, bis
// dahin führt die Lobby die Wartenden.
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

// EINSTELLBAR: Browser und Server lesen diese Werte von hier, damit Texte und
// Prüfungen nicht auseinanderlaufen.
export const GRENZEN = Object.freeze({
  // ACHTUNG: Zählt Unicode-Codepunkte. HTML maxlength zählt UTF-16-Einheiten.
  NAME_MAX: 20,
  // Mehr Akzente auf einem Zeichen braucht kein Name; Zalgo-Text stapelt
  // sonst Dutzende und überdeckt die Zeilen darüber und darunter.
  AKZENTE_MAX: 3,
  MULDE_MIN: 0,
  MULDE_MAX: 5,
  CODE_LAENGE: 6,
  REVANCHE_SEKUNDEN: 15,

  PARTIE_RUHE_MINUTEN: 15,
  WARTEN_MINUTEN: 7.5,
});

// == 4. Gemeinsame Namensregel ===========================================
// Cc sind Steuerzeichen, Cf unsichtbare Formatzeichen wie die Leserichtung,
// Zl und Zp Zeilen- und Absatztrenner. Die Füllzeichen danach (Hangul,
// Braille-Leerzeichen) zählen als Schriftzeichen, sehen aber leer aus.
const UNSICHTBAR = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u115F\u1160\u3164\uFFA0\u2800]/u;

// M sind Zeichen, die sich auf das vorige setzen, etwa Akzente.
const AKZENT = /\p{M}/u;

// SCHUTZ: Ohne spitze Klammern enthält ein Name kein vollständiges HTML-Tag.
// Der Client setzt Namen zusätzlich nur über textContent.
export const NAME_VERBOTEN = '<>';

/**
 * Entfernt verbotene und unsichtbare Zeichen, begrenzt Akzente und kürzt auf
 * NAME_MAX Codepunkte. Kann leer liefern: Der Browser meldet es, der Server
 * setzt einen Ersatz ein. Familien-Emoji zerfallen, weil ihr unsichtbares
 * Verbindungszeichen entfällt.
 * @param {string} text
 * @returns {string}
 */
export function bereinigeName(text) {
  let erlaubt = '';
  let akzente = 0;

  // NFC setzt zerlegte Umlaute wie o + ¨ zu einem einzigen ö zusammen.
  for (const zeichen of text.normalize('NFC')) {
    if (UNSICHTBAR.test(zeichen) || NAME_VERBOTEN.includes(zeichen)) continue;

    if (AKZENT.test(zeichen)) {
      akzente += 1;
      // SCHUTZ: Ein Akzent ohne Buchstaben davor oder zu viele übereinander
      // fallen weg; ein Name nur aus Akzenten wird so leer.
      const ohneGrundzeichen = erlaubt === '' || /\s$/u.test(erlaubt);
      if (ohneGrundzeichen || akzente > GRENZEN.AKZENTE_MAX) continue;
    } else {
      akzente = 0;
    }
    erlaubt += zeichen;
  }

  // Array.from erhält Codepunkte; slice direkt auf Text kann Emoji halbieren.
  const zeichenListe = Array.from(erlaubt.trim());
  const gekuerzt = zeichenListe.slice(0, GRENZEN.NAME_MAX).join('');

  // Durch das Kürzen kann ein Leerzeichen neu ans Ende geraten.
  return gekuerzt.trim();
}

// == 5. Gemeinsame Coderegel =============================================
// 0, O, 1, I und L fehlen: Beim Abtippen verwechselt man sie leicht.
// SCHUTZ: 31 Zeichen an 6 Stellen ergeben 31^6, rund 887 Millionen Codes.
// Wer Zeichen streicht, muss CODE_LAENGE so erhöhen, dass es nicht weniger
// werden; protokoll.test.js prüft das.
export const CODE_ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// \s sind Leerzeichen aller Art, \p{Pd} Binde- und Gedankenstriche. Sie und
// der Unterstrich trennen beim Abtippen nur Gruppen wie in ABC-234.
const CODE_TRENNER = /[\s_\p{Pd}]/gu;

/**
 * Bringt eine Eingabe in die Form, die der Server vergibt: Trennzeichen
 * fallen weg, Buchstaben werden groß. Prüft nichts; das macht hatCodeForm.
 * O wird nicht zu 0 und I nicht zu 1: Keines davon steht im Zeichensatz.
 * @param {string} text
 * @returns {string}
 */
export function normalisiereCode(text) {
  return text.replace(CODE_TRENNER, '').toUpperCase();
}

// SCHUTZ: Streng nur die kanonische Form; Kleinbuchstaben oder Trennzeichen
// müssen vorher durch normalisiereCode.
export function hatCodeForm(code) {
  if (typeof code !== 'string') return false;
  if (code.length !== GRENZEN.CODE_LAENGE) return false;
  return [...code].every((zeichen) => CODE_ZEICHEN.includes(zeichen));
}
