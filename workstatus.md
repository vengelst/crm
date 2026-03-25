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

## 2026-03-24

### Einheitliche Detailansichten, echtes Loeschen und Dark-Theme-Kontrast

- Ausgangslage:
  - Es sollte geprueft werden, ob Dashboard-Detailaufrufe und Bereichsdetailseiten wirklich dieselben Detailansichten verwenden.
  - Kunden und Monteure sollten echt loeschbar sein, jeweils mit Rueckfrage und klarer Fehlermeldung bei blockierenden Abhaengigkeiten.
  - Der Dark-Theme-Textkontrast sollte weicher werden, ohne die Lesbarkeit der aktiven Navigation zu verschlechtern.

- Geplante Aufgabe:
  - Einheitlichkeit der Detailansichten bestaetigen.
  - Delete-Flow fuer Kunden und Monteure pruefen.
  - Header-/Dark-Theme-Kontrast gegen den Code- und Build-Stand abgleichen.

- Umsetzung durch Claude:
  - Dashboard und Bereichsseiten verwenden dieselben Detailpfade fuer `Kunden`, `Projekte` und `Monteure`.
  - Echtes Loeschen fuer `Kunden` und `Monteure` implementiert, jeweils mit `window.confirm`.
  - Klare Backend-Meldungen bei blockiertem Loeschen umgesetzt.
  - Dark-Theme-Basistext auf weichere Kontraststufe angepasst.

- Pruefung durch Codex:
  - `pnpm --filter api build` gruen.
  - `pnpm --filter web build` gruen.
  - Detailseiten in `customers/[id]`, `projects/[id]` und `workers/[id]` rendern jeweils dieselbe `CrmApp`-Sektion wie die Bereichsseiten.
  - Frontend-Rueckfrage vor echtem Loeschen in `crm-app.tsx` bestaetigt.
  - Backend-Loeschlogik in `customers.service.ts` und `workers.service.ts` bestaetigt:
    - echte Delete-Transaktionen
    - klare Blockiermeldungen bei Projekten bzw. Zeitbuchungen
  - Aktive Navigation ist im Code kontrastiert, kein offensichtlicher weisser Text auf weissem Hintergrund.
  - Hauptcontainer verwenden nun `dark:text-slate-200`.

- Ergebnis / Entscheidung:
  - Codex-Abnahme fuer Detailansichten, echtes Loeschen und Dark-Theme-Kontrast: **Teilweise**.
  - Code- und Build-Stand sind stimmig, ohne erkennbare strukturelle Abweichung zur Anforderung.

- Offene Punkte:
  - Der echte Laufzeittest fuer das Loeschen wurde in dieser Pruefrunde nicht erneut mit frischen Wegwerf-Testdaten durchgespielt.

## 2026-03-24

### Dashboard-Status, Projekt-Hinweise und Bereich Auswertung

- Ausgangslage:
  - Das Dashboard sollte bei Monteuren klare Arbeitsstatus anzeigen.
  - Projekte sollten bereits in der Dashboard-Uebersicht einen kompakten Hinweis auf Teams oder Monteure erhalten.
  - Fuer Stundenzeiten, Zettel und Kennzahlen sollte ein eigener Hauptbereich `Auswertung` entstehen.

- Geplante Aufgabe:
  - Statusdarstellung fuer Monteure im Dashboard ergaenzen.
  - Team-/Monteur-Hinweise in der Projektliste des Dashboards ergaenzen.
  - Neuen Navigationspunkt `Auswertung` mit eigener Seite schaffen.

- Umsetzung durch Claude:
  - Monteure im Dashboard mit drei Stati umgesetzt:
    - `arbeitet`
    - `nicht gestartet`
    - `kein Projekt`
  - Projektkarten im Dashboard zeigen nun Teamname, Monteurnamen oder einen Leerhinweis.
  - Neuer Bereich `Auswertung` unter `/reports` mit eigener Seite und eigener Navigation umgesetzt.

- Pruefung durch Codex:
  - `pnpm --filter web build` gruen.
  - `/reports` ist als Route vorhanden und unter `http://localhost:3800/reports` erreichbar.
  - `Auswertung` ist als eigener `NavLink` in der Hauptnavigation bestaetigt.
  - Dashboard-Monteurstatus in `crm-app.tsx` bestaetigt:
    - `bg-emerald-500` fuer `arbeitet`
    - `bg-red-500` fuer `nicht gestartet`
    - `bg-amber-500` fuer `kein Projekt`
  - Projekt-Hinweise im Dashboard bestaetigt:
    - Teamname bei passendem Team
    - bis zu drei Monteurnamen
    - sonst `X Monteure zugeordnet`
    - oder `Keine Monteure zugeordnet`
  - Auswertungsseite enthaelt Kennzahlen, Kunden-Umsatzuebersicht und Monteur-Statusliste.

