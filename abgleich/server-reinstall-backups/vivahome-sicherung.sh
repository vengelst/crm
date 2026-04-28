#!/usr/bin/env bash
#
# vivahome-sicherung.sh — Backup & Restore auf dem Server (root).
#
# Scope: Dieses Skript liegt im Arbeits-Repository nur aus Zufall/Ablage — gesichert/wiederhergestellt
# wird der **gesamte betroffene Host** (nginx, TLS, statische Sites, alle /opt-Stacks:
# u.a. /opt/crm, Belegscanner, Leitstelle, mTower, …). **restore** installiert **keine** Host-Pakete
# (Docker, WireGuard, PHP, …); das ist vorher mit neuserver-host-setup.sh / Checkliste zu erledigen
# (neuserver **ergaenzt** nur die bestehende Linux-Installation per apt — **kein** neuer Server aus dem Skript;
# liegt typisch **gemeinsam mit diesem Skript** unter /tmp/sicherung/).
#
#   ./vivahome-sicherung.sh backup
#     Schreibt nach $ROOT (Standard /tmp/sicherung). Verzeichnis vorher selbst leeren/leeren lassen.
#     Vorgabe: **beide** Skripte unter /tmp/sicherung ($ROOT). Liegt neuserver nur im **gleichen Verzeichnis**
#     wie dieses Skript (z. B. /tmp/sicherung), wird es zu Beginn des Backups nach $ROOT kopiert, falls dort noch fehlt.
#     Am Ende: neuserver in ROOT + 99_meta (Quellen siehe copy_neuserver_host_setup_into_backup).
#     Apps unter /opt je als 05_crm.tar.gz … (gzip), nicht als Millionen Einzeldateien.
#     Plesk (Panel) wird nicht mitinstalliert: Ziel ist ein Server **ohne Plesk**. Mitgesichert wird nur
#     nginx/LetzEncrypt/Apps/Docker-relevantes; nach restore ggf. Plesk-Referenzen in nginx entfernen (siehe README).
#
#   ./vivahome-sicherung.sh restore
#     Sicherungsbaum: Standard /tmp/sicherung (oder Umgebung VIVAHOME_SICHERUNG_ROOT).
#     Wenn das Skript *im* Sicherungsordner liegt (siehe backup), wird ROOT automatisch erkannt:
#       bash /tmp/sicherung/vivahome-sicherung.sh restore
#       bash /pfad/zum/sicherung/99_meta/vivahome-sicherung.sh restore
#     Stellt Nginx, Let's Encrypt, statische Sites, /opt-Apps, Postgres-Dumps,
#     Docker-Volumes (MinIO, app_storage des vivahome-/opt/crm-Stacks) wieder her.
#
# Voraussetzungen backup: bash, rsync, tar, docker.
# Voraussetzungen restore: wie backup + nginx installiert + docker compose (v2 empfohlen).
# Hinweis: CRLF-Zeilenenden entfernen: sed -i 's/\r$//' vivahome-sicherung.sh

set -euo pipefail

SCRIPT_SRC="${BASH_SOURCE[0]}"
if [[ -L "$SCRIPT_SRC" ]]; then
  SCRIPT_SRC="$(readlink -f "$SCRIPT_SRC" 2>/dev/null || readlink "$SCRIPT_SRC")"
fi
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SRC")" && pwd)"

ROOT="/tmp/sicherung"
if [[ -n "${VIVAHOME_SICHERUNG_ROOT:-}" ]]; then
  ROOT="${VIVAHOME_SICHERUNG_ROOT%/}"
elif [[ "$(basename "$SCRIPT_DIR")" == "99_meta" && -d "$SCRIPT_DIR/../01_nginx" ]]; then
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
elif [[ -d "$SCRIPT_DIR/01_nginx/etc-nginx" ]]; then
  ROOT="$SCRIPT_DIR"
fi

log() { echo "[$(date -Iseconds)] $*"; }
die() { echo "FEHLER: $*" >&2; exit 1; }

