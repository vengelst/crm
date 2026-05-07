# CRM Monteur App (Android First)

Diese App ist der Start fuer den Monteur-Flow auf Android:

- PIN-Login (`/auth/pin-login`)
- Zeiterfassung (`/time/clock-in`, `/time/clock-out`) inkl. GPS
- Offline-Queue fuer Clock-In/Clock-Out mit Auto-Sync bei Netzrueckkehr
- Foto-Upload fuer Projekt-Dokumente (`/documents/upload`)
- Wochenzettel laden (`/timesheets/weekly`) inkl. einfacher Status-Timeline
- Worker-Signatur-Call (`/timesheets/:id/worker-sign`) als MVP mit `signatureImagePath`

## Start lokal

```bash
pnpm install
pnpm --filter mobile start
```

Android Emulator nutzt fuer lokale API standardmaessig:

- `http://10.0.2.2:3000`

## Aktueller Stand (MVP)

- Alles ist bewusst in `App.tsx` zentral gehalten, um den Einstieg schnell zu machen.
- Naechster Schritt ist die Aufteilung in:
  - `src/features/auth/*`
  - `src/features/time/*`
  - `src/features/documents/*`
  - `src/features/timesheets/*`
  - `src/core/api/*`, `src/core/offline/*`

## Ticketliste fuer Claude (Tag-Plan)

### Tag 1 - Fundament + Login + Zeiterfassung

1. App-Struktur auf Feature-Module aufteilen.
2. Typed API-Client mit zentralem Error-Handling bauen.
3. PIN-Login harden (Validation, Retry-Limit, Session-Restore).
4. Clock-In/Clock-Out robust machen:
   - Open-Entry-Status sauber anzeigen
   - Project-Selection persistieren
   - Queue-Retry mit Backoff
5. Echte Network-Detection integrieren (`expo-network`) und Auto-Sync bei Reconnect.

### Tag 2 - Dokumente + Stundenzettel + Signatur

1. Projekt-Dokumentliste im Worker-Scope laden.
2. Bild-Upload verbessern:
   - Camera + Gallery
   - Komprimierung/Resizing
   - Upload-Fortschritt
3. Wochenzettel-Liste inkl. Statuslabels:
   - Draft / Worker Signed / Customer Signed / Approved / Billed
4. Echte Signatur-Erfassung integrieren (Canvas + Export + Upload) statt nur `signatureImagePath`.
5. Signatur-Flow absichern (keine Signatur bei bereits abgeschlossenem Zettel).

### Tag 3 - Android-Release-Readiness

1. Rollen-/Scope-Tests fuer Worker-Endpunkte.
2. Crash- und Error-Telemetrie integrieren (z. B. Sentry).
3. Branding/Icons/Splash finalisieren.
4. Build-Profile fuer `internal`, `staging`, `production` definieren (EAS).
5. Play-Store-Checkliste:
   - Privacy Policy
   - Berechtigungsbegruendung (Location, Medien)
   - Signed AAB Upload

## Wichtige offene Punkte

- Signatur-Binary-Flow mit Backend final abstimmen:
  - Soll die App PNG/JPEG direkt hochladen und danach einen Storage-Pfad erhalten?
  - Oder soll Backend eine eigene Signatur-Upload-Route bereitstellen?
- Soll GPS fuer jeden Clock-Event Pflicht sein oder optional mit Fallback?
