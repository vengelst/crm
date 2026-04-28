# Checkliste: Sicherung und Zurueckspielen (vivahome / aehnlicher Host)

Ergänzung zum Skript **`vivahome-sicherung.sh`**. Nicht alles kann (oder soll) automatisch laufen — diese Punkte bewusst prüfen.

**Ordner im Arbeits-Repository:** Nur **Ablageort** — gemeint ist immer der **gesamte Host** und **alle** Apps darauf. **`restore`** ersetzt **nicht** die Installation von Docker, WireGuard, PHP, Certbot usw.; das ist **Host-Setup** (siehe unten), typisch **vor** dem ersten `restore` auf einem neuen System. **Warum die Skripte nicht „von selbst“ unter `/tmp/sicherung` liegen:** Kurz erklärt im **`README.md`** (Abschnitt *Warum lagen die Skripte nicht …*).

**Allgemeiner Server (Host-Pakete):** massgeblich nur auf dem **Server** unter **`/tmp/sicherung`** — **`vivahome-sicherung.sh`** und **`neuserver-host-setup.sh`** dort ablegen (kein fester Pfad auf einem Arbeits-PC; `vivahome` bei Bedarf einmal per `scp` vom Arbeits-Repo auf den Server, `neuserver` z. B. aus dem README-Anhang auf dem Server als Datei anlegen). Nach **`backup`** sind beide Skripte im Bundle und wandern mit **`scp -r`** nur als **Kopie** auf einen Rechner zum Archivieren.

## Vor dem Backup (Altserver)

- [ ] **Beide Skripte** ausschließlich unter **`/tmp/sicherung/`** (bzw. unter **`$VIVAHOME_SICHERUNG_ROOT`**) ablegen und **`bash /tmp/sicherung/vivahome-sicherung.sh backup`** ausführen — `neuserver-host-setup.sh` muss **vor** dem Backup in diesem Ordner liegen, damit es ins Bundle kommt. Nur bei Sonderfall: **`VIVAHOME_HOST_SETUP_SCRIPT`** auf eine vorhandene Datei setzen.
- [ ] **Wartungsfenster** absprechen (bei Volume-Tars: kurzer Stop von `crm-minio` / `crm-api`).
- [ ] **Compose- und Containernamen** stimmen mit dem Skript überein (`crm-postgres`, `leitstelle-db-1`, …) — sonst Skript anpassen.
- [ ] **Zusätzliche Daten**: mTower-Prometheus/Grafana-Volumes, MQTT-Persistenz, weitere Postgres-Instanzen → Skript erweitern oder manuell sichern.
- [ ] **Zielserver ohne Plesk**: Es wird **kein** Plesk mehr installiert. Die Sicherung kann trotzdem **alte nginx-`include`-Zeilen** zu `plesk.conf.d` / Plesk enthalten — nach `restore` in **`nginx.conf`** und **`sites-enabled`** pruefen, Plesk-Referenzen entfernen oder Pfade anpassen, dann **`nginx -t`**. **Mail** ist fuer dieses Vorgehen **nicht** relevant.
- [ ] **Firewall** (`ufw status`, `nft list ruleset`): Regeln dokumentieren oder exportieren.
- [ ] **SSH**: `authorized_keys` sichern (oder neu deployen); **Host-Keys** bewusst neu oder übernehmen.
- [ ] **Geheimnisse**: `.env`-Kopien nur an sicheren Ort; **nach Kompromittierung** alle Secrets rotieren, nicht blind alte `.env` weiterverwenden.

## Übertragung

- [ ] Gesamten Ordner **`sicherung`** inkl. **`vivahome-sicherung.sh`** im Wurzelverzeichnis kopieren (Checksumme optional: `sha256sum`).
- [ ] Bei abweichendem Zielpfad auf dem Neuserver: **`export VIVAHOME_SICHERUNG_ROOT=/pfad/zum/sicherung`** vor `restore`, oder nach **`/tmp/sicherung`** legen.

## Zielhost (Vorbereitung — **vor** `vivahome-sicherung.sh restore`)

- [ ] OS-Patches, **Zeit** (NTP), **Hostname** (optional).
- [ ] **Fehlende Host-Pakete ergänzen** (wenn nötig): `bash /tmp/sicherung/neuserver-host-setup.sh` — **kein** neuer Server, nur **apt-Nachinstall** auf der **bestehenden** Linux-Installation (mindestens Docker + nginx; optional `--wireguard`, `--php`, `--certbot`, `--all` — Punkte siehe README **Host-Checkliste** im Arbeits-Repo).
- [ ] **Docker** + **Compose v2**, `docker compose version` ok; Dienst **docker** aktiv.
- [ ] **nginx** installiert; **certbot** falls Zertifikate neu statt Tar.
- [ ] **PHP-FPM** + passende Version, falls vivahome.de PHP nutzt (Skript legt optional `etc-php`-Tar zurück).
- [ ] **WireGuard** / **Firewall** / **SSH** wie auf dem Altsystem dokumentiert — nicht Bestandteil von `restore`.
- [ ] **Ports** frei wie auf dem Altsystem (3800/3801, 9000, mTower-Ports, …).

## Nach `restore`

- [ ] **`nginx -t`** und Seiten testen (HTTP→HTTPS, APIs, MinIO-Konsole falls exponiert).
- [ ] **`docker ps`**, Logs der APIs, **ein Login** in die betroffenen Web-Apps.
- [ ] **Cron**: Inhalt von `99_meta/root-crontab.txt` prüfen und bei Bedarf **`crontab -e`**.
- [ ] **Monitoring / Backups** auf dem neuen Host wieder anbinden.
- [ ] **DNS** auf neue IP zeigen lassen, TTL vorher verkürzen wenn möglich.

## Rechtliches / Betrieb

- [ ] **Aufbewahrung** der Sicherung (verschlüsseltes Archiv, Zugriffsrechte) — enthält **private Keys** und **Datenbanken**.

## Apps als `*.tar.gz`

- Backup legt **`05_crm.tar.gz`** usw. ab (**ohne** `.git` im Archiv — auf dem Ziel ggf. `git clone` + Konfig aus `.env`).
- **Restore** erkennt weiterhin alte Pfade **`05_app-crm/repo/`** (Legacy).

## Optional später im Skript

- Weitere **`docker compose`-Dateien** (z. B. fest `docker-compose.staging.yml`).
- **Redis** / **Queue**-Volumes, falls eingeführt.
- **Log-Rotation** und **Log-Pfade** unter `/var/log`.