usage() {
  cat <<EOF
vivahome-sicherung.sh — interaktives Menue ohne Argumente (auf TTY), sonst Befehl als Argument.

  bash $0              Menue (nur wenn stdin/stdout Terminal)
  bash $0 menu         Menue erzwingen
  bash $0 backup       Sicherung nach ROOT schreiben
  bash $0 restore      Aus ROOT zurueckspielen (root); braucht docker+compose+nginx (z. B. bash $ROOT/neuserver-host-setup.sh)
  bash $0 help         Diese Hilfe (-h / --help)

Aktuelles ROOT: $ROOT
(Optional: export VIVAHOME_SICHERUNG_ROOT=/anderer/pfad)

EOF
}

interactive_menu() {
  echo ""
  echo "=== vivahome-sicherung ===  ROOT=$ROOT"
  echo ""
  PS3="Nummer waehlen, dann Enter: "
  select _opt in "Backup - Sicherung nach ROOT schreiben" "Restore - Daten aus ROOT zurueckspielen" "Hilfe anzeigen" "Beenden"; do
    case $REPLY in
      1) MODE=backup; return 0 ;;
      2) MODE=restore; return 0 ;;
      3) usage; exit 0 ;;
      4) exit 0 ;;
      *) echo "Ungueltig — bitte 1 bis 4." ;;
    esac
  done
}

MODE=""
case "${1:-}" in
  backup) MODE=backup ;;
  restore) MODE=restore ;;
  help | -h | --help) usage; exit 0 ;;
  menu) interactive_menu ;;
  "")
    if [[ -t 0 && -t 1 ]]; then
      interactive_menu
    else
      usage
      exit 1
    fi
    ;;
  *)
    usage
    die "Unbekannter Befehl: ${1:-}"
    ;;
esac

[[ "$MODE" == "backup" || "$MODE" == "restore" ]] || die "intern: MODE=$MODE"

# --- Postgres: Dump (laufender Container) ---
pg_dump_container() {
  local container="$1"
  if ! docker ps -a --format '{{.Names}}' | grep -qx "$container"; then
    log "Postgres: Container '$container' nicht vorhanden — uebersprungen."
    return 0
  fi
  if [[ "$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null)" != "running" ]]; then
    log "Postgres: starte '$container' fuer Dump …"
    docker start "$container" >/dev/null || { log "Postgres: Start von '$container' fehlgeschlagen — uebersprungen."; return 0; }
    sleep 4
  fi
  local user db
  user=$(docker exec "$container" printenv POSTGRES_USER 2>/dev/null || echo postgres)
  db=$(docker exec "$container" printenv POSTGRES_DB 2>/dev/null || echo postgres)
  local base safe
  base="${container}__${db}.dump"
  safe=$(echo "$base" | tr '/ ' '__')
  mkdir -p "$ROOT/10_datenbanken"
  log "Postgres: Dump $container → $safe"
  docker exec "$container" pg_dump -U "$user" -d "$db" -Fc -f "/tmp/$safe"
  docker cp "$container:/tmp/$safe" "$ROOT/10_datenbanken/$safe"
  docker exec "$container" rm -f "/tmp/$safe"
  echo "${container}|${user}|${db}|${safe}" >>"$ROOT/10_datenbanken/MANIFEST_PG"
}

