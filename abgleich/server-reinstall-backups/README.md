# Server-Reinstall: Nginx-Sicherung (vivahome)

**Scope:** Dieser Ordner liegt im **Arbeits-Repository** nur **zufällig / aus Ablage**. Inhalt und Skripte betreffen den **gesamten Server** und **alle** darauf laufenden Anwendungen (Websites, nginx, Docker-Stacks unter `/opt`, …) — nicht eine einzelne App.  
**Wiederanlauf auf dem Zielhost:** Alles massgeblich nur auf dem **Server** unter **`/tmp/sicherung`**: Sicherungsbaum, **`vivahome-sicherung.sh`**, **`neuserver-host-setup.sh`**. **`neuserver-host-setup.sh` wird nicht im Repo-Ordner gepflegt** — nur auf dem Host unter `/tmp/sicherung` (oder aus dem letzten **`backup`**-Bundle: `99_meta/` bzw. Root des Sicherungsbaums). **`vivahome-sicherung.sh`** kann bei Bedarf aus dem Arbeits-Repo per `scp` auf den Server kopiert werden; der **volle Text** von `neuserver-host-setup.sh` liegt **nur auf dem Server** (oder im Bundle). **Zuerst** — falls Docker/nginx noch fehlen — `bash /tmp/sicherung/neuserver-host-setup.sh` (z. B. `--all`). **Danach** `bash /tmp/sicherung/vivahome-sicherung.sh restore`. `restore` spielt die Sicherung ein und **installiert keine** Host-Pakete per `apt`.

Stand: manuell erzeugt vor Neuaufsetzen des Hosts.

## Dateien

| Datei | Inhalt |
|--------|--------|
| `nginx-etc-vivahome-*.tar.gz` | Archiv von **`/etc/nginx`** vom Altserver (kann noch Plesk-Pfade/`plesk.conf.d` enthalten). **Neuer Server ohne Plesk:** Includes pruefen (README-Abschnitt). |
| `nginx-T-expanded-vivahome-*.conf` | Ausgabe von **`nginx -T`** (zusammengefuehrte effektive Konfiguration inkl. aller Includes). Die ersten Zeilen sind die Syntaxpruef-Meldung von nginx. |

## Wiederherstellung (neuer Server, grob)

1. Paket entpacken: `sudo tar xzf nginx-etc-vivahome-*.tar.gz -C /` (legt `etc/nginx/` an — Zielpfad anpassen oder mit `-C /` als root nutzen).
2. Pfade, Zertifikate, Upstreams und Plesk-spezifische Includes **gegen die neue Umgebung** pruefen.
3. `nginx -t` ausfuehren, dann Dienst neu laden.

**Hinweis:** SSL-Zertifikatdateien liegen typischerweise **nicht** unter `/etc/nginx`, sondern z. B. unter Plesk- oder Let’s-Encrypt-Pfaden — bei Bedarf separat sichern.

## Git

Inhalt dieses Ordners (Archive und expanded `.conf`) ist per `.gitignore` vom Commit ausgeschlossen, damit keine Hostdetails versehentlich ins Repo gelangen. Bei Bedarf bewusst ausserhalb des Repos archivieren.

---

## Hauptskript: Backup & Restore (`vivahome-sicherung.sh`)

**Vorgabe auf dem Server:** Alle Skripte liegen unter **`/tmp/sicherung`** (bei abweichendem Pfad: **`VIVAHOME_SICHERUNG_ROOT`** — dann eben dort). **`vivahome-sicherung.sh`** und **`neuserver-host-setup.sh`** nur in diesem Ordner; Aufruf immer z. B. **`bash /tmp/sicherung/vivahome-sicherung.sh`** bzw. **`bash /tmp/sicherung/neuserver-host-setup.sh`**. Liegt `vivahome` beim Start ausserhalb dieses Ordners, erscheint ein **Hinweis** im Log. Ohne Argumente (TTY): **Menue**; in Cron/Skripten **`backup`** oder **`restore`**.

### Warum lagen die Skripte nicht „von selbst“ in `/tmp/sicherung`?

**`/tmp/sicherung` ist kein Systempaket**, sondern euer **Arbeits- und Sicherungsordner** auf dem Server. Linux legt ihn nicht automatisch mit zwei Skripten an. So kommen die Dateien dort hin:

