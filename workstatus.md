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
- **i18n-Regel (verbindlich):**
  - Fuer dieses Projekt werden Uebersetzungen **nicht** ueber eine Datenbank, sondern **dateibasiert** gepflegt.
  - Wenn ein UI-Bereich mehrsprachig umgesetzt wird, muessen dort **alle sichtbaren festen Systemtexte** ueber i18n laufen.
  - In mehrsprachigen Bereichen duerfen **keine harten deutschen Resttexte** verbleiben.
  - Das gilt insbesondere fuer:
    - Ueberschriften
    - Buttons
    - Labels
    - Platzhalter
    - Statusmeldungen
    - Empty States
    - Dialogtexte
    - Tabellenkoepfe
    - Tooltips
    - Druck-/Preview-Texte
    - Hilfstexte
  - Nicht automatisch zu uebersetzen sind frei eingegebene Inhalte oder fachliche Nutzdaten, z. B. kundenspezifische Texte oder Baustellenhinweise.
  - Neue sichtbare UI-Texte duerfen nur noch mit passendem i18n-Key eingebaut werden.
  - Codex prueft bei Abnahmen zusaetzlich, ob in den geaenderten mehrsprachigen Komponenten noch harte sichtbare Texte verblieben sind.

## Aenderungshistorie

## 2026-04-28

### TEST-Server Loginfehler nach DB-Uebertragung (Codex, read-only Diagnose)

- Ausgangslage:
  - Lokal auf der Dev-Maschine lief der CRM-Stack unter `http://localhost:3800`; Login und Kiosk-Login funktionierten.
  - Nach Uebertragung der Datenbank auf den TEST-Server waren die CRM-Domain und die Container erreichbar, Anmeldungen auf `crm.vivahome.de` liefen jedoch in `500`-Fehler.

- Pruefung durch Codex:
  - Lokalen Dev-Docker-Stack neu gebaut und gestartet; Web, API, Postgres und MinIO liefen danach wieder sauber.
  - Server read-only geprueft: aktive Nginx-Konfiguration, laufende Container, API-Logs, Postgres-Logs und Datenbankinhalt.
  - In der Server-DB wurden die erwarteten Benutzer bestaetigt (`admin@example.local`, `ve@vivahome.de`); die Datenbank war also inhaltlich vorhanden.
  - Der oeffentliche `/api`-Pfad fuer `crm.vivahome.de` war aktiv; der verbleibende Fehler lag nicht primaer im Proxy.
  - API-Logs zeigten fuer `POST /api/auth/login` und `POST /api/auth/kiosk-login` konsistent `P1000` / `password authentication failed for user "postgres"`.
  - Ursache eingegrenzt: Der Datenbanktransfer hatte Inhalte und Schema uebertragen, aber nicht automatisch die zur Laufzeit benoetigte Postgres-Rollen-Authentifizierung fuer Netzwerkzugriffe zwischen `crm-api` und `crm-postgres`.

- Ergebnis / Entscheidung:
  - Der Serverfehler war kein Produktivcode- oder UI-Problem, sondern ein Betriebs-/Credentials-Thema zwischen API und Postgres.
  - Nach Angleichen des Postgres-Rollenpassworts an die erwartete Laufzeitkonfiguration funktionierte der Server-Login wieder.
  - Fuer kuenftige TEST-Deploys gilt: Nach DB-Transfer immer nicht nur Daten und Containerstatus, sondern auch die effektive DB-Authentifizierung zwischen `crm-api` und `crm-postgres` pruefen.

## 2026-04-09

### Ressourcen- und Deploy-Anpassungen (Claude)

- **`getProjectAssignmentTimeSummary`** (`apps/api/src/time/time.service.ts`): Statt N+1 pro Monteur zwei gebündelte Queries (Projekt-Einträge ab gestern, IN/OUT mit Lookback 366 Tage) plus In-Memory-Auswertung; Hilfsmethode `findOpenClockInFromInOutSequence`.
- **Office-Reminder-Queue** (`apps/api/src/reminders/reminders.service.ts`): Vor dem Dispatch werden alle `ReminderLog`-Einträge mit Status `SENT` für die betroffenen Reminder-IDs einmal geladen; pro Kanal wird ein Set genutzt statt wiederholter `findUnique`-Aufrufe. Entfernt: `wasOfficeReminderChannelSent`.
- **Referenzdaten Reminder-UI**: `getOfficeReminderReferenceData` — `take: 500` für Kunden, Kontakte, Projekte (Notizen blieben bei 50).
- **Dokumente** (`documents.service.ts`): `list` mit `take: 500`.
- **Storage** (`storage.service.ts`): `getObjectBufferWithFallback` bricht Lesen ab, wenn die Gesamtgroesse 40 MiB ueberschreitet (Stream + lokale Datei per `stat`).
- **NotificationBell**: Polling 180 s, nur bei sichtbarem Tab; bei `visibilitychange` → `visible` sofortiger Refresh.
- **Deploy-Test-Skript** (`abgleich/deploy-test.ps1`): Remote-Aufrufe explizit `docker compose -f docker-compose.yml`.
- **Doku**: `abgleich/SERVER-DIAGNOSE.md` — CRM-Postgres vs. fremdes MySQL, Befehle zur Lastanalyse (ohne produktive MySQL-Konfiguration zu aendern).

## 2026-04-16

### Produktions-Server vivahome.de (SSH, read-only)

Messzeitpunkt: hohe Load (~6.3) auf ~7.7 GiB RAM, kein Swap.