# --- Volume per Container-Name (Mountpoint tar) ---
tar_volume_of_container() {
  local container="$1" archive_label="$2"
  if ! docker ps -a --format '{{.Names}}' | grep -qx "$container"; then
    log "Volume: Container '$container' nicht vorhanden — $archive_label uebersprungen."
    return 0
  fi
  mkdir -p "$ROOT/11_crm_docker_volumes"
  local vols vol mp
  vols=$(docker inspect "$container" -f '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}' 2>/dev/null | tr -s ' ' '\n' | grep -v '^$' || true)
  [[ -z "$vols" ]] && { log "Volume: keine named volumes an $container"; return 0; }
  while read -r vol; do
    [[ -z "$vol" ]] && continue
    # Postgres-Daten: nur per pg_dump, nicht als rohes Volume (konsistenter)
    if [[ "$vol" == *postgres* ]]; then
      log "Volume: $vol (Postgres) — nur Dump, kein Volume-Tar."
      continue
    fi
    mp=$(docker volume inspect "$vol" -f '{{ .Mountpoint }}' 2>/dev/null) || continue
    local out="crm_vol__${vol}.tar.gz"
    log "Volume: tar $vol ($container) → $out"
    docker stop "$container" >/dev/null 2>&1 || true
    sleep 2
    tar czf "$ROOT/11_crm_docker_volumes/$out" -C "$mp" .
    echo "${container}|${vol}|${out}" >>"$ROOT/11_crm_docker_volumes/MANIFEST_VOLUMES"
    docker start "$container" >/dev/null 2>&1 || true
    sleep 2
  done <<<"$vols"
}

# --- /opt-App als tar.gz (weniger Dateien fuer Uebertragung; .env liegt im Archiv) ---
# .git ausgeschlossen (Clone vom Remote nach Bedarf); History nur auf dem Server nicht im Bundle.
tar_app_to_backup() {
  local label="$1" src="$2"
  local out="$ROOT/${label}.tar.gz"
  if [[ ! -d "$src" ]]; then
    echo "WARN: $src fehlt" >>"$ROOT/99_meta/warnings.txt"
    return 0
  fi
  log "App: $src → $(basename "$out")"
  tar czf "$out" \
    --exclude=node_modules \
    --exclude='**/node_modules' \
    --exclude=.next \
    --exclude=dist \
    --exclude=.turbo \
    --exclude=coverage \
    --exclude=.git \
    -C "$src" .
}

# Host-Basis-Skript ins Bundle — Quelle nur $ROOT oder (falls vivahome dort liegt) gleiches Verzeichnis, optional VIVAHOME_HOST_SETUP_SCRIPT
copy_neuserver_host_setup_into_backup() {
  local src="" meta="$ROOT/99_meta/neuserver-host-setup.sh" rootf="$ROOT/neuserver-host-setup.sh"
  local rr sd
  rr="$(readlink -f "$ROOT" 2>/dev/null || echo "$ROOT")"
  sd="$(readlink -f "$SCRIPT_DIR" 2>/dev/null || echo "$SCRIPT_DIR")"
  if [[ -f "$rootf" ]]; then
    src="$rootf"
  elif [[ "$sd" == "$rr" && -f "$SCRIPT_DIR/neuserver-host-setup.sh" ]]; then
    src="$SCRIPT_DIR/neuserver-host-setup.sh"
  elif [[ -n "${VIVAHOME_HOST_SETUP_SCRIPT:-}" && -f "${VIVAHOME_HOST_SETUP_SCRIPT}" ]]; then
    src="${VIVAHOME_HOST_SETUP_SCRIPT}"
  fi
  if [[ -n "$src" ]]; then
    if [[ "$src" -ef "$rootf" ]]; then
      cp -a "$src" "$meta"
      chmod +x "$meta"
      log "neuserver-host-setup.sh bereits unter $ROOT — Kopie nach 99_meta."
    else
      cp -a "$src" "$rootf"
      cp -a "$src" "$meta"
      chmod +x "$rootf" "$meta"
      log "neuserver-host-setup.sh ins Backup kopiert (Quelle: $src)"
    fi
  else
    log "WARN: neuserver-host-setup.sh nicht gefunden — Vorgabe: Datei nach $ROOT legen (z. B. /tmp/sicherung)."
    echo "WARN: neuserver-host-setup.sh nicht unter $ROOT (und nicht VIVAHOME_HOST_SETUP_SCRIPT)." >>"$ROOT/99_meta/warnings.txt"
  fi
}

