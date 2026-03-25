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
## 2026-03-24

### Projektpreise und Monteurkosten

- Ausgangslage:
  - Projektpreise und Monteurkosten sollten im CRM als Grundlage fuer Umsatz-, Kosten- und Margenlogik erfasst werden.
  - Preise sollen projektbezogen gespeichert werden, Monteurkosten direkt am Monteur.

- Geplante Aufgabe:
  - Projekt um Preisfelder erweitern.
  - Monteur um internen Stundensatz erweitern.
  - Erste Anzeige der Werte in Projekt- und Kundenansicht schaffen.

- Umsetzung durch Claude:
  - Im `Project`-Modell vier neue Preisfelder ergaenzt:
    - `weeklyFlatRate`
    - `includedHoursPerWeek`
    - `hourlyRateUpTo40h`
    - `overtimeRate`
  - Im `Worker`-Modell `internalHourlyRate` ergaenzt.
  - Projektformular um eigenen Block `Projektpreise` erweitert.
  - Projekt-Detail um Preistabelle erweitert.
  - Monteur-Formular um Feld `Interner Stundensatz (EUR)` erweitert.
  - Projekt-Detail zeigt Monteure mit internem Stundensatz.
  - Kunden-Detail zeigt in der Projekttabelle auch Preisbasiswerte.

- Pruefung durch Codex:
  - `pnpm --filter web build` gruen.
  - Dev-Docker-Stack laeuft sauber.
  - Schema, DTOs und UI-Felder fuer Projektpreise und `internalHourlyRate` bestaetigt.
  - API-Speicherpfade mit echten Testdaten verifiziert:
    - Projekt mit Preisfeldern anlegen, laden und loeschen erfolgreich
    - Monteur mit internem Stundensatz anlegen, laden und loeschen erfolgreich
  - Projekt-Detail zeigt Preisblock und Monteur-Stundensaetze.
  - Kunden-Detail zeigt Preisbasis in der Projekttabelle.

- Ergebnis / Entscheidung:
  - Codex-Abnahme fuer Projektpreise und Monteurkosten: **Gruen**.
  - Die Datenbasis fuer projektbezogene Preislogik und Monteurkosten ist vorhanden und lauffaehig.
  - Damit sind die Voraussetzungen fuer Umsatz-, Kosten- und Margenberechnung geschaffen.

- Offene Punkte:
  - Danach Paket 3: Berechnungslogik und Auswertung

## 2026-03-24

### Berechnungslogik und Auswertung

- Ausgangslage:
  - Auf Basis der Projektpreise und Monteur-Stundensaetze sollte eine erste Umsatz-, Kosten- und Margenlogik fuer Projekte und Kunden entstehen.

- Geplante Aufgabe:
  - Wochenweise Umsatzlogik fuer Projekte.
  - Kostenlogik aus `internalHourlyRate`.
  - Projekt-Auswertung und Kunden-Auswertung im UI.

- Umsetzung durch Claude:
  - `GET /projects/:id/financials` und `GET /customers/:id/financials` umgesetzt.
  - Zwei Preismodelle beruecksichtigt:
    - Wochenpauschale
    - Stundensatz mit Ueberstunden
  - `CLOCK_IN`/`CLOCK_OUT`-Paare werden in Stunden umgerechnet und nach ISO-Kalenderwochen gruppiert.
  - Projekt-Detail zeigt:
    - Kennzahlen
    - Umsatzaufschluesselung
    - Monteurkosten
    - Wochendetail
  - Kunden-Detail zeigt:
    - aggregierte Kennzahlen
    - Aufschluesselung
    - Projekt-Tabelle mit Stunden, Umsatz, Kosten und Marge

- Pruefung durch Codex:
  - `pnpm --filter web build` gruen.
  - Endpunkte fuer Projekt- und Kunden-Financials vorhanden und erreichbar.
  - Kontrollierter Laufzeittest mit echten Testdaten erfolgreich:
    - Testprojekt mit `weeklyFlatRate = 2500`
    - Testmonteur mit `internalHourlyRate = 35`
    - 3 Arbeitstage à 9h = `27h`
  - Verifiziertes Projektergebnis:
    - `totalHours = 27`
    - `overtimeHours = 0`
    - `totalRevenue = 2500`
    - `totalCosts = 945`
    - `margin = 1555`
    - `pricingModel = WEEKLY_FLAT_RATE`
  - Kunden-Financials liefern die aggregierten Werte korrekt und enthalten die Projektaufschluesselung.