- **Host-MariaDB** (`/usr/sbin/mariadbd`, User `mysql`): im Moment **keine** auffaellige CPU; `SHOW FULL PROCESSLIST` zeigte nur `Sleep` (Plesk/psa) und die Diagnose-Abfrage selbst.
- **`crm-postgres` (Docker):** `docker stats` meldete **>600 % CPU** und **~2.3 GiB RAM** — das passt **nicht** zu normalem Leerlauf-PostgreSQL.
- **`docker top crm-postgres`:** laufender Prozess **`/tmp/mysql`** (ca. 2 MiB Binary, User `postgres`, Rechte `700`, MD5 `590b00dff7a44130ebe1350a5b4ddc97`) mit sehr hoher CPU-Zeit — **das ist nicht** die Host-Datenbank und **kein** offizielles PostgreSQL-Binary. **Eindringlich wahrscheinlich Kompromittierung oder Schadsoftware** im Container (Tarnname „mysql“).

**Empfohlene Sofortmassnahmen (Betrieb, ausserhalb Repo):** Container stoppen oder Netzwerk isolieren, **Forensik** (wann angelegt, Eintrittspfad), Postgres-Volume/Images **nicht blind weiterverwenden**, Secrets (`DATABASE_URL`, API-Keys, Plesk) **rotieren**, Stack aus **vertrauenswuerdiger Quelle** neu deployen. Details und Befehle: `abgleich/SERVER-DIAGNOSE.md` (Abschnitt DB-Container).

### App-Pruefung Ressourcenverbrauch (read-only, Codex/Claude-Befund)

**Ist-Zustand (idle, 3 Snapshots ueber 15 s, lokal):**

| Container     | CPU       | RAM     | Auffaelligkeit                          |
|---------------|-----------|---------|----------------------------------------|
| crm-web       | 0,0–0,8 % | 992 MiB | konstant hoch fuer idle                |
| crm-api       | 2,1–4,1 % | 596 MiB | 3 parallele Node-Prozesse              |
| crm-postgres  | 0,0–4,0 % | 27 MiB  | unauffaellig                           |
| crm-minio     | 0,0–0,1 % | 78 MiB  | unauffaellig                           |

- Container liefen zum Messzeitpunkt seit **8 Tagen** ohne Restart.
- Im API-Container: **drei** Node-Prozesse gleichzeitig (`pnpm start:dev` → `nest start --watch` → `node dist/main`).

**Hauptbefund (hohe Wahrscheinlichkeit):**  
Beide CRM-Container mit `NODE_ENV=development`, `CHOKIDAR_USEPOLLING=true`, `WATCHPACK_POLLING=true`, `next dev` und `nest start --watch` — Hinweis auf **Dev-Compose-Override** (`docker-compose.dev.yml`) statt Produktions-Images. Folgen: dauerhaftes Filesystem-Polling (idle-CPU), hoher RAM durch `next dev` (HMR, groessere Bundles im Speicher), mehrfacher Node-Heap bei parallelen API-Prozessen.

**Top-5 Verdachtsliste (sortiert):**

1. Dev-Modus auf TEST/Prod (groesster Hebel).
2. `reminders.service.ts` (ca. 293): `@Interval(3600000)`; ca. 334–349: N+1 bei Reminder-Unterjobs.
3. `time.service.ts` `getProjectAssignmentTimeSummary`: Schleife pro Monteur mit `findOpenClockIn` + `findMany` — bei hauefigem Aufruf (z. B. Projekt-Dashboard) teuer.
4. `NotificationBell.tsx` (ca. 25): `setInterval(loadCount, 60000)` pro Client → Last skaliert mit Nutzerzahl.
5. `storage.service.ts` (ca. 244): `Buffer.concat` statt Stream bei grossen Dateien.

**Priorisierte naechste Schritte:**

1. Auf **TEST-Server** `docker compose`/`docker inspect crm-api` pruefen: **nur** `docker-compose.yml`, **ohne** `-f docker-compose.dev.yml`; `NODE_ENV=production` verifizieren.
2. Reminder-Cron: Batch-Fetch statt N+1 in `runOfficeReminderQueue`.
3. `getProjectAssignmentTimeSummary`: **eine** aggregierte Query (`workerId: { in: [...] }`) statt Schleife.
4. NotificationBell: Intervall 180–300 s oder bei Focus/Visibility drosseln.
5. `documents.service.ts` / `reminders.service.ts`: Pagination / `take`-Limits pruefen.

**Nicht untersucht (Scope):** keine Last-Messung unter echter Nutzung; kein `pg_stat_statements`; kein Heap-Dump; Dev-Modus-Aussage auf echtem TEST-Host noch **verifizieren**.

**Umsetzung:** Kein Produktivcode in dieser Pruefrunde geaendert (read-only). **Naechster Hebel:** Compose-Setup auf TEST verifizieren, bevor tiefe Code-Optimierungen.

## 2026-04-09

### Server-Neuaufsetzung: `neuserver-host-setup.sh` (Compose ohne apt-Paket)

- Auf manchen Ubuntu-Quellen fehlt `docker-compose-plugin`; der bisherige **eine** `apt-get`-Schritt brach dann komplett ab.
- Anpassung: zuerst `docker.io` + `nginx`, danach optional `docker-compose-plugin`; **Fallback** Compose v2 als CLI-Binary nach `/usr/local/lib/docker/cli-plugins/docker-compose` (GitHub Release, `x86_64` / `aarch64`).
- **`neuserver-host-setup.sh` nicht im Repo-Ordner** `abgleich/server-reinstall-backups/`; Pflege nur auf dem Host unter **`/tmp/sicherung/`** (README beschreibt Ablage, kein vollständiger Skripttext im README).
- **Ubuntu 24.04:** Paketname für Compose ist **`docker-compose-v2`**, nicht `docker-compose-plugin` (letzteres fehlt im Ubuntu-Archiv). Skript auf dem Host versucht jetzt: Plugin → **v2-Paket** → GitHub-Fallback; vivahome: `docker-compose-v2` nachinstalliert, manuelles Binary unter `/usr/local/...` entfernt, damit die Paket-Version genutzt wird.

