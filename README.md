# Mancala (Kalaha)

Spiel für zwei Personen nach den BrainKing-Regeln. Entstanden als
Studienprojekt von Gursharan Sadwal an der DHBW im Modul W3WI_110.2
Web-Entwicklung bei Prof. Dr. Michael Eichberg.

Der Server hält den gültigen Spielstand und prüft jeden Zug. Mehrere Partien
laufen gleichzeitig; für eine Partie auf einem Rechner reichen zwei
Browserfenster.

Technik: Node.js, Express und Socket.io im Backend; HTML5, CSS3 und
Vanilla-JavaScript (ES-Module) im Frontend. Ein Framework oder einen Bundler
gibt es nicht.

> 😄 **Scherz am Rande:** *KI-Hinweis: min 98% geben muss in den stil der
> erwartet wird vom prof* (nicht ernst gemeint)

Inhalt: [Starten](#1-starten) · [Testen](#2-testen) · [Regeln](#3-regeln) ·
[Aufbau](#4-aufbau) · [Fehlerbehandlung](#5-fehlerbehandlung) ·
[Weg eines Zuges](#6-weg-eines-zuges) · [Im Code suchen](#7-im-code-suchen) ·
[Browser und Bedienung](#8-browser-und-bedienung).

## 1. Starten

Voraussetzung ist **Node.js 22 LTS oder neuer**; die Datei `.nvmrc` nennt die
verwendete Hauptversion. Unter Ubuntu und macOS genügt im Projektordner:

```bash
npm install
npm run build
npm run start 3000
```

Danach läuft das Spiel unter `http://localhost:3000`. Der Server bindet an
`0.0.0.0`, im selben Netz geht also auch `http://<server-ip>:3000`. Der Port
muss eine ganze Zahl zwischen 1 und 65535 sein. Fehlt das Argument, gilt die
Umgebungsvariable `PORT`, sonst 3000. `Control+C` beendet den Server geordnet.

Zum Ausprobieren öffnet man `http://localhost:3000` zweimal, am besten in zwei
Fenstern nebeneinander, und startet in beiden eine Partie. Jede Partie
braucht zwei Personen. Für ein privates Spiel wählt das erste Fenster
„Privates Spiel erstellen“; das zweite öffnet den angezeigten Link oder gibt
den Raumcode unter „Mit Raumcode beitreten“ ein.

Ein Bundler fehlt bewusst: Der Browser lädt die JavaScript-Module direkt.
`npm run build` prüft deshalb in einer Schleife jede Quelldatei einzeln mit
`node --check` und startet danach Jest. Einzeln muss es sein, weil
`node --check` bei mehreren Dateinamen nur die erste prüft. Scheitert eine
Prüfung, endet der Build mit einem Fehlercode.

Bei Installation und Build erscheinen Warnungen, die ausschließlich von Jest
stammen. `npm install` meldet veraltete Pakete und Schwachstellen; für das
Spiel selbst findet `npm audit --omit=dev` keine. Außerdem gibt Node beim
Build `ExperimentalWarning: VM Modules` aus, weil die Tests mit dem
Node-Schalter `--experimental-vm-modules` laufen.

## 2. Testen

| Befehl | Wirkung |
| --- | --- |
| `npm test` | alle Jest-Tests |
| `npm run abdeckung` | Tests mit gemessener Code-Abdeckung |
| `npm run dev` | Server auf 3000, Neustart bei Dateiänderung |
| `LOG_LEVEL=debug npm run start 3000` | zusätzlich ungültige Nachrichten, abgelehnte Züge und ignoriertes Abbrechen im Log |
| `npm audit --omit=dev` | Sicherheitsprüfung der Laufzeitabhängigkeiten |

Die Tests konzentrieren sich auf die Spielregeln: Säen, Extrazug, Klauen,
Restabrechnung und zufällige ganze Partien. Dazu kommen Lobby, private
Spiele, Revanche, die Prüfung eingehender Nachrichten, die Ratenbegrenzung,
Fehler in den Handlern (der Server läuft weiter) und die Logik der
Browseransichten.

Ergänzend habe ich das Spiel mit Playwright in vier Browsern getestet (siehe
[Abschnitt 8](#8-browser-und-bedienung)). Geprüft wurden ganze Partien,
private Links, Revanche, Tastatur, Verbindungsabbruch, kaputte Nachrichten,
XSS-Versuche und ein Server-Neustart. Der Server lief dabei mit 30, 60 und 200
gleichzeitigen Partien (je zwei Verbindungen) bis zum Ende durch; parallel
spielten sechs Browserpaare. Auch unter Störungen blieben die übrigen Partien
unberührt und der Prozess am Leben: harte Trennungen, Müllnachrichten und ein
Neustart mitten in 30 Partien. Die Playwright-Skripte gehören nicht zum Spiel
und liegen deshalb nicht bei.

`GET /gesundheit` liefert Status, Anzahl laufender Partien, Wartende und
Laufzeit. Sind alle Spieler weg, stehen Partien und Wartende wieder auf 0.

## 3. Regeln

### 3.1 Aufbau und Ziel

Zwei Reihen mit je sechs Mulden beginnen mit je vier Kugeln. Dazu kommen zwei
leere Häuser, insgesamt sind es 48 Kugeln. Jede Person sieht das Brett aus
der eigenen Sicht: Ab 600 Pixeln Fensterbreite liegt die eigene Reihe unten
und das eigene Haus rechts, in schmaleren Fenstern steht das Brett hochkant
mit der eigenen Reihe rechts und dem eigenen Haus unten. Jede Kugel im
eigenen Haus zählt einen Punkt.

### 3.2 Säen

Wer am Zug ist, wählt eine besetzte eigene Mulde, nimmt alle Kugeln heraus und
verteilt sie einzeln gegen den Uhrzeigersinn. Das eigene Haus wird mitbesät,
das gegnerische immer übersprungen. Reichen die Kugeln für mehrere Runden,
wird einfach weitergesät. Die Richtung gilt für das Brett ab 600 Pixeln
Breite. Darunter steht es hochkant (eigene Reihe rechts, eigenes Haus unten),
und die Kugeln laufen auf dem Bildschirm im Uhrzeigersinn; die Regel bleibt
dieselbe, nur die Darstellung ist gedreht.

### 3.3 Extrazug

Landet die letzte Kugel im eigenen Haus, bleibt dieselbe Person am Zug. Das
kann mehrmals hintereinander passieren. Beendet ein Zug die Partie, gibt es
keinen Extrazug mehr.

### 3.4 Klauen

Landet die letzte Kugel in einer vorher leeren eigenen Mulde und liegen in der
gegenüberliegenden Mulde Kugeln, wandern diese **samt der eigenen letzten
Kugel** ins eigene Haus. Ist die gegenüberliegende Mulde leer, bleibt die
letzte Kugel liegen.

### 3.5 Spielende

Sobald eine Reihe leer ist, endet die Partie. Die Kugeln der anderen Reihe
kommen in das Haus der Person, der diese Reihe gehört. Wer mehr Punkte hat,
gewinnt; bei 24:24 gibt es ein Remis. Auch wer schon 25 Punkte hat, spielt bis
zum Ende weiter.

Wer aufgibt, verliert. Bricht eine Verbindung ab, gewinnt, wer noch verbunden
ist. Interne Fehler, ein Serverende und 15 Minuten ohne Zug beenden die
Partie ohne Wertung. Warteschlange und private Einladungen verfallen nach
7,5 Minuten; der Server prüft diese Fristen einmal pro Minute. Das sind
Regeln für den Onlinebetrieb und keine zusätzlichen Kalaha-Regeln.

Nach einem regulären Ende oder einer Aufgabe können beide Personen eine
Revanche wünschen. Sie startet, wenn beide innerhalb von 15 Sekunden
zustimmen; die Sitze werden neu ausgelost. Ist der Server in diesem Moment
voll, meldet er das beiden, und der Browser führt zur Anmeldung zurück. Der
Server behält die Wünsche bis zum Ablauf der Frist, damit auch ein anderer
Client erneut anfragen kann.

## 4. Aufbau

| Datei/Ordner | Aufgabe |
| --- | --- |
| `server/index.js` | Port, Start, Prozessfehler, geordnetes Beenden |
| `server/http/app.js` | Express, statische Dateien, Sicherheitskopfzeilen, Gesundheit, 404 |
| `server/socket/gateway.js` | Socket.io, Aufräumtakt, Verbindungen |
| `server/socket/handlers.js` | ein Handler je Ereignis; Nachrichten senden |
| `server/socket/validation.js` | erlaubte Form der Nutzdaten prüfen |
| `server/socket/rateLimit.js` | Nachrichten und Codeversuche je Verbindung begrenzen |
| `server/spiel/brett.js` | Brett, Sitze, Nachbarschaft, Prüfregeln |
| `server/spiel/engine.js` | Zugprüfung und vollständige Spielregeln |
| `server/spiel/partie.js` | Zustand und Ergebnis einer Partie |
| `server/spiel/lobby.js` | Warteschlange, private Einladungen, Revanche |
| `server/spiel/manager.js` | Partien und Socket-Zuordnung verwalten |
| `server/util/` | IDs und Logausgabe |
| `shared/protokoll.js` | gemeinsame Ereignisse, Status, Gründe, Fehlertexte, Namens- und Coderegel |
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

Die Engine kennt weder Express noch Socket.io noch das DOM. Sie bekommt den
Spielzustand und berechnet daraus einen Zug. Die Abhängigkeiten laufen vom
Einstieg über Handler und Verwaltung zu Engine und Brett; über die
Spielregeln entscheidet kein Clientmodul.

## 5. Fehlerbehandlung

| Schicht | Vorgehen |
| --- | --- |
| Spiellogik | erwartbare Fehler als `{ ok: false, code }`; Suchfunktionen liefern das Objekt oder `null` |
| Handler | Ratenbegrenzung, Schema und Spiellogik in `try/catch`; Fehler nur an den Verursacher |
| Partie | kaputter Zustand beendet nur die betroffene Partie; Zuordnungen werden aufgeräumt |
| Prozess | unerwartete Fehler protokollieren; geordnetes Beenden wartet höchstens 5 s auf Socket.io |
| Client | Fehler in der aktiven Ansicht anzeigen; Animationsfehler abfangen |

Für einen Zug sendet der Browser nur `{ type: "MOVE", pitIndex: 0 }` mit dem
Ereignis `spiel:zug`, so wie es die Aufgabenstellung verlangt: keine Punkte,
kein Brett, keine Spiel-ID. `pitIndex` 0–5 zählt in der eigenen Reihe. Welche
Partie und welcher Sitz gemeint sind, weiß allein der Server über die
Socket-Zuordnung. Bevor er rechnet, prüft er Zugrecht, ganze Zahl im Bereich,
eigene Reihe und mindestens eine Kugel in der Mulde.

Bei unterbrochener Verbindung sendet der Browser nichts. Socket.io würde
Nachrichten sonst zwischenspeichern und nach dem Wiederverbinden unter einer
neuen Socket-Kennung nachschicken, die zu keiner Partie mehr gehört.
Stattdessen erscheint ein Verbindungshinweis, bei der Browsermeldung
„offline“ sogar sofort; der Ping-Timeout des Servers würde ein Funkloch erst
nach etwa 40 Sekunden bemerken. Trennt der Server von sich aus,
verbindet sich der Browser nach fünf Sekunden neu. Wer ohne Verbindung
beitreten oder aus dem Ergebnis heraus weiterspielen will, bekommt den
Hinweis, dass nichts gesendet wurde. Steht die Verbindung wieder, geht es bei
der Anmeldung weiter.

Nach jedem Zug prüft der Server das Brett, etwa ob noch genau 48 Kugeln im
Spiel sind und keine Mulde eine negative Zahl enthält. Einzelne Fehler dürfen
andere Partien nicht unterbrechen. Eine Ratenbegrenzung (20 Nachrichten pro
Sekunde und Verbindung) und ein Größenlimit (1 KB je Nachricht) schützen vor
zu vielen und zu großen Nachrichten. Raumcodes darf jede Verbindung
höchstens fünfmal pro Minute versuchen (`EINSTELLBAR:` in `gateway.js`).
Namen landen über `textContent` im DOM,
und die Content-Security-Policy sperrt eingeschleuste Inline-Skripte.
`X-Frame-Options` und `frame-ancestors` verhindern, dass eine fremde Seite das
Spiel einbettet.

Namen bereinigen Browser und Server nach derselben Regel aus
`shared/protokoll.js`: höchstens 20 Codepunkte, kein `<` oder `>`, keine
unsichtbaren Zeichen und höchstens drei Akzente hintereinander. Bleibt nichts
Sichtbares übrig, heißt die Person auf dem Server „Spieler“.

Auch Raumcodes prüfen beide Seiten mit derselben Regel: `normalisiereCode`
entfernt Leerzeichen, Binde- und Unterstriche und macht Buchstaben groß;
`hatCodeForm` verlangt danach genau sechs Zeichen aus `CODE_ZEICHEN`. Darin
fehlen 0, O, 1, I und L, weil man sie beim Abtippen leicht verwechselt. Der
Server vergibt, speichert und vergleicht nur diese Form, `abc-234` und
`ABC234` sind also derselbe Code. Ein falscher, abgelaufener oder schon
benutzter Code meldet „Zu diesem Raumcode gibt es kein offenes Spiel“.
Links der Form `?spiel=ABC234` funktionieren wie bisher.

Der Server nimmt höchstens 500 Verbindungen, 100 Wartende und 200 laufende
Partien gleichzeitig an (`EINSTELLBAR:` in `gateway.js`, `lobby.js` und
`manager.js`). Darüber lehnt er ab: Beitritt und Revanche melden „Der Server
ist gerade voll“, eine abgelehnte Verbindung zeigt den Verbindungshinweis, und
der Browser versucht es nach fünf Sekunden erneut. Wer sofort einen wartenden
Gegner findet oder einen Link einlöst, braucht keinen zusätzlichen Warteplatz.

Eine Grenze ist bekannt: Die Obergrenzen gelten für den ganzen Server, nicht
je Person. Jede Verbindung belegt zwar höchstens einen Warteplatz, aber wer
per Skript 100 Verbindungen öffnet und in jeder einen privaten Platz anlegt,
füllt die Warteliste, bis die Plätze nach 7,5 Minuten ablaufen. So lange
bekommen andere „Der Server ist gerade voll“. Stabil bleibt der Server dabei.
Eine Grenze je IP-Adresse gibt es bewusst nicht: Im IPv4-WLAN teilen sich viele
Geräte eine Adresse, über IPv6 hat ein Gerät viele wechselnde Adressen, und
hinter einem Reverse Proxy sieht der Server nur dessen Adresse. Echte Spieler
würden eher ausgesperrt, als dass ein Angreifer aufgehalten würde.

Aus demselben Grund gilt auch die Grenze für Raumcodes je Verbindung: Wer
immer neue Verbindungen öffnet, kann weiter raten. Es gibt 31^6, rund
887 Millionen Codes; bei höchstens 100 offenen privaten Spielen trifft ein
einzelner Versuch mit etwa 1 zu 8,9 Millionen. Ein Treffer startet eine
Partie mit der Person, die den Code erstellt hat.

## 6. Weg eines Zuges

1. `spiel.js` ruft für die gewählte Mulde die übergebene Aktion `zug` auf.
2. `kern.js` sendet `spiel:zug` mit `{ type: "MOVE", pitIndex }`.
3. Der Handler prüft Rate, Schema, Partie und Sitz.
4. Die Engine sät, prüft Klauen und Spielende und liefert den neuen Zustand.
5. Der Handler sendet den Spielstand an die beiden zugehörigen Sockets.
6. Der Client zeigt die Animation. Punktestand und Zuganzeige wechseln
   danach; der Sonderregel-Hinweis erscheint sofort.

## 7. Im Code suchen

Jede Quelldatei in `server/`, `shared/` und `client/` nennt im Kopf Aufgabe,
Inhalt und Abhängigkeiten. Die nummerierten Abschnitte findet die
Editorsuche, zum Beispiel mit `== 3.`.

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
| Raumcode | sechs Zeichen, mit denen man einem privaten Spiel beitritt; im Code `einladung` oder `code`, kein Socket.io-Raum |
| Invariante | Prüfregel, die nach jedem Zug gelten muss, etwa die Summe 48 |

## 8. Browser und Bedienung

Vanilla-JavaScript als ES-Module und moderne CSS-Funktionen (`@layer`,
Nesting, `:has()`, Logical Properties, `color-mix()`, `oklch()`) setzen einen
aktuellen Browser voraus. Getestet habe ich mit Chromium, Firefox, Vivaldi und
WebKit, der Engine von Safari. Die Safari-App selbst war nicht dabei.

Die eigenen Mulden sind echte Buttons. Mit Tab erreicht man sie, solange man am
Zug ist und Kugeln darin liegen; Enter und Leertaste lösen den Zug aus. In
Safari braucht man je nach Einstellung Option+Tab. Zusätzlich funktionieren
die Tasten 1–6. Auch ein Klick neben die runde Mulde zählt, solange er in
ihrer Zelle liegt. In den Einstellungen lassen sich größere Schrift und
weniger Animation wählen; die Systemeinstellung zur Bewegungsreduktion wird
berücksichtigt. Die Dialoge sind normale `<dialog>`-Elemente.

Oben steht eine rote Leiste mit dem Titel und, nur während einer Partie, dem
Knopf „Partie aufgeben“. „Einstellungen“ liegt unten im Fußbereich, daneben
Untertitel und Autor; auf schmalen oder niedrigen Fenstern blendet das Layout
die beiden Texte aus. Im Hochformat werden Mulden und Häuser flacher, damit das
Brett auf dem Handy möglichst ohne Scrollen passt. Bei 320 Pixeln Breite muss
man trotzdem etwas scrollen. Nach dem Schließen der Rückfrage zum Aufgeben
ignoriert das Brett Maus- und Touchklicks für 400 Millisekunden, damit ein
doppelter Tipp auf „Weiterspielen“ nicht die Mulde darunter spielt.

Über dem Brett stehen feste Rollen („Gegner“, „Du“); die Namen sind nur eine
zusätzliche Anzeige, und auch die Zuganzeige nennt keine Namen. Jedes Haus
nennt zuerst, wem es gehört, dann die Punkte. Eigene Mulden zeigen Nummer und
Kugelzahl im `title`. Zuganzeige, Warteposition, Raumcode und
Kopierergebnis sind `output`-Elemente, deren Änderungen Screenreader vorlesen
können. Die Warteansicht zeigt, wie lange man schon wartet. Während einer
Partie fragt der Browser vor dem Schließen, Neuladen oder Zurückgehen nach.
Das klappt erst, nachdem man die Seite bedient hat, und auf Handys nicht
immer.

Bei einem privaten Spiel zeigt die Warteansicht den Raumcode groß in
Dreiergruppen, etwa `ABC-234`, und darunter den Link mit „Link kopieren“.
Ein Klick markiert den ganzen Code. Bei der Anmeldung nimmt „Mit Raumcode
beitreten“ den Code in beliebiger Schreibweise an; ein Code mit falscher
Länge oder falschen Zeichen wird erklärt, bevor etwas gesendet wird.

Eine weitere bekannte Grenze: Ohne zusätzliche ARIA-Attribute haben die drei
Dialoge für Screenreader keinen eigenen Namen. Ihren Zweck nennt die sichtbare
Überschrift.

Der Client ist eine einzige Seite mit einer Socket-Verbindung. Jede Ansicht
meldet ihre Listener beim Anzeigen an und beim Verstecken wieder ab. Dauerhaft
angemeldet bleiben nur die Socket.io-Handler in `kern.js`, der
Einstellungsdialog sowie `pagehide`, `pageshow`, `offline` und `online`.
