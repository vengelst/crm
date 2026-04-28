#!/usr/bin/env bash
# Auf dem Server ausfuehren: legt unter /tmp/sicherung alles fuer Neuaufsetzen ab.
# Keine Docker-Volumes/Datenbank-Dumps — nur Konfiguration, Quellen (ohne node_modules), statische Sites, Zertifikate.

set -euo pipefail

ROOT="/tmp/sicherung"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

rm -rf "$ROOT"
mkdir -p "$ROOT"/{01_nginx,02_letsencrypt,03_static-mtower-www-html,04_static-vivahome,05_app-crm,06_app-belegscanner,07_app-leitstelle,08_app-mtower,99_meta}

echo "Sicherung $TS nach $ROOT" | tee "$ROOT/99_meta/README.txt"

# --- Nginx (alle vhosts inkl. crm, beleg, leitstelle, mtower, vivahome, s3) ---
cp -a /etc/nginx "$ROOT/01_nginx/etc-nginx"
nginx -T >"$ROOT/01_nginx/nginx-T-expanded.txt" 2>&1 || true

# --- Let's Encrypt (Zertifikate + Keys — vertraulich) ---
if [[ -d /etc/letsencrypt ]]; then
  tar czf "$ROOT/02_letsencrypt/etc-letsencrypt.tar.gz" -C / etc/letsencrypt
fi

# --- Statische Websites ---
# MTower/Mondoma Marketing (Inhalt: MTower / Mondoma d.o.o.) — typisch fuer mondoma.eu / www
if [[ -d /var/www/html ]]; then
  tar czf "$ROOT/03_static-mtower-www-html/var-www-html.tar.gz" -C / var/www/html
fi
if [[ -d /var/www/vivahome ]]; then
  tar czf "$ROOT/04_static-vivahome/var-www-vivahome.tar.gz" -C / var/www/vivahome
fi

rsync_app() {
  local name="$1"
  local src="$2"
  local dst="$3"
  if [[ ! -d "$src" ]]; then
    echo "WARN: fehlt $src" >>"$ROOT/99_meta/warnings.txt"
    return 0
  fi
  mkdir -p "$dst"
  rsync -a \
    --exclude=node_modules \
    --exclude='**/node_modules' \
    --exclude=.next \
    --exclude=dist \
    --exclude=.turbo \
    --exclude=coverage \
    "$src"/ "$dst"/
  # .env separat mit klarer Endung (Secrets!)
  if [[ -f "$src/.env" ]]; then
    install -m 0600 "$src/.env" "$dst/.env.SICHERUNG_NICHT_INS_REPO"
  fi
}

rsync_app "crm" /opt/crm "$ROOT/05_app-crm/repo"
rsync_app "belegscanner" /opt/belegscanner "$ROOT/06_app-belegscanner/repo"
rsync_app "leitstelle" /opt/leitstelle "$ROOT/07_app-leitstelle/repo"
rsync_app "mtower" /opt/mtower "$ROOT/08_app-mtower/repo"

# --- Meta / Inventar ---
{
  echo "=== hostname / zeit ==="
  hostname
  date -u
  echo "=== df -h ==="
  df -h
  echo "=== docker ps -a ==="
  docker ps -a
  echo "=== docker volume ls ==="
  docker volume ls
  echo "=== docker compose project roots (opt) ==="
  ls -la /opt/crm /opt/belegscanner /opt/leitstelle /opt/mtower 2>&1 || true
} >"$ROOT/99_meta/inventar.txt" 2>&1

crontab -l >"$ROOT/99_meta/root-crontab.txt" 2>&1 || echo "(kein crontab)" >"$ROOT/99_meta/root-crontab.txt"

# PHP-FPM pool snippets falls vivahome PHP nutzt
if [[ -d /etc/php ]]; then
  tar czf "$ROOT/99_meta/etc-php-snippets.tar.gz" -C / etc/php 2>/dev/null || true
fi

# Groessen
du -sh "$ROOT"/* >"$ROOT/99_meta/du-top.txt"
du -sh "$ROOT" >"$ROOT/99_meta/du-gesamt.txt"

echo "Fertig. Gesamt:" | tee -a "$ROOT/99_meta/README.txt"
du -sh "$ROOT" | tee -a "$ROOT/99_meta/README.txt"
ls -la "$ROOT"