### Projekt: Live-Status zugeordneter Monteure

- API `GET /projects/:id/assignment-time-summary` (Buerorollen): je Monteur offene Arbeit auf diesem Projekt, erste heutige CLOCK_IN auf dem Projekt, Minuten heute auf dem Projekt.
- Projektkarte: Abschnitt Zugeordnete Monteure zeigt diese Daten; Hinweis auf Arbeitsprotokoll fuer Details.

### Kiosk-PIN / Standort Zeiterfassung

- Neuer Monteur-PIN und PIN-Reset: Pruefung gegen aktive Monteur-PINs **und** aktive Benutzer-`kioskCodeHash` (keine Kollision mit Kiosk-Login).
- Benutzer anlegen/aktualisieren mit Kiosk-Code: Pruefung gegen alle Monteur-PINs und andere Benutzer-Kiosk-Codes.
- Kiosk Zeiterfassung: Standort zuerst aus Projekt-Baustelle bzw. Cache; Live-GPS nur wenn noetig — kein zusaetzlicher In-App-Dialog zur Speicher-Erlaubnis.

### CI, Tests, Server-Secrets

- `pnpm test`: API mit `jest --passWithNoTests` bis echte Specs existieren; Web mit Platzhalter-Script (E2E weiter `pnpm test:e2e`).
- GitHub Actions: Schritt **Test** nach Lint.
- `.env.server` aus dem Repository-Tracking entfernt (nur lokal, Vorlage `.env.server.example`); `.gitignore` ergaenzt.
- README: Hinweis, `.env.server` aus der Example-Datei anzulegen.

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
- Naechster fachlicher Umsetzungspunkt:
  - `Baustellenhinweise / Pflichttexte / Monteur-Zustimmung / Unterschrift`
  - mit projektbezogenem Nachweis und reproduzierbaren Testdaten
- Sprachlogik fuer Monteure / Kiosk ist fachlich neu festgelegt, aber noch nicht abgeschlossen:
  - Sprache wird kuenftig direkt im Loginfenster gewaehlt
  - die gewaehlte Sprache gilt fuer die gesamte Sitzung
  - Wechsel erst nach Logout und neuer Anmeldung
- Die bisherige profilbasierte `languageCode`-Ableitung ist damit nur noch eine moegliche Voreinstellung, aber nicht mehr die massgebliche aktive Sitzungsquelle.

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

## 2026-03-23

### Backup-Runtime, Monteur-Bearbeitung und Sprachstand

- Ausgangslage:
  - Backup und Restore nutzen im API-Prozess direkt `pg_dump` und `psql`.
  - Monteure sollten direkt im UI bearbeitbar sein, ohne erst indirekt in einen anderen Modus wechseln zu muessen.
  - Die Sprachumschaltung fuer Monteure / Kiosk war nur teilweise umgesetzt und fuehrte zu gemischten Ansichten.

- Geplante Aufgabe:
  - PostgreSQL-CLI-Tools in der Docker-Runtime fuer API sicherstellen.
  - Monteur-Detail und Monteur-Formular fachlich zusammenbringen.
  - Sprachlogik fuer Monteure / Kiosk weiter schliessen.

- Umsetzung durch Claude:
  - `apps/api/Dockerfile` und `docker/Dockerfile.dev` so angepasst, dass `postgresql16-client` in der API-Runtime vorhanden ist.
  - Das Monteur-Formular bleibt nun in der rechten Spalte sichtbar und wird bei geoeffnetem Monteur mit `mapWorkerToForm(selectedWorker)` vorbelegt.
  - Im Monteur-Formular wurde eine Sprachauswahl fuer `Deutsch` / `English` eingebaut.
  - Der Worker-Login liefert `languageCode` an das Frontend zurueck.
  - Teile der Worker-/Kiosk-Oberflaeche wurden bereits auf i18n-Keys umgestellt.

- Pruefung durch Codex:
  - `pnpm --filter api build` gruen.
  - `pnpm --filter web build` gruen.
  - Docker-Runtime fuer Backup/Restore verifiziert:
    - `pg_dump` und `psql` im API-Produktionscontainer verfuegbar
    - `pg_dump` und `psql` im Dev-API-Container verfuegbar
  - Monteur-Bearbeitung als direktes UI-Formular bestaetigt.
  - Sprachstand nur teilweise bestaetigt:
    - Hauptbereiche wurden verbessert
    - in worker-/kioskrelevanten Unteransichten blieben zuletzt noch gemischte Sprachreste bestehen

- Ergebnis / Entscheidung:
  - Backup-/Restore-Runtime in Docker: **Gruen**
  - Monteur-Bearbeitung im UI: **Gruen**
  - Sprachumschaltung ueber `languageCode` im Workerprofil: **nur teilweise** und fachlich inzwischen ueberholt
  - Neue fachliche Entscheidung:
    - Die Sprache soll nicht mehr primär waehrend der Sitzung aus dem Workerprofil abgeleitet werden
    - Stattdessen wird die Sprache kuenftig direkt im Loginfenster gewaehlt und fuer die laufende Sitzung fixiert

- Offene Punkte:
  - Loginbasierte Sitzungssprache fuer Monteure / Kiosk umsetzen
  - Restliche worker-/kioskrelevanten Sprachreste auf die neue Sitzungslogik umstellen
  - Danach erneute Codex-Abnahme nur fuer den Sprach-Login-Ansatz

