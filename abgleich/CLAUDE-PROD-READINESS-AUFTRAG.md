# Auftrag an Claude: Produktions-Readiness umsetzen

Stand: 2026-05-06  
Bezug: `abgleich/GO-LIVE-CHECKLISTE-STAGE-PROD.md` (Punkte 6-9)

## Ziel

Die offenen Produktionspunkte aus der Go-Live-Checkliste technisch umsetzen, so dass ein kontrollierter Wechsel von TEST nach PROD moeglich ist.

## Rollen

- **Claude:** Umsetzung (Skripte, Deploypfad, Runbook, Betriebsdoku)
- **Codex:** Verifikation, Review, Dokumentation (`workstatus.md`)

## Konkrete Umsetzungsaufgaben fuer Claude

### 1) Prod-Deploypfad sauber einfuehren

- `abgleich/deploy.ps1` und ggf. `abgleich/crm-deploy.ps1` so erweitern, dass es einen klaren `prod`-Pfad gibt.
- Trennung TEST/PROD muss eindeutig sein:
  - Server-Host
  - Domain
  - Zielpfad auf Server
  - verwendete Env-Datei
  - Compose-Aufruf
- Keine stillen Defaults auf TEST, wenn explizit PROD gewaehlt wurde.
- Bei destruktiven Schritten (Restore/Volume-Reset) explizite Sicherheitsabfrage erzwingen.

### 2) Prod-Secrets/Credentials-Flow absichern

- Definieren, welche Datei/Quelle fuer PROD-Secrets verbindlich ist (ohne Secrets ins Repo zu schreiben).
- Sicherstellen, dass die Deploy-Logik konsistent mit `DATABASE_URL` arbeitet.
- Vor Migrationsschritt einen klaren Credential-Check einbauen:
  - Fast fail mit konkreter Fehlermeldung
  - Hinweis auf Passwort-Drift zwischen DB-Role und ENV

### 3) Rollback-Pfad implementieren und dokumentieren

- Reproduzierbaren Rollback-Ablauf bereitstellen (Code + DB + Storage, je nach Modus).
- Mindestens einen testbaren Restore-Weg im Skriptfluss abbilden (oder dediziertes Skript).
- Rollback-Entscheidungskriterien dokumentieren:
  - Wann nur App-Rollback
  - Wann DB/Storage-Restore noetig

### 4) Prod-Runbook erstellen

- Neue Datei unter `abgleich/` anlegen (z. B. `PROD-RUNBOOK.md`) mit:
  - Pre-Deploy-Checks
  - Deploy-Schritte
  - Post-Deploy-Smoke-Checks
  - Monitoring/Logs
  - Rollback-Schritte
  - Eskalations-/Notfallhinweise

## Akzeptanzkriterien (Definition of Done)

- [ ] Es existiert ein eindeutiger `prod`-Deploypfad in den Skripten.
- [ ] TEST und PROD sind in Parametern und Ausfuehrung klar getrennt.
- [ ] Credential-Precheck vor Migration ist implementiert.
- [ ] Rollback-Ablauf ist dokumentiert und technisch nachvollziehbar.
- [ ] Ein PROD-Runbook liegt unter `abgleich/` vor.
- [ ] `pnpm lint`, `pnpm test`, `pnpm build` sind nach den Aenderungen gruen.
- [ ] `workstatus.md` wurde um die Umsetzungsergebnisse ergaenzt.

## Nicht im Scope

- Ungeplante fachliche Feature-Aenderungen.
- Unabgesprochene destruktive Eingriffe in produktive Daten.

---

## Kurzprompt fuer Claude

"Bitte setze `abgleich/CLAUDE-PROD-READINESS-AUFTRAG.md` um: Prod-Deploypfad einfuehren, Secrets/Credential-Precheck absichern, Rollback-Pfad dokumentieren/abbilden und ein PROD-Runbook erstellen. Anschliessend `pnpm lint`, `pnpm test`, `pnpm build` ausfuehren und `workstatus.md` aktualisieren."
