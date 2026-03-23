# CRM Monteur Plattform

Monorepo fuer das MVP einer CRM-, Projekt-, Monteur- und Zeiterfassungs-App gemaess `crm_monteur_projekt_app_spec.md`.

## Stack

- `apps/web`: Next.js 16, React 19, Tailwind CSS
- `apps/api`: NestJS 11, Prisma, JWT-basierte Auth
- PostgreSQL fuer Fachdaten
- MinIO fuer dokumentenbasierten Storage
- Turbo + pnpm fuer das Monorepo

## Schnellstart

1. `.env.example` nach `.env` kopieren und Werte pruefen.
2. `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres minio`
3. `pnpm install`
4. `pnpm db:generate`
5. `pnpm db:migrate`
6. `pnpm db:seed`
7. `pnpm dev`

## Kompletter Docker-Start

Die App kann jetzt komplett als eigene Container laufen:

1. Lokale `pnpm`-Dev-Server auf `3800` und `3801` stoppen.
2. `docker compose up -d --build`
3. Web unter [http://localhost:3800](http://localhost:3800) aufrufen.
4. API unter [http://localhost:3801/api](http://localhost:3801/api) pruefen.

Container:

- `crm-web`
- `crm-api`
- `crm-postgres`
- `crm-minio`

## Lokale URLs

- Web: [http://localhost:3800](http://localhost:3800)
- API: [http://localhost:3801/api](http://localhost:3801/api)

## Demo-Zugaenge

- Admin: `admin@example.local` / `admin12345`
- Monteur: `M-1000` / `1234`

## MVP-Umfang

- Admin-Login
- Kunden, Niederlassungen, Ansprechpartner
- Projekte, Monteure, Projektzuordnungen
- Clock-In / Clock-Out mit GPS
- Wochenzettel-Generierung
- Signaturablage
- Dokument-Upload und Download
- PDF-Export fuer Wochenzettel
- E-Mail-Versand mit PDF-Anhang

## Hinweise

- Der aktuelle Stand priorisiert echte Endpunkte und Kernflows vor UI-Feinschliff.
- Dokumente werden im MVP lokal unter `storage/uploads` gespeichert.
- E-Mail laeuft standardmaessig ueber `jsonTransport`, solange `SMTP_REAL_DELIVERY=true` nicht gesetzt ist.
- Eine initiale SQL-Migration liegt unter `prisma/migrations/202603231440_init/migration.sql`.
- Lokale Entwicklung nutzt bewusst Port `55432`, damit bereits laufende lokale Postgres-Instanzen nicht kollidieren.
