-- =============================================================
-- VALIDATION POS ↔ TimeWin24 — À exécuter sur la DB TW24 PROD
-- Chaque bloc produit OK ou KO avec raison
-- =============================================================

-- ────────────────────────────────────────────────────────────
-- BLOCK 1 — PosProvider actif
-- ────────────────────────────────────────────────────────────
SELECT
  'BLOCK 1: PosProvider' AS check_name,
  CASE
    WHEN COUNT(*) = 0 THEN 'KO — Aucun provider configuré. Aller dans Intégrations > Connexions POS.'
    WHEN SUM(CASE WHEN active = true THEN 1 ELSE 0 END) = 0 THEN 'KO — Provider(s) présents mais tous inactifs'
    ELSE 'OK — ' || COUNT(*) || ' provider(s), ' || SUM(CASE WHEN active = true THEN 1 ELSE 0 END) || ' actif(s)'
  END AS result
FROM pos_providers;

-- ────────────────────────────────────────────────────────────
-- BLOCK 2 — PosStoreLink : un lien par magasin opérationnel
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                 AS tw24_store_id,
  s.name               AS store_name,
  psl.pos_store_id     AS caisse_store_id,
  psl.pos_store_name   AS caisse_store_name,
  pp.name              AS provider_name,
  CASE
    WHEN psl.id IS NULL THEN 'KO — Aucun PosStoreLink pour ce magasin BLOQUANT'
    WHEN psl.active = false THEN 'KO — Lien inactif BLOQUANT'
    WHEN pp.active = false THEN 'KO — Provider inactif BLOQUANT'
    ELSE 'OK'
  END AS status
FROM stores s
LEFT JOIN pos_store_links psl ON psl.store_id = s.id
LEFT JOIN pos_providers pp ON pp.id = psl.provider_id
WHERE s.is_active = true
  AND s.is_archived = false
ORDER BY s.name;

-- ────────────────────────────────────────────────────────────
-- BLOCK 3 — Doublons PosStoreLink (doit retourner 0 lignes)
-- ────────────────────────────────────────────────────────────
SELECT
  'BLOCK 3: Doublons PosStoreLink' AS check_name,
  CASE
    WHEN COUNT(*) = 0 THEN 'OK — Aucun doublon'
    ELSE 'KO — ' || COUNT(*) || ' doublon(s) détectés. Corriger avant lundi.'
  END AS result
FROM (
  SELECT pos_store_id, provider_id, COUNT(*) as cnt
  FROM pos_store_links
  GROUP BY pos_store_id, provider_id
  HAVING COUNT(*) > 1
) dups;

-- ────────────────────────────────────────────────────────────
-- BLOCK 4 — Employés test : existent dans TW24 ?
-- Remplacer les UUIDs par les vrais UUIDs des employés test
-- ────────────────────────────────────────────────────────────
-- EXEMPLE : remplacer 'UUID_EMPLOYE_A' et 'UUID_EMPLOYE_B'
SELECT
  e.id,
  e.first_name || ' ' || e.last_name AS full_name,
  e.employee_code,
  e.active,
  u.email,
  CASE
    WHEN e.active = false THEN 'KO — Employé inactif dans TW24'
    WHEN u.id IS NULL THEN 'WARNING — Pas de compte User lié'
    ELSE 'OK'
  END AS status
FROM employees e
LEFT JOIN users u ON u.employee_id = e.id
WHERE e.active = true
ORDER BY e.last_name;

-- ────────────────────────────────────────────────────────────
-- BLOCK 5 — Vérification données post-test (après 4 ventes)
-- Adapter CURRENT_DATE si test fait hier
-- ────────────────────────────────────────────────────────────

-- 5A : PosSalesData du jour
SELECT
  psd.date,
  psd.hour_slot,
  psd.revenue,
  psd.transactions,
  psd.items_sold,
  psd.card_amount,
  psd.cash_amount,
  s.name AS store_name
FROM pos_sales_data psd
JOIN stores s ON s.id = psd.store_id
WHERE psd.date = CURRENT_DATE
ORDER BY psd.hour_slot;

-- 5B : EmployeePerformanceDaily du jour
SELECT
  e.first_name || ' ' || e.last_name AS employee,
  epd.total_sales,
  epd.transactions,
  epd.items_sold,
  epd.avg_basket,
  epd.card_amount,
  epd.cash_amount,
  s.name AS store_name
FROM employee_performance_daily epd
JOIN employees e ON e.id = epd.employee_id
JOIN stores s ON s.id = epd.store_id
WHERE epd.date = CURRENT_DATE
ORDER BY e.last_name;

-- 5C : Cohérence — total revenue PosSalesData = somme EmployeePerformanceDaily
SELECT
  'BLOCK 5C: Cohérence revenue' AS check_name,
  psd_total,
  epd_total,
  CASE
    WHEN ABS(psd_total - epd_total) < 0.01 THEN 'OK — Valeurs cohérentes'
    ELSE 'KO — Écart de ' || ROUND(ABS(psd_total - epd_total)::numeric, 2) || '€ — VÉRIFIER'
  END AS result
FROM (
  SELECT COALESCE(SUM(revenue), 0) AS psd_total FROM pos_sales_data WHERE date = CURRENT_DATE
) psd,
(
  SELECT COALESCE(SUM(total_sales), 0) AS epd_total FROM employee_performance_daily WHERE date = CURRENT_DATE
) epd;

-- ────────────────────────────────────────────────────────────
-- BLOCK 6 — PosEvents : statut des événements du jour
-- ────────────────────────────────────────────────────────────
SELECT
  event_type,
  COUNT(*) AS total,
  SUM(CASE WHEN processed_at IS NOT NULL AND error IS NULL THEN 1 ELSE 0 END) AS ok,
  SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN processed_at IS NULL AND error IS NULL THEN 1 ELSE 0 END) AS pending
FROM pos_events
WHERE created_at >= CURRENT_DATE
GROUP BY event_type
ORDER BY event_type;

-- BLOCK 6B : Détail des erreurs
SELECT
  id,
  event_type,
  store_id,
  employee_id,
  error,
  created_at
FROM pos_events
WHERE error IS NOT NULL
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 20;

-- ────────────────────────────────────────────────────────────
-- BLOCK 7 — Test idempotency (envoyer 2x le même saleId)
-- Résultat attendu : transactions = 1 (pas 2) pour ce saleId
-- ────────────────────────────────────────────────────────────
-- Après test doublon, vérifier :
SELECT
  event_type,
  payload->>'saleId' AS sale_id,
  COUNT(*) AS event_count,
  SUM(CASE WHEN processed_at IS NOT NULL AND error IS NULL THEN 1 ELSE 0 END) AS processed_count,
  CASE
    WHEN COUNT(*) > 1 AND SUM(CASE WHEN processed_at IS NOT NULL AND error IS NULL THEN 1 ELSE 0 END) = 1
    THEN 'OK — Idempotency OK : ' || COUNT(*) || ' events reçus, 1 seul traité'
    WHEN COUNT(*) = 1 THEN 'OK — Un seul event reçu'
    ELSE 'KO — Vérifier le guard'
  END AS idempotency_status
FROM pos_events
WHERE event_type = 'sale.completed'
  AND created_at >= CURRENT_DATE
  AND payload->>'saleId' IS NOT NULL
GROUP BY event_type, payload->>'saleId'
HAVING COUNT(*) > 1;