- Ergebnis / Entscheidung:
  - Codex-Abnahme fuer Berechnungslogik und Auswertung: **Gruen**.
  - Die erste Umsatz-, Kosten- und Margenlogik ist technisch bestaetigt.

- Offene Punkte:
  - Spaetere Erweiterungen wie Zuschlaege, Reisekosten oder komplexere Wochenmodelle sind noch offen.

## 2026-03-24

### Deaktivierte Monteure und PIN-Login

- Ausgangslage:
  - Deaktivierte Monteure sollten konsequent aus der Team-Auswahl herausfallen und sich nicht mehr per PIN anmelden koennen.
  - Der Login sollte klar zwischen Admin-Anmeldung und Monteur-/Kiosk-Anmeldung getrennt sein.
  - Nach PIN-Login sollte nur noch die reduzierte Monteur-Sicht mit eigenen Projekten sichtbar sein.

- Geplante Aufgabe:
  - Deaktivierte Monteure in Team-Checkboxen ausblenden.
  - PIN-Login fuer deaktivierte Monteure serverseitig sperren.
  - Login-Oberflaeche in zwei Modi aufteilen.
  - Admin-Datenladen fuer Worker-Sitzungen unterbinden.

- Umsetzung durch Claude:
  - Deaktivierte Monteure werden in der Team-Auswahl nicht mehr angeboten.
  - Deaktivierte Monteure bleiben in der Admin-Monteurliste sichtbar und werden als `(deaktiviert)` markiert.
  - Der PIN-Login lehnt deaktivierte Monteure sowie Monteure ohne aktuelle oder zukuenftige Zuordnung ab.
  - Die Login-Seite zeigt getrennte Bereiche fuer `Admin Login` und `Monteur / Kiosk`.
  - Nach erfolgreichem PIN-Login wird eine reduzierte Monteur-Sicht mit `Aktuelle Projekte` und `Zukuenftige Projekte` angezeigt.
  - Alte gespeicherte Auth-Daten ohne `type` werden weiterhin als `user` interpretiert.

- Pruefung durch Codex:
  - `pnpm --filter web build` gruen.
  - Dev-Docker-Stack auf `localhost:3800` und `localhost:3801` laeuft.
  - Backend-Pruefung bestaetigt in `auth.service.ts`:
    - deaktivierte Monteure werden beim PIN-Login gesperrt
    - fehlende relevante Projektzuordnung fuehrt zur erwarteten Fehlermeldung
    - Rueckgabe enthaelt getrennt `currentProjects` und `futureProjects`
  - Frontend-Pruefung bestaetigt in `crm-app.tsx`:
    - zwei Login-Modi `Admin Login` und `Monteur / Kiosk`
    - getrennte Worker-Sicht nach PIN-Login
    - `loadData()` bricht fuer `auth.type === "worker"` sauber ab
    - Team-Auswahl filtert auf aktive Monteure
    - Monteurliste markiert deaktivierte Monteure sichtbar

- Ergebnis / Entscheidung:
  - Codex-Abnahme fuer deaktivierte Monteure und PIN-Login: **Teilweise**.
  - Code, Build und Datenlade-Logik sind stimmig und ohne erkennbare Abweichung zur Anforderung umgesetzt.

- Offene Punkte:
  - Ein kompletter interaktiver Browser-Durchlauf des Login-Flows wurde in dieser Pruefrunde nicht erneut automatisiert bestaetigt.

## 2026-03-24

### Prozessabweichung Codex

- Ausgangslage:
  - Fuer dieses Projekt ist verbindlich vereinbart: wir planen gemeinsam, Claude implementiert, Codex prueft und dokumentiert.

- Geplante Aufgabe:
  - Die Rollenverteilung sauber einhalten und bei Abweichungen transparent festhalten.

- Umsetzung durch Claude:
  - Keine.

- Pruefung durch Codex:
  - Codex hat in einer Runde dennoch selbst Codeaenderungen fuer `Kioskmodus` und `PIN` vorgenommen und damit gegen die vereinbarte Arbeitsweise verstossen.

- Ergebnis / Entscheidung:
  - Die Abweichung wird dokumentiert.
  - Fuer weitere neue Umsetzungen gilt wieder ausschliesslich: Claude implementiert, Codex prueft.

- Offene Punkte:
  - Das naechste neue Arbeitspaket wird wieder als klare Claude-Aufgabe formuliert und erst danach von Codex abgenommen.