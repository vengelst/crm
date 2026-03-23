# CRM-, Projekt-, Monteur- und Zeiterfassungs-App – Umsetzungsspezifikation

## Ziel

Es soll eine produktionsfähige Webanwendung mit Mobile-Nutzung entstehen, die folgende Kernbereiche in **einem System** vereint:

1. **CRM / Kundenverwaltung**
2. **Niederlassungen / Standorte / Ansprechpartner**
3. **Projektverwaltung**
4. **Monteurverwaltung**
5. **Mobile Zeiterfassung mit GPS**
6. **Dokumentenmanagement**
7. **Wochen-Stundenzettel mit Unterschrift**
8. **Kiosk-/PIN-Modus für Monteure und Kunden**
9. **E-Mail- und PDF-Ausgabe**
10. **Druck- und Exportfunktionen**
11. **Rollen- und Rechtesystem**
12. **Docker-basierte lokale und Server-Umgebung**

Die Anwendung soll primär am **PC administriert** werden, aber für **Monteure auf dem Smartphone** gut nutzbar sein.

---

## Business-Kontext

Das Unternehmen arbeitet projektbezogen für Kunden im Bereich:
- Videoüberwachungsanlagen
- Elektroinstallationen
- ähnliche Montage-/Installationsarbeiten

Für Kundenprojekte werden **Leiharbeiter / Monteure** eingesetzt. Diese werden Projekten zugeordnet. Pro Monteur müssen Arbeitszeiten, Projektzuordnung, GPS-Orte, Kommentare und Wochen-Stundenzettel sauber dokumentiert werden. Kunden müssen Stundenzettel auf Handy oder Tablet per PIN öffnen und unterschreiben können.

---

## Produktvision

Die App soll wie eine Kombination aus:
- CRM
- Projekt- und Einsatzplanung
- Monteur-App
- Zeiterfassung
- Dokumentenablage
- Stundenzettel-/Abnahme-System
- vorbereiteter Abrechnungsgrundlage

funktionieren.

Kein überladenes Design. Klare, kompakte, professionelle Oberfläche mit:
- Hellmodus
- Dunkelmodus
- Hintergrund separat definierbar
- standardisierte, gut lesbare System- oder Webfonts
- spätere Internationalisierung vorbereiten

---

## Empfohlener Tech-Stack

## Frontend
- **Next.js** (App Router)
- **TypeScript**
- **React**
- **Tailwind CSS**
- **shadcn/ui** für konsistente UI-Komponenten
- **React Hook Form** + **Zod**
- **TanStack Query**
- **next-intl** oder vorbereitetes i18n-Setup
- **PWA-Fähigkeit** für mobile Nutzung

## Backend
- Entweder integriert in Next.js via Route Handlers / Server Actions **oder** separates Backend
- Für saubere Domänentrennung empfohlen:
  - **NestJS** oder **Express/Fastify mit TypeScript**
- **REST API** als Start
- Später optional GraphQL

## Datenbank
- **PostgreSQL**
- **Prisma ORM** empfohlen

## Storage / Dokumente
- **S3-kompatibler Storage** (MinIO lokal/Server; später AWS S3 möglich)
- Dokumente, Fotos, PDF-Exports dort speichern

## Authentifizierung
- Admin-/Büro-Login mit E-Mail + Passwort
- Monteure und Kunden zusätzlich mit **PIN-/Kiosk-Flow**
- optional später 2FA für Admin

## PDF / Dokumentgenerierung
- serverseitige PDF-Erstellung mit z. B.
  - Playwright PDF
  - oder pdf-lib
  - oder React-PDF

## E-Mail
- SMTP (z. B. Unternehmensmailserver)
- Versand von PDFs an Buchhaltung / Projektleiter / interne Empfänger

## Signatur
- Canvas-basierte handschriftliche Signatur im Browser/Mobile
- Speicherung als PNG + Prüfsumme + Zeitstempel

