# Mancala (Kalaha)

Verteiltes Spiel für zwei Personen nach den BrainKing-Regeln. Studienprojekt
von Gursharan Sadwal, DHBW, Modul W3WI_110.2 Web-Entwicklung bei
Prof. Dr. Michael Eichberg.

Der Server hält den gültigen Spielstand und prüft jeden Zug. Zwei getrennte
Browserfenster genügen zum Ausprobieren; mehrere Partien laufen gleichzeitig.

Technik: Node.js, Express und Socket.io im Backend; HTML5, CSS3 und
Vanilla-JavaScript (ES-Module) im Frontend, ohne Framework und ohne Bundler.

Inhalt: [Starten](#1-starten) · [Testen](#2-testen) · [Regeln](#3-regeln) ·
[Aufbau](#4-aufbau) · [Fehlerbehandlung](#5-fehlerbehandlung) ·
[Weg eines Zuges](#6-weg-eines-zuges) · [Im Code suchen](#7-im-code-suchen) ·
[Browser und Bedienung](#8-browser-und-bedienung).

## 1. Starten

Voraussetzung: **Node.js 22 LTS oder neuer**; `.nvmrc` nennt die verwendete
Hauptversion. Auf Ubuntu und macOS im Projektordner:

```bash
npm install
npm run build
npm run start 3000
```

Das Spiel ist unter `http://localhost:3000` erreichbar. Der Server bindet an
`0.0.0.0`; im selben Netz funktioniert auch `http://<server-ip>:3000`.
Der Port muss eine ganze Zahl zwischen 1 und 65535 sein. Ohne Argument gilt
die Umgebungsvariable `PORT`, sonst 3000. Mit `Control+C` endet der Server
geordnet.

Zum Ausprobieren öffnet man `http://localhost:3000` zweimal, am besten in zwei
Fenstern nebeneinander, und startet in beiden eine Partie. Jede Partie
braucht zwei Personen.

Es gibt keinen Bundler: Der Browser lädt die JavaScript-Module direkt.
`npm run build` prüft jede Quelldatei einzeln mit `node --check` und führt
anschließend Jest aus. Eine Syntaxprüfung mehrerer Dateinamen in einem
Aufruf würde nur die erste Datei prüfen; deshalb verwendet der Build eine
Schleife. Scheitert eine Prüfung, endet der Build mit Fehlercode.

Zwei Meldungen sind dabei normal: `npm install` warnt vor Schwachstellen, die
nur Jest betreffen (`npm audit --omit=dev` findet im Spiel selbst keine), und
Jest schreibt beim Build `ExperimentalWarning: VM Modules`, weil es die
ES-Module über diesen Node-Schalter lädt.

## 2. Testen

| Befehl | Wirkung |
| --- | --- |
| `npm test` | alle Jest-Tests |
| `npm run abdeckung` | Tests mit gemessener Code-Abdeckung |
| `npm run dev` | Server auf 3000, Neustart bei Dateiänderung |
| `LOG_LEVEL=debug npm run start 3000` | zusätzlich abgelehnte Nachrichten und Züge im Log |
| `npm audit --omit=dev` | Sicherheitsprüfung der Laufzeitabhängigkeiten |

Die Tests decken vor allem die Spielregeln ab: Säen, Extrazug, Klauen,
Restabrechnung und zufällige ganze Partien. Dazu kommen Lobby, private
Spiele, Revanche, die Prüfung eingehender Nachrichten, die Ratenbegrenzung
und die Logik der Browseransichten.

Zusätzlich wurde das Spiel mit Playwright in vier Browsern getestet (siehe
[Abschnitt 8](#8-browser-und-bedienung)): ganze Partien, private Links,
Revanche, Tastatur, Verbindungsabbruch, kaputte Nachrichten, XSS-Versuche,
15 Partien gleichzeitig und ein Server-Neustart. Die Playwright-Skripte
gehören nicht zum Spiel und sind deshalb nicht dabei.

`GET /gesundheit` liefert Status, Anzahl laufender Partien, Wartende und
Laufzeit. Sind alle Spieler weg, stehen Partien und Wartende wieder auf 0.

## 3. Regeln

### 3.1 Aufbau und Ziel

Zwei Reihen mit je sechs Mulden starten mit je vier Kugeln. Dazu kommen zwei
leere Häuser: insgesamt 48 Kugeln. Jede Person sieht die eigene Reihe unten
und das eigene Haus rechts. Jede Kugel im eigenen Haus zählt einen Punkt.

### 3.2 Säen

Wer am Zug ist, wählt eine besetzte eigene Mulde. Alle Kugeln werden daraus
aufgenommen und einzeln gegen den Uhrzeigersinn verteilt. Das eigene Haus
wird mitbesät, das gegnerische Haus immer übersprungen. Reichen die Kugeln
für mehrere Runden, wird weitergesät.

### 3.3 Extrazug

Landet die letzte Kugel im eigenen Haus, bleibt dieselbe Person am Zug.
Das kann mehrfach hintereinander geschehen. Endet die Partie mit diesem Zug,
gibt es keinen Extrazug mehr.

### 3.4 Klauen

Landet die letzte Kugel in einer vorher leeren eigenen Mulde und liegen in
der gegenüberliegenden Mulde Kugeln, kommen die gegenüberliegenden Kugeln
**und die eigene letzte Kugel** ins eigene Haus. Ist die gegenüberliegende
Mulde leer, bleibt die letzte Kugel liegen.

### 3.5 Spielende

Sobald eine Reihe leer ist, endet die Partie. Die restlichen Kugeln der
anderen Reihe kommen in das Haus des Spielers, dem die Reihe gehört. Wer mehr
Punkte hat, gewinnt; bei 24:24 ist es ein Remis. Auch wenn jemand schon
25 Punkte hat, wird bis zum Ende gespielt.

Wer aufgibt, verliert. Bricht eine Verbindung ab, gewinnt, wer noch verbunden
ist. Interne Fehler, ein Serverende und 15 Minuten ohne Zug beenden die
Partie ohne Wertung. Warteschlange und private Einladungen laufen nach
7,5 Minuten ab, der Server prüft diese Fristen einmal pro Minute. Das sind
Regeln für den Onlinebetrieb, keine zusätzlichen Kalaha-Regeln.

## 4. Aufbau

| Datei/Ordner | Aufgabe |
| --- | --- |
| `server/index.js` | Port, Start, Prozessfehler, geordnetes Beenden |
| `server/http/app.js` | Express, statische Dateien, Sicherheitskopfzeilen, Gesundheit, 404 |
| `server/socket/gateway.js` | Socket.io, Aufräumtakt, Verbindungen |
| `server/socket/handlers.js` | ein Handler je Ereignis; Nachrichten senden |
| `server/socket/validation.js` | erlaubte Form der Nutzdaten prüfen |
| `server/socket/rateLimit.js` | Nachrichten je Verbindung begrenzen |
| `server/spiel/brett.js` | Brett, Sitze, Nachbarschaft, Prüfregeln |
| `server/spiel/engine.js` | Zugprüfung und vollständige Spielregeln |
| `server/spiel/partie.js` | Zustand und Ergebnis einer Partie |
| `server/spiel/lobby.js` | Warteschlange, private Einladungen, Revanche |
| `server/spiel/manager.js` | Partien und Socket-Zuordnung verwalten |
| `server/util/` | IDs und Logausgabe |
| `shared/protokoll.js` | gemeinsame Ereignisse, Status, Gründe und Fehlertexte |
| `client/index.html` | vier Ansichten in einem Dokument |
| `client/404.html` | eigene Fehlerseite |
| `client/js/main.js` | Ansichten und Verbindung zusammenführen |
| `client/js/kern.js` | Anzeigezustand und Socket-Verbindung |
| `client/js/dom.js` | kleine DOM-Helfer |
| `client/js/anmelden.js`, `warten.js`, `spiel.js`, `ende.js` | eine Datei je Ansicht |
| `client/js/einstellungen.js` | Schriftgröße, Animation, gespeicherte Einstellungen |
| `client/css/` | nach Themen geteiltes CSS, geordnet durch `@layer` |
| `client/fonts/` | selbst gehostete Jost-Schrift mit OFL-Lizenz |
| `tests/` | Jest-Tests |

Die Engine kennt weder Express noch Socket.io noch das DOM. Sie erhält den
Spielzustand und berechnet einen Zug. Abhängigkeiten laufen vom Einstieg
über Handler und Verwaltung zur Engine und zum Brett; kein Clientmodul
entscheidet über die Spielregeln.

## 5. Fehlerbehandlung

| Schicht | Vorgehen |
| --- | --- |
| Spiellogik | erwartbare Fehler als `{ ok: false, code }`; Suchfunktionen liefern das Objekt oder `null` |
| Handler | Ratenbegrenzung, Schema und Spiellogik in `try/catch`; Fehler nur an den Verursacher |
| Partie | kaputter Zustand beendet nur die betroffene Partie; Zuordnungen werden aufgeräumt |
| Prozess | unerwartete Fehler protokollieren; geordnetes Beenden wartet höchstens 5 s auf Socket.io |
| Client | Fehler in der aktiven Ansicht anzeigen; Animationsfehler abfangen |

Der Browser sendet für einen Zug nur `{ type: "MOVE", pitIndex: 0 }` mit
dem Ereignis `spiel:zug`, wie es die Aufgabenstellung verlangt: keine
Punkte, kein Brett und keine Spiel-ID. `pitIndex` 0–5 bezieht sich auf die
eigene Reihe. Die serverseitige Socket-Zuordnung bestimmt Partie und Sitz.
Der Server prüft Zugrecht, ganze Zahl im Bereich, eigene Reihe und
mindestens eine Kugel, bevor er rechnet.

Ist die Verbindung unterbrochen, sendet der Browser nichts und zeigt einen
Verbindungshinweis. Socket.io würde Nachrichten sonst zwischenspeichern und
nach dem Wiederverbinden unter einer neuen Socket-Kennung nachschicken. Wer
in dieser Zeit beitreten oder aus dem Ergebnis heraus weiterspielen will,
bekommt den Hinweis, dass nichts gesendet wurde. Steht die Verbindung wieder,
geht es bei der Anmeldung weiter.

Nach einem Zug werden die Brettregeln geprüft, etwa die Summe 48 und gültige
nicht negative Kugelzahlen. Einzelne Fehler dürfen andere Partien nicht
unterbrechen. Eine Ratenbegrenzung (20 Nachrichten pro Sekunde und
Verbindung) und ein Größenlimit (1 KB je Nachricht) schützen den Server vor
zu vielen und zu großen Nachrichten. Namen landen über `textContent`
im DOM; die Content-Security-Policy sperrt eingeschleuste Inline-Skripte.
`X-Frame-Options` und `frame-ancestors` verhindern, dass eine fremde Seite
das Spiel einbettet.

Namen bereinigen Browser und Server mit derselben Regel aus
`shared/protokoll.js`: höchstens 20 Codepunkte, kein `<` oder `>`, keine
unsichtbaren Zeichen und höchstens drei Akzente hintereinander. Bleibt nichts
Sichtbares übrig, heißt der Spieler auf dem Server „Spieler“.

Der Server nimmt höchstens 500 Verbindungen, 100 Wartende und 200 laufende
Partien gleichzeitig an (`EINSTELLBAR:` in `gateway.js`, `lobby.js` und
`manager.js`). Darüber lehnt er ab: Beitritt und Revanche melden „Der Server
ist gerade voll“. Eine abgelehnte Verbindung zeigt den Verbindungshinweis;
der Browser versucht es nach fünf Sekunden erneut.
Wer sofort einen wartenden Gegner findet oder einen Link einlöst, braucht
keinen zusätzlichen Warteplatz.

## 6. Weg eines Zuges

1. `spiel.js` ruft für die gewählte Mulde die übergebene Aktion `zug` auf.
2. `kern.js` sendet `spiel:zug` mit `{ type: "MOVE", pitIndex }`.
3. Der Handler prüft Rate, Schema, Partie und Sitz.
4. Die Engine sät, prüft Klauen und Spielende, dann den neuen Zustand.
5. Der Handler sendet den Spielstand an die beiden zugehörigen Sockets.
6. Der Client zeigt die Animation. Punktestand und Zuganzeige wechseln
   anschließend; der Sonderregel-Hinweis erscheint sofort.

## 7. Im Code suchen

Der Dateikopf erklärt Aufgabe, Inhalt und Abhängigkeiten. Nummerierte
Abschnitte findet man mit der Suche im Editor, zum Beispiel `== 3.`.

| Suchmarker | Bedeutung |
| --- | --- |
| `REGEL 3.4:` | eine Spielregel mit Nummer aus Abschnitt 3 |
| `SCHUTZ:` | Eingabeprüfung, Absturzschutz, Anti-Cheating |
| `ACHTUNG:` | Fallstrick oder Abstimmung mit anderer Stelle |
| `WCAG:` | Tastatur, Trefferfläche, Schrift, Kontrast |
| `EINSTELLBAR:` | Wert, den man gezielt anpassen kann |

| Begriff | Bedeutung |
| --- | --- |
| Mulde | eines der zwölf kleinen Spielfelder |
| Haus | Sammelfeld; jede Kugel darin ist ein Punkt |
| Kugel | ein Spielstein |
| Sitz | `unten` oder `oben` im Serverzustand |
| Partie | ein einzelnes Spiel zwischen zwei Sockets |
| Ansicht | Anmelden, Warten, Spiel oder Ergebnis |
| Sicht | Brett aus der Perspektive eines Sitzes |
| Klauen | Regel 3.4; Protokollfeld `beute` und CSS-Klasse `zelle--beute` behalten ihren Namen |
| Raum | Socket.io-Gruppe, die eine Partie isoliert |
| Invariante | Prüfregel, die nach jedem Zug gelten muss, etwa die Summe 48 |

## 8. Browser und Bedienung

Vanilla-JavaScript als ES-Module und moderne CSS-Funktionen (`@layer`,
Nesting, `:has()`, Logical Properties, `color-mix()`, `oklch()`) brauchen
einen aktuellen Browser. Getestet wurde mit Chromium, Firefox, WebKit (der
Engine von Safari) und Vivaldi.

Die eigenen Mulden sind echte Buttons. Tab erreicht sie, solange man am Zug
ist und Kugeln darin liegen; Enter und Leertaste lösen den Zug aus.
Zusätzlich funktionieren die Tasten 1–6. Die rechteckige Zelle gehört
zur Klickfläche der runden Mulde. Einstellungen erlauben größere Schrift
und weniger Animation; die Systemeinstellung zur Bewegungsreduktion wird
berücksichtigt. Dialoge verwenden die nativen Browserfunktionen.

Auf dem Handy stehen Titel und Einstellungen in einer Zeile. Im Hochformat
werden Mulden und Häuser flacher, damit Brett und „Partie aufgeben“ meist
ohne Scrollen zu sehen sind.

Über dem Brett stehen feste Rollen („Gegner“, „Du“), die Namen sind nur
zusätzliche Anzeige. Auch die Zuganzeige nennt keine Namen. Jedes Haus nennt
zuerst, wem es gehört, dann die Punkte. Eigene Mulden zeigen Nummer und
Kugelzahl im `title`. Zuganzeige, Warteposition und Kopierergebnis sind
`output`-Elemente, deren Änderungen Screenreader vorlesen können. Die
Warteansicht zeigt, wie lange man schon wartet. Während einer Partie fragt
der Browser vor dem Schließen, Neuladen oder Zurückgehen nach. Das klappt
erst, nachdem man die Seite bedient hat, und auf Handys nicht immer.

Bekannte Grenze: Ohne zusätzliche ARIA-Attribute haben die drei Dialoge für
Screenreader keinen eigenen Namen. Ihren Zweck nennt die sichtbare
Überschrift.

Der Client ist eine einzige Seite mit einer Socket-Verbindung. Jede Ansicht
meldet ihre Listener beim Anzeigen an und beim Verstecken wieder ab.
Dauerhaft angemeldet bleiben nur die Socket.io-Handler in `kern.js`, der
Einstellungsdialog sowie `pagehide` und `pageshow`.