## 2026-03-23

### Neue Fachanforderung Baustellenhinweise und Testdaten

- Ausgangslage:
  - Vorlagen sollen kuenftig nicht nur einzelne Punkte enthalten, sondern auch laengere Hinweis- und Zustimmungstexte.
  - Monteure sollen projektbezogen ueber besondere Gegebenheiten auf der Baustelle informiert werden.
  - Diese Hinweise sollen bei Bedarf mit Unterschrift bestaetigt und als Nachweis im Projekt gespeichert werden.
  - Zusaetzlich werden reproduzierbare Testdaten fuer Kunden, Ansprechpartner, Projekte und Monteure benoetigt.

- Geplante Aufgabe:
  - Vorlagen um Hinweis-/Zustimmungstexte erweitern.
  - Projektbezogene Kopien dieser Hinweise speichern.
  - Monteur-Bestaetigung und Signatur je Projekt/Hinweis ermoeglichen.
  - Nachweis im Projekt sichtbar machen.
  - Reproduzierbare Testdaten anlegen:
    - 5 Kunden
    - je Kunde 1 bis 3 Ansprechpartner
    - je Kunde 1 bis 3 Projekte
    - alle Projekte im Zeitraum `01.03.2026` bis `31.05.2026`
    - 6 Monteure

- Umsetzung durch Claude:
  - Noch offen.
  - Eine konkrete Claude-Aufgabenbeschreibung fuer Datenmodell, API, UI, Signaturfluss und Testdaten wurde vorbereitet.

- Pruefung durch Codex:
  - Noch offen.
  - Eine Codex-Abnahmeanweisung fuer dieses Paket wurde vorbereitet, aber die Umsetzung steht noch aus.

- Ergebnis / Entscheidung:
  - Dieses Paket ist der naechste groessere fachliche Ausbauschritt.
  - Der Nachweis soll projektbezogen gespeichert bleiben und darf nicht nur eine Live-Referenz auf die Vorlage sein.

- Offene Punkte:
  - Umsetzung durch Claude
  - anschliessende Codex-Abnahme
  - Entscheidung nach Umsetzung, ob die Hinweis-Nachweise zusaetzlich auch in PDF / Dokumenthistorie sichtbar gemacht werden sollen

## 2026-04-16

### App-Pruefung Ressourcenverbrauch (read-only Analyse)

- Ausgangslage:
  - Auf dem TEST-/Produktivserver wurde auffaellig hoher CPU-/RAM-Verbrauch der CRM-Container gemeldet.
  - Pruefung sollte read-only erfolgen, ohne Produktivdaten zu gefaehrden und ohne ungefragte Refactors.

- Ist-Zustand (Messung lokal, 3 Snapshots ueber 15s, idle):
  - `crm-web`  : CPU 0,0–0,8 % | RAM **992 MiB** (konstant)
  - `crm-api`  : CPU 2,1–4,1 % | RAM **596 MiB** (konstant)
  - `crm-postgres`: CPU 0,0–4,0 % | RAM 27 MiB
  - `crm-minio`: CPU 0,0–0,1 % | RAM 78 MiB
  - API-Prozesse: **zwei parallele Node-Prozesse** im Container
    - `pnpm --filter api start:dev` (PID 1)
    - `nest.js start --watch` (PID 19, bereits **1h34 CPU-Zeit** bei 8 Tagen Laufzeit)
    - `node --enable-source-maps dist/main` (PID 36)
  - Container laufen seit 8 Tagen ohne Restart.

- **Hauptbefund (hohe Wahrscheinlichkeit):**
  Beide CRM-Container laufen mit **`NODE_ENV=development`** und den Dev-Overrides
  (`CHOKIDAR_USEPOLLING=true`, `WATCHPACK_POLLING=true`, `next dev`, `nest start --watch`).
  Das heisst der TEST-Server nutzt anscheinend den Dev-Compose-Override statt des Prod-Images.
  Folgen:
  - Filesystem-Polling (chokidar/watchpack) laeuft ununterbrochen → idle-CPU-Grundlast.
  - Next.js im Dev-Modus behaelt HMR, Source-Maps und ungemischtes Bundle im Speicher → ~1 GB RAM nur fuer Web.
  - API laeuft als **drei parallele Node-Instanzen** statt einem Prod-Prozess → Dreifach-Heap.

- Hypothesen (sortiert nach Wahrscheinlichkeit):
  1. **Dev-Modus auf TEST/Prod** — erklaert den Grossteil der idle-Last (Web ~1 GB, API 3× Node, dauerhaftes FS-Polling).
  2. **Reminder-Cron `@Interval(3600000)` in `apps/api/src/reminders/reminders.service.ts:293`** —
     stuendlicher Batch, ruft 5 Unter-Jobs; `runOfficeReminderQueue` iteriert in Schleife und ruft je Reminder weitere DB-Calls auf. Bei vielen offenen Reminders N+1.
  3. **`TimeService.getProjectAssignmentTimeSummary` in `apps/api/src/time/time.service.ts:115` —
     `for (const workerId of workerIds)` mit `findOpenClockIn` + `findMany(timeEntry)` pro Monteur. Dashboard-relevant, mehrfach pro Minute.
  4. **Client-Polling `NotificationBell` in `apps/web/src/components/crm-app/notifications/NotificationBell.tsx:25`** — `setInterval(loadCount, 60000)` bei jedem angemeldeten Benutzer → lineare DB-Last mit Benutzeranzahl.
  5. **I/O — `storage.service.ts:244` (Buffer.concat statt Stream)** — grosse Dateien (PDFs, Bilder) werden komplett in RAM geladen; vereinzelte Memory-Spikes moeglich, aber kein Dauerbefund.

