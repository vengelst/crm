# Go-Live Checkliste (Stage -> Produktion)

Stand: 2026-05-06 (erweitert um STAGING + Drift-Checks)
Projekt: CRM

## Ziel

Diese Checkliste trennt klar zwischen:
- **Codex** = Analyse, Verifikation, Review, Dokumentation
- **Claude** = technische Umsetzung / Skript- und Infrastruktur-Anpassungen

Drei Umgebungen sind technisch klar getrennt:
- **TEST**    – Continuous-Test-Server (`crm.vivahome.de`).
- **STAGING** – Pre-Production-Server (eigene Domain, eigenes Repo, eigene DB).
- **PROD**    – Produktion (eigene Domain, eigenes Repo, eigene DB).

## A. Stage-Freigabe (muss vollstaendig gruen sein)

1. **Git-Stand synchron**
   - Verantwortlich: **Codex**
   - Prüfen: Branch, Commit, `origin/main`, TEST-/STAGING-Server-Commit identisch
   - Status heute: **erfuellt fuer TEST**, STAGING noch nicht aufgesetzt

2. **DB-Migrationsstand synchron**
   - Verantwortlich: **Codex**
   - Prüfen: `npx prisma migrate status --config prisma/prisma.config.ts` auf TEST/STAGING
   - Status heute: **erfuellt** auf TEST (`Database schema is up to date`)

3. **Runtime Healthcheck**
   - Verantwortlich: **Codex**
   - Prüfen: `web` + `api` Container laufen, HTTP-Status ok (`/` 30x, `/api` 200)
   - Status heute: **erfuellt** auf TEST

4. **Qualitaets-Gates lokal**
   - Verantwortlich: **Codex**
   - Prüfen: `pnpm lint`, `pnpm test`, `pnpm build`
   - Status heute: **erfuellt**

5. **Manueller Smoke-Test auf TEST**
   - Verantwortlich: **Codex**
   - Mindestens:
     - Login (User)
     - Kiosk/PIN-Login (Monteur)
     - Projektdetails öffnen
     - Dokument hochladen/anzeigen
     - Zeiterfassung Start/Stop
   - Status heute: **offen** (manueller Durchlauf noch zu protokollieren)

## B. Produktions-Readiness (vor erstem Prod-Switch)

6. **Produktions-Deploypfad definieren**
   - Verantwortlich: **Claude**
   - Aufgabe:
     - dedizierten `prod`-Target im Deploy-Workflow ergänzen
     - saubere Trennung TEST vs STAGING vs PROD (Server, Domain, Env-Datei, Compose)
   - Status: **erfuellt**
     - `abgleich/deploy-prod.ps1` (PROD), `abgleich/deploy-staging.ps1` (STAGING)
     - Hard-Block gegen jeweils andere Umgebungen (Domain/Pfad-Reservierungen)
     - `abgleich/deploy.ps1` reicht `staging`/`prod` durch, ohne stille Defaults

7. **Prod-Secrets und DB-Credentials absichern**
   - Verantwortlich: **Claude**
   - Aufgabe:
     - `DATABASE_URL`, JWT, SMTP, MinIO für STAGING + PROD separat halten
     - sicherstellen, dass Passwort in ENV und DB-Rolle konsistent ist
   - Status: **erfuellt** (technisch)
     - `.env.staging.example` + `.env.prod.example` als Vorlagen, jeweils gitignored
     - **Lokaler ENV-Drift-Vorabcheck** in `deploy-staging.ps1` und `deploy-prod.ps1`
       (vergleicht lokale `.env.*` gegen aktuelle Server-`.env`, kritische Drifts
       erfordern getippte Bestaetigung)
     - Server-seitiger **Credential-Precheck** (`psql select 1`) blockt Migration
       bei Drift, fail-fast mit konkreten Fix-Optionen
     - Nicht erfuellt: echte PROD-Secrets sind noch nicht gefuellt; Inhalte muessen
       durch Betrieb gepflegt werden

8. **Rollback-Pfad dokumentieren und testen**
   - Verantwortlich: **Claude** (Umsetzung), **Codex** (Verifikation)
   - Aufgabe:
     - klarer Ablauf für Rollback (Code + DB + Storage) dokumentiert
     - mindestens 1 verifizierter Restore-Test
   - Status: **technisch erfuellt, Verifikation offen**
     - `abgleich/rollback-prod.ps1` (PROD) + `abgleich/rollback-staging.ps1` (STAGING)
     - Modi: `code|db|storage|full`, Bestaetigungsworte je Umgebung getrennt
     - Snapshot-Anlage in beiden Deploy-Skripten automatisch
     - Live-Restore-Test gegen echte STAGING-/PROD-Umgebung steht aus

9. **Prod-Runbook freigeben**
   - Verantwortlich: **Claude** (Erstellung), **Codex** (Review)
   - Inhalt:
     - Schrittfolge Deploy (TEST/STAGING/PROD)
     - STAGING -> PROD Freigabecheck (`staging-to-prod-readiness.ps1`)
     - Drift-Checks (eingebaut + standalone)
     - Smoke-Test nach Deploy
     - Monitoring/Alarm-Checks
     - Rollback-Entscheidungsmatrix
     - Notfallkontakte / Eskalation
     - Go/No-Go Kriterien
   - Status: **erfuellt** (`abgleich/PROD-RUNBOOK.md`)

10. **Go/No-Go Entscheidung**
    - Verantwortlich: **gemeinsam**
    - Bedingung:
      - Punkte 1-9 gruen oder bewusst per Risiko-Freigabe akzeptiert
      - `staging-to-prod-readiness.ps1` Exit `0` dokumentiert
    - Status: **offen** (haengt an Aufsetzen der STAGING-Umgebung und Live-Tests)

## C. Drift-Pruefungen (Pflicht vor jedem STAGING/PROD-Deploy)

Diese Checks laufen automatisch in den Deploy-Skripten. Manuell sollten sie
zusaetzlich VOR groesseren Releases gefahren werden:

- [ ] `pwsh abgleich/preflight-drift.ps1 -EnvLabel staging -Server <s> -RemoteRepo <r> -CheckServer -CheckCredential` -> Exit 0
- [ ] `pwsh abgleich/preflight-drift.ps1 -EnvLabel prod -Server <s> -RemoteRepo <r> -CheckServer -CheckCredential` -> Exit 0
- [ ] `pwsh abgleich/staging-to-prod-readiness.ps1 -StagingServer <s> -StagingRemoteRepo <r> -StagingDomain <d> -ProdServer <s> -ProdRemoteRepo <r> -ProdDomain <d>` -> Exit 0

## Kurzfazit aktuell

- **Stage-faehig (TEST):** Ja (technische Gates gruen).
- **STAGING-Umgebung:** Skripte und Dokumentation erfuellt, Aufsetzen der
  Server-Seite (Domain, SSH, `.env.staging`) noch durch Betrieb erforderlich.
- **Produktion sofort:** Nein. Bedingung sind Punkt 5 (Smoke-Test TEST),
  ein lauffaehiges STAGING und ein durchlaufener `staging-to-prod-readiness`
  mit Exit 0.