| Situation | Was passiert |
|-----------|----------------|
| **Erstes Backup** | `mkdir -p /tmp/sicherung` — **`vivahome-sicherung.sh`** einmal per `scp` auf den Server; **`neuserver-host-setup.sh`** **nur auf dem Server** unter `/tmp/sicherung` anlegen (kein Repo-Pfad) oder aus einem älteren Bundle übernehmen. Fehlt `neuserver` noch unter `$ROOT`, kopiert `backup` sie zu Beginn **nur**, wenn sie **im gleichen Verzeichnis wie das gestartete** `vivahome-sicherung.sh` liegt. |
| **Nach `backup`** | `vivahome-sicherung.sh` wird immer nach **`$ROOT/`** und **`$ROOT/99_meta/`** geschrieben; `neuserver-host-setup.sh` ebenfalls (wenn vorhanden). Im heruntergeladenen Sicherungsordner liegen beide Skripte dann **mit bei**. |
| **Zielhost (z. B. neue VM)** | Gesamten Ordner (z. B. per `scp -r`) nach **`/tmp/sicherung`** legen — darin sind die Skripte aus dem letzten Backup. **Zuerst** `neuserver-host-setup.sh`, falls Pakete fehlen (**Ergänzung** der bestehenden Installation), **danach** `vivahome-sicherung.sh restore`. |

**Zwei Rollen:** **`vivahome-sicherung.sh`** sichert und stellt **Anwendungsdaten, nginx, `/opt`-Stacks, Datenbanken** wieder her. **`neuserver-host-setup.sh`** **installiert keinen neuen Server**; es **ergänzt** auf einem **bereits vorhandenen** Debian/Ubuntu per `apt` u. a. Docker, Compose, nginx (optional PHP, Certbot, WireGuard-Pakete, git). Der gemeinsame Ordner **`/tmp/sicherung`** bündelt **ein** übertragbares Paket inkl. Skripte.

| Modus | Aktion |
|--------|--------|
| **`backup`** | Schreibt nach **`/tmp/sicherung`** (oder `VIVAHOME_SICHERUNG_ROOT`). **Inhalt des Zielordners wird vom Skript nicht geloescht** — bei Bedarf vorher selbst leeren. **Zu Beginn:** fehlt **`neuserver-host-setup.sh`** unter `$ROOT`, liegt es aber **im gleichen Verzeichnis wie das gestartete** `vivahome-sicherung.sh`, wird es nach `$ROOT` kopiert. Umfang: **nginx**, Let’s Encrypt, statische Sites, **`/opt`-Apps** als `05_crm.tar.gz` … `08_mtower.tar.gz` (Dateinamen historisch), Postgres-**Dumps**, **MinIO**- und **app_storage**-Volumes des vivahome-Stacks. **Am Ende:** **`vivahome-sicherung.sh`** und **`neuserver-host-setup.sh`** nach **`$ROOT/`** und **`99_meta/`** (Quellen fuer `neuserver`: `$ROOT`, ggf. gleiches Verzeichnis wie vivahome, **`VIVAHOME_HOST_SETUP_SCRIPT`**). |
| **`restore`** | Auf dem **Zielhost** (root): erwartet den Sicherungsbaum **und** bereits installierte **nginx** + **Docker** + **Compose** (sonst Abbruch mit Hinweis). **ROOT** automatisch, wenn das Skript unter **`…/sicherung/vivahome-sicherung.sh`** oder **`…/sicherung/99_meta/vivahome-sicherung.sh`** liegt; sonst **`/tmp/sicherung`** oder Umgebung **`VIVAHOME_SICHERUNG_ROOT`**. Stellt Nginx/TLS/Websites, `/opt`-Apps inkl. `.env`, `docker compose up`, **pg_restore**, genannte Docker-Volume-Tars wieder her. **Kein** `apt install` für WireGuard/PHP usw. |

Auf den Server kopieren und ausfuehren (**beide Skripte unter `/tmp/sicherung`**):

```bash
# Altserver — nur auf dem Server: Ordner, vivahome per scp, neuserver nur unter /tmp/sicherung auf dem Host
ssh root@DEIN-SERVER "mkdir -p /tmp/sicherung"
# vivahome einmalig vom Rechner mit Arbeitskopie (lokaler Pfad anpassen):
scp /pfad/zu/vivahome-sicherung.sh root@DEIN-SERVER:/tmp/sicherung/
# neuserver-host-setup.sh: nur auf dem Server unter /tmp/sicherung pflegen (z. B. aus letztem Backup-Bundle kopieren oder dort editieren), dann:
ssh root@DEIN-SERVER "sed -i 's/\r$//' /tmp/sicherung/vivahome-sicherung.sh /tmp/sicherung/neuserver-host-setup.sh && chmod +x /tmp/sicherung/*.sh"
ssh root@DEIN-SERVER "bash /tmp/sicherung/vivahome-sicherung.sh backup"
# Gesamtpaket herunterladen (Beispiel):
# scp -r root@DEIN-SERVER:/tmp/sicherung ./sicherung-vivahome

# Zielhost — gesamten Ordner nach /tmp/sicherung hochladen; falls Docker/nginx fehlen, Pakete ergaenzen:
ssh root@DEIN-NEU-SERVER "sed -i 's/\r$//' /tmp/sicherung/*.sh && chmod +x /tmp/sicherung/*.sh"
ssh root@DEIN-NEU-SERVER "bash /tmp/sicherung/neuserver-host-setup.sh --all"   # oder --help / ohne --all
ssh root@DEIN-NEU-SERVER "bash /tmp/sicherung/vivahome-sicherung.sh restore"
# Alternativ anderer Pfad:
# export VIVAHOME_SICHERUNG_ROOT=/mnt/usb/sicherung && bash /mnt/usb/sicherung/vivahome-sicherung.sh restore
```

