# CRM STAGING/PROD-Runbook

Stand: 2026-05-06 (Erweitert um STAGING + Drift-Checks)
Zielgruppe: Personen mit Deploy- und Server-Zugriff auf STAGING- und Produktivumgebung.

Dieses Runbook beschreibt den verbindlichen Ablauf fuer Deploys, Drift-Checks,
Smoke-Checks und Rollbacks der CRM-Umgebungen STAGING und PROD. Es ergaenzt
die Go-Live-Checkliste (`abgleich/GO-LIVE-CHECKLISTE-STAGE-PROD.md`) und ist
zusammen mit ihr zu lesen.

> Wichtig: TEST, STAGING und PROD sind technisch klar getrennt. Es gibt keine
> stillen Defaults zwischen diesen Umgebungen. Alle STAGING-/PROD-Pfade
> verlangen explizite Parameter.

## 1. Verbindliche Konventionen

| Aspekt              | TEST                                | STAGING                                       | PROD                                          |
|---------------------|-------------------------------------|-----------------------------------------------|-----------------------------------------------|
| Deploy-Skript       | `abgleich/deploy-test.ps1`          | `abgleich/deploy-staging.ps1`                 | `abgleich/deploy-prod.ps1`                    |
| Rollback-Skript     | (kein dediziertes)                  | `abgleich/rollback-staging.ps1`               | `abgleich/rollback-prod.ps1`                  |
| Server-Default      | `root@crm.vivahome.de`              | **Pflichtparameter** `-Server`                | **Pflichtparameter** `-Server`                |
| Domain-Default      | `crm.vivahome.de` (geblockt fuer S/P) | **Pflichtparameter** `-Domain`              | **Pflichtparameter** `-Domain`                |
| RemoteRepo-Default  | `/opt/crm`                          | **Pflichtparameter** (z. B. `/opt/crm-staging`) | **Pflichtparameter** (z. B. `/opt/crm-prod`) |
| Env-Datei (lokal)   | `.env.server`                       | `.env.staging` (Vorlage `.env.staging.example`) | `.env.prod` (Vorlage `.env.prod.example`)   |
| Compose             | `docker-compose.yml`                | `docker-compose.yml` (kein Dev-Overlay)       | `docker-compose.yml` (kein Dev-Overlay)       |
| Snapshot-Pfad       | n/v                                 | `<RemoteRepo>/backups/<YYYYMMDD_HHMMSS>/`     | `<RemoteRepo>/backups/<YYYYMMDD_HHMMSS>/`     |
| Bestaetigungswort   | `yes` (TEST destruktiv)             | `STAGING` / `OVERWRITE STAGING DATA`          | `PROD` / `OVERWRITE PROD DATA`                |
| Rollback-Wort       | n/v                                 | `ROLLBACK STAGING`                            | `ROLLBACK PROD`                               |

Sicherheits-Reservierungen (hart in den Skripten verdrahtet):

- STAGING-Skripte lehnen Domain `crm.vivahome.de` und Repo-Pfad `/opt/crm` ab (TEST).
- STAGING-Skripte lehnen Pfade ab, die `prod` oder `-prod` enthalten.
- PROD-Skripte lehnen Domain `crm.vivahome.de` und Repo-Pfade `/opt/crm`, `/opt/crm-staging` ab.
- PROD-Skripte lehnen Pfade/Domains ab, die `staging` oder `-staging` enthalten.
- `.env.staging` und `.env.prod` sind gitignored. Secrets gehoeren NICHT ins Repository.

## 2. Pre-Deploy-Checks (Pflicht)

Vor jedem STAGING- oder PROD-Deploy folgende Punkte verifizieren:

1. Lokale Quality Gates gruen:
   ```pwsh
   pnpm lint
   pnpm test
   pnpm build
   ```
2. Lokaler Branch sauber, auf `main`, mit gepushten Commits.
3. Passende `.env`-Datei existiert lokal und enthaelt **die richtigen** Secrets:
   - `DATABASE_URL` enthaelt das aktuell aktive Postgres-Volume-Passwort.
   - `JWT_SECRET` unterscheidet sich nachweislich zwischen TEST/STAGING/PROD.
   - `MINIO_ROOT_PASSWORD`, `SMTP_*` korrekt fuer das Ziel.
4. SSH-Zugriff auf `-Server` getestet (`ssh <server> 'echo ok'`).
5. Domain `-Domain` aufloest und auf den richtigen Server zeigt.
6. Wartungsfenster mit Stakeholdern abgestimmt.

### 2.1 Drift-Vorabcheck (eingebaut in deploy-staging.ps1 und deploy-prod.ps1)

Beide Deploy-Skripte fuehren VOR dem Code-/Migration-Schritt einen lokalen
ENV-Drift-Vorabcheck aus:

