# Notfall-Admin (Break-Glass) — Betriebs-Runbook

Kurzes Operations-Runbook fuer den ENV-basierten Notfallzugang (`type=emergency-admin`).
Pflichtlektuere fuer alle, die den Zugang aktivieren oder nutzen.

> **Break-Glass ist kein regulaerer Betriebszugang.** Der Login umgeht die
> Datenbank-Authentifizierung und kommt mit Wildcard-Permissions. Er existiert
> ausschliesslich, um die App im Storungsfall wieder erreichbar zu machen.

---

## 1. Zweck

- Zugriff auf die App auch dann, wenn die normale Anmeldung nicht moeglich ist
  (z. B. DB-Ausfall, korruptes User-Tabellen-Schema, gesperrter Admin).
- Der Endpoint `POST /api/auth/emergency-login` arbeitet **ohne Datenbank-
  Lookup** und liefert ein kurzlebiges JWT mit `roles=[SUPERADMIN]` und
  `permissions=["*"]`.
- Im UI erscheint waehrend einer Notfallsitzung ein gut sichtbarer
  bernsteinfarbener Banner „Notfallmodus aktiv".

---

## 2. Voraussetzungen

- Server-Zugriff auf den Host, auf dem der CRM-Stack laeuft (typischerweise
  `/opt/crm`).
- Schreibrecht auf der Server-`.env` (oder dem Ablageort der ENV-Variablen).
- Recht zum Neustart des `crm-api`-Containers (`docker compose ... up -d --force-recreate api`).
- Zugriff auf die Container-Logs (`docker compose logs api` oder Loki/Promtail).
- Telefonisches/Chat-Quorum fuer das Vier-Augen-Prinzip (siehe Abschnitt 4).

---

## 3. Aktivierungsschritte

### 3.1 ENV-Variablen setzen

In der Server-`.env` (gleicher Ort, in dem `DATABASE_URL`, `JWT_SECRET` etc.
stehen) ergaenzen oder aendern:

```env
EMERGENCY_ADMIN_ENABLED=true
EMERGENCY_ADMIN_USER=<temporaerer-benutzername>
EMERGENCY_ADMIN_PASS=<starkes-zufalls-passwort>

# Optional, empfohlen:
EMERGENCY_ADMIN_TTL_MINUTES=15            # 5..60, Default 20
EMERGENCY_ADMIN_ALLOWED_IPS=10.0.0.5,10.0.0.6   # CSV; leer = jede Quell-IP
EMERGENCY_ADMIN_REQUIRE_HEADER=X-Break-Glass=<shared-secret>
```

Hinweise:

- `EMERGENCY_ADMIN_USER`/`EMERGENCY_ADMIN_PASS` **niemals** ins Repository
  einchecken. Auch nicht in `.env.example` oder `docker-compose.yml`.
- Passwort frisch generieren (z. B. `openssl rand -base64 24`), nicht aus
  Passwortmanager-Defaults oder altem Material recyceln.
- IP-Allowlist auf VPN/Office-Range setzen, wenn moeglich.

### 3.2 Container neu laden

```bash
cd /opt/crm   # oder Deploy-Verzeichnis
docker compose -f docker-compose.yml up -d --force-recreate api
```

Logs auf erfolgreichen Start pruefen:

```bash
docker compose -f docker-compose.yml logs --tail=50 api
# erwartet: "Mapped {/api/auth/emergency-login, POST}"
# erwartet: "Nest application successfully started"
```

### 3.3 Verifikation

Feature-Flag (oeffentlicher Endpoint, sollte jetzt `enabled: true` melden):

```bash
curl -sS https://<host>/api/auth/config
# {"emergencyLogin":{"enabled":true}}
```

Login-Probe:

```bash
curl -sS -X POST https://<host>/api/auth/emergency-login \
  -H "Content-Type: application/json" \
  -H "X-Break-Glass: <shared-secret>"   `# nur falls REQUIRE_HEADER gesetzt` \
  -d '{"username":"<EMERGENCY_ADMIN_USER>","password":"<EMERGENCY_ADMIN_PASS>"}'