## Deployment
- **Docker Compose** für lokale Entwicklung und Serverbetrieb
- GitHub als zentrale Codeverwaltung
- Server pullt nur aus GitHub
- CI optional mit GitHub Actions

---

## Architektur – Zielbild

## Hauptmodule

1. **Auth & Users**
2. **CRM**
3. **Branches / Ansprechpartner**
4. **Projects**
5. **Workers / Monteure**
6. **Assignments / Einsatzplanung**
7. **Time Tracking**
8. **GPS / Locations**
9. **Timesheets / Weekly Approval**
10. **Documents / Media**
11. **Vehicles & Equipment**
12. **Print / Export / Email**
13. **Settings**
14. **Audit Log**
15. **Kiosk / PIN Access**

---

## Rollenmodell

Mindestens folgende Rollen vorsehen:

### 1. Superadmin
- alles
- Systemkonfiguration
- Benutzer/Rollen
- Mandanten-/Firmeneinstellungen

### 2. Büro / Disposition / Verwaltung
- Kunden anlegen/bearbeiten
- Projekte anlegen/bearbeiten
- Monteure zuordnen
- Dokumente hochladen
- Stundenzettel prüfen/exportieren/versenden

### 3. Projektleiter intern
- Projekte einsehen/bearbeiten
- Monteure zuweisen
- Kommentare / Status / Dokumente
- Auswertungen für eigene Projekte

### 4. Monteur
- nur eigene Einsätze / eigene Projekte
- ein-/ausstempeln
- Kommentare erfassen
- eigene Wochenzettel ansehen und unterschreiben

### 5. Kunde / Kundenabnahme (Kiosk)
- kein normales Konto nötig
- Zugriff nur via PIN / Freigabelink / zeitlich begrenzter Token
- sieht nur freigegebene Wochenzettel
- kann nur prüfen und unterschreiben

---

## Kernobjekte / Fachmodell

## Kunde
Ein Kunde ist die übergeordnete Organisation.

Felder:
- Kundennummer
- Firmenname
- Rechtsform
- Status (aktiv/inaktiv)
- Branche
- Hauptadresse
- Rechnungsadresse
- allgemeine E-Mail
- allgemeine Telefonnummer
- Website
- Umsatzsteuer-ID
- Notizen
- interne Bemerkungen
- Standard-Buchhaltungs-E-Mail
- Standard-Projektleiter-E-Mail(n)
- Tags
- erstellt am / geändert am

## Niederlassung / Standort des Kunden
Ein Kunde kann mehrere Standorte / Niederlassungen haben.

Felder:
- Kunde
- Name der Niederlassung
- Adressdaten
- Telefon
- E-Mail
- lokale Hinweise
- aktiv/inaktiv

## Ansprechpartner
Ein Kunde bzw. eine Niederlassung kann mehrere Ansprechpartner haben.

Felder:
- Kunde
- optional Niederlassung
- Vorname
- Nachname
- Rolle/Funktion
- Telefon mobil
- Telefon Festnetz
- E-Mail
- bevorzugter Kontaktweg
- Buchhaltung ja/nein
- Projektleitung ja/nein
- Unterschriftsberechtigt ja/nein
- Notizen

## Projekt
Das Projekt ist die operative Arbeitseinheit.

Felder:
- Projektnummer
- Projekttitel
- Kunde
- Niederlassung / Einsatzstandort
- Projektadresse
- Beschreibung
- Leistungsart (Video, Elektro, Service, Sonstiges)
- Status (Entwurf, geplant, aktiv, pausiert, abgeschlossen, storniert)
- Priorität
- Startdatum geplant
- Enddatum geplant
- Startdatum tatsächlich
- Enddatum tatsächlich
- Projektleiter intern
- Kundenansprechpartner
- Unterkunftsadresse für Monteure
- besondere Hinweise / Zugangsinfos
- Arbeitszeiten/Hausordnung/Hinweise
- Standard-Pausenregelung (optional Projekt-Override)
- Abrechnungsmodus
- E-Mail-Verteiler für Berichte / Stundenzettel
- Notizen intern