- Liest die aktuelle `.env` vom Zielserver.
- Vergleicht sie mit der lokalen `.env.staging` bzw. `.env.prod`.
- Geprueft werden u. a.: `DATABASE_URL`, `POSTGRES_PASSWORD`, `JWT_SECRET`,
  `NEXT_PUBLIC_API_URL`, `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ROOT_USER`,
  `MINIO_ROOT_PASSWORD`, `STORAGE_LOCAL_FALLBACK`, `SMTP_HOST`, `SMTP_FROM`.
- **Kritische Drifts** (`POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`,
  `MINIO_ROOT_USER`) erfordern getippte Bestaetigung
  `STAGING DRIFT OK` bzw. `PROD DRIFT OK`.
- **Fehlende lokale Schluessel**, die auf dem Server gesetzt waren, brechen den
  Deploy hart ab. Ohne Diff im Repo gibt es keinen versteckten Server-Wert.
- Schalter `-SkipDriftCheck` deaktiviert den Vorabcheck (nur Erst-Inbetriebnahme).

Zusaetzlich faehrt das Remote-Skript serverseitig den Credential-Precheck per
`psql ... select 1`. Schlaegt der fehl, wird **keine** Migration und **kein**
Rebuild ausgefuehrt -> die Umgebung bleibt im alten Stand.

### 2.2 Standalone-Drift-Check fuer ad-hoc-Pruefungen

```pwsh
# Nur lokal (Env-File-Plausibilitaet ohne Server-Zugriff):
pwsh abgleich/preflight-drift.ps1 -EnvLabel staging

# Mit Server (ENV-Drift, Git-Drift):
pwsh abgleich/preflight-drift.ps1 `
  -EnvLabel staging `
  -Server 'root@staging.example.de' `
  -RemoteRepo '/opt/crm-staging' `
  -CheckServer

# Plus DB-Probe und HTTPS-Smoke:
pwsh abgleich/preflight-drift.ps1 `
  -EnvLabel prod `
  -Server 'root@prod.example.de' `
  -RemoteRepo '/opt/crm-prod' `
  -Domain 'crm.example.de' `
  -CheckServer -CheckCredential -CheckSmoke
```

Exit-Codes:
- `0` = alles in Ordnung
- `1` = Aufruffehler
- `2` = Drift erkannt
- `3` = Server nicht erreichbar / Vorbedingungen fehlen

## 3. STAGING-Standardablauf

Sicherer Standardpfad fuer STAGING:

```pwsh
pwsh abgleich/deploy-staging.ps1 `
  -Server     'root@staging.example.de' `
  -Domain     'crm-staging.example.de' `
  -RemoteRepo '/opt/crm-staging' `
  -EnvFile    '.env.staging' `
  -Mode       'app' `
  -Branch     'main'
```

Was das Skript macht:

1. Banner + getippte Bestaetigung `STAGING`.
2. Hard-Block gegen TEST-Domain/Pfad und PROD-Pfade.
3. Lokale Vorbedingungen pruefen (Branch, Working Tree, Env-Datei).
4. **ENV-Drift-Vorabcheck** (lokal vs Server).
5. `git push origin main`.
6. Auf dem Server:
   - Pre-Deploy-Snapshot anlegen (`backups/<stamp>/commit.txt`, `db.sql`, `storage.tar.gz`).
   - Code per `git fetch && git reset --hard origin/main`.
   - **Credential-Precheck** per `psql select 1`.
   - `npx prisma migrate deploy`.
   - `docker compose up -d --build`.
7. Lokal: HTTPS-Smoke-Check gegen `https://<Domain>/api`.

## 4. STAGING -> PROD Freigabecheck

Vor dem ersten PROD-Deploy (und vor jedem groesseren Release) wird die
Konsistenz von STAGING zu PROD nachgewiesen:

```pwsh
pwsh abgleich/staging-to-prod-readiness.ps1 `
  -StagingServer     'root@staging.example.de' `
  -StagingRemoteRepo '/opt/crm-staging' `
  -StagingDomain     'crm-staging.example.de' `
  -ProdServer        'root@prod.example.de' `
  -ProdRemoteRepo    '/opt/crm-prod' `
  -ProdDomain        'crm.example.de'
```

Das Skript ist **nicht-destruktiv** und prueft:

| Pruefpunkt                                            | Hart? |
|-------------------------------------------------------|-------|
| SSH zu STAGING erreichbar                             | hart  |
| STAGING-Repo existiert + git rev-parse ok             | hart  |
| Git-Drift STAGING vs lokales `main`                   | weich |
| STAGING-Container `web/api/postgres/minio` running    | hart  |
| HTTPS-Smoke STAGING `/`, `/api`                       | hart (wenn Domain) |
| SSH zu PROD erreichbar                                | hart (wenn Server) |
| PROD-`backups/`-Verzeichnis beschreibbar              | hart (wenn Server+Repo) |
| HTTPS-Smoke PROD (Vor-Deploy-Stand)                   | weich |
| ENV-Schluesselmenge `.env.staging` == `.env.prod`     | weich |
| Sicherheits-Secrets unterschiedlich (JWT, MinIO, ...)  | hart  |
| `DATABASE_URL` STAGING != PROD                        | hart  |