# {"accessToken":"eyJ...","ttlMinutes":15,"user":{...,"permissions":["*"]},"emergency":true}
```

Token-Test gegen einen geschuetzten Endpoint:

```bash
TOKEN=<accessToken-aus-vorigem-Aufruf>
curl -sS -H "Authorization: Bearer $TOKEN" https://<host>/api/auth/me
# {"sub":"emergency:<user>","type":"emergency-admin","roles":["SUPERADMIN"],"permissions":["*"]}
```

Audit-Log auf dem Server:

```bash
docker compose -f docker-compose.yml logs api | grep AUTH_AUDIT | tail -5
# [AUTH_AUDIT] WARN emergency-login SUCCESS ip=... username=...***(N) ttl=15min
```

---

## 4. Nutzung im Incident

### 4.1 Wann ist der Notfall-Login erlaubt?

**Nur** in einem dieser Faelle:

- Normale Anmeldung schlaegt fuer alle Admins fehl (DB- oder Auth-Stoerung).
- Der einzige aktive Admin-Account ist gesperrt/inaktiv und kann ohne
  Notfallzugang nicht reaktiviert werden.
- Datenbank ist nicht erreichbar, aber die App muss eingesehen oder ein
  Backup ausgeloest werden.

**Nicht** erlaubt:

- Vergessenes Passwort eines regulaeren Admins → ueber Passwort-Reset.
- „Schneller mal eben" im Tagesgeschaeft.
- Tests, Demos, Schulungen → eigener Test-User.

### 4.2 Freigabe (Vier-Augen-Prinzip empfohlen)

- Aktivierung **immer** zusammen mit zweiter Person aus DevOps/Security
  abstimmen.
- Aktivierungsgrund + Person 1 (aktiviert) + Person 2 (zugestimmt) im
  Incident-Ticket sofort dokumentieren.

### 4.3 Minimaler Ablauf

1. Vier-Augen-Quorum + Incident-Ticket eroeffnen.
2. Aktivieren: Schritte 3.1–3.3.
3. Login im UI (Login-Screen → „Notfall-Login" einblenden) **oder** per API
   wie in 3.3.
4. Im UI ist der Banner „Notfallmodus aktiv" sichtbar — nur die fuer den
   Incident noetigen Massnahmen durchfuehren.
5. Sofort nach Erledigung: Notfallmodus beenden (Banner-Button **„Notfallmodus
   beenden"** oder regulaerer Logout) und Schritte 5 ausfuehren.

> Token laeuft ohnehin nach `EMERGENCY_ADMIN_TTL_MINUTES` (Default 20 Min.) ab.
> Das ersetzt **nicht** die manuelle Deaktivierung — siehe Abschnitt 5.

---

## 5. Deaktivierung / Rueckbau

Nach Abschluss der Incident-Massnahme **sofort** durchfuehren — nicht auf das
Token-TTL warten.

### 5.1 ENV zurueckbauen

In der Server-`.env`:

```env
EMERGENCY_ADMIN_ENABLED=false
EMERGENCY_ADMIN_USER=
EMERGENCY_ADMIN_PASS=
# EMERGENCY_ADMIN_ALLOWED_IPS / REQUIRE_HEADER koennen bleiben
```

### 5.2 Secret-Rotation

- Passwort, das aktiviert war, gilt als **verbrannt** und darf nicht
  wiederverwendet werden — auch nicht in einer spaeteren Notfallsitzung.
- Wenn `EMERGENCY_ADMIN_REQUIRE_HEADER` zum Einsatz kam: Shared-Secret rotieren.

### 5.3 Container neu starten

```bash
cd /opt/crm
docker compose -f docker-compose.yml up -d --force-recreate api
```

### 5.4 Verifikation des Rueckbaus

Beide Aufrufe muessen scheitern:

```bash
curl -sS https://<host>/api/auth/config
# {"emergencyLogin":{"enabled":false}}

curl -sS -X POST https://<host>/api/auth/emergency-login \
  -H "Content-Type: application/json" \
  -d '{"username":"<vorher-genutzt>","password":"<vorher-genutzt>"}'
# HTTP 403 — {"message":"Notfall-Login ist deaktiviert.","error":"Forbidden","statusCode":403}
```

Audit-Log gegenpruefen:

```bash
docker compose -f docker-compose.yml logs api | grep AUTH_AUDIT
# der letzte Eintrag muss "DISABLED" oder kein neuer SUCCESS sein
```

---

## 6. Audit / Nachbereitung

### 6.1 Logs sichern

Mindestens den Zeitraum **Aktivierung minus 5 Min. bis Deaktivierung plus 5 Min.**
exportieren:

```bash
docker compose -f docker-compose.yml logs --since 2h api \
  | grep -E "AUTH_AUDIT|emergency-login" > /tmp/break-glass-$(date +%F-%H%M).log
