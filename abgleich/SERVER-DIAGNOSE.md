# Server-Diagnose (CRM-Host)

Dieses CRM nutzt in Docker **PostgreSQL** (`crm-postgres`), nicht MySQL. Ein separater **MySQL/MariaDB**-Dienst auf demselben Host (z. B. andere Webapps, Monitoring, WordPress) kann CPU/RAM/I/O stark belasten und hat **keinen** direkten Bezug zum CRM-Stack im Repo.

## CRM-Container pruefen

```bash
cd /opt/crm   # oder das tatsaechliche Deploy-Verzeichnis
docker compose -f docker-compose.yml ps
docker stats --no-stream
docker compose -f docker-compose.yml logs --tail=200 api web
```

API/Web-Modus pruefen (Produktion erwartet `NODE_ENV=production`, kein `nest --watch` / `next dev` in den produktiven Images):

```bash
docker inspect crm-api --format '{{.Config.Env}}' | tr ' ' '\n' | grep NODE_ENV
docker inspect crm-web --format '{{.Config.Env}}' | tr ' ' '\n' | grep NODE_ENV
```

## MySQL/MariaDB auf dem Host (hohe Last)

### Prozess und Konfiguration

```bash
ps aux | grep -E '[m]ysqld|[m]ariadbd'
systemctl status mysql mariadb 2>/dev/null
# typische Pfade:
# sudo mysqld --verbose --help 2>/dev/null | head
# sudo cat /etc/mysql/mysql.conf.d/mysqld.cnf
```

### Schnellcheck Verbindungen und laufende Abfragen

```bash
mysqladmin -u root -p status
mysqladmin -u root -p processlist
# oder in der Shell:
# mysql -u root -p -e "SHOW FULL PROCESSLIST;"
# mysql -u root -p -e "SHOW GLOBAL STATUS LIKE 'Threads%';"
```

Haeufige Ursachen hoher Last:

- Viele gleichzeitige Verbindungen von Webapps oder Crawlern
- Fehlende oder falsche Indizes (viele `Sending data`-Zeilen, lange Laufzeiten)
- Zu grosser **InnoDB Buffer Pool** relativ zum RAM (Konkurrenz mit anderen Diensten)
- Replikation, Backups, oder Import-Jobs parallel zum Betrieb

### Slow Query Log (temporaer aktivieren, nur mit Bedarf)

In der Server-`my.cnf` / Drop-in-Datei (Beispiel, anpassen):

```ini
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
```

Nach Analyse wieder deaktivieren oder `long_query_time` hochsetzen, damit die Platte nicht vollgeschrieben wird.

### `innodb_buffer_pool_size`

Nur nach Pruefung des freien RAM und der Gesamtlast anpassen; typisch **ein Bruchteil des physischen RAMs**, nicht „so gross wie moeglich“, wenn viele andere Dienste (Docker, CRM, Mail, …) auf derselben Maschine laufen.

## CRM vs. MySQL

| Komponente   | Rolle im CRM-Projekt        |
|-------------|-----------------------------|
| PostgreSQL  | CRM-Anwendungsdatenbank     |
| MySQL       | Nicht Teil des CRM-Compose  |

Wenn MySQL Ressourcen frisst, zielgerichtet den **jeweiligen Konsumenten** (welche App, welche Datenbankname, welche Abfragen) identifizieren — nicht die CRM-Postgres-Container.

## Verdaechtige Last im Container `crm-postgres` (Security)

PostgreSQL selbst laeuft als `postgres` mit typischen Hintergrundprozessen (`checkpointer`, `background writer`, …). **Ungueltig** ist z. B. ein eigener Prozess **`/tmp/mysql`** (oder andere Namen unter `/tmp`), der **nicht** zum offiziellen Image gehoert.

Schnellcheck (auf dem Docker-Host):

```bash
docker stats --no-stream crm-postgres
docker top crm-postgres -eo pid,pcpu,pmem,args
docker exec crm-postgres ps aux
docker exec crm-postgres ls -la /tmp/
```

Wenn ein fremdes Binary hohe CPU/RAM verursacht:

1. **Nicht** nur den Prozess killen und weitermachen — Annahme: Container und ggf. Datenhaltung sind **nicht vertrauenswuerdig**, bis der Eintritt geklaert ist.
2. Netzwerk/Exposure pruefen (offene Ports, schwache Passwoerter, kompromittierte CI/SSH-Keys).
3. **Neuaufbau:** frisches Image, Migrationen, **Secrets rotieren**; altes Volume nur nach Bewertung wieder anbinden.
4. Optional: Binary sichern (`docker cp`) fuer Analyse, Hash notieren.

**Abgrenzung:** Die **Host-MariaDB** (Plesk, eigener `mariadbd`-Prozess) ist ein **anderer** Dienst als ein `/tmp/mysql` **im Postgres-Container**.
