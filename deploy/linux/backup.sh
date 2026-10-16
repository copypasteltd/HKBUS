#!/bin/bash
set -euo pipefail
umask 027
exec 9>/www/wwwroot/hkbusgo/shared/backup.lock
flock -n 9 || exit 0
exec /usr/sbin/runuser -u hkbusgo -- /usr/local/bin/node /www/wwwroot/hkbusgo/ops/backup.mjs
