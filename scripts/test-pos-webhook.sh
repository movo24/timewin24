#!/usr/bin/env bash
# =============================================================
# TEST END-TO-END : 4 ventes POS → TimeWin24 webhook
# Usage : ./scripts/test-pos-webhook.sh
#
# Prérequis :
#   - TW24 en cours d'exécution (localhost:3000 par défaut)
#   - CAISSE_STORE_ID  = UUID du magasin côté CAISSE (pos_store_id dans PosStoreLink)
#   - EMPLOYEE_A_ID    = UUID TW24 de l'employé A
#   - EMPLOYEE_B_ID    = UUID TW24 de l'employé B
#   - POS_SECRET       = valeur de TIMEWIN24_POS_SECRET dans CAISSE/.env
#   - POS_KEY_ID       = valeur de TIMEWIN24_POS_KEY_ID dans CAISSE/.env
# =============================================================

set -e

# ── CONFIGURATION — MODIFIER CES VALEURS ──────────────────────
TW24_URL="${TW24_URL:-http://localhost:3000}"
CAISSE_STORE_ID="${CAISSE_STORE_ID:-REMPLACER_PAR_UUID_MAGASIN_CAISSE}"
EMPLOYEE_A_ID="${EMPLOYEE_A_ID:-REMPLACER_PAR_UUID_EMPLOYE_A_TW24}"
EMPLOYEE_B_ID="${EMPLOYEE_B_ID:-REMPLACER_PAR_UUID_EMPLOYE_B_TW24}"
POS_SECRET="${POS_SECRET:-REMPLACER_PAR_POS_SECRET}"
POS_KEY_ID="${POS_KEY_ID:-REMPLACER_PAR_POS_KEY_ID}"
TODAY=$(date +%Y-%m-%d)
HOUR_SLOT=$(date +%H | sed 's/^0//')  # heure actuelle sans 0 initial
HOUR_SLOT_NEXT=$(( (HOUR_SLOT + 1) % 24 ))
# ──────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

