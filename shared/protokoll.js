/**
 * Gemeinsames Protokoll fuer Server und Client (Konzept 6).
 *
 * Diese Datei wird vom Server per `import` geladen UND vom Browser als
 * statische Datei ausgeliefert. Beide Seiten benutzen buchstaeblich dieselbe
 * Datei – der einfachste Weg, Tippfehler in Ereignisnamen auszuschliessen,
 * ohne einen Bundler einzufuehren (Konzept 12.3). Aus demselben Grund steht
 * hier auch die Namensregel `bereinigeName`.
 *
 * WICHTIG: Hier darf nichts stehen, was nur im Node-Umfeld existiert (kein
 * `process`, kein `require`, kein Dateizugriff) – sonst bricht der Browser.
 */

/**
 * Namen aller Socket.io-Ereignisse.
 *
 * Die Anforderungen skizzieren die Client-Nachricht als `{ type: "MOVE",
 * pitIndex }`. Bei Socket.io traegt der Ereignisname die Typinformation, die
 * Entsprechung ist also `spiel:zug` mit `{ mulde }`. Der Inhalt ist identisch,
 * die Typangabe wandert nur aus der Nutzlast in den Kanal (Konzept 6.1).
 */
export const EREIGNIS = Object.freeze({
  // ----- Client -> Server -----
  BEITRETEN: 'spiel:beitreten',   // { name, privat?, code? }  schnell, privat erstellen oder per Code beitreten
  ABBRECHEN: 'spiel:abbrechen',   // -               Suche oder Revanche-Wunsch abbrechen
  ZUG: 'spiel:zug',               // { mulde: 0..5 } Zug anmelden
  AUFGEBEN: 'spiel:aufgeben',     // -               laufende Partie aufgeben
  ERNEUT: 'spiel:erneut',         // { name? }       nach Partieende neu suchen
  REVANCHE: 'spiel:revanche',     // -               nach Partieende: noch einmal gegen denselben

  // ----- Server -> Client -----
  WARTESCHLANGE: 'warteschlange', // { position }
  PRIVAT: 'spiel:privat',         // { code }        privater Warteplatz angelegt
  START: 'spiel:start',           // { spielId, sitz, gegner, spielstand }
  STAND: 'spiel:stand',           // { spielstand, bericht }
  ENDE: 'spiel:ende',             // { spielstand, ergebnis, revanche }
  ABBRUCH: 'spiel:abbruch',       // { grund, spielstand, ergebnis, revanche }
  REVANCHE_ANGEBOT: 'spiel:revanche-angebot', // -  dein Gegner moechte eine Revanche
  REVANCHE_WEG: 'spiel:revanche-weg',         // -  Revanche nicht mehr moeglich (Gegner weg)
  REVANCHE_ABGELAUFEN: 'spiel:revanche-abgelaufen', // -  Frist fuer die Revanche ist vorbei
  FEHLER: 'spiel:fehler',         // { code, text }
});

/**
 * Fehlercodes (Konzept 6.7).
 *
 * Fehler werden immer NUR an den Verursacher gesendet, nie in den Raum: Der
 * Gegner soll nicht erfahren, dass jemand ungueltige Nachrichten schickt.
 */
export const FEHLER = Object.freeze({
  NUTZDATEN_UNGUELTIG: 'NUTZDATEN_UNGUELTIG', // Schemapruefung fehlgeschlagen
  NICHT_AM_ZUG: 'NICHT_AM_ZUG',               // Gegner ist an der Reihe
  MULDE_UNGUELTIG: 'MULDE_UNGUELTIG',         // Nummer ausserhalb 0..5
  MULDE_LEER: 'MULDE_LEER',                   // gewaehlte Mulde enthaelt nichts
  PARTIE_NICHT_AKTIV: 'PARTIE_NICHT_AKTIV',   // Partie beendet oder abgebrochen
  KEINE_PARTIE: 'KEINE_PARTIE',               // Socket gehoert zu keiner Partie
  ZU_VIELE_ANFRAGEN: 'ZU_VIELE_ANFRAGEN',     // Ratenbegrenzung ausgeloest
  BEREITS_IN_WARTESCHLANGE: 'BEREITS_IN_WARTESCHLANGE',
  BEREITS_IN_PARTIE: 'BEREITS_IN_PARTIE',
  CODE_UNBEKANNT: 'CODE_UNBEKANNT',           // Einladungslink ungueltig oder abgelaufen
  INTERNER_FEHLER: 'INTERNER_FEHLER',         // Schicht 2 der Absturzsicherung
  WARTEZEIT_ABGELAUFEN: 'WARTEZEIT_ABGELAUFEN', // länger als GRENZEN.WARTEN_MINUTEN gewartet
});

/**
 * Verstaendliche Begleittexte zu den Fehlercodes.
 *
 * Der Code ist das, worauf der Client reagiert; der Text ist das, was ein
 * Mensch liest. Beides zusammen vermeidet, dass im Client Fehlermeldungen
 * verstreut hartkodiert werden.
 */
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

/**
 * Zustaende einer Partie (Konzept 4.7).
 *
 * Bewusste Abweichung vom Konzept: Es gibt keinen Zustand WARTET. Eine Partie
 * entsteht erst, wenn zwei Spieler da sind; wer wartet, steht in der Lobby.
 */