**Voraussetzungen vor `restore`:** Docker + **`docker compose`** (Compose v2: `docker-compose-plugin` oder auf Ubuntu **`docker-compose-v2`**) + nginx auf dem **bestehenden** Zielhost (nach Bedarf per `neuserver-host-setup.sh` **nachinstallieren**); optional PHP (falls `etc-php` mitgesichert wurde).

**Hinweise Restore:**

- **Compose / `.env`:** `docker compose` laedt nur **`.env`** fuer Variablenersetzung im YAML. Liegen Secrets in **`.env.production`** (z. B. Leitstelle), muss **`--env-file .env.production`** genutzt werden — das macht `vivahome-sicherung.sh` beim `compose up` automatisch, wenn **kein** `.env` existiert. **mTower:** Das mitgelieferte `MANIFEST_PG` verweist auf **`mtower-test-postgres-1`**; das Skript startet daher den **Test-Stack** (`-p mtower-test`, `docker-compose.test.yml`, `.env.test`). **`/.env.prod.server`** liegt typischerweise **nicht** im Tarball — Prod muesstet ihr separat betreiben und `MANIFEST_PG` anpassen.
- **Host-Ports:** Wenn ein Stack nicht startet („port is already allocated“), kollidiert ein **Host-Port** mit einem anderen Container (z. B. Belegscanner **3000** vs. mTower-Test-Backend) — einen Dienst umziehen oder kurz stoppen, dann **`docker compose … up -d`** erneut.
- Postgres-Container muessen die **gleichen Namen** haben wie beim Backup (`crm-postgres`, `leitstelle-db-1`, `belegscanner-db-1`, `mtower-test-postgres-1`) — sonst Dumps in `10_datenbanken/` manuell einspielen.
- Volume-Restore fuer MinIO/app_storage nutzt die Container **`crm-minio`** und **`crm-api`** (Namen im Skript fest); Archivnamen enthalten den Volume-Namen (`crm_vol__….tar.gz`).
- `root-crontab.txt` wird **nicht** automatisch importiert (Inhalt pruefen und bei Bedarf `crontab -e`).

Aeltere Variante nur Konfig/Quellen ohne DB/MinIO: **`remote-sicherung-vivahome.sh`** (optional).

Gesamtpaket vom Server auf einen Rechner zum Archivieren (Beispiel PowerShell — **beliebiger** Zielordner):

```powershell
scp -r root@vivahome.de:/tmp/sicherung "D:\Backup\sicherung-vivahome-$(Get-Date -Format yyyyMMdd)"
```

### Ordnerstruktur unter `/tmp/sicherung`

| Ordner | Inhalt (Bezug zu deinen Hosts) |
|--------|--------------------------------|
| `01_nginx/` | Kopie von `/etc/nginx` + `nginx-T-expanded.txt` (alle Sites: **crm.vivahome.de** in `vivahome.de`, **beleg.vivahome.de**, **leitstelle.vivahome.de**, **mtower.mondoma.eu**, **vivahome.de**, **s3.vivahome.de**) |
| `02_letsencrypt/` | `etc-letsencrypt.tar.gz` — **private Keys** enthalten |
| `03_static-mtower-www-html/` | Tar von `/var/www/html` — statische **Mondoma/MTower**-Marketingseite (laut `index.html`) |
| `04_static-vivahome/` | Tar von `/var/www/vivahome` — **vivahome.de**-Website-Dateien |
| **`05_crm.tar.gz`** … **`08_mtower.tar.gz`** | je ein **gzip-komprimierter Tarball** des jeweiligen **`/opt/...`**-Inhalts (ohne `node_modules`, `.next`, `dist`, `.turbo`, `coverage`, **`.git`**). **`.env`** liegt im Archiv. **Alte Sicherungen** mit `05_app-crm/repo/` usw. werden beim **restore** weiter unterstuetzt. |
| `10_datenbanken/` | `MANIFEST_PG` + Postgres-**custom-format**-Dumps (`*.dump`) |
| `11_crm_docker_volumes/` | `MANIFEST_VOLUMES` + `crm_vol__*.tar.gz` (MinIO-Daten, **app_storage**; Ordnername historisch) |
| `99_meta/` | `inventar.txt` (docker ps, volumes, df), `root-crontab.txt`, optional `etc-php-snippets.tar.gz`; bei erfolgreichem Fund **`neuserver-host-setup.sh`**; **`neuserver-host-setup.sh`** liegt zusaetzlich im **Sicherungsroot** |

