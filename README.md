# Mancala (Kalaha)

Verteiltes 2-Personen-Webspiel nach dem **BrainKing**-Regelwerk.
DHBW, Modul W3WI_110.2 Web-Entwicklung, Prof. Dr. Michael Eichberg.
Student: Gursharan Sadwal.

Zwei Personen spielen an verschiedenen Rechnern dieselbe Partie. Der Server
hält den einzig gültigen Spielstand, der Browser zeigt ihn nur an.

---

## Starten

Voraussetzung: **Node.js ab Version 20** (siehe `.nvmrc`).

```bash
npm install
npm run build        # prüft Syntax und führt alle Tests aus
npm run start 3000   # Port als Argument
```

Danach erreichbar unter `http://localhost:3000` – und von jedem anderen Rechner
im selben Netz unter `http://<ip-des-servers>:3000`, weil der Server auf
`0.0.0.0` (IPv4) bindet.

Zum Ausprobieren genügen zwei Browserfenster: Beide öffnen die Seite, geben
einen Namen ein und werden automatisch zusammengeführt.

### Weitere Befehle

| Befehl | Wirkung |
| :--- | :--- |
| `npm test` | nur die Tests |
| `npm run dev` | Server auf Port 3000, startet bei Dateiänderungen neu |
| `LOG_LEVEL=debug npm run start 3000` | ausführlichere Protokollausgabe |

Der Endpunkt `/gesundheit` zeigt, wie viele Partien gerade laufen.

---

## Aufbau

```
server/
  index.js            Start, Port, Prozesswächter
  http/app.js         Express, statische Auslieferung
  socket/
    gateway.js        Socket.io aufsetzen, Aufräumintervall
    handlers.js       ein Handler je Ereignis – der einzige Ort, der sendet
    validation.js     Schemaprüfung eingehender Nutzdaten
    rateLimit.js      Ereigniszähler je Verbindung
  spiel/
    brett.js          Aufbau, Nachbarschaft, Gegenüber, Invarianten
    engine.js         Zugprüfung, Säen, Sonderregeln, Abrechnung
    partie.js         Zustandsobjekt einer Partie
    lobby.js          Warteschlange
    manager.js        alle Partien, Aufräumen
  util/               Protokollausgabe, IDs

client/
  index.html          semantisches Grundgerüst aller vier Ansichten
  css/                01-reset bis 08-bewegung, per @layer geordnet
  fonts/              Schrift Jost (SIL Open Font License, Lizenztext daneben)
  js/                 ES-Module, vom Browser direkt geladen
    main.js           Einstiegspunkt, verdrahtet Kern und Ansichten
    kern.js           Anzeigezustand, Socket.io
    dom.js            kleine DOM-Helfer, bewusst ohne eigene Imports
    anmelden.js       Ansicht 1: Namensformular
    warten.js         Ansicht 2: Wartebildschirm
    spiel.js          Ansicht 3: Brett, Zeichnen, Animation
    ende.js           Ansicht 4: Ergebnisdialog
    einstellungen.js  Einstellungsdialog: größere Schrift, weniger Animation

shared/
  protokoll.js        Ereignisnamen und Fehlercodes – von BEIDEN Seiten genutzt

tests/                Jest-Tests: Spiellogik, Lobby, Handler, Schemaprüfung,
                      Einstellungen, Revanche-Zähler
```

### Die wichtigste Entwurfsentscheidung

Die **Spiel-Engine kennt weder Socket.io noch Express noch das DOM.** Sie
bekommt einen Zustand und liefert einen neuen zurück. Deshalb lässt sich das
gesamte Regelwerk mit `npm test` prüfen, ohne einen Server zu starten.

Die Abhängigkeiten laufen nur in eine Richtung:

```
index.js -> gateway/handlers -> manager/lobby -> partie -> engine -> brett
```

Nur `handlers.js` sendet etwas. Alles darunter gibt Ergebnisse zurück.

---

## Anti-Cheating

Der Client ist nicht vertrauenswürdig. Er sendet bei einem Zug
**ausschließlich eine Zahl zwischen 0 und 5** – kein Brett, keine Punktzahl,
keine Spiel-ID. Der Server prüft der Reihe nach:

1. Läuft die Partie?
2. Ist dieser Socket an der Reihe?
3. Ist die Muldennummer eine ganze Zahl von 0 bis 5?
4. Liegt die Mulde in der eigenen Reihe?
5. Enthält sie mindestens eine Kugel?

Erst danach rechnet die Engine. Welche Partie zu einem Socket gehört, weiß
allein der Server – aus einer serverseitigen `Map`, nie aus den Nutzdaten.

## Absturzsicherheit

Der Prozess darf unter keinen Umständen sterben. Fünf gestaffelte Schichten:

| Schicht | Wirkung |
| :--- | :--- |
| 1 Schemaprüfung | falsche Nutzdaten erreichen die Spiellogik gar nicht |
| 2 Handler-Kapselung | jeder Handler in `try/catch`, ein Fehler bleibt lokal |
| 3 Engine ohne `throw` | ein Regelverstoß ist ein Rückgabewert, keine Ausnahme |
| 4 Invariantenprüfung | ein kaputter Zustand beendet nur diese eine Partie |
| 5 Prozesswächter | letzte Rettung: protokollieren und weiterlaufen |

Die wirksamste Bremse ist Invariante I-1: **Die Summe aller 14 Felder ist immer
48.** Fast jeder denkbare Fehler beim Säen, Überspringen oder Klauen verletzt
sie sofort.

---

## Regeln in Kürze

- 2 Reihen à 6 Mulden, je 4 Kugeln, dazu 2 Häuser – zusammen 48 Kugeln.
- Gesät wird gegen den Uhrzeigersinn, eine Kugel je Feld.
- Das **eigene** Haus wird mitbesät, das **gegnerische immer übersprungen**.
- Letzte Kugel im eigenen Haus → **Extrazug**.
- Letzte Kugel in einer leeren **eigenen** Mulde → alle Kugeln gegenüber
  **plus die eigene** wandern ins eigene Haus.
- Sobald eine Reihe leer ist, endet die Partie; jeder bekommt die Restkugeln
  seiner Seite. Ab 25 Punkten Sieg, 24:24 ist ein Remis.

Grundlage ist das Regelwerk von BrainKing (Mancala/Kalaha). Die Regeln sind
in `server/spiel/engine.js` umgesetzt und in `tests/engine.test.js` geprüft.

---

## Technik

Frontend: HTML5, modernes CSS3 (`@layer`, Nesting, `:has()`, `color-mix()`,
`oklch()`, Logical Properties), Vanilla JavaScript als ES-Module.
**Kein Framework.** Backend: Node.js mit Express und Socket.io. Tests: Jest.
