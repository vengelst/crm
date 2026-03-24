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

## Dokumentation

- `workstatus.md` ist die laufende Status- und Verlaufsdatei fuer dieses Projekt.
- Vor groesseren Aufgaben soll `workstatus.md` gelesen werden.
- Nach groesseren Umsetzungen, Tests oder Pruefrunden wird `workstatus.md` aktualisiert.

## Wichtiger Hinweis zur Projektstruktur

- Fuer dieses Projekt soll aktuell keine feste Trennung in `Backend` und `Frontend` angenommen werden.
- Dokumentation, Planung und Aufgabenbeschreibungen sollen allgemein formuliert werden, solange die Architektur nicht verbindlich festgelegt ist.
- Keine technische Struktur als abgeschlossen darstellen, wenn sie noch im Fluss ist.
