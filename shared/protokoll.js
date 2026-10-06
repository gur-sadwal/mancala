/**
 * Gemeinsames Protokoll fuer Server und Client (Konzept 6).
 *
 * Diese Datei wird vom Server per `import` geladen UND vom Browser als
 * statische Datei ausgeliefert. Beide Seiten benutzen buchstaeblich dieselbe
 * Datei – der einfachste Weg, Tippfehler in Ereignisnamen auszuschliessen,
 * ohne einen Bundler einzufuehren (Konzept 12.3).
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
  [FEHLER.PARTIE_NICHT_AKTIV]: 'Diese Partie laeuft nicht mehr.',
  [FEHLER.KEINE_PARTIE]: 'Du bist in keiner laufenden Partie.',
  [FEHLER.ZU_VIELE_ANFRAGEN]: 'Zu viele Anfragen. Bitte kurz warten.',
  [FEHLER.BEREITS_IN_WARTESCHLANGE]: 'Du suchst bereits nach einem Gegner.',
  [FEHLER.BEREITS_IN_PARTIE]: 'Du bist bereits in einer Partie.',
  [FEHLER.CODE_UNBEKANNT]: 'Dieses private Spiel gibt es nicht mehr. Bitte um einen neuen Link.',
  [FEHLER.INTERNER_FEHLER]: 'Es ist ein interner Fehler aufgetreten.',
});

/** Zustaende einer Partie (Konzept 4.7). */
export const STATUS = Object.freeze({
  WARTET: 'WARTET',
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
});

/** Grenzen, die Server und Client gleichermassen kennen muessen. */
export const GRENZEN = Object.freeze({
  NAME_MAX: 20,          // Zeichen; entspricht maxlength im HTML-Formular
  MULDE_MIN: 0,
  MULDE_MAX: 5,
  CODE_LAENGE: 6,        // Zeichen im Einladungscode, z. B. K7M2QX
  REVANCHE_SEKUNDEN: 15, // so lange gilt ein Revanche-Angebot (Zaehler im Ergebnisdialog)
});

/**
 * Erlaubte Zeichen im Einladungscode.
 *
 * Ohne leicht verwechselbare Zeichen (0/O, 1/I/L), weil der Code auch einmal
 * abgetippt oder vorgelesen wird. Steht hier, weil der Server damit Codes
 * erzeugt UND prueft.
 */
export const CODE_ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