## Projektzuordnung Monteur
Join-Modell zwischen Projekt und Monteur.

Felder:
- Projekt
- Monteur
- Rolle im Projekt
- Einsatzbeginn
- Einsatzende
- aktiv ja/nein
- Kommentar

## Monteur
Felder:
- Personalnummer / Monteurnummer
- Vorname
- Nachname
- Mobilnummer
- E-Mail
- Heimatadresse
- Nationalität optional
- Sprache optional
- aktiv/inaktiv
- PIN-Code Hash
- Foto optional
- Notfallkontakt
- Verfügbarkeit
- Qualifikationen
- Führerschein ja/nein
- Bemerkungen
- Benutzerkonto optional verknüpft

## Fahrzeug
Felder:
- Kennzeichen
- Hersteller
- Modell
- interner Name
- aktiv/inaktiv
- Bemerkungen

## Monteur-Fahrzeug-Zuordnung
Felder:
- Monteur
- Fahrzeug
- von
- bis
- Kommentar

## Werkzeug / Ausstattung
Zwei Ebenen:

### A. Stammdaten Artikel
- Name
- Kategorie (Werkzeug, PSA, Elektronik, Sonstiges)
- Seriennummer optional
- inventarisiert ja/nein

### B. Ausgabe an Monteur
- Monteur
- Werkzeug/Ausrüstung
- ausgegeben am
- zurückgegeben am
- Zustand
- Kommentar

PSA/Arbeitsmittel, die typischerweise relevant sind:
- Helm
- Gurt
- Sicherheitsschuhe
- Handschuhe
- Warnweste
- Standard-Werkzeugsatz

---

## Zeit- und Einsatzlogik

## Grundlogik Zeiterfassung
Ein Monteur sieht auf dem Handy nur:
- seine aktuellen / zugewiesenen Projekte
- Button „Arbeitsbeginn“
- Button „Arbeitsende“
- optional Kommentar
- Historie seiner Einträge

Beim Einstempeln:
- Datum/Zeit speichern
- GPS-Koordinaten speichern
- Projekt speichern
- Gerätedaten optional speichern

Beim Ausstempeln:
- Datum/Zeit speichern
- GPS-Koordinaten speichern
- Projekt speichern
- Kommentar optional

## Pausenlogik
V1 bewusst einfach:
- globale Standardpause in Einstellungen definierbar
- optional projektbezogene Überschreibung
- Pause wird pauschal von Tagesarbeitszeit abgezogen
- Beispiel: ab >6h automatisch 30 min, ab >9h automatisch 45 min

Alternative Parameter:
- feste Pause pro Tag
- regelbasierte Pause je Stundenbereich

Empfehlung: regelbasierte Pausenmatrix in Einstellungen.

## Wochenauswertung
Für jeden Monteur und jedes Projekt separat:
- Summe täglicher Zeiten
- Pausenabzug
- Nettozeit
- Wochenstunden
- Bemerkungen
- Ein-/Ausstempelorte

Wichtig:
- **Jeder Monteur erhält seinen eigenen Wochen-Stundenzettel**
- Kein gemeinsamer Sammelzettel für mehrere Monteure
- Kunde muss pro Monteur separat unterschreiben können
- Monteur muss seinen eigenen Zettel ebenfalls separat unterschreiben können

---

## GPS / Standortdaten

Bei jedem Clock-In / Clock-Out speichern:
- latitude
- longitude
- accuracy
- timestamp client
- timestamp server
- optional reverse geocoding snapshot
- permission status

Später möglich:
- nur bei Ein-/Ausstempeln GPS
- keine dauerhafte Hintergrund-Ortung in V1 nötig