- Konkrete naechste Schritte (Reihenfolge nach Wirkung):
  1. **TEST-Server Compose-Setup pruefen** — nur `docker-compose.yml` verwenden (ohne `docker-compose.dev.yml`), `NODE_ENV=production` im Prod-Image setzen, Polling-ENV entfernen. Erwartete Ersparnis: grosser Teil der idle-CPU und ~500–700 MiB RAM auf Web.
  2. **Reminder-Cron entschaerfen** — `runOfficeReminderQueue` auf Batch-Dispatch umstellen, `wasOfficeReminderChannelSent` pro Ausfuehrung einmal sammeln statt pro Reminder abfragen. Datei: `apps/api/src/reminders/reminders.service.ts`.
  3. **`getProjectAssignmentTimeSummary`** — eine gesammelte Query `findMany({ workerId: { in: workerIds } })` statt Schleife. Datei: `apps/api/src/time/time.service.ts:140`.
  4. **`NotificationBell`-Polling** — Intervall von 60 s auf 180–300 s anheben, oder ueber Focus-Events drosseln. Datei: `apps/web/src/components/crm-app/notifications/NotificationBell.tsx:25`.
  5. **`documents.service.ts:42` und `reminders.service.ts:144`** — Pagination/Limits ergaenzen.

- Nicht untersucht (Scope):
  - Keine Live-Messung unter Last (nur idle, drei Snapshots lokal).
  - `pg_stat_statements` / Query-Profiling der Produktivdatenbank wurde nicht angefasst.
  - Kein Heap-Dump oder Memory-Profile der Node-Prozesse.
  - Server-Seite (echter TEST-Host) nicht direkt gemessen — Befund basiert auf lokalem Dev-Stack und Code-Analyse.

- Ergebnis / Entscheidung:
  - Analyse liegt vor; Codeaenderungen noch **nicht** umgesetzt (read-only Auftrag).
  - Priorisierte Massnahme ist die Compose-/Umgebungs-Pruefung auf dem TEST-Server, bevor Code-Hotspots angefasst werden.

- Offene Punkte:
  - Verifizieren, welches Compose-File tatsaechlich auf dem TEST-Server laeuft (`docker inspect` auf dem Server).
  - Nach Freigabe einzelne Code-Hotspots als separate Claude-Aufgaben formulieren.

## 2026-04-28

### Umsetzungsstand Bearbeiten + Drucken (Pause wegen Claude-API)

- Ausgangslage:
  - Fuer Kunde/Projekt sollte zentrales Bearbeiten umgesetzt werden.
  - Fuer Kunde/Projekt/Reports/Aufgaben sollte ein konfigurierbarer Druck inkl. PDF-Bundle folgen.
  - Bearbeiten und Drucken sollen ueber Rechteverwaltung steuerbar sein.

- Umsetzung durch Claude (laut Rueckmeldung, Stand vor API-Ausfall):
  - Permission-Fundament umgesetzt:
    - neue Decorators/Guards fuer Permissions (`@Permissions`, `PermissionsGuard`)
    - `JwtAuthGuard` erweitert, laedt User-Permissions aus DB und haengt sie an `request.user`
    - `AuthService` liefert `user.permissions` fuer User-/Kiosk-User-Login
    - `/auth/me` liefert Rollen + Permissions
  - Seed erweitert um neue Druck-Permissions:
    - `customers.print`, `projects.print`, `documents.print`, `reports.print`, `tasks.print`
  - Frontend-Auth-Pipeline erweitert:
    - `AuthState.user.permissions` verfuegbar
    - `hasPermission(...)`-Helper eingefuehrt
    - Sync ueber `/auth/me` nach Auth-Restore
  - Erstes UI-Gating umgesetzt:
    - Bearbeiten-Button Kunde an `customers.edit` gebunden
    - Bearbeiten-Button Projekt an `projects.edit` gebunden

- Pruefung durch Codex:
  - Kein neuer technischer Re-Check in dieser Runde (Status wurde aus Claude-Zwischenstand uebernommen).
  - Vollstaendige Endabnahme fuer Druck-Konfigurator / Bundle / Aufgaben-Druck steht noch aus.

- Ergebnis / Entscheidung:
  - Umsetzung ist **unterbrochen**, weil die Claude-API aktuell stoert.
  - Arbeit wird bewusst pausiert und spaeter fortgesetzt.

- Naechster Wiedereinstieg (Reihenfolge bereits festgelegt):
  1. Druck-Konfigurator + localStorage (Kunde/Projekt/Reports/Aufgaben), inkl. einheitlichem Print-Payload
  2. `POST /print/bundle` (Basis-PDF + Merge von PDF/Bild-Dokumenten, nicht-PDF vorerst ignorieren)
  3. Aufgabenliste + Einzelaufgabe druckbar machen (auf Bundle-Flow)

- Offene Punkte fuer Wiederaufnahme:
  - Re-Check, ob Schritt 1-4 wirklich im Repo-Stand angekommen sind (Diff + kurzer Smoke-Test).
  - Danach direkte Fortsetzung mit dem Druck-Konfigurator.
  - Nach Abschluss: Dev-Docker-Verifikation auf `http://localhost:3800`.

## 2026-05-04

### App-Pruefung Gesamtstand (Codex, read-only Pruefung)

- Ausgangslage:
  - Die App sollte umfassend gegen aktuellen Repo-Stand, lokalen Dev-Docker-Stand und vorhandene Checks geprueft werden.
  - Im Arbeitsbaum lagen bereits laufende, nicht abgeschlossene Aenderungen vor; diese sollten nicht veraendert oder zurueckgesetzt werden.

