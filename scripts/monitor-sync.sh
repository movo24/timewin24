#!/usr/bin/env bash
# Surveillance sync POS → TimeWin24 — Jour 1
# Usage : ./scripts/monitor-sync.sh [session_cookie]
# Exemple : ./scripts/monitor-sync.sh "next-auth.session-token=abc123"

TW24_URL="${TW24_URL:-http://localhost:3000}"
COOKIE="${1:-}"

if [ -z "$COOKIE" ]; then
  echo "Usage: $0 \"next-auth.session-token=<valeur>\""
  echo "Trouver le cookie : DevTools → Application → Cookies → next-auth.session-token"
  exit 1
fi

while true; do
  RESP=$(curl -s -H "Cookie: $COOKIE" "$TW24_URL/api/pos-events/failed")
  RATE=$(echo "$RESP" | grep -o '"saleSyncRate":[0-9]*' | cut -d: -f2)
  FAILED=$(echo "$RESP" | grep -o '"total":[0-9]*' | head -1 | cut -d: -f2)
  STUCK=$(echo "$RESP" | grep -o '"total":[0-9]*' | tail -1 | cut -d: -f2)
  TS=$(date '+%H:%M:%S')

  if [ "$RATE" = "100" ] && [ "${FAILED:-0}" = "0" ]; then
    echo "[$TS] ✓ syncRate=${RATE}%  failed=${FAILED}  stuck=${STUCK}"
  else
    echo "[$TS] ✗ ALERTE syncRate=${RATE}%  failed=${FAILED}  stuck=${STUCK}"
    echo "         → Checker les logs CAISSE : grep TW24_PUSH_FAILED /var/log/caisse/*.log"
    echo "         → Checker PosEvent errors : $TW24_URL/api/pos-events/failed"
  fi

  sleep 60
done