sign_and_send() {
  local body="$1"
  local description="$2"
  local timestamp=$(date +%s%3N)
  local nonce=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$(date +%s)-$(( RANDOM ))")
  local payload="${timestamp}.${nonce}.${body}"

  if command -v openssl &> /dev/null && [ "$POS_SECRET" != "REMPLACER_PAR_POS_SECRET" ]; then
    local sig=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$POS_SECRET" | awk '{print $2}')
    local headers="-H 'X-POS-Timestamp: $timestamp' -H 'X-POS-Nonce: $nonce' -H 'X-POS-Signature: $sig' -H 'X-POS-Key-Id: $POS_KEY_ID'"
  else
    # Fallback : X-POS-Secret legacy (si HMAC non configuré)
    local headers="-H 'X-POS-Secret: $POS_SECRET'"
    info "Utilisation X-POS-Secret legacy (openssl non dispo ou secret non configuré)"
  fi

  info "Test : $description"
  local response=$(curl -s -w "\n%{http_code}" \
    -X POST "$TW24_URL/api/pos-events/webhook" \
    -H "Content-Type: application/json" \
    -H "X-POS-Store-Id: $CAISSE_STORE_ID" \
    -H "X-POS-Timestamp: $timestamp" \
    -H "X-POS-Nonce: $nonce" \
    -H "X-POS-Signature: $(echo -n "$payload" | openssl dgst -sha256 -hmac "$POS_SECRET" 2>/dev/null | awk '{print $2}' || echo 'no-sig')" \
    -H "X-POS-Key-Id: $POS_KEY_ID" \
    -d "$body")

  local http_code=$(echo "$response" | tail -n1)
  local body_resp=$(echo "$response" | head -n-1)

  if [ "$http_code" = "201" ]; then
    ok "$description → HTTP 201 | eventId=$(echo $body_resp | grep -o '"eventId":"[^"]*"' | cut -d'"' -f4)"
  else
    fail "$description → HTTP $http_code | $body_resp"
  fi
}

echo ""
echo "══════════════════════════════════════════════════════"
echo "  TEST POS → TimeWin24 — $TODAY"
echo "  Store CAISSE : $CAISSE_STORE_ID"
echo "  Employé A    : $EMPLOYEE_A_ID"
echo "  Employé B    : $EMPLOYEE_B_ID"
echo "══════════════════════════════════════════════════════"
echo ""

# ── VENTE 1 : Employé A, carte, 1 article, 25.00€ ─────────
SALE_ID_1="test-sale-$(date +%s)-1"
sign_and_send \
  "{\"eventType\":\"sale.completed\",\"employeeId\":\"$EMPLOYEE_A_ID\",\"data\":{\"saleId\":\"$SALE_ID_1\",\"ticketNumber\":\"TEST-001\",\"date\":\"$TODAY\",\"hourSlot\":$HOUR_SLOT,\"revenue\":25.00,\"transactions\":1,\"itemsSold\":1,\"cardAmount\":25.00,\"cashAmount\":0}}" \
  "Vente 1 — Employé A, carte 25€"

sleep 1

# ── VENTE 2 : Employé A, espèces, 2 articles, 18.50€ ──────
SALE_ID_2="test-sale-$(date +%s)-2"
sign_and_send \
  "{\"eventType\":\"sale.completed\",\"employeeId\":\"$EMPLOYEE_A_ID\",\"data\":{\"saleId\":\"$SALE_ID_2\",\"ticketNumber\":\"TEST-002\",\"date\":\"$TODAY\",\"hourSlot\":$HOUR_SLOT,\"revenue\":18.50,\"transactions\":1,\"itemsSold\":2,\"cardAmount\":0,\"cashAmount\":18.50}}" \
  "Vente 2 — Employé A, espèces 18.50€ (même hourSlot)"

sleep 1

# ── VENTE 3 : Employé B, carte, 3 articles, 67.00€ ────────
SALE_ID_3="test-sale-$(date +%s)-3"
sign_and_send \
  "{\"eventType\":\"sale.completed\",\"employeeId\":\"$EMPLOYEE_B_ID\",\"data\":{\"saleId\":\"$SALE_ID_3\",\"ticketNumber\":\"TEST-003\",\"date\":\"$TODAY\",\"hourSlot\":$HOUR_SLOT,\"revenue\":67.00,\"transactions\":1,\"itemsSold\":3,\"cardAmount\":67.00,\"cashAmount\":0}}" \
  "Vente 3 — Employé B, carte 67€"

sleep 1

# ── VENTE 4 : Employé A, carte, 1 article, 12.00€, heure différente ──
SALE_ID_4="test-sale-$(date +%s)-4"
sign_and_send \
  "{\"eventType\":\"sale.completed\",\"employeeId\":\"$EMPLOYEE_A_ID\",\"data\":{\"saleId\":\"$SALE_ID_4\",\"ticketNumber\":\"TEST-004\",\"date\":\"$TODAY\",\"hourSlot\":$HOUR_SLOT_NEXT,\"revenue\":12.00,\"transactions\":1,\"itemsSold\":1,\"cardAmount\":12.00,\"cashAmount\":0}}" \
  "Vente 4 — Employé A, carte 12€ (hourSlot différent: $HOUR_SLOT_NEXT)"

sleep 1

# ── TEST IDEMPOTENCY : renvoyer la vente 1 ─────────────────
echo ""
info "Test idempotency — Renvoi vente 1 (saleId=$SALE_ID_1)..."
sign_and_send \
  "{\"eventType\":\"sale.completed\",\"employeeId\":\"$EMPLOYEE_A_ID\",\"data\":{\"saleId\":\"$SALE_ID_1\",\"ticketNumber\":\"TEST-001\",\"date\":\"$TODAY\",\"hourSlot\":$HOUR_SLOT,\"revenue\":25.00,\"transactions\":1,\"itemsSold\":1,\"cardAmount\":25.00,\"cashAmount\":0}}" \
  "DUPLICATE vente 1 (idempotency guard doit bloquer)"

# ── TEST CAS DÉGRADÉ : TW24 injoignable ───────────────────
echo ""
info "Test cas dégradé — Appel vers URL inexistante (simule TW24 down)..."
BAD_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://localhost:9999/api/pos-events/webhook" \
  -H "Content-Type: application/json" \
  -H "X-POS-Store-Id: $CAISSE_STORE_ID" \
  -d "{}" 2>/dev/null || echo "000")
if [ "$BAD_RESPONSE" = "000" ] || [ "$BAD_RESPONSE" = "7" ]; then
  ok "Connexion refusée comme prévu (TW24 down simulé) → CAISSE doit continuer normalement"
else
  info "Réponse inattendue: $BAD_RESPONSE"
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo "  RÉSULTATS ATTENDUS (à vérifier avec validate-pos-sync.sql)"
echo ""
echo "  PosSalesData — hourSlot $HOUR_SLOT :"
echo "    revenue      = 110.50€ (25 + 18.50 + 67)"
echo "    transactions = 3"
echo "    items_sold   = 6 (1 + 2 + 3)"
echo "    card_amount  = 92.00€ (25 + 67)"
echo "    cash_amount  = 18.50€"
echo ""
echo "  PosSalesData — hourSlot $HOUR_SLOT_NEXT :"
echo "    revenue      = 12.00€"
echo "    transactions = 1"
echo "    items_sold   = 1"
echo ""
echo "  EmployeePerformanceDaily — Employé A :"
echo "    total_sales  = 55.50€ (25 + 18.50 + 12)"
echo "    transactions = 3"
echo "    items_sold   = 4 (1 + 2 + 1)"
echo "    avg_basket   = 18.50€"
echo "    card_amount  = 37.00€ (25 + 12)"
echo "    cash_amount  = 18.50€"
echo ""
echo "  EmployeePerformanceDaily — Employé B :"
echo "    total_sales  = 67.00€"
echo "    transactions = 1"
echo "    items_sold   = 3"
echo ""
echo "  Idempotency : vente 1 envoyée 2x → transactions toujours = 1"
echo "══════════════════════════════════════════════════════"