Empfohlen für V1:
- **nur Ereignis-Ortung** bei Arbeitsbeginn/-ende
- Hintergrund-Ortung nicht standardmäßig
- falls später gewünscht: optionales Intervalltracking

---

## Wochen-Stundenzettel / Approval Flow

## Ziel
Am Ende jeder Woche entsteht pro Monteur und Projekt ein freigabefähiger Stundenzettel.

Inhalt:
- Kunde
- Projekt
- Projektort
- Monteur
- Kalenderwoche
- Einsatztage
- Arbeitsbeginn / Arbeitsende
- Pause
- Nettozeit
- Ein-/Ausstempelorte
- Kommentare/Bemerkungen
- Summen
- Monteur-Signatur
- Kunden-Signatur
- Freigabestatus
- Zeitstempel

## Signatur-Workflow Monteur
- Monteur öffnet seinen Wochenzettel
- prüft Daten
- signiert auf Handy
- Signatur + Zeitstempel + Geräteinfo speichern

## Signatur-Workflow Kunde
- Büro / Projektleiter stellt Stundenzettel zur Kundenfreigabe bereit
- Kunde öffnet Kiosk-/PIN-Modus auf Handy/Tablet
- sieht nur freigegebene, relevante Zettel
- signiert direkt
- Signatur und Zeitstempel speichern

## Kiosk-/PIN-Modus
Es gibt zwei getrennte Anwendungsfälle:

### A. Monteur-Kiosk / einfacher PIN-Zugang
- 6-stellige PIN
- nach Login nur eigene Projekte und eigene Wochenzettel sichtbar

### B. Kunden-Kiosk / Abnahme-Modus
- 4- oder 6-stellige PIN oder einmaliger Freigabecode
- zeigt nur freigegebene Stundenzettel für bestimmtes Projekt/Kunde/Woche
- keine Admin-Funktionen

Empfehlung:
- Kiosk-Sessions zeitlich begrenzen
- PINs niemals im Klartext speichern
- nur gehashte PINs in DB

---

## Dokumentenmanagement

Dokumente sollen hinterlegt werden können bei:
- Kunde
- Niederlassung
- Ansprechpartner
- Projekt
- Monteur
- Wochenzettel

Dokumenttypen:
- Fotos Ist-Situation
- Lieferscheine
- Rechnungsbelege
- Projektunterlagen
- sonstige PDFs/Bilder

Metadaten:
- Dateiname
- MIME-Type
- Größe
- Upload durch
- Upload-Zeit
- Beschreibung
- Dokumenttyp
- Bezug (Kunde/Projekt/Monteur/etc.)
- Version optional

---

## Druck / Export / Versand

## Druckbare Dokumente
1. Kundenstammblatt
2. Projektstammblatt
3. Monteurstammblatt
4. Wochen-Stundenzettel pro Monteur
5. Wochen-Summary pro Projekt / Kunde

## Exportformate
- PDF
- CSV/XLSX für Listen

## E-Mail-Versand
Stundenzettel sollen per E-Mail versendet werden können an:
- Buchhaltung des Kunden
- Projektleiter beim Kunden
- interne Projektleitung
- optional CC/BCC

Empfohlene Felder im Projekt/Kundenobjekt:
- Standard-E-Mail Empfänger Buchhaltung
- Standard-E-Mail Empfänger Projektleitung
- weitere CC-Empfänger

---

## UI / UX-Konzept

## Desktop
Schwerpunkt für Disposition/Büro:
- Dashboard
- Kundenliste
- Projektliste
- Kalender / Planung
- Monteurliste
- Dokumente
- Zeiterfassungsübersichten
- Freigaben / Stundenzettel
- Reports / Exporte
- Einstellungen

## Mobile
Schwerpunkt für Monteure:
- PIN-Login
- meine Projekte
- Arbeitsbeginn
- Arbeitsende
- Kommentar
- meine Wochenzettel
- Signatur

