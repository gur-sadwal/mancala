# AGENTS.md – Mancala-Code

Deutschsprachiges DHBW-Studienprojekt von Gursharan Sadwal. Der Student muss
jede geänderte Zeile selbst erklären können. README.md beschreibt Regeln und Aufbau.

## Verbindliche Arbeitsregeln

- Server autoritativ: Client sendet Muldennummer, keine berechneten Spielstände.
  Müll-Nachrichten, Disconnects und einzelne kaputte Partien dürfen den Server nicht stoppen.
- Express, Socket.io, Vanilla-JavaScript, HTML und CSS; keine zusätzlichen Dependencies,
  Frameworks, Bundler oder Produktivdateien unter server/, shared/, client/.
- Eine JS-Datei je Ansicht; CSS bleibt nach Themen getrennt. Kleine benannte Funktionen,
  möglichst <=40 Zeilen, frühe Rückkehr. Kein var, this oder verschachtelte Ternaries.
- Kommentare, UI, Dokumentation und Commits auf Deutsch mit echten Umlauten;
  Bezeichner bleiben ASCII. Dateikopf mit Inhalt und nummerierten Abschnitten.
  Marker: REGEL 3.x:, SCHUTZ:, ACHTUNG:, WCAG:, EINSTELLBAR:.
- Native HTML-Elemente, label for, vollständige Tastaturbedienung, Trefferflächen
  >=44x44px, Schrift >=16px, Kontrast >=4,5:1. Kein style=, .style., onclick,
  br als Abstand, !important oder zusätzlicher ARIA-/Screenreader-Code.
- Ansichtslistener beim Anzeigen anmelden und beim Verstecken abmelden.
  Fehlermeldungen müssen in der aktiven Ansicht sichtbar sein. Animationen abfangen.
- Tests vor funktionalen Fixes. `npm run build` prüft Syntax und Jest. Zusätzlich
  vollständige Browserabläufe, Angriffe, Last und Server-Neustart prüfen.
- Kommentaränderungen von Logikänderungen trennen; AST-Vergleich als Nachweis.
- Keine fremden Änderungen überschreiben. Eigene Agents in getrennten Worktrees
  mit klar zugewiesenen Dateien koordinieren.

## Regelquelle und Prüfung

Die Spielregeln stehen vollständig in README.md, Abschnitt3.1–3.5.
Regeländerungen sind keine Refaktorierung; bei Unklarheiten mit dem Auftraggeber
abstimmen. Vor Änderungen den Git-Status prüfen und fremde Arbeit erhalten.
Nach funktionalen Änderungen alle Tests ausführen; Fehlerbehebung und Kommentare
in getrennten, nachvollziehbaren Commits festhalten.