# Wenn neuserver neben vivahome liegt (z. B. beide unter /tmp/sicherung), aber $ROOT noch leer: einmal nach $ROOT legen
prefill_neuserver_into_root_if_missing() {
  local cand="$SCRIPT_DIR/neuserver-host-setup.sh" dest="$ROOT/neuserver-host-setup.sh"
  [[ -f "$cand" ]] || return 0
  [[ -f "$dest" ]] && return 0
  [[ "$cand" -ef "$dest" ]] && return 0
  cp -a "$cand" "$dest"
  chmod +x "$dest"
  log "neuserver-host-setup.sh nach $dest uebernommen (Quelle: $cand — beide Skripte liegen damit im Sicherungsordner)."
}

# Vorgabe: vivahome-sicherung.sh laeuft aus $ROOT oder $ROOT/99_meta (typisch /tmp/sicherung)
warn_if_script_outside_bundle() {
  local sd rr meta
  sd="$(readlink -f "$SCRIPT_DIR" 2>/dev/null || echo "$SCRIPT_DIR")"
  rr="$(readlink -f "$ROOT" 2>/dev/null || echo "$ROOT")"
  meta="$(readlink -f "$ROOT/99_meta" 2>/dev/null || echo "$ROOT/99_meta")"
  if [[ "$sd" != "$rr" && "$sd" != "$meta" ]]; then
    log "Hinweis: vivahome-sicherung.sh liegt ausserhalb des Sicherungsordners $ROOT — Vorgabe: Skripte ausschliesslich unter $ROOT (Standard /tmp/sicherung) ablegen und von dort starten."
  fi
}

