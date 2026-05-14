#!/bin/bash
#
# Smoke test post-déploiement du SaaS App Store.
#
# Usage:
#   bash scripts/smoke-test-saas-prod.sh https://app.timewin24.com
#
# Vérifie :
#   - Pages publiques accessibles sans auth
#   - Routes protégées redirigent
#   - Routes feature-flagged OFF retournent 404
#   - Sécurité headers présents
#
# N'effectue aucune écriture en DB. Lecture seule.

set -e

if [ -z "$1" ]; then
  echo "Usage: bash $0 <base-url>"
  echo "Example: bash $0 https://app.timewin24.com"
  exit 1
fi

BASE="${1%/}"  # strip trailing slash

PASS=0
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✅ $name (got $actual)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

status() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

echo "════════════════════════════════════════════════════════════════"
echo "  Smoke test SaaS App Store — $BASE"
echo "════════════════════════════════════════════════════════════════"
echo ""

echo "── 1. Pages publiques (Apple Store mandatory) ──"
check "GET /privacy"  "200" "$(status $BASE/privacy)"
check "GET /terms"    "200" "$(status $BASE/terms)"
check "GET /support"  "200" "$(status $BASE/support)"
echo ""

echo "── 2. Login pages accessibles ──"
check "GET /login"        "200" "$(status $BASE/login)"
check "GET /admin-login"  "200" "$(status $BASE/admin-login)"
echo ""

echo "── 3. Routes protégées redirigent vers login ──"
# Note: Next.js redirect peut être 307 ou 302
DASH=$(status $BASE/dashboard)
PLAN=$(status $BASE/planning)
ONBO=$(status $BASE/onboarding)
echo "  GET /dashboard  → $DASH (attendu 307/302)"
echo "  GET /planning   → $PLAN (attendu 307/302)"
echo "  GET /onboarding → $ONBO (attendu 307/302)"
[ "$DASH" = "307" ] || [ "$DASH" = "302" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
[ "$PLAN" = "307" ] || [ "$PLAN" = "302" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
[ "$ONBO" = "307" ] || [ "$ONBO" = "302" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
echo ""

echo "── 4. Routes flag-protégées (variant=appstore → 404) ──"
# Ces routes touchent prisma et requièrent ENABLE_<X>=true
# Comme TIMEWIN_VARIANT=appstore, elles doivent retourner 404
POS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/pos-events/webhook -H "Content-Type: application/json" -d '{}')
AI=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/ai/assistant -H "Content-Type: application/json" -d '{}')
INT=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/integrations/pos)
echo "  POST /api/pos-events/webhook → $POS (attendu 404 si TIMEWIN_VARIANT=appstore)"
echo "  POST /api/ai/assistant       → $AI  (attendu 404 si ENABLE_AI=false)"
echo "  GET  /api/integrations/pos   → $INT (attendu 404 ou 401)"
[ "$POS" = "404" ] && { echo "    ✅"; PASS=$((PASS+1)); } || { echo "    ⚠ flag pos pas appliqué ?"; FAIL=$((FAIL+1)); }
[ "$AI" = "404" ]  && { echo "    ✅"; PASS=$((PASS+1)); } || { echo "    ⚠ flag ai pas appliqué ?"; FAIL=$((FAIL+1)); }
echo ""

echo "── 5. NextAuth endpoints OK ──"
check "GET /api/auth/csrf"     "200" "$(status $BASE/api/auth/csrf)"
check "GET /api/auth/session"  "200" "$(status $BASE/api/auth/session)"
echo ""

echo "── 6. Health check ──"
HEALTH=$(status $BASE/api/health 2>/dev/null)
echo "  GET /api/health → $HEALTH (200 si endpoint existe, 404 sinon)"
echo ""

echo "── 7. Headers de sécurité ──"
HEADERS=$(curl -sI $BASE/privacy | tr '[:upper:]' '[:lower:]')
echo "$HEADERS" | grep -q "x-frame-options\|content-security-policy" && \
  echo "  ✅ Headers de sécurité présents" || \
  echo "  🟡 Aucun header de sécurité visible (acceptable si Vercel le gère)"
echo ""

echo "── 8. Cookies signés HTTPS-only ──"
COOKIES=$(curl -sI $BASE/api/auth/csrf | grep -i "set-cookie")
echo "$COOKIES" | grep -qi "secure" && \
  echo "  ✅ Cookies marqués Secure" || \
  echo "  ⚠ Pas de flag Secure dans les cookies (problème HTTPS?)"
echo "$COOKIES" | grep -qi "httponly" && \
  echo "  ✅ Cookies marqués HttpOnly" || \
  echo "  ⚠ Pas de flag HttpOnly"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "  RÉCAP : $PASS passés / $FAIL échoués"
echo "════════════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "⚠ Tests échoués. À investiguer avant d'aller plus loin."
  exit 1
fi

echo ""
echo "✅ Tous les smoke tests passent."
echo ""
echo "Étapes suivantes manuelles :"
echo "  1. Login OWNER : ${BASE}/login avec demo-owner@timewin24.app"
echo "  2. Vérifier sidebar (modules POS/AI/Inventory cachés)"
echo "  3. Tester onboarding si Demo Company a step<99"
echo "  4. Tester envoi planning depuis le calendrier"