```

Pro Eintrag enthaltene Felder:

- Zeitstempel (Container-Zeit)
- Status: `SUCCESS` / `FAIL` / `DISABLED` / `MISCONFIGURED` / `IP_BLOCKED` / `HEADER_MISMATCH`
- Quell-IP (`ip=...`)
- Maskierter Username (`username=ab***(N)`)
- TTL bei Erfolg (`ttl=Nmin`)

### 6.2 Pflicht-Nachtrag im Incident-Protokoll

In das Incident-Ticket aufnehmen, spaetestens 24 Stunden nach dem Vorfall:

| Feld | Inhalt |
|---|---|
| Warum aktiviert? | konkrete Stoerung, Verweis auf Alarm/Ticket |
| Wer hat aktiviert? | Person + Zustimmender (Vier-Augen) |
| Wer hat genutzt? | identische oder andere Person, mit Zeitfenster |
| Quell-IP(s) | aus Audit-Log |
| Aktiv ab / bis | exakte Zeitstempel |
| Massnahme im Notfallmodus | was wurde getan (kein Tagesgeschaeft) |
| Deaktivierung verifiziert? | Verweis auf 5.4 |
| Secret rotiert? | ja/nein + wann |

### 6.3 Review

- Ein **Incident-Review** ist innerhalb von 24 Stunden Pflicht.
- Wenn der Notfallmodus genutzt wurde, weil der regulaere Pfad versagt hat:
  Folgemassnahmen festlegen, damit das beim naechsten Mal nicht mehr noetig ist.

---

## 7. Security-Guardrails

> Diese Punkte sind **nicht optional**.

- **Keine Credentials im Repo.** Nicht in `docker-compose.yml`, nicht in
  `.env.example`, nicht in CI-Variablen, nicht in Tickets oder Chats unmaskiert.
- **Default deaktiviert.** `EMERGENCY_ADMIN_ENABLED=false` ist der Normalzustand.
  Jede Aktivierung ist ein loggable, nachweispflichtiges Ereignis.
- **Nur temporaer aktivieren.** Spaetestens beim Verlassen des Incidents
  wieder deaktivieren — nicht auf den naechsten Wartungslauf vertagen.
- **Zugriff einschraenken.** Wenn moeglich `EMERGENCY_ADMIN_ALLOWED_IPS` auf
  VPN-/Office-Range setzen und/oder `EMERGENCY_ADMIN_REQUIRE_HEADER` mit
  Shared Secret nutzen.
- **Kurze Token-TTL.** Default 20 Min. ist absichtlich knapp. Nicht
  hochsetzen, ausser ein Incident erfordert es technisch und das wird im
  Ticket vermerkt.
- **Break-Glass ist kein regulaerer Zugang.** Der Account hat
  `permissions=["*"]` — er umgeht alle feingranularen Berechtigungen. Niemals
  fuer „normale" Aufgaben verwenden, auch nicht ein einziges Mal.
- **Passwort verbrennen.** Nach jeder Aktivierung das verwendete Passwort
  rotieren, bevor das Feature wieder aktiviert wird.

---

## 8. Implementierungs-Referenzen

Fuer Pruefung/Code-Review:

- Feature-Flag-Endpoint: [apps/api/src/auth/auth.controller.ts](../apps/api/src/auth/auth.controller.ts) (`GET /auth/config`)
- Login-Logik (ENV-only, timing-safe): [apps/api/src/auth/auth.service.ts](../apps/api/src/auth/auth.service.ts) (`emergencyLogin`, `constantTimeStringEqual`, `parseEmergencyTtlMinutes`)
- DTO: [apps/api/src/auth/dto/emergency-login.dto.ts](../apps/api/src/auth/dto/emergency-login.dto.ts)
- Guard-Sonderfaelle: [apps/api/src/common/guards/jwt-auth.guard.ts](../apps/api/src/common/guards/jwt-auth.guard.ts) (kein DB-Lookup fuer `type=emergency-admin`), [apps/api/src/common/guards/permissions.guard.ts](../apps/api/src/common/guards/permissions.guard.ts) (Wildcard `*`)
- ENV-Vorlagen: [.env.example](../.env.example), [docker-compose.yml](../docker-compose.yml)

---

## 9. Schnellpruefung — geht der Notfallzugang?

Nicht im Notfall, sondern **bevor** ein Notfall eintritt, einmalig durchspielen:

1. Auf einem Test-/Staging-Host Aktivierung wie in Abschnitt 3.
2. Login per `curl` (Abschnitt 3.3) — Token erhalten.
3. Mit Token `GET /api/customers` aufrufen — 200 erwartet.
4. Deaktivierung wie in Abschnitt 5.
5. Verifikation 5.4 — 403 erwartet.
6. Audit-Log enthaelt `SUCCESS` und keinen weiteren `SUCCESS` nach Schritt 4.

Sobald einer der Schritte schiefgeht: Befund ins Ticket eintragen und vor dem
naechsten Wartungsfenster fixen — ein Notfallzugang, der im Notfall nicht
funktioniert, ist kein Notfallzugang.