- Pruefung durch Codex:
  - `pnpm --filter api build`: gruen.
  - `pnpm --filter web build`: gruen.
  - `pnpm --filter api test`: gruen, aber ohne echte Tests (`No tests found`).
  - `pnpm --filter web test`: nur Platzhalter-Hinweis, keine Unit-Tests.
  - `pnpm --filter web lint`: **rot**.
    - `apps/web/src/components/crm-app/print/PrintConfiguratorModal.tsx`: `setState` direkt in `useEffect`.
    - `apps/web/src/components/crm-app/worker/use-worker-photo.ts`: `setState` direkt in `useEffect`.
    - `apps/web/src/components/crm-app.tsx`: Warning wegen fehlender `auth`-Dependency im `useEffect`.
  - `pnpm --filter web test:e2e`: **5/5 rot**.
    - Die Browser-Tests landen auf einer Next-`404` statt auf dem erwarteten Login-Screen.
    - Der API-Login `POST /api/auth/kiosk-login` mit Seed-PIN `1234` liefert im laufenden Dev-Stack `401`.
  - Lokaler Dev-Docker-Stand auf `localhost:3800` / `localhost:3801` laeuft, ist aber nicht gesund genug fuer eine Abnahme:
    - `crm-web`-Logs zeigen wiederholt `Watchpack Error (initial scan): EIO: i/o error` fuer `apps/web/src/app`, Unterordner und `public`.
    - `crm-api` startet, meldet aber beim Bucket-Check: `MinIO bucket check failed ... S3 API Requests must be made to API port.`
  - Auffaelligkeit E2E vs. aktueller Code:
    - `apps/web/src/app/page.tsx` leitet nach `/dashboard` um.
    - Die Komponente `CrmApp` wuerde ohne Auth zwar den Kiosk-Login rendern, der laufende Dev-Web-Stand liefert in der Pruefung aber stattdessen eine Next-404-Seite.
  - Hinweis zur Tooling-Nebenwirkung:
    - `pnpm --filter api lint` lief gruen, verwendet aber `eslint --fix`; wegen des bereits schmutzigen Arbeitsbaums wurde daran nichts weiter veraendert.

- Ergebnis / Entscheidung:
  - Der Code ist aktuell **nicht abnahmefaehig**.
  - Hauptgruende sind:
    - Web-Lint fehlschlaegt.
    - E2E komplett rot.
    - Der laufende Dev-Docker-Web-Stand auf `http://localhost:3800` liefert in der Pruefung keine stabile funktionale Startseite.
    - Seed-/Kiosk-Login-Testvoraussetzungen passen nicht zum aktuell laufenden Stack.

- Priorisierte naechste Schritte:
  1. Dev-Docker-Web-Problem zuerst beheben: Ursache der `Watchpack`-/Volume-Fehler und der Next-404 im laufenden Container klaeren.
  2. Danach Seed-/Dev-DB gegen erwartete Testdaten pruefen, insbesondere Kiosk-PIN `1234` und Admin-Login.
  3. Anschliessend Web-Lint-Fehler in den neuen Print-/Worker-Foto-Komponenten korrigieren.
  4. Erst dann E2E erneut gegen `http://localhost:3800` laufen lassen.

## 2026-05-04

### Nachpruefung nach Claude-Reparatur des Dev-Stands (Codex, read-only Pruefung)

- Ausgangslage:
  - Claude sollte den lokalen Dev-Stand wieder abnahmefaehig machen: `localhost:3800`, Seed-Logins und Web-Lint.

- Pruefung durch Codex:
  - `pnpm --filter api build`: gruen.
  - `pnpm --filter web build`: gruen.
  - `pnpm --filter web lint`: gruen.
  - `http://localhost:3800`: liefert wieder `200`.
  - `POST /api/auth/login` mit `admin@example.local / admin12345`: erfolgreich.
  - `POST /api/auth/kiosk-login` mit PIN `1234`: erfolgreich.
  - `pnpm --filter web test:e2e`: **teilweise gruen** (`3/5` bestanden, `2/5` fehlgeschlagen).
  - Verbleibende E2E-Abweichungen:
    - Monteur-Arbeitsstart:
      - Nach erfolgreicher Erfolgsmeldung `Arbeit gestartet.` bleibt die UI im Zustand `Arbeit beginnen`.
      - API-Status meldet danach weiterhin `hasOpenWork: false`.
      - Ursache eingegrenzt: Seed-Zeitdaten enthalten fuer den Testmonteur bereits `CLOCK_OUT`-Eintraege in der Zukunft derselben Woche; die Open-Work-Erkennung ueber `findOpenClockIn` wird dadurch ausgehebelt.
    - Monteur-Stundenzettel:
      - Im Kiosk-/Monteurfluss erscheint im Stundenzettel-Bereich `Fehlende Berechtigung.`
      - Ursache eingegrenzt: `POST /timesheets/weekly` ist aktuell nur fuer `SUPERADMIN`, `OFFICE`, `PROJECT_MANAGER` freigegeben, nicht fuer `WORKER`.
  - Dev-Docker-Web-Stand:
    - Die frueheren Next-404-/Watchpack-Probleme waren in dieser Nachpruefung nicht mehr reproduzierbar.
  - API-Log Resthinweis:
    - MinIO-Warnung beim Bucket-Check bleibt sichtbar: `S3 API Requests must be made to API port.`

- Ergebnis / Entscheidung:
  - Der Stand ist deutlich verbessert und lokal wieder grundsaetzlich lauffaehig.
  - Eine vollstaendige Abnahme ist aber **noch nicht gru en**, weil zwei zentrale Monteur-E2E-Faelle weiterhin fehlschlagen:
    - Arbeit beginnen/beenden
    - Stundenzettel erzeugen/unterschreiben