**Hinweis:** Im Nginx liegt **Belegscanner** unter dem Hostnamen **`beleg.vivahome.de`** (Symlink in `sites-enabled`), nicht zwingend `belegscanner.vivahome.de` — bei DNS-Umstellung beachten.

### Was `vivahome-sicherung.sh` **zusaetzlich** nicht abdeckt

- **mTower-/Leitstelle-/Belegscanner-Docker-Volumes** (ausser Postgres — dort nur **Dump**): z. B. Prometheus-Daten, MQTT — bei Bedarf Skript erweitern oder manuell `docker volume` sichern.
- **Firewall**, **SSH-Keys** — wie oben. **Plesk** und **Mail** werden auf dem Zielsystem nicht eingerichtet; **DNS** nur falls Domains auf die neue IP zeigen sollen (Checkliste).
- Nach **Kompromittierung**: lieber **frische** Images/Volumes + Dumps/MinIO aus **sauberer** Sicherung; Secrets in `.env` rotieren.

Weitere Pfade (z. B. zweites Document-Root) im Skript `vivahome-sicherung.sh` ergaenzen.

---

## Weitere Überlegungen (manuell / Checkliste)

Siehe **`CHECKLISTE-SICHERUNG-RESTORE.md`** (Wartungsfenster, Firewall, SSH, **nginx ohne Plesk**, DNS, Secrets nach Incident, optionale Docker-Volumes).

### Host-Checkliste (nur Server, Kurz)

- Zeit / NTP, `apt upgrade`, Firewall (22/80/443), Docker + Compose (`docker-compose-plugin` oder auf Ubuntu **`docker-compose-v2`**), `nginx`, nach Restore: alte Plesk-`include`-Zeilen in nginx entfernen, `nginx -t`, optional certbot, php-fpm, WireGuard-Pakete, DNS bei neuer IP.

### Neuer Server **ohne Plesk**

Die gesicherte **`/etc/nginx`-Kopie** kann noch **`include ... plesk.conf.d`** o. ae. enthalten (vom Altsystem). Nach **`restore`** pruefen:

1. **`nginx.conf`** und Dateien unter **`sites-enabled`**: Zeilen mit **`plesk`** oder **`psa`** entfernen oder auskommentieren, falls der Pfad auf dem Neusystem nicht existiert.
2. Ordner **`/etc/nginx/plesk.conf.d`**: wenn leer/unbenutigt, kann er bleiben oder weg — wichtig ist, dass **keine** `include`-Zeile auf fehlende Dateien zeigt.
3. **`nginx -t`** und **`systemctl reload nginx`** — erst danach DNS auf die neue IP zeigen.

---

## `neuserver-host-setup.sh` (nur auf dem Server)

Der **vollständige Skripttext** wird **nicht** im Ordner `abgleich/server-reinstall-backups/` im Repository gepflegt.

- **Ablage:** immer **`/tmp/sicherung/neuserver-host-setup.sh`** auf dem Host (neben `vivahome-sicherung.sh`).
- **Quellen:** aus einem früheren **`backup`**-Bundle (`99_meta/` oder Sicherungsroot), vom Altserver kopieren, oder auf dem Zielhost mit `nano`/`vim` pflegen.
- **Rolle:** ergänzt ein bestehendes Debian/Ubuntu per `apt` mit u. a. `docker.io`, nginx; Compose-Reihenfolge: **`docker-compose-plugin`** (wo im Archiv vorhanden, z. B. Docker-APT), sonst **`docker-compose-v2`** (Ubuntu/Debian *universe*, liefert `docker compose`), sonst **GitHub**-Fallback nach `/usr/local/lib/docker/cli-plugins/`. Auf Ubuntu 24.04 existiert oft **kein** Paket `docker-compose-plugin` — dann **`apt install docker-compose-v2`** (Nachinstallation wie bei euch). Optionen: `--all`, `--php`, `--certbot`, `--wireguard`, `--git` (siehe `bash /tmp/sicherung/neuserver-host-setup.sh --help` auf dem Server).
- **CRLF:** bei Bedarf `sed -i 's/\r$//' /tmp/sicherung/neuserver-host-setup.sh`, dann `chmod +x`.