# =============================================================================
# BACKUP
# =============================================================================
do_backup() {
  mkdir -p "$ROOT"
  chmod 755 "$ROOT" 2>/dev/null || true
  mkdir -p "$ROOT"/{01_nginx,02_letsencrypt,03_static-mtower-www-html,04_static-vivahome,10_datenbanken,11_crm_docker_volumes,99_meta}
  : >"$ROOT/10_datenbanken/MANIFEST_PG"
  : >"$ROOT/11_crm_docker_volumes/MANIFEST_VOLUMES"
  : >"$ROOT/99_meta/warnings.txt"

  local TS
  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  log "Backup nach $ROOT (Zeit $TS)"
  echo "vivahome-sicherung backup $TS" | tee "$ROOT/99_meta/README.txt"
  prefill_neuserver_into_root_if_missing
  warn_if_script_outside_bundle

  cp -a /etc/nginx "$ROOT/01_nginx/etc-nginx"
  nginx -T >"$ROOT/01_nginx/nginx-T-expanded.txt" 2>&1 || true

  if [[ -d /etc/letsencrypt ]]; then
    tar czf "$ROOT/02_letsencrypt/etc-letsencrypt.tar.gz" -C / etc/letsencrypt
  fi

  [[ -d /var/www/html ]] && tar czf "$ROOT/03_static-mtower-www-html/var-www-html.tar.gz" -C / var/www/html
  [[ -d /var/www/vivahome ]] && tar czf "$ROOT/04_static-vivahome/var-www-vivahome.tar.gz" -C / var/www/vivahome

  tar_app_to_backup 05_crm /opt/crm
  tar_app_to_backup 06_belegscanner /opt/belegscanner
  tar_app_to_backup 07_leitstelle /opt/leitstelle
  tar_app_to_backup 08_mtower /opt/mtower

  # Bekannte Postgres-Container (Anpassung bei anderen Namen)
  for c in crm-postgres leitstelle-db-1 belegscanner-db-1 mtower-test-postgres-1; do
    pg_dump_container "$c"
  done

  # /opt/crm-Stack: MinIO + API-Storage (ohne Postgres-Volume)
  if docker ps -a --format '{{.Names}}' | grep -qx crm-minio; then
    tar_volume_of_container crm-minio minio
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx crm-api; then
    tar_volume_of_container crm-api api_storage
  fi
  # crm-web typischerweise ohne persistentes App-Volume — falls doch, optional:
  # tar_volume_of_container crm-web web_storage

  {
    echo "=== hostname / zeit ==="
    hostname
    date -u
    df -h
    echo "=== docker ps -a ==="
    docker ps -a
    echo "=== docker volume ls ==="
    docker volume ls
  } >"$ROOT/99_meta/inventar.txt" 2>&1

  crontab -l >"$ROOT/99_meta/root-crontab.txt" 2>&1 || echo "(kein crontab)" >"$ROOT/99_meta/root-crontab.txt"

  if [[ -d /etc/php ]]; then
    tar czf "$ROOT/99_meta/etc-php-snippets.tar.gz" -C / etc/php 2>/dev/null || true
  fi

  # Skript in die Sicherung legen (ein Ordner = alles inkl. Restore-Befehl)
  if [[ -f "$SCRIPT_SRC" ]]; then
    cp -a "$SCRIPT_SRC" "$ROOT/vivahome-sicherung.sh"
    cp -a "$SCRIPT_SRC" "$ROOT/99_meta/vivahome-sicherung.sh"
    chmod +x "$ROOT/vivahome-sicherung.sh" "$ROOT/99_meta/vivahome-sicherung.sh"
    log "Skript-Kopie: $ROOT/vivahome-sicherung.sh"
  fi
  copy_neuserver_host_setup_into_backup

  du -sh "$ROOT"/* >"$ROOT/99_meta/du-top.txt" 2>/dev/null || true
  du -sh "$ROOT" | tee -a "$ROOT/99_meta/README.txt"
  log "Backup fertig."
  ls -la "$ROOT"
}

# =============================================================================
# RESTORE
# =============================================================================
require_root() {
  [[ "$(id -u)" -eq 0 ]] || die "restore muss als root laufen."
}

# restore spielt nur Daten/Konfiguration ein — kein apt/install von Docker, WG, PHP, …
require_host_prereqs() {
  command -v tar >/dev/null 2>&1 || die "tar fehlt (Basis-Pakete installieren)."
  command -v rsync >/dev/null 2>&1 || die "rsync fehlt: apt install -y rsync"
  command -v nginx >/dev/null 2>&1 || die "nginx fehlt. Zuerst fehlende Pakete nachinstallieren: bash $ROOT/neuserver-host-setup.sh (oder --all) — ergaenzt die vorhandene Installation, installiert keinen neuen Server. Skripte liegen nur unter $ROOT (Standard /tmp/sicherung). Doku: README im Arbeits-Repo (Host-Checkliste / Anhang neuserver), danach erneut restore."
  command -v docker >/dev/null 2>&1 || die "docker fehlt. Zuerst bash $ROOT/neuserver-host-setup.sh (Docker+Compose+nginx auf dem bestehenden Host), danach erneut restore."
  if docker compose version >/dev/null 2>&1; then
    :
  elif command -v docker-compose >/dev/null 2>&1; then
    log "WARN: nur docker-compose (v1) gefunden — empfohlen: Compose v2 (docker compose)."
  else
    die "docker compose fehlt (Compose v2). bash $ROOT/neuserver-host-setup.sh (ergaenzt Installation) oder z. B. apt install docker-compose-v2 (Ubuntu) bzw. docker-compose-plugin, danach erneut restore."
  fi
  if systemctl is-enabled docker >/dev/null 2>&1; then
    systemctl is-active --quiet docker || log "WARN: Docker-Dienst nicht aktiv — ggf. systemctl start docker"
  fi
}

restore_nginx_tls_static_php() {
  [[ -d "$ROOT/01_nginx/etc-nginx" ]] || die "Fehlt: $ROOT/01_nginx/etc-nginx"
  [[ -f "$ROOT/02_letsencrypt/etc-letsencrypt.tar.gz" ]] || log "WARN: kein Let's-Encrypt-Archiv — Zertifikate manuell (certbot)."

  local bak="/root/nginx-pre-restore-$(date +%Y%m%d%H%M%S)"
  if [[ -d /etc/nginx ]]; then
    cp -a /etc/nginx "$bak"
    log "Altes Nginx nach $bak kopiert."
  fi
  rsync -a --delete "$ROOT/01_nginx/etc-nginx/" /etc/nginx/

  if [[ -f "$ROOT/02_letsencrypt/etc-letsencrypt.tar.gz" ]]; then
    tar xzf "$ROOT/02_letsencrypt/etc-letsencrypt.tar.gz" -C /
    chmod -R u+rwX,go-rwx /etc/letsencrypt 2>/dev/null || true
  fi

  mkdir -p /var/www/html /var/www/vivahome
  [[ -f "$ROOT/03_static-mtower-www-html/var-www-html.tar.gz" ]] && tar xzf "$ROOT/03_static-mtower-www-html/var-www-html.tar.gz" -C /
  [[ -f "$ROOT/04_static-vivahome/var-www-vivahome.tar.gz" ]] && tar xzf "$ROOT/04_static-vivahome/var-www-vivahome.tar.gz" -C /

  if [[ -f "$ROOT/99_meta/etc-php-snippets.tar.gz" ]]; then
    tar xzf "$ROOT/99_meta/etc-php-snippets.tar.gz" -C / || true
  fi

  nginx -t
  systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || die "nginx reload fehlgeschlagen"
  log "Nginx + TLS + statische Sites + ggf. PHP wiederhergestellt."
}

restore_opt_apps() {
  # Neu: flache tar.gz im Sicherungsroot. Alt: …/repo/ (rsync-Sicherung)
  local specs=(
    "05_crm.tar.gz|/opt/crm|05_app-crm/repo"
    "06_belegscanner.tar.gz|/opt/belegscanner|06_app-belegscanner/repo"
    "07_leitstelle.tar.gz|/opt/leitstelle|07_app-leitstelle/repo"
    "08_mtower.tar.gz|/opt/mtower|08_app-mtower/repo"
  )
  local s arc dest leg
  for s in "${specs[@]}"; do
    IFS='|' read -r arc dest leg <<<"$s"
    if [[ -f "$ROOT/$arc" ]]; then
      mkdir -p "$dest"
      tar xzf "$ROOT/$arc" -C "$dest"
      log "App aus $arc nach $dest"
    elif [[ -d "$ROOT/$leg" ]]; then
      mkdir -p "$dest"
      rsync -a "$ROOT/$leg/" "$dest/"
      if [[ -f "$ROOT/$leg/.env.SICHERUNG_NICHT_INS_REPO" ]]; then
        install -m 0600 "$ROOT/$leg/.env.SICHERUNG_NICHT_INS_REPO" "$dest/.env"
        log ".env (alt) nach $dest/.env"
      fi
      log "App (legacy $leg) nach $dest"
    else
      log "WARN: weder $ROOT/$arc noch $ROOT/$leg — $dest uebersprungen"
    fi
  done
}

compose_up_project() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  (
    cd "$dir" || exit 0

    # mTower: MANIFEST_PG nutzt Container mtower-test-postgres-1 → Test-Stack mit -p mtower-test
    if [[ "$dir" == "/opt/mtower" ]]; then
      if [[ -f docker-compose.yml && -f docker-compose.test.yml && -f .env.test ]]; then
        log "docker compose -p mtower-test -f docker-compose.yml -f docker-compose.test.yml --env-file .env.test up -d in $dir"
        docker compose -p mtower-test -f docker-compose.yml -f docker-compose.test.yml --env-file .env.test up -d
        return
      fi
      if [[ -f docker-compose.yml && -f docker-compose.prod.yml && -f .env.prod.server ]]; then
        log "WARN: $dir — Prod-Compose ohne passenden MANIFEST-Eintrag mtower-test-postgres-1; nur nutzen wenn Dumps/Container zu prod passen."
        log "docker compose --env-file .env.prod.server -f docker-compose.yml -f docker-compose.prod.yml up -d in $dir"
        docker compose --env-file .env.prod.server -f docker-compose.yml -f docker-compose.prod.yml up -d
        return
      fi
      log "WARN: $dir — weder Test-Stack (.env.test + docker-compose.test.yml) noch Prod (.env.prod.server + docker-compose.prod.yml) startbar."
      return 1
    fi

    local f=""
    if [[ -f docker-compose.yml ]]; then f="docker-compose.yml"
    elif [[ -f docker-compose.yaml ]]; then f="docker-compose.yaml"
    elif [[ -f docker-compose.prod.yml ]]; then f="docker-compose.prod.yml"
    else return 0
    fi

    # Compose laedt nur .env automatisch — .env.production (z. B. Leitstelle) explizit mitgeben
    if [[ -f .env ]]; then
      log "docker compose -f $f up -d in $dir"
      docker compose -f "$f" up -d
    elif [[ -f .env.production ]]; then
      log "docker compose --env-file .env.production -f $f up -d in $dir"
      docker compose --env-file .env.production -f "$f" up -d
    else
      log "docker compose -f $f up -d in $dir"
      docker compose -f "$f" up -d
    fi
  )
}

restore_postgres_dumps() {
  [[ -f "$ROOT/10_datenbanken/MANIFEST_PG" ]] || { log "Kein MANIFEST_PG — keine DB-Restores."; return 0; }
  local line c user db file
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    IFS='|' read -r c user db file <<<"$line"
    [[ -z "$c" || -z "$file" ]] && continue
    [[ -f "$ROOT/10_datenbanken/$file" ]] || { log "WARN: Dump-Datei fehlt: $file"; continue; }
    if ! docker ps --format '{{.Names}}' | grep -qx "$c"; then
      log "WARN: Container $c laeuft nicht — Dump $file uebersprungen (Stack starten, dann Script erneut oder manuell pg_restore)."
      continue
    fi
    log "Postgres restore: $c / $db aus $file"
    docker cp "$ROOT/10_datenbanken/$file" "$c:/tmp/restore.dump"
    docker exec "$c" pg_restore -U "$user" -d "$db" --clean --if-exists --no-owner -j 1 "/tmp/restore.dump" || {
      log "WARN: pg_restore meldete Fehler (teilweise normal bei leeren Extensions) — pruefen: docker logs $c"
    }
    docker exec "$c" rm -f /tmp/restore.dump
  done <"$ROOT/10_datenbanken/MANIFEST_PG"
}

resolve_volume_mountpoint() {
  local vol="$1" ctr="$2" arch="$3"
  local mp cand vol2
  if [[ -n "$vol" ]]; then
    mp=$(docker volume inspect "$vol" -f '{{ .Mountpoint }}' 2>/dev/null) && { echo "$mp"; return 0; }
  fi
  # Volume-Name steckt im Archivnamen: crm_vol__<VOLUME>.tar.gz
  if [[ -n "$arch" && "$arch" == crm_vol__*.tar.gz ]]; then
    vol2="${arch#crm_vol__}"
    vol2="${vol2%.tar.gz}"
    mp=$(docker volume inspect "$vol2" -f '{{ .Mountpoint }}' 2>/dev/null) && { echo "$mp"; return 0; }
  fi
  # Letzter Fallback: erstes named volume am Container (ohne Postgres-Daten)
  cand=$(docker inspect "$ctr" -f '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}' 2>/dev/null | tr -s ' ' '\n' | grep -v '^$' | grep -vi postgres | head -1)
  [[ -n "$cand" ]] || return 1
  docker volume inspect "$cand" -f '{{ .Mountpoint }}' 2>/dev/null
}

restore_crm_volumes_from_tar() {
  [[ -f "$ROOT/11_crm_docker_volumes/MANIFEST_VOLUMES" ]] || { log "Kein Volume-MANIFEST — Docker-Volume-Restore (MinIO/app_storage) uebersprungen."; return 0; }
  local line ctr vol arc mp
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    IFS='|' read -r ctr vol arc <<<"$line"
    [[ -z "$ctr" || -z "$arc" ]] && continue
    [[ -f "$ROOT/11_crm_docker_volumes/$arc" ]] || { log "WARN: Archiv fehlt $arc"; continue; }
    docker ps -a --format '{{.Names}}' | grep -qx "$ctr" || { log "WARN: $ctr nicht vorhanden — $arc"; continue; }
    log "Stop $ctr fuer Volume-Restore (${vol:-auto}) …"
    docker stop "$ctr" >/dev/null 2>&1 || true
    sleep 2
    mp=$(resolve_volume_mountpoint "${vol:-}" "$ctr" "$arc") || { log "WARN: kein Mountpoint fuer $ctr — $arc"; docker start "$ctr" 2>/dev/null || true; continue; }
    log "Entpacke $arc → $mp"
    shopt -s dotglob nullglob 2>/dev/null || true
    rm -rf "${mp:?}"/* 2>/dev/null || true
    tar xzf "$ROOT/11_crm_docker_volumes/$arc" -C "$mp"
    docker start "$ctr" >/dev/null 2>&1 || true
    sleep 2
    log "Volume wiederhergestellt ($ctr), gestartet."
  done <"$ROOT/11_crm_docker_volumes/MANIFEST_VOLUMES"
}

do_restore() {
  require_root
  require_host_prereqs
  [[ -d "$ROOT/01_nginx" ]] || die "Ungueltige Sicherung: $ROOT/01_nginx fehlt. Bitte Inhalt nach $ROOT hochladen (Standard /tmp/sicherung)."
  warn_if_script_outside_bundle

  log "RESTORE aus $ROOT — Nginx/TLS/Websites …"
  restore_nginx_tls_static_php

  log "RESTORE — /opt Apps …"
  mkdir -p /opt/crm /opt/belegscanner /opt/leitstelle /opt/mtower
  restore_opt_apps

  log "RESTORE — Docker Stacks (compose up) …"
  for d in /opt/crm /opt/belegscanner /opt/leitstelle /opt/mtower; do
    [[ -d "$d" ]] || continue
    compose_up_project "$d" || log "WARN: compose up in $d fehlgeschlagen"
  done

  log "Warte auf Postgres-Starts (max. 120s, alle laufenden bekannten DB-Container) …"
  local i c ready any
  for i in $(seq 1 24); do
    ready=1
    any=0
    for c in crm-postgres leitstelle-db-1 belegscanner-db-1 mtower-test-postgres-1; do
      docker ps --format '{{.Names}}' | grep -qx "$c" || continue
      any=1
      docker exec "$c" pg_isready >/dev/null 2>&1 || ready=0
    done
    [[ "$any" -eq 0 ]] && break
    [[ "$ready" -eq 1 ]] && break
    sleep 5
  done

  log "RESTORE — Postgres Dumps …"
  restore_postgres_dumps

  log "RESTORE — Docker-Volumes MinIO / app_storage (/opt/crm-Stack) …"
  restore_crm_volumes_from_tar

  log "RESTORE — abschliessend docker compose up (alle Stacks) …"
  for d in /opt/crm /opt/belegscanner /opt/leitstelle /opt/mtower; do
    [[ -d "$d" ]] || continue
    compose_up_project "$d" || true
  done

  if [[ -f "$ROOT/99_meta/root-crontab.txt" ]] && ! grep -q 'kein crontab' "$ROOT/99_meta/root-crontab.txt" 2>/dev/null; then
    log "Hinweis: root-crontab liegt unter $ROOT/99_meta/root-crontab.txt — nicht automatisch importiert."
  fi

  log "Restore fertig. Ohne Plesk: nginx auf alte include-Zeilen (plesk.conf.d) pruefen, dann nginx -t."
  log "Bitte pruefen: docker ps, Logs, alle exponierten Sites (vivahome-Stacks, Belegscanner, Leitstelle, mTower, …)."
  log "Hinweis: WireGuard/Firewall/Cron/Monitoring wurden durch dieses Skript nicht eingerichtet — Checkliste Host."
}

# =============================================================================
case "$MODE" in
  backup)  do_backup ;;
  restore) do_restore ;;
  *) die "Unbekannter Modus" ;;
esac
