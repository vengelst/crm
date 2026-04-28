# Auftrag: App-Prüfung mit Fokus Ressourcenverbrauch (Server)

## Ziel

Die CRM-Anwendung soll **systematisch geprüft** werden, weil auf dem **Produktiv-/TEST-Server** auffällig **viel CPU, RAM oder I/O** verbraucht wird. Ziel ist ein **nachvollziehbarer Befund** (Ursachen, Verdachtsliste, priorisierte Maßnahmen) — **ohne** Produktivdaten zu gefährden und **ohne** ungefragte große Refactors.

## Rahmenbedingungen

- **Codex** darf laut Projektregeln keinen Produktivcode ändern; **diese Prüfung** ist eine Aufgabe für **Claude** (Analyse + ggf. kleine, abgesprochene Fixes) oder für **Codex nur Review/Dokumentation**.
- Nach größeren Umsetzungen: `workstatus.md` um **Ergebnis der Prüfung** ergänzen (Befund, offene Punkte).
- **Dev-Verifikation** nach Codeänderungen: lokaler Dev-Docker unter **http://localhost:3800** wie in `AGENTS.md`.

## Technischer Kontext (kurz)

- Monorepo: **Next.js (Web)**, **NestJS (API)**, **Prisma/PostgreSQL**, **MinIO**, **Docker Compose**.
- Öffentlicher Zugriff oft über **Nginx** → API/Web in Containern.

## 1. Messung und Einordnung (Server, read-only bevorzugt)

Ohne Änderungen am Code zuerst **Fakten** sammeln:

- **Container-Ressourcen:** `docker stats` (oder gleichwertig) über **1–5 Minuten** während normaler Nutzung und einmal während **Planung/Kalender** bzw. typischer Büroflows.
- **Welcher Dienst dominiert:** `crm-web`, `crm-api`, `crm-postgres`, `minio` — Anteil CPU/RAM notieren.
- **API-Prozesse:** einmal **Anzahl Worker/Threads** (Nest/Node) und ob **mehrere** API-Container laufen.
- **Logs:** kurz prüfen, ob **Fehler-Spam** oder **Retry-Schleifen** (Logs wachsen unkontrolliert → I/O).

Ergebnis: **1 Absatz „Ist-Zustand“** mit Zahlen/Beobachtungen.

## 2. Code- und Architektur-Prüfung (Repo)

### API (NestJS)

- **Schedules / Cron / Intervalle:** `@nestjs/schedule`, `setInterval`, wiederholte Jobs — zu häufige DB- oder MinIO-Zugriffe?
- **Prisma:** N+1-Queries, fehlende `select`, große `findMany` ohne Limit, Transaktionen die lange offen bleiben.
- **WebSockets / SSE / Long-Polling** (falls vorhanden): Verbindungen sauber geschlossen?
- **Speicher:** große In-Memory-Caches, unbounded Arrays, PDF/Bilder komplett im RAM statt Stream.

### Web (Next.js)

- **Build/Bundle:** unnötig große Client-Bundles, schwere Dependencies im Client.
- **Daten-Fetching:** gleiche Daten in kurzem Abstand mehrfach laden, fehlende Memoization nur wo messbar relevant.
- **Planung/Kalender:** viele DOM-Updates, Drag-Events, Re-Renders — Profiling-Hinweis (React DevTools Profiler) nur als Empfehlung, nicht Pflicht.

### Docker / Runtime

- **Node `NODE_OPTIONS`:** z. B. `--max-old-space-size` nur dokumentieren, nicht willkürlich in Prod ändern ohne Abstimmung.
- **Postgres:** Connection-Pool-Größe vs. API-Instanzen; langsame Queries (`pg_stat_statements` nur wenn betrieblich erlaubt).

## 3. Abgrenzung „Ressourcen vs. Normal“

- Kurz klären: **Erwarteter** Verbrauch bei **leerem** System vs. bei **X aktiven Nutzern**.
- Prüfen, ob hoher Verbrauch **nur unter Last** oder **idle** auftritt (idle → eher Leak, Cron, oder falsche Schleife).

## 4. Deliverable (Pflicht)

Schriftliches Ergebnis mit:

1. **Beobachtung** (was wurde gemessen, welcher Container).
2. **Hypothesen** (max. 5, nach Wahrscheinlichkeit sortiert).
3. **Konkrete nächste Schritte** (z. B. „Query X begrenzen“, „Log-Level“, „ein Endpoint profilen“) — **mit Datei-/Modulbezug** wo möglich.
4. **Was bewusst nicht** untersucht wurde (Zeit/Scope).

Optional: **kleine, risikoarme** Optimierungen nur umsetzen, wenn sie eindeutig aus der Analyse folgen und **i18n/Projektregeln** eingehalten werden.

## 5. Nicht im Scope (ohne separate Freigabe)

- Produktionsdatenbank löschen oder Migrationen auf Live ohne Deploy-Prozess.
- Große Umbauten ohne vorherige Abstimmung mit dem Auftraggeber.

---

**Kurzfassung für den Chat an Claude:**  
„Bitte laut `abgleich/CLAUDE-APP-PRUEFUNG.md` die App prüfen; Schwerpunkt hoher Ressourcenverbrauch auf dem Server. Zuerst Messungen/Docker/Logs, dann gezielt API- und Web-Code. Ergebnis als strukturierter Report, bei Code-Fixes nur minimal und mit Dev-Docker-Check.“