## UI-Stil
- nüchtern, professionell
- kompakt, aber nicht eng
- klare Cards/Tables/Drawer
- Hell/Dunkelmodus
- Hintergrund als eigenes Theme-Element konfigurierbar
- keine verspielten Elemente

## Theming-Konzept
- Theme tokens / CSS variables
- Hintergrund separat definierbar
- light / dark palette
- komponentenbasierte Styles

---

## Internationalisierung vorbereiten

Noch nicht in V1 aktiv umsetzen, aber Architektur vorbereiten:
- alle Texte zentral in locale-Dateien
- keine hartcodierten UI-Texte in Komponenten
- Datenmodell sprachneutral

Später geplante Sprachen:
- Deutsch
- Serbisch
- Slowakisch

---

## Empfohlene Screens / Seiten

## Auth
- Login
- Passwort vergessen
- PIN-Login (Monteur/Kunde)

## Dashboard
- heutige aktive Projekte
- anwesende Monteure
- fehlende Clock-Outs
- offene Wochenzettel
- ausstehende Unterschriften
- letzte Uploads / Dokumente

## CRM
- Kundenliste
- Kunde Detail
- Niederlassungen
- Ansprechpartner
- Kommunikationshistorie
- Notizen
- Telefonprotokolle

## Projekte
- Projektliste
- Projektdetail
- Projektkalender
- Monteur-Zuordnungen
- Dokumente
- Unterkunft
- Ansprechpartner
- Projektstatus

## Monteure
- Monteurliste
- Monteurdetail
- PIN verwalten
- Fahrzeuge
- Werkzeug / PSA
- Dokumente
- Einsatzhistorie

## Zeiterfassung / Timesheets
- Tagesansicht
- Wochenansicht
- Freigabeliste
- einzelne Wochenzettel
- Kunden-Unterschriftenstatus
- Monteur-Unterschriftenstatus

## Kiosk
- PIN-Eingabe
- Zettelauswahl
- Signaturseite
- Bestätigung

## Reports / Export
- Projektstunden
- Kundenstunden
- Monteurstunden
- offene Signaturen
- PDF-/CSV-Export

## Einstellungen
- Pausenregeln
- Theme / Hintergrund
- E-Mail-Templates
- PIN-Richtlinien
- Rollen & Rechte
- Dokumenttypen
- Projektstatuswerte

---

## Datenbankentwurf – Tabellenübersicht

## Identity / System
- users
- roles
- permissions
- user_roles
- sessions
- audit_logs
- settings

## CRM
- customers
- customer_branches
- customer_contacts
- customer_notes
- customer_call_logs

## Projects
- projects
- project_notes
- project_assignments
- project_status_history
- project_email_recipients

## Workers
- workers
- worker_pins
- worker_skills
- worker_documents
- worker_assignments_history

## Vehicles / Equipment
- vehicles
- worker_vehicle_assignments
- equipment_items
- worker_equipment_issues

## Time Tracking
- time_entries
- gps_events
- break_rules
- weekly_timesheets
- weekly_timesheet_days
- weekly_timesheet_signatures

## Documents
- documents
- document_links
- document_versions optional

## Communication / Mail
- email_outbox
- email_logs
- print_jobs optional

---

## Tabellen – fachliche Mindestfelder

## customers
- id
- customer_number
- company_name
- legal_form
- status
- billing_email
- phone
- email
- website
- vat_id
- address_line1
- address_line2
- postal_code
- city
- country
- notes
- created_at
- updated_at
- deleted_at

## customer_branches
- id
- customer_id
- name
- address fields
- phone
- email
- notes
- active

## customer_contacts
- id
- customer_id
- branch_id nullable
- first_name
- last_name
- role
- email
- phone_mobile
- phone_landline
- is_accounting_contact
- is_project_contact
- is_signatory
- notes