- Naechste Schritte:
  1. Seed-/Zeitdaten fuer den Testmonteur bereinigen, damit keine zukuenftigen `CLOCK_OUT`-Eintraege die Open-Work-Erkennung verfälschen.
  2. Fachlich entscheiden und dann umsetzen, ob Monteure Stundenzettel im Kiosk selbst erzeugen duerfen; aktueller E2E-Test erwartet genau dieses Verhalten.
  3. Danach E2E erneut komplett gegen `http://localhost:3800` laufen lassen.

## 2026-05-04

### Nachpruefung Projekt-UX-Vereinfachung (Codex, read-only Pruefung)

- Ausgangslage:
  - Claude hat den Bereich `Projekte` mit Fokus auf einfachere Eingabe, klarere Detailstruktur und ruhigere Priorisierung ueberarbeitet.
  - Geprueft werden sollte, ob die Vereinfachung sichtbar ist, die i18n-Regel eingehalten wurde und keine bestehende Kernfunktion verloren ging.

- Pruefung durch Codex:
  - Geaenderte Hauptstellen gegengeprueft:
    - `apps/web/src/components/crm-app.tsx`
    - `apps/web/src/components/crm-app/projects/ProjectDetailCard.tsx`
    - `apps/web/src/i18n.ts`
  - Bestaetigt:
    - Projektformular nutzt einen schlankeren Basisbereich und lagert Zusatzangaben in einklappbare Sektionen aus.
    - Projektdetail zeigt einen kompakten Header mit gebuendelten Hauptaktionen.
    - Team-/Monteurzuweisung ist als zentraler Arbeitsbereich mit Suche, aktiv/inaktiv-Trennung und klareren Zustandslisten umgesetzt.
    - Auswertung und Preise sind weiterhin vorhanden, aber visuell nachrangiger und einklappbar platziert.
    - Neue sichtbare Texte laufen ueber i18n in `de` und `en`; in den geprueften geaenderten Komponenten waren keine harten sichtbaren Resttexte auffaellig.
  - Technische Checks:
    - `pnpm --filter web lint`: gruen.
    - `pnpm --filter web test:e2e`: gruen (`5/5 passed`).
  - Rueckmeldung zum Dev-Stand:
    - Der von Claude gemeldete Dev-Stack-Nachweis auf `http://localhost:3800` war konsistent mit dem geprueften Repo-Stand; in dieser Codex-Nachpruefung wurden keine Widersprueche sichtbar.

- Ergebnis / Entscheidung:
  - Fuer das Projekt-UX-Paket keine neuen Findings.
  - Die Vereinfachungen verbessern Orientierung und Eingabe, ohne erkennbare fachliche Kernfunktion zu verlieren.
  - Das Paket ist aus Codex-Sicht abnahmefaehig.

- Resthinweis:
  - Die Playwright-Suite deckt den neuen Projekt-Detailfluss nur indirekt ab; ein spaeterer gezielter UI-Smoke-Test fuer Team-Zuweisung und Header-Aktionen waere als Produktsicherung sinnvoll, ist aber kein aktueller Blocker.

## 2026-05-04

### Nachpruefung Kunden-UX-Umbau (Codex, read-only Pruefung)

- Ausgangslage:
  - Claude hat den Kundenbereich erneut und deutlich tiefgreifender ueberarbeitet, mit Fokus auf gefuehrte Neuanlage, klaren Hauptansprechpartner, Standorte als Unterstruktur und modulare Bearbeitung.

- Pruefung durch Codex:
  - Geaenderte Hauptstellen gegengeprueft:
    - `apps/web/src/components/crm-app/customers/CustomerFormBody.tsx`
    - `apps/web/src/components/crm-app/customers/CreateCustomerModal.tsx`
    - `apps/web/src/components/crm-app/customers/EditCustomerModal.tsx`
    - `apps/web/src/components/crm-app/customers/CustomerDetailCard.tsx`
    - `apps/web/src/components/crm-app.tsx`
    - `apps/web/src/i18n.ts`
  - Bestaetigt:
    - Neuanlage ist auf die zentralen Basisdaten reduziert; Standorte und Kontakte blockieren den Einstieg nicht mehr.
    - Bearbeitung ist modular ueber Tabs fuer Stammdaten, Standorte und Ansprechpartner organisiert.
    - Der Hauptansprechpartner ist im Detailkopf klar sichtbar und ueber Quick-Action gezielt pflegbar.
    - Kontakte werden fachlich nachvollziehbar in zentrale und standortbezogene Kontakte getrennt dargestellt.
    - Standorte erscheinen als optionale Unterstruktur des Kunden, nicht mehr als gleichgewichtiger Pflichtblock.
    - Neue sichtbare Texte laufen in den geprueften Bereichen ueber i18n in `de` und `en`.
  - Technische Checks:
    - `pnpm --filter web lint`: gruen.
    - `pnpm --filter web test:e2e`: gruen (`5/5 passed`).

- Ergebnis / Entscheidung:
  - Das Kundenpaket ist deutlich wirksamer als die erste, eher defensive Vereinfachungsrunde.
  - Aus Codex-Sicht keine blockierenden technischen oder i18n-bezogenen Findings.
  - Das Paket ist abnahmefaehig.

- Fachlicher Beobachtungspunkt:
  - Der neue `Hauptkontakt` wird ohne Schema-Aenderung ueber das bestehende Feld `isProjectContact` modelliert. Das ist fuer den aktuellen Stand funktional tragfaehig, sollte spaeter aber beobachtet werden, falls die Fachbedeutung von `Projektkontakt` und `zentraler Hauptansprechpartner` getrennt gebraucht wird.

