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

## Im vollständigen Mancala-Arbeitsordner

Dort gelten zusätzlich ../AGENTS.md und ../ANFORDERUNGEN_UND_REGELWERK.md
(die verbindliche Regelquelle). Vor Fortsetzung des großen Reviews lesen:
../.codex/plans/code-review-2026-10.md, ../.codex/fortschritt.md und
../.codex/konventionen.md. Alle Phasen 0–10 gehören zum Auftrag.
Projektwissen liegt unter ../.codex/memory/, Browserwerkzeuge unter ../Browsertests/.
Nach jeder Session passendes Lern-PDF pflegen. ../TODOs/TODO.md enthält private
Zugangsdaten im Vorspann: niemals vollständig öffnen oder veröffentlichen.

Der Nutzer hat den gesamten Plan einschließlich paralleler Agents, Fixes, tiefem
Umbau, Commits und abschließendem Push/Deployment nach grüner Prüfung freigegeben.
Neue Funktionen außerhalb des Plans vorher abstimmen.