## projects
- id
- project_number
- customer_id
- branch_id nullable
- title
- description
- service_type
- status
- priority
- site_name
- site_address_line1
- site_postal_code
- site_city
- site_country
- accommodation_address
- planned_start_date
- planned_end_date
- actual_start_date
- actual_end_date
- internal_project_manager_user_id nullable
- primary_customer_contact_id nullable
- pause_rule_id nullable
- notes
- created_at
- updated_at
- deleted_at

## workers
- id
- worker_number
- first_name
- last_name
- email
- phone
- address fields
- active
- language_code nullable
- notes
- created_at
- updated_at

## worker_pins
- id
- worker_id
- pin_hash
- valid_from
- valid_to nullable
- is_active
- created_at

## project_assignments
- id
- project_id
- worker_id
- role_name
- start_date
- end_date nullable
- active
- notes

## vehicles
- id
- license_plate
- make
- model
- internal_name
- active
- notes

## worker_vehicle_assignments
- id
- worker_id
- vehicle_id
- assigned_from
- assigned_to nullable
- notes

## equipment_items
- id
- item_number
- category
- name
- serial_number nullable
- trackable
- active
- notes

## worker_equipment_issues
- id
- worker_id
- equipment_item_id
- issued_at
- returned_at nullable
- condition_out nullable
- condition_in nullable
- notes

## break_rules
- id
- scope_type (global/project)
- project_id nullable
- name
- auto_deduct_enabled
- threshold_minutes_1
- break_minutes_1
- threshold_minutes_2 nullable
- break_minutes_2 nullable
- active

## time_entries
- id
- worker_id
- project_id
- entry_type (clock_in, clock_out, manual_adjustment)
- occurred_at_client
- occurred_at_server
- latitude nullable
- longitude nullable
- accuracy nullable
- comment nullable
- source_device nullable
- created_by_user_id nullable
- kiosk_session_id nullable

## gps_events
- id
- worker_id
- project_id nullable
- related_time_entry_id nullable
- latitude
- longitude
- accuracy nullable
- recorded_at
- event_type

## weekly_timesheets
- id
- worker_id
- project_id
- week_year
- week_number
- status (draft, worker_signed, customer_signed, completed, locked)
- total_minutes_gross
- total_break_minutes
- total_minutes_net
- generated_at
- locked_at nullable

## weekly_timesheet_days
- id
- weekly_timesheet_id
- work_date
- first_clock_in_at nullable
- last_clock_out_at nullable
- gross_minutes
- break_minutes
- net_minutes
- summary_comment nullable
- clock_in_latitude nullable
- clock_in_longitude nullable
- clock_out_latitude nullable
- clock_out_longitude nullable

## weekly_timesheet_signatures
- id
- weekly_timesheet_id
- signer_type (worker, customer)
- signer_name
- signer_role nullable
- signature_image_path
- signed_at
- ip_address nullable
- device_info nullable

## documents
- id
- storage_key
- original_filename
- mime_type
- file_size
- uploaded_by_user_id nullable
- document_type
- title nullable
- description nullable
- created_at

## document_links
- id
- document_id
- entity_type
- entity_id

## customer_call_logs
- id
- customer_id
- contact_id nullable
- project_id nullable
- subject
- call_date
- direction
- summary
- next_action nullable
- created_by_user_id

## customer_notes / project_notes
- id
- related entity
- body
- created_by_user_id
- created_at

## settings
- id
- key
- value_json
- updated_at

## audit_logs
- id
- actor_user_id nullable
- actor_type
- entity_type
- entity_id
- action
- before_json nullable
- after_json nullable
- created_at

---

## API – empfohlene Endpunkte

## Auth
- POST /auth/login
- POST /auth/logout
- POST /auth/pin-login
- POST /auth/refresh

## Customers
- GET /customers
- POST /customers
- GET /customers/:id
- PATCH /customers/:id
- DELETE /customers/:id

## Branches / Contacts
- CRUD analog

## Projects
- GET /projects
- POST /projects
- GET /projects/:id
- PATCH /projects/:id
- POST /projects/:id/assignments
- GET /projects/:id/timesheets
- GET /projects/:id/documents