Exit-Codes:
- `0` = **Go**, PROD-Deploy darf gestartet werden.
- `2` = **No-Go**, mindestens ein hartes Kriterium ist verletzt.
- `3` = Aufruf-/Eingabefehler.

**Pflicht:** Vor Punkt 5 (PROD-Deploy) ist Exit-Code `0` schriftlich
festzuhalten (z. B. im Wartungsfenster-Ticket / `workstatus.md`).

## 5. PROD-Standardablauf (Mode `app`)

Erst **nachdem** Abschnitt 4 mit Exit `0` durchgelaufen ist:

```pwsh
pwsh abgleich/deploy-prod.ps1 `
  -Server     'root@prod.example.de' `
  -Domain     'crm.example.de' `
  -RemoteRepo '/opt/crm-prod' `
  -EnvFile    '.env.prod' `
  -Mode       'app' `
  -Branch     'main'
```

Ablauf identisch zum STAGING-Ablauf (Punkt 3), aber mit Bestaetigungswort
`PROD` und Hard-Block gegen TEST- und STAGING-Pfade.

## 6. Migrate-Only Deploy (STAGING + PROD)

Sonderfall: Code ist bereits auf dem Server, aber Schema muss nachgezogen werden.

```pwsh
pwsh abgleich/deploy-staging.ps1 -Server '...' -Domain '...' -RemoteRepo '...' -Mode 'migrate-only'
pwsh abgleich/deploy-prod.ps1    -Server '...' -Domain '...' -RemoteRepo '...' -Mode 'migrate-only'
```

Vorteil: kein Container-Rebuild. Nuetzlich fuer eingeschobene Hotfix-Migrationen.

## 7. FULL-Deploy (DESTRUKTIV)

Nur fuer kontrolliertes Re-Bootstrapping (z. B. erste Inbetriebnahme oder
forcierte Daten-Synchronisation aus lokalem Stand).

```pwsh
pwsh abgleich/deploy-staging.ps1 -Server '...' -Domain '...' -RemoteRepo '...' -Mode 'full'
pwsh abgleich/deploy-prod.ps1    -Server '...' -Domain '...' -RemoteRepo '...' -Mode 'full'
```

Sicherheits-Doppelbestaetigung:

- STAGING: `STAGING` + `OVERWRITE STAGING DATA`
- PROD:    `PROD`    + `OVERWRITE PROD DATA`

Effekte: Ziel-DB und Ziel-Storage werden mit dem lokalen Stand ueberschrieben.
Pre-Deploy-Snapshot wird **vorher** angelegt -> Rollback per `rollback-*.ps1
-Mode full -Stamp <stamp>` moeglich.

## 8. Post-Deploy Smoke-Test (manuell)

Nach jedem Deploy zusaetzlich zum automatischen Smoke-Check:

- [ ] `https://<Domain>/` laedt das Web-UI (HTTP 200/30x).
- [ ] `https://<Domain>/api` antwortet (HTTP 200).
- [ ] Login als regulaerer User funktioniert.
- [ ] Kiosk/PIN-Login funktioniert.
- [ ] Projektdetails oeffnen.
- [ ] Dokument hochladen / anzeigen.
- [ ] Zeiterfassung Start / Stop.
- [ ] Logs unauffaellig:
      `ssh <Server> 'cd <RemoteRepo> && docker compose logs --tail=200 api web'`

## 9. Monitoring / Logs

- Container-Status:
  ```bash
  ssh <Server> 'cd <RemoteRepo> && docker compose ps'
  ```
- API-Fehler-Trace (kurz):
  ```bash
  ssh <Server> 'cd <RemoteRepo> && docker compose logs --since=10m api'
  ```
- Postgres-Health:
  ```bash
  ssh <Server> 'docker exec crm-postgres pg_isready -U postgres -d crm_monteur'
  ```
- Backup-Verzeichnis:
  ```bash
  ssh <Server> 'ls -lt <RemoteRepo>/backups | head'
  ```

## 10. Rollback-Pfad (STAGING + PROD)

Pre-Deploy-Snapshots liegen auf dem jeweiligen Server unter
`<RemoteRepo>/backups/<stamp>/` mit:

- `commit.txt`     – Git-Commit vor dem Deploy
- `db.sql`         – pg_dump der Ziel-DB vor dem Deploy
- `storage.tar.gz` – Tar des Storage-Verzeichnisses vor dem Deploy