- Ergebnis / Entscheidung:
  - Codex-Abnahme fuer Dashboard-Status, Projekt-Hinweise und `Auswertung`: **Gruen**.
  - Die Erweiterung ist technisch bestaetigt und im Dev-Stand erreichbar.

- Offene Punkte:
  - Der Dashboard-Monteurstatus leitet `arbeitet` aktuell aus dem letzten `timeEntry` ab; das ist fuer den aktuellen Stand akzeptiert, spaeter aber eventuell noch durch eine explizitere Open-Work-Logik ersetzbar.

## 2026-03-23

### Kioskmodus, Stundenzettel-Sicht und zentrale Auswertung

- Ausgangslage:
  - Der Monteurfluss war fachlich noch nicht sauber genug getrennt.
  - Stundenzettel sollten im Projekt, beim Kunden und zentral in `Auswertung` sichtbar sein.
  - Der Kiosk sollte der einzige Einstieg fuer Monteure sein.

- Geplante Aufgabe:
  - Login auf `Benutzer` und `Kiosk / Monteur` reduzieren.
  - Kiosk-Projektansicht auf volle Projektdetailtiefe bringen.
  - Stundenzettel in Projekt-, Kunden- und Reports-Sicht anzeigen.
  - Signaturabschluss sauber sperren und PIN-Meldungen bereinigen.

- Umsetzung durch Claude:
  - Login auf zwei Modi reduziert:
    - `Benutzer-Anmeldung` mit E-Mail + Passwort
    - `Kiosk / Monteur` nur per PIN
  - Kiosk liefert und zeigt jetzt:
    - aktuelle Projekte
    - zukuenftige Projekte
    - vergangene Projekte
    - Kundenname pro Projekt
    - volle Projektansicht mit Stammdaten, Preisen, Monteuren, Auswertung und Stundenzetteln
  - Wiederverwendbare `TimesheetList` fuer:
    - Projekt-Detail
    - Kunden-Detail
    - Kiosk-Projektansicht
    - zentrale Reports-Sicht
  - `ReportsSection` um zentrale Stundenzettel-Uebersicht mit Filtern erweitert:
    - Kunde
    - Projekt
    - Monteur
    - Status
  - Signatur-/Sperrlogik nach Kunden-Signatur verschaerft:
    - automatischer Abschluss auf `COMPLETED`
    - `lockedAt` wird gesetzt
    - abgeschlossene Zettel koennen nicht neu erzeugt oder weiter geaendert werden
  - Fehlermeldung fuer doppelte Monteur-PIN korrigiert und nicht mehr auf den entfernten Monteur-Login verwiesen.

- Pruefung durch Codex:
  - Mehrere Codex-Abnahmen fuer diese Teilpakete durchgefuehrt.
  - Bestaetigt:
    - `pnpm --filter api build` gruen
    - `pnpm --filter web build` gruen
    - zentrale Stundenzettel-Sicht in `Auswertung` vorhanden
    - Kunden- und Projektsicht mit Stundenzetteln vorhanden
    - Kiosk-Login nur noch per PIN sichtbar
    - Backend-Meldung bei doppelter PIN fachlich korrigiert
  - Nachtraeglich auch Lint-Bereinigung fuer `crm-app.tsx` durchgefuehrt:
    - ungenutzte Destructuring-Variablen entfernt
    - ungenutzte Hilfskomponenten entfernt
    - zwei `img`-Warnungen auf `next/image` umgestellt

- Ergebnis / Entscheidung:
  - Codex-Abnahme fuer Kioskmodus, Stundenzettel-Sichten und zentrale Reports-Verwaltung: **Gruen**.
  - Der Monteur-Kiosk ist fachlich klarer getrennt, und Stundenzettel sind jetzt in den relevanten Kontexten sichtbar.
  - Die verbleibenden Lint-Warnungen wurden aufgeraeumt.

- Offene Punkte:
  - Produktpflege und weitere Verfeinerungen koennen folgen, aber fuer dieses Paket besteht aktuell keine offene Abweichung mehr.