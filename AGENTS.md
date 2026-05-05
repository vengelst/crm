# Project Instructions

## Zusammenarbeit

- Wir planen Anforderungen, Prioritaeten und die naechsten Schritte gemeinsam.
- Claude setzt Codeaenderungen und technische Umsetzungen um.
- Codex unterstuetzt bei Analyse, Review, Tests, Verifikation und Dokumentation.
- Codex soll keinen Produktivcode aendern, ausser dies wird ausdruecklich verlangt.

## Arbeitsregel fuer neue Aufgaben

- Neue Umsetzungen sollen zuerst als klare Aufgabenbeschreibung fuer Claude formuliert werden.
- Wenn ein Stand geprueft, getestet oder bewertet werden soll, ist das eine Aufgabe fuer Codex.
- Wenn unklar ist, ob eine direkte Umsetzung gewuenscht ist, erst rueckfragen.

## Dev-Docker-Verifikation nach jeder Claude-Umsetzung (verbindlich)

- Unmittelbar nach jeder Umsetzung durch Claude muss sichergestellt werden, dass der **lokale Dev-Docker-Stand** die Aenderungen sichtbar unter **http://localhost:3800** ausliefert (Build/Container/Compose wie im Projekt vorgesehen; bei Bedarf Neustart oder erneutes Hochfahren, bis der aktuelle Stand erreichbar ist).
- **Alte oder produktionsnahe Containerstaende** duerfen **nicht** als Referenz fuer die lokale Entwicklung gelten. Nur der aktive Dev-Stack auf dem Rechner des Umsetzers zaehlt als gueltiger Nachweis, dass die Aenderung lokal sichtbar ist.
- Nach **jeder Codeaenderung** an `apps/api/**` oder `apps/web/**` sind die Services `api` und `web` **immer aktiv neu zu laden** (kein Raten, kein Auslassen). Standardvorgehen: `docker compose up -d --build api web`; mindestens jedoch ein expliziter Neustart beider Services, sodass der laufende Stand sicher den letzten Code enthaelt.

## Dokumentation

- `workstatus.md` ist die laufende Status- und Verlaufsdatei fuer dieses Projekt.
- Vor groesseren Aufgaben soll `workstatus.md` gelesen werden.
- Nach groesseren Umsetzungen, Tests oder Pruefrunden wird `workstatus.md` aktualisiert.

## Verbindliche i18n-Regel

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

## Fachliche Leitplanken

- Monteure arbeiten ausschliesslich ueber den `Kiosk / Monteur`-Modus mit persoenlicher PIN.
- Es soll keine fachliche Vermischung von Benutzer-Login und Monteur-Login geben:
  - Benutzer: E-Mail + Passwort
  - Monteure: nur PIN im Kiosk
- Der Kiosk ist die einzige Arbeitsoberflaeche fuer Monteure.
- Monteure duerfen:
  - eigene zugeordnete Projekte sehen
  - Projektdetails oeffnen
  - vorhandene Projektdokumente lesen
  - Dokumente zum Projekt hochladen
  - Arbeit beginnen und beenden
  - eigene Stundenzettel sehen und signieren lassen
- Monteure duerfen nicht:
  - Projekte loeschen oder verwalten
  - Kunden verwalten
  - Dokumente loeschen
  - fremde oder abgeschlossene Stundenzettel veraendern

## Stundenzettel-Regeln

- Stundenzettel sind zentraler Leistungs- und Abrechnungsnachweis.
- Jeder Monteur hat eigene Stundenzettel pro Projekt und Kalenderwoche.
- Stundenzettel muessen sichtbar sein in:
  - Kiosk / Monteur
  - Projekt
  - Kunde
  - Auswertung
- Nach Kunden-Signatur gilt der Stundenzettel als abgeschlossen:
  - Status `COMPLETED`
  - `lockedAt` gesetzt
  - keine weitere Aenderung oder Neuerzeugung fuer diesen Zettel

## Umsetzungs- und Pruefregel

- Wenn neue Anforderungen den Kiosk, PIN-Logik, Stundenzettel oder Signaturfluss betreffen, ist immer gegen diese Leitplanken zu pruefen.
- Bei Abweichungen zwischen alter Implementierung und fachlicher Vorgabe ist die fachliche Vorgabe massgeblich und in `workstatus.md` nachzuziehen.

## Wichtiger Hinweis zur Projektstruktur

- Fuer dieses Projekt soll aktuell keine feste Trennung in `Backend` und `Frontend` angenommen werden.
- Dokumentation, Planung und Aufgabenbeschreibungen sollen allgemein formuliert werden, solange die Architektur nicht verbindlich festgelegt ist.
- Keine technische Struktur als abgeschlossen darstellen, wenn sie noch im Fluss ist.