export const STATUS = Object.freeze({
  LAEUFT: 'LAEUFT',
  BEENDET: 'BEENDET',
  ABGEBROCHEN: 'ABGEBROCHEN',
});

/** Gruende, aus denen eine Partie endet (Konzept 5.7). */
export const GRUND = Object.freeze({
  REGULAER: 'REGULAER',           // eine Reihe leer, regulaere Abrechnung
  GEGNER_WEG: 'GEGNER_WEG',       // Verbindungsabbruch des Gegners
  AUFGEGEBEN: 'AUFGEGEBEN',       // jemand hat aufgegeben
  INTERNER_FEHLER: 'INTERNER_FEHLER', // Invariante verletzt o. ae. (Konzept 7.7)
  SERVER_ENDE: 'SERVER_ENDE',     // Server wird heruntergefahren (SIGTERM/SIGINT)
  ZU_LANGE_KEIN_ZUG: 'ZU_LANGE_KEIN_ZUG', // GRENZEN.PARTIE_RUHE_MINUTEN ohne Zug, wird nicht gewertet
});

/** Grenzen, die Server und Client gleichermassen kennen muessen. */
export const GRENZEN = Object.freeze({
  NAME_MAX: 20,          // Zeichen; entspricht maxlength im HTML-Formular
  MULDE_MIN: 0,
  MULDE_MAX: 5,
  CODE_LAENGE: 6,        // Zeichen im Einladungscode, z. B. K7M2QX
  REVANCHE_SEKUNDEN: 15, // so lange gilt ein Revanche-Angebot (Zaehler im Ergebnisdialog)

  // EINSTELLBAR: Nach so vielen Minuten ohne Zug beendet der Server eine
  // Partie (nicht gewertet). Steht hier, damit Server und Anzeige dieselbe
  // Zahl benutzen.
  PARTIE_RUHE_MINUTEN: 15,

  // EINSTELLBAR: So lange darf man auf einen Gegner warten – in der
  // Warteschlange und mit einem privaten Einladungslink.
  WARTEN_MINUTEN: 7.5,
});

/**
 * Unsichtbare Zeichen: alle Steuerzeichen (Unicode-Gruppe Cc, z. B.
 * Zeilenumbruch) und Formatzeichen (Gruppe Cf, z. B. Nullbreite-Leerzeichen
 * oder die Umkehr der Leserichtung).
 */
const UNSICHTBAR = /[\p{Cc}\p{Cf}]/u;

/**
 * Zeichen, die in einem Namen verboten sind: Mit `<` beginnt und mit `>`
 * endet jedes HTML-Tag. Ohne sie kann ein Name kein Tag wie `<script>` oder
 * `<img onerror=...>` enthalten – Schutz gegen Cross-Site-Scripting (XSS).
 *
 * Das ist die ZWEITE Absicherung. Die erste steckt im Client: Er setzt Namen
 * ausschliesslich ueber `textContent`, nie ueber `innerHTML` (Konzept 6.2).
 */
export const NAME_VERBOTEN = '<>';

/**
 * Die Namensregel – EINE Regel, an ZWEI Stellen geprueft.
 *
 *   1. Im Browser, vor dem Absenden (client/js/anmelden.js): Der Spieler
 *      sieht sofort, was ankommt, und bekommt eine Meldung, wenn vom Namen
 *      nichts uebrig bleibt. Reine Bequemlichkeit.
 *   2. Auf dem Server (server/socket/validation.js): verbindlich. Ein
 *      manipulierter Client kann die erste Pruefung einfach weglassen – dem
 *      Client wird nie vertraut.
 *
 * Weil beide Seiten diese Datei laden, koennen die zwei Pruefungen nicht
 * auseinanderlaufen.
 *
 *   Unsichtbares   ->  entfernt (Zeilenumbruch, Nullbreite-Leerzeichen ...):
 *                      Es wuerde die Anzeige zerlegen, ohne selbst sichtbar
 *                      zu sein
 *   < und >        ->  entfernt (NAME_VERBOTEN, gegen XSS)
 *   Leerzeichen    ->  am Anfang und Ende entfernt
 *   Laenge         ->  auf GRENZEN.NAME_MAX (20) gekuerzt
 *
 * Kann eine leere Zeichenkette liefern. Was dann passiert, entscheidet jede
 * Seite selbst: Der Browser meldet "Bitte gib einen Namen ein.", der Server
 * setzt "Spieler" ein.
 *
 * Nebenwirkung: Das unsichtbare Verbindungszeichen in Familien-Emoji
 * (U+200D) faellt mit weg – sie zerfallen in einzelne Emoji.
 *
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

  // Array.from zerlegt in ganze Zeichen; slice auf dem Text zählte dagegen
  // UTF-16-Hälften und könnte ein Emoji halbieren.
  const zeichenListe = Array.from(erlaubt.trim());
  const gekuerzt = zeichenListe.slice(0, GRENZEN.NAME_MAX).join('');

  // Das Kürzen kann ein Leerzeichen ans Ende bringen.
  return gekuerzt.trim();
}

/**
 * Erlaubte Zeichen im Einladungscode.
 *
 * Ohne leicht verwechselbare Zeichen (0/O, 1/I/L), weil der Code auch einmal
 * abgetippt oder vorgelesen wird. Steht hier, weil der Server damit Codes
 * erzeugt UND prueft.
 */
export const CODE_ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