Symlink `backups/last` zeigt immer auf den juengsten Snapshot.

### 10.1 Entscheidungskriterien

| Symptom                                              | Empfohlener Modus  | Hinweis                                |
|------------------------------------------------------|--------------------|-----------------------------------------|
| App-Bug nach Deploy, DB unveraendert                 | `code`             | verlustfrei, keine Datenaenderung      |
| Migration kaputt / falsche Daten, Code laeuft        | `db`               | Schreibzugriffe seit Snapshot verloren |
| Storage-Korruption, DB ok                            | `storage`          | hochgeladene Dateien seit Snapshot weg |
| Komplett-Wiederherstellung nach FULL-Fehlschlag      | `full`             | nur, wenn Daten ohnehin verworfen      |

Faustregel:

- App-Pfad zuerst probieren (`code`).
- DB-Restore nur, wenn Datenmodell selbst inkonsistent geworden ist.
- Storage-Restore nur bei Storage-Schaden.
- `full` ist letzter Ausweg.

### 10.2 Beispielaufrufe STAGING

```pwsh
# Code-Rollback auf juengsten Snapshot.
pwsh abgleich/rollback-staging.ps1 `
  -Server     'root@staging.example.de' `
  -RemoteRepo '/opt/crm-staging' `
  -Mode       'code'

# DB-Rollback auf bestimmten Snapshot.
pwsh abgleich/rollback-staging.ps1 `
  -Server     'root@staging.example.de' `
  -RemoteRepo '/opt/crm-staging' `
  -Stamp      '20260506_181500' `
  -Mode       'db'
```

Bestaetigungswort: `ROLLBACK STAGING`.

### 10.3 Beispielaufrufe PROD

```pwsh
# Code-Rollback auf juengsten Snapshot.
pwsh abgleich/rollback-prod.ps1 `
  -Server     'root@prod.example.de' `
  -RemoteRepo '/opt/crm-prod' `
  -Mode       'code'

# Vollrollback nach kaputtem FULL-Deploy.
pwsh abgleich/rollback-prod.ps1 `
  -Server     'root@prod.example.de' `
  -RemoteRepo '/opt/crm-prod' `
  -Mode       'full'
```

Bestaetigungswort: `ROLLBACK PROD`.

### 10.4 Wichtig nach DB-Rollback

- Migrationsdateien im Repo koennen jetzt **vor** dem DB-Stand liegen
  (Ziel wurde zurueckgespult). Naechster Deploy muss bewusst entschieden werden:
  - Wieder hochmigrieren (per `migrate-only`-Deploy), oder
  - Im Code die problematische Migration revertieren und sauber neu deployen.

## 11. Eskalation / Notfall

- Break-Glass-Admin-Pfad: siehe `abgleich/EMERGENCY-ADMIN-RUNBOOK.md`.
  Aktivierung nur in echten Notfaellen, niemals in eingecheckten `.env`-Dateien.
- Bei Verdacht auf Kompromittierung: Container stoppen, Netz isolieren,
  Forensik vor Bereinigung. Siehe `abgleich/SERVER-DIAGNOSE.md` (DB-Container).
- Logs sichern, bevor Container neu gebaut werden.

## 12. Go/No-Go Kriterien fuer PROD-Switch

Go fuer PROD-Switch nur wenn ALLE Punkte erfuellt sind:

- [ ] Stage-Freigabe (Punkte 1–5 der Go-Live-Checkliste) gruen.
- [ ] STAGING-Server live + Stand entspricht dem nach PROD geplanten Code.
- [ ] `staging-to-prod-readiness.ps1` Exit-Code `0`, dokumentiert in `workstatus.md`.
- [ ] PROD-Server erreichbar, SSH ok.
- [ ] `.env.prod` existiert lokal mit echten PROD-Secrets, alle `CHANGE_ME`-Platzhalter ersetzt.
- [ ] PROD-Domain zeigt auf PROD-Host.
- [ ] Pre-Deploy-Backup-Pfad (`<RemoteRepo>/backups/`) ist beschreibbar.
- [ ] Wartungsfenster kommuniziert.
- [ ] Rollback-Pfad in diesem Runbook gelesen.
- [ ] Verantwortliche/Erreichbarkeiten fuer das Wartungsfenster geklaert.

No-Go bei einem der folgenden Befunde:

- Credential-Precheck schlaegt schon im Probelauf fehl.
- ENV-Drift-Vorabcheck zeigt unerklaerte kritische Differenzen.
- Snapshot-Verzeichnis nicht beschreibbar / kein Plattenplatz.
- Kein verbindlicher Rollback-Plan kommuniziert.
- Offene P1-Tickets im Funktionsumfang des Deploys.
- `staging-to-prod-readiness.ps1` Exit ungleich `0`.