## Workers
- GET /workers
- POST /workers
- GET /workers/:id
- PATCH /workers/:id
- POST /workers/:id/pin/reset
- GET /workers/:id/equipment
- GET /workers/:id/vehicles

## Time Tracking
- POST /time/clock-in
- POST /time/clock-out
- GET /time/my-entries
- GET /timesheets/weekly
- POST /timesheets/:id/worker-sign
- POST /timesheets/:id/customer-sign
- POST /timesheets/:id/regenerate

## Documents
- POST /documents/upload
- GET /documents/:id/download
- POST /documents/link

## Email / Export
- POST /timesheets/:id/send-email
- GET /timesheets/:id/pdf
- GET /projects/:id/pdf
- GET /workers/:id/pdf
- GET /customers/:id/pdf

---

## Business Rules

1. Jeder Monteur sieht nur eigene zugewiesene Projekte.
2. Arbeitsbeginn/-ende nur für aktive Projektzuordnung erlaubt.
3. Jede Zeitbuchung speichert Serverzeit.
4. GPS ist bei Mobile-Zeitbuchung Standard, falls Berechtigung vorhanden.
5. Jeder Wochenzettel gilt pro Monteur und Projekt.
6. Kunden- und Monteur-Signatur sind getrennt.
7. Nach finaler Freigabe kann Wochenzettel gesperrt werden.
8. PINs nur gehasht speichern.
9. Dokumente versionierbar/ersetzbar planen.
10. Alle relevanten Änderungen auditieren.

---

## Empfohlene Releases / Phasen

## Phase 1 – MVP
Ziel: produktiv nutzbarer Kern

Umfang:
- Auth
- Kunden
- Niederlassungen
- Ansprechpartner
- Projekte
- Monteure
- Projektzuordnung
- Mobile Clock-In/Clock-Out mit GPS
- Pausenregel
- Wochenzettel-Generierung
- Monteur-Signatur
- Kunden-Signatur
- PDF-Export Wochenzettel
- Dokument-Upload für Projekte
- Dark/Light Mode
- Docker Setup

## Phase 2
- Fahrzeuge
- Werkzeug/PSA-Verwaltung
- Kiosk-Modus verbessern
- E-Mail-Versand mit Vorlagen
- Reports
- CSV/XLSX Export
- bessere Kalender-/Einsatzplanung

## Phase 3
- Mehrsprachigkeit
- Benachrichtigungen
- Offline-Pufferung mobile Eingaben
- Hintergrundsync
- automatische Abrechnungsgrundlage / Rechnungsmodul
- erweiterte Dashboards

---

## Nichtfunktionale Anforderungen

- saubere modulare Architektur
- vollständige TypeScript-Typisierung
- Validierung aller Eingaben
- responsive UI
- Docker-first Setup
- GitHub-kompatibler Workflow
- einfache Serverbereitstellung via pull + docker compose up -d
- Backups für DB und Dokumente planbar
- Logging + Error Handling
- DSGVO-bewusster Umgang mit personenbezogenen Daten

---

## Docker / Repo-Struktur – Empfehlung

```text
repo/
  apps/
    web/
    api/
  packages/
    ui/
    config/
    types/
  prisma/
  docker/
  docs/
  .env.example
  docker-compose.yml
  docker-compose.dev.yml
  Makefile
  README.md
```

Alternative auch als Monorepo mit Turborepo.

Empfehlung:
- **Monorepo mit pnpm + Turborepo**

---

## Konkreter Arbeitsauftrag für Cursor / Claude / Codex

Baut eine produktionsfähige Monorepo-Webanwendung für CRM, Projektverwaltung, Monteurverwaltung, mobile Zeiterfassung mit GPS, Wochen-Stundenzettel mit Monteur- und Kunden-Signatur, Dokumentenmanagement, PDF-Export, E-Mail-Versand und Kiosk-/PIN-Modus.

