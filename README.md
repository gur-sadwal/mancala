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
Hauptversion. Auf Ubuntu und macOS im Repository-Ordner:

```bash
npm install
npm run build
npm run start 3000
```

Das Spiel ist unter `http://localhost:3000` erreichbar. Der Server bindet an
`0.0.0.0`; im selben Netz funktioniert auch `http://<server-ip>:3000`.
Der Port muss eine ganze Zahl zwischen 1 und 65535 sein. Ohne Argument ist 3000
voreingestellt. Mit `Control+C` endet der Server geordnet.

Zum Ausprobieren öffnet man `http://localhost:3000` in zwei Browserfenstern
und startet in beiden eine Partie. Ein Fenster genügt nicht, weil jede Partie
zwei Personen braucht.

Es gibt keinen Bundler: Der Browser lädt die JavaScript-Module direkt.
`npm run build` prüft jede Quelldatei einzeln mit `node --check` und führt
anschließend Jest aus. Eine Syntaxprüfung mehrerer Dateinamen in einem
Aufruf würde nur die erste Datei prüfen; deshalb verwendet der Build eine
Schleife. Scheitert eine Prüfung, endet der Build mit Fehlercode.

## 2. Testen

| Befehl | Wirkung |
| --- | --- |
| `npm test` | alle Jest-Tests |
| `npm run abdeckung` | Tests mit gemessener Code-Abdeckung |
| `npm run dev` | Server auf 3000, Neustart bei Dateiänderung |
| `LOG_LEVEL=debug npm run start 3000` | ausführliche Servermeldungen |
| `npm audit --omit=dev` | Sicherheitsprüfung der Laufzeitabhängigkeiten |

Die Tests prüfen unter anderem Säen, Extrazüge, Klauen, Restabrechnung,
Zufallspartien, beide Brettsichten, Lobby, private Spiele, Revanche,
Nutzdatenprüfung, Ratenbegrenzung, Handlerfehler und Clientzustände.
Ein grüner Jest-Lauf allein belegt keine fehlerfreie Browserbedienung.

Zum vollständigen Prüfverfahren gehören zusätzlich ein frischer Klon ohne
`node_modules`, die Ubuntu-Befehle oben, echte Browserpartien, private Links,
Revanche, Tastatur, Verbindungsabbruch, Müll-Nachrichten, XSS-Versuche,
15 gleichzeitige Partien und ein Server-Neustart. Die Playwright-Werkzeuge
liegen im vollständigen Studienarbeitsordner außerhalb dieses Repositories;
Playwright ist keine Abhängigkeit des abgegebenen Spiels.

`GET /gesundheit` liefert Status, Anzahl laufender Partien, Wartende und
Laufzeit. Nach Tests müssen Partien und Wartende wieder 0 sein.

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
Das kann mehrfach hintereinander geschehen.

### 3.4 Klauen

Landet die letzte Kugel in einer vorher leeren eigenen Mulde und liegen in
der gegenüberliegenden Mulde Kugeln, kommen die gegenüberliegenden Kugeln
**und die eigene letzte Kugel** ins eigene Haus. Ist die gegenüberliegende
Mulde leer, bleibt die letzte Kugel liegen.

### 3.5 Spielende

Sobald eine Reihe leer ist, endet die Partie. Die übrigen Kugeln der anderen
Reihe kommen in das Haus ihrer Person. Wer mehr Punkte hat, gewinnt; 24:24
ist ein Remis. Eine Führung ab 25 Punkten beendet das Spiel nicht vorzeitig.

Aufgeben und Verbindungsabbruch geben der verbleibenden Person den Sieg.
Interne Fehler, Serverende und 15 Minuten ohne Zug beenden die Partie ohne
Wertung. Warteschlange und private Einladungen laufen nach 7,5 Minuten ab;
der Server prüft die Fristen einmal pro Minute. Das sind Projektentscheidungen
für den Onlinebetrieb, keine zusätzlichen Kalaha-Spielregeln.

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
| `server/util/` | IDs und Protokollausgabe |
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
| Spiellogik | erwartbare Fehler als `{ ok: false, code }`; Nachschlagen liefert Objekt oder `null` |
| Handler | Ratenbegrenzung, Schema, dann `try/catch`; Fehler nur an den Verursacher |
| Partie | kaputter Zustand beendet nur die betroffene Partie; Zuordnungen werden aufgeräumt |
| Prozess | unerwartete Fehler protokollieren; geordnetes Beenden wartet auf offene Ressourcen |
| Client | Fehler in der aktiven Ansicht anzeigen; Animationsfehler abfangen |

Der Browser sendet für einen Zug nur `{ mulde: 0 }` mit dem Ereignis
`spiel:zug`: keine Punkte, kein Brett und keine Spiel-ID. Die Zahl 0–5
bezieht sich auf die eigene Reihe. Die serverseitige Socket-Zuordnung
bestimmt Partie und Sitz. Der Server prüft Zugrecht, ganze Zahl im Bereich,
eigene Reihe und mindestens eine Kugel, bevor er rechnet.

Nach einem Zug werden die Brettregeln geprüft, etwa die Summe 48 und gültige
nicht negative Kugelzahlen. Einzelne Fehler dürfen andere Partien nicht
unterbrechen. Eine Ratenbegrenzung und ein Größenlimit verhindern, dass
unbegrenzt Nachrichten verarbeitet werden. Namen landen über `textContent`
im DOM; die Content-Security-Policy sperrt eingeschleuste Inline-Skripte.

## 6. Weg eines Zuges

1. `spiel.js` ruft für die gewählte Mulde die übergebene Aktion `zug` auf.
2. `kern.js` sendet `spiel:zug` mit der Muldennummer.
3. Der Handler prüft Rate, Schema, Partie und Sitz.
4. Die Engine sät, prüft Klauen und Spielende, dann den neuen Zustand.
5. Der Handler sendet den Spielstand an die beiden zugehörigen Sockets.
6. Der Client zeigt die Animation. Punktestand und Zuganzeige wechseln
   anschließend; der Sonderregel-Hinweis erscheint sofort.

## 7. Im Code suchen

Der Dateikopf erklärt Aufgabe, Inhalt und Abhängigkeiten. Nummerierte
Abschnitte sind mit `Cmd+F` auffindbar, zum Beispiel `== 3.`.

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
| Invariante | Prüfregel, die vor und nach einem Zug gelten muss |

## 8. Browser und Bedienung

Vanilla-JavaScript als ES-Module und moderne CSS-Funktionen (`@layer`,
Nesting, `:has()`, Logical Properties, `color-mix()`, `oklch()`) verlangen
aktuelle Browser. Die vollständige Browserprüfung umfasst Chromium,
Firefox, WebKit und Vivaldi; WebKit ist eine Safari-Engine und kein Beleg
für einen Lauf im vollständigen Safari-Programm.

Mulden sind echte Buttons: Tab erreicht sie, Enter und Leertaste lösen sie
aus. Zusätzlich funktionieren die Tasten 1–6. Die rechteckige Zelle gehört
zur Klickfläche der runden Mulde. Einstellungen erlauben größere Schrift
und weniger Animation; die Systemeinstellung zur Bewegungsreduktion wird
berücksichtigt. Dialoge verwenden die nativen Browserfunktionen.

Der Client bleibt eine Seite mit einer Socket-Verbindung. Listener einer
Ansicht werden beim Anzeigen angemeldet und beim Verstecken entfernt;
seitenweite Listener bleiben mit begründetem Zweck aktiv.
