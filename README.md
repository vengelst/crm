# CRM Monteur Plattform

## Lokale Entwicklung (Docker)

Der komplette Dev-Stack (Web, API, Postgres, MinIO) laeuft in Docker mit Hot-Reload.

### Starten und Stoppen

```powershell
# Variante 1: pnpm
pnpm dev:docker          # Stack im Hintergrund starten
pnpm dev:docker:logs     # Live-Logs aller Container
pnpm dev:docker:down     # Stack stoppen

# Variante 2: PowerShell-Skripte
.\startapp.ps1           # Stack im Hintergrund starten
.\stopapp.ps1            # Stack stoppen
```

### Zugriff

| Dienst | URL |
|--------|-----|
| Web    | http://localhost:3800 |
| API    | http://localhost:3801/api |
| MinIO  | http://localhost:9001 |

### Lokale Entwicklung ohne Docker

```bash
pnpm dev                 # Web + API nativ starten (Postgres + MinIO muessen laufen)
```

## Test-Server Deployment

```powershell
.\abgleich\crm-deploy.ps1 -Command deploy
```

Oder ueber das interaktive Menue: `.\abgleich\crm-deploy.ps1`