### Verbindliche technische Vorgaben
- Monorepo mit pnpm
- Frontend: Next.js + TypeScript + Tailwind + shadcn/ui
- Backend: NestJS oder Express/Fastify in TypeScript
- Datenbank: PostgreSQL + Prisma
- Storage: S3-kompatibel, lokal via MinIO
- Docker Compose für dev und prod
- saubere Rollen-/Rechtebasis
- vorbereitete Mehrsprachigkeit
- Hell-/Dunkelmodus
- Theme-/Background-Konfiguration separat

### Verbindliche fachliche Vorgaben
- Kunden mit Niederlassungen und Ansprechpartnern
- Projekte mit Kunde, Ort, Zeitraum, Unterkunft, Dokumenten
- Monteure mit PIN-Login, Projektzuordnung, Fahrzeugen, Werkzeug/PSA
- Mobile Arbeitsbeginn-/Arbeitsende-Erfassung pro Projekt mit GPS
- Pausenabzug über Regeln
- Wochenzettel pro Monteur und Projekt
- separate Signatur von Monteur und Kunde
- PDF-Export und E-Mail-Versand
- Audit-Log für wichtige Änderungen

### Erwartete erste Deliverables
1. vollständige Zielarchitektur
2. Domänenmodell / ERD
3. Prisma-Schema
4. Docker-Setup
5. Basis-Auth + Rollenmodell
6. CRUD für Kunden/Projekte/Monteure
7. Mobile Clock-In/Clock-Out Flow
8. Wochenzettel-Generator
9. Signatur-Komponente
10. PDF-Export erster Version

### Erwartete Arbeitsweise
- zuerst Architektur und Datenmodell finalisieren
- dann Grundgerüst aufsetzen
- dann Module iterativ implementieren
- jedes Modul mit Seed-Daten, Beispielen und Testfällen
- keine halbfertigen UI-Dummys ohne Backend-Anbindung
- bevorzugt echte End-to-End-Flows statt isolierter Mockups

---

## Offene Punkte für spätere Entscheidung

1. echtes Rechnungsmodul ja/nein
2. Offline-Fähigkeit für Monteure ja/nein
3. automatische Kalenderplanung mit Drag & Drop
4. Mandantenfähigkeit falls mehrere Firmen genutzt werden
5. erweiterte Lohn-/Kostenlogik
6. DATEV-/Buchhaltungsanbindung
7. digitale Lieferscheine / Materialverbrauch im Projekt

---

## Umsetzungsempfehlung für Start

Startet mit einem **klaren MVP**, nicht mit allem gleichzeitig.

### Reihenfolge
1. Auth / Rollen
2. CRM
3. Projekte
4. Monteure
5. Projektzuordnung
6. Zeiterfassung + GPS
7. Wochenzettel
8. Signatur
9. PDF / E-Mail
10. Fahrzeuge / Werkzeug / Reports

---

## Definition of Done für MVP

Das MVP ist fertig, wenn:
- Kunden, Niederlassungen, Ansprechpartner angelegt werden können
- Projekte mit Ort und Zeitraum angelegt werden können
- Monteure angelegt und Projekten zugeordnet werden können
- Monteure mobil per PIN ihre Zeiten je Projekt erfassen können
- GPS beim Ein-/Ausstempeln gespeichert wird
- pro Woche und Monteur ein Wochenzettel erzeugt wird
- Monteur und Kunde separat unterschreiben können
- ein PDF exportiert und per E-Mail versendet werden kann
- alles in Docker lokal und auf Server startbar ist

---

## Wichtig

Code und Architektur sollen so aufgebaut werden, dass später ohne großen Umbau ergänzt werden kann:
- Mehrsprachigkeit
- Offline-Mobile-Flow
- Rechnungsmodul
- Einsatzplanung/Kalender
- Material-/Werkzeuglogik
- tiefere Reporting-Funktionen