## 2026-05-04

### Nachpruefung Kunden-Bearbeitung mit Reitern (Codex, read-only Pruefung)

- Ausgangslage:
  - In der Kunden-Bearbeitung sollte das bisher als zu lang empfundene Formular staerker ueber Reiter getrennt werden.
  - Ziel war, dass Ansprechpartner, Standorte, Vereinbarungen/Finanzen und Projekte nicht mehr als ein langer Bearbeitungsfluss erscheinen.

- Pruefung durch Codex:
  - Geaenderte Hauptstellen gegengeprueft:
    - `apps/web/src/components/crm-app/customers/CustomerFormBody.tsx`
    - `apps/web/src/components/crm-app/customers/EditCustomerModal.tsx`
    - `apps/web/src/components/crm-app.tsx`
    - `apps/web/src/i18n.ts`
  - Bestaetigt:
    - Edit-Modal besitzt jetzt fuenf Reiter: Stammdaten, Ansprechpartner, Standorte, Vereinbarungen/Finanzen, Projekte.
    - Pro Reiter wird nur der jeweils aktive Bereich gerendert; das Bearbeiten fuehlt sich dadurch deutlich kuerzer und fokussierter an.
    - Status, Rechnungs-E-Mail und USt-ID liegen jetzt im eigenen Reiter `Vereinbarungen / Finanzen`.
    - Der Projekte-Reiter ist sauber als read-only Schnellzugriff umgesetzt und mischt keine unpassende Inline-Projektbearbeitung in das Kunden-Modal.
    - Quick-Actions aus dem Kundendetail springen in die passenden Reiter.
    - Neue sichtbare Texte laufen in den geprueften Bereichen ueber i18n in `de` und `en`.
  - Technische Checks:
    - `pnpm --filter web lint`: gruen.
    - `pnpm --filter web test:e2e`: gruen (`5/5 passed`).

- Ergebnis / Entscheidung:
  - Fuer dieses Paket keine neuen Findings.
  - Die Kunden-Bearbeitung ist jetzt deutlich besser in fachliche Bereiche getrennt und nicht mehr als ein einziges langes Formular organisiert.
  - Das Paket ist aus Codex-Sicht abnahmefaehig.

## 2026-05-04

### Nachpruefung Wiedervorlagen in Kunde und Projekt (Codex, read-only Pruefung)

- Ausgangslage:
  - Wiedervorlagen sollten fachlich als `FOLLOW_UP` sauberer behandelt, direkt in Kunden- und Projektkontexte eingebettet und in den Listen mit offenen Kennzahlen sichtbar gemacht werden.

- Pruefung durch Codex:
  - Geaenderte Hauptstellen gegengeprueft:
    - `apps/api/src/reminders/reminders.controller.ts`
    - `apps/api/src/reminders/reminders.service.ts`
    - `apps/web/src/components/crm-app/reminders/EmbeddedRemindersSection.tsx`
    - `apps/web/src/components/crm-app/projects/ProjectDetailCard.tsx`
    - `apps/web/src/components/crm-app/customers/CustomerDetailCard.tsx`
    - `apps/web/src/components/crm-app/dashboard/EntityList.tsx`
    - `apps/web/src/components/crm-app.tsx`
  - Technische Checks:
    - `pnpm --filter web lint`: gruen.
    - `pnpm --filter web test:e2e`: gruen (`5/5 passed`).
  - Zusaetzlicher fachlicher Befund:
    - Die Embedded-Sektion legt neue Eintraege korrekt als `FOLLOW_UP` an.
    - Die Lese- und Count-Pfade filtern aktuell aber nur nach `status`, `customerId` und `projectId`, nicht nach `kind=FOLLOW_UP`.
    - Dadurch koennen im Kunden-/Projektkontext auch `TODO`- und `CALLBACK`-Reminder in der Wiedervorlagen-Sektion und in den Kennzahlen auftauchen.

- Ergebnis / Entscheidung:
  - Das Paket ist funktional stark verbessert, aber noch **nicht fachlich ganz sauber gru en**.
  - Offener Punkt:
    - Reminder-Liste und Reminder-Counts muessen fuer diese Wiedervorlagen-Einbettung zusaetzlich auf `FOLLOW_UP` begrenzt werden.

## 2026-05-04

### Korrektur Wiedervorlagen-Filter auf FOLLOW_UP (Codex)

- Ausgangslage:
  - Die eingebetteten Wiedervorlagen und ihre Kennzahlen beruecksichtigten zwar den Kontext (Kunde/Projekt), aber noch nicht den Reminder-Typ.
  - Dadurch konnten `TODO` und `CALLBACK` in Wiedervorlagen-Sektionen und Badges auftauchen.

- Umsetzung durch Codex:
  - `GET /reminders/items` erweitert um optionalen `kind`-Filter.
  - `GET /reminders/counts` erweitert um optionalen `kind`-Filter.
  - Embedded-Wiedervorlagen laden jetzt explizit mit `kind=FOLLOW_UP`.
  - Kunden-/Projekt-Badges laden Counts jetzt explizit mit `status=OPEN&kind=FOLLOW_UP`.

- Pruefung durch Codex:
  - `pnpm --filter web lint`: gruen.
  - `pnpm --filter web test:e2e`: gruen (`5/5 passed`).
  - Codepfade fuer Listen und Counts bestaetigt auf `FOLLOW_UP` begrenzt.

- Ergebnis / Entscheidung:
  - Der fachliche Restpunkt ist geschlossen.
  - Wiedervorlagen in Kunde und Projekt sind jetzt auch in Anzeige und Zaehlung sauber von `TODO` und `CALLBACK` getrennt.
