# Workstatus

## Zweck

- Diese Datei haelt Arbeitsregeln, Entscheidungen und den laufenden Projektstand fest.
- Vor groesseren Aufgaben soll sie kurz gelesen werden.
- Nach groesseren Planungs-, Umsetzungs- oder Pruefrunden wird sie aktualisiert.

## Rollen und Arbeitsweise

- Wir planen Anforderungen, Prioritaeten und Arbeitspakete gemeinsam.
- Claude setzt Codeaenderungen und technische Umsetzungen um.
- Codex unterstuetzt bei Strukturierung, Review, Tests, Verifikation und Dokumentation.
- Codex aendert keinen Produktivcode, ausser dies wird ausdruecklich beauftragt.
- Neue Umsetzungen sollen zuerst als klare Aufgabenbeschreibung fuer Claude formuliert werden.
- Nach groesseren Umsetzungen prueft Codex den Stand und dokumentiert das Ergebnis hier.

## Aktuelle Projektsituation

- Projektpfad: `C:\coding\CRM`
- Es gibt aktuell keine verbindliche Trennung in `Backend` und `Frontend`.
- Dokumentationen und Regeln sollen deshalb allgemein formuliert werden und keine feste technische Struktur voraussetzen.
- Bereits vorhandene Skripte und Deploy-Helfer koennen genutzt und weiter angepasst werden.
- Aktuell wichtigster Prozesspunkt:
  - wir planen gemeinsam
  - Claude implementiert
  - Codex prueft und dokumentiert

## Wichtige Regeln

- Keine festen Aussagen ueber Architektur oder Ordnerstruktur dokumentieren, wenn diese noch nicht verbindlich festgelegt sind.
- Bei Unsicherheit zwischen Planung und direkter Umsetzung erst rueckfragen.
- Prozessaenderungen immer auch hier festhalten.
- **Dev-Docker nach Claude-Umsetzung (verbindlich):** Direkt nach jeder Umsetzung durch Claude muss der lokale Dev-Docker-Stand die Aenderungen sichtbar unter **http://localhost:3800** liefern. Alte oder produktionsnahe Containerstaende gelten nicht als Dev-Referenz; nur der laufende Dev-Stack auf dem Umsetzungsrechner ist massgeblich.

## Aenderungshistorie

## 2026-03-24

### Prozessschaerfung Dev-Docker

- Verbindliche Regel dokumentiert: Nach jeder Claude-Umsetzung ist unmittelbar zu verifizieren, dass **http://localhost:3800** den aktuellen Dev-Docker-Stand zeigt.
- Klarstellung: Produktiv- oder veraltete Container nicht als Referenz fuer lokale Entwicklung verwenden; `AGENTS.md` und diese Datei entsprechend ergaenzt.

## 2026-03-23

### Prozessklarstellung

- Die Zusammenarbeit wurde verbindlich festgelegt:
  - Wir planen gemeinsam.
  - Claude programmiert.
  - Codex testet, prueft und dokumentiert.
- Diese Regel soll kuenftig konsequent eingehalten werden.

### Dokumentation angelegt

- `workstatus.md` wurde fuer das CRM-Projekt angelegt.
- Die Datei dient als gemeinsame Gedächtnis- und Regelbasis fuer weitere Arbeitsschritte.

### Skript- und Deploy-Stand

- Die vorhandenen Deploy-/Hilfsskripte aus dem anderen Projekt wurden als Grundlage fuer CRM uebernommen und angepasst.
- Relevantes Hauptskript ist aktuell `abgleich/crm-deploy.ps1`.
- Der TEST-Bezug auf `crm.vivahome.de` bleibt als betrieblicher Kontext relevant.

### Korrektur der Dokumentationsbasis

- Fruehere Beschreibungen mit einer festen Trennung in `Backend` und `Frontend` gelten fuer dieses Projekt aktuell nicht als verbindlich.
- Dokumentationen sollen ab jetzt auf die reale Situation angepasst bleiben:
  - keine feste technische Teilung voraussetzen
  - keine Architektur als abgeschlossen darstellen, wenn sie noch im Fluss ist

## Offene Punkte

- `AGENTS.md` als dauerhafte Projektregeldatei pflegen.
- Kuenftige Claude-Umsetzungen und Codex-Pruefungen fortlaufend hier dokumentieren.
- Technische Struktur erst dann genauer dokumentieren, wenn sie wirklich feststeht.

## Vorlage fuer neue Eintraege

```md
## YYYY-MM-DD

### Thema

- Ausgangslage:
- Geplante Aufgabe:
- Umsetzung durch Claude:
- Pruefung durch Codex:
- Ergebnis / Entscheidung:
- Offene Punkte:
```
