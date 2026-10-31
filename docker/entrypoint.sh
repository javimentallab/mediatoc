#!/bin/sh

if ! [ "$PGID" -eq "$(id -g abc)" ]; then
    groupmod --non-unique --gid "$PGID" abc
fi

if ! [ "$PUID" -eq "$(id -u abc)" ]; then
    usermod --non-unique --uid "$PUID" abc
fi

echo 
echo PUID: $(id -u abc)
echo PGID: $(id -g abc)
echo 


# auto-restore-from-backup: si arrancas en limpio (volumen nuevo, /storage/data.db ausente),
# coge el backup más reciente automáticamente. Disaster recovery sin intervención.
if [ ! -f /storage/data.db ] && [ -d /storage/backups ]; then
  LATEST=$(ls -1t /storage/backups/data-*.db 2>/dev/null | head -1)
  if [ -n "$LATEST" ]; then
    echo "auto-restore: /storage/data.db ausente, restaurando desde $LATEST"
    cp "$LATEST" /storage/data.db
    rm -f /storage/data.db-wal /storage/data.db-shm
    chmod 644 /storage/data.db
  else
    echo "auto-restore: no hay backups disponibles, MediaOCD arrancará con BD vacía"
  fi
fi

chown -R abc:abc /storage
chown -R abc:abc /assets
chown -R abc:abc /logs

su -c "node /app/build/index.js" abc