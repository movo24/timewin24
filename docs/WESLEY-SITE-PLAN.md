# The Wesley — plan du site (radar commercial, pas vitrine)

> Objectif : un système **e-commerce + retail intelligence + SEO/IA + store locator +
> dashboard expansion**. Pas un site corporate. Ce document mappe l'intégralité du brief
> en V1/V2/V3 et trace ce qui est déjà construit.

## ⚠️ Décision de placement (à trancher)

Ce code vit aujourd'hui dans le repo `timewin24` (appli RH/planning **interne**), en module
isolé sous `src/app/wesley/`. The Wesley est un **produit distinct** (site public retail,
autre data model, autre déploiement, autres contraintes RGPD/paiement). **Recommandation :
extraire dans son propre repo/déploiement** dès que la V1 est validée. Le module est
volontairement autonome pour rendre cette extraction triviale.

---

## ✅ Construit en V1 (front-office, dans ce commit)

| Écran / brique | Fichier |
|---|---|
| Shell (nav, footer, bandeau consentement) | `src/app/wesley/layout.tsx` |
| Accueil (hero, viraux, catégories, nouveautés, petits prix, store finder, CTA ville) | `src/app/wesley/page.tsx` |
| Catalogue + filtres (catégorie, prix, tri viral/prix/nouveau/best) | `src/app/wesley/catalogue/page.tsx` + `components/wesley/catalogue-grid.tsx` |
| Fiche produit (prix, bénéfice, stock web + magasin, similaires, **JSON-LD Product/Offer**) | `src/app/wesley/produit/[slug]/page.tsx` |
| Store locator + pages SEO magasin (**JSON-LD Store**, itinéraire, produits stars, "bientôt ouvert") | `src/app/wesley/magasins/[…]` |
| Creator Studio (kits, matériel, guides) | `src/app/wesley/creator-studio/page.tsx` |
| "Je veux The Wesley dans ma ville" (form + API rate-limitée) | `src/app/wesley/ville/page.tsx` + `src/app/api/wesley/city-request/route.ts` |
| Confidentialité & cookies (stub RGPD) | `src/app/wesley/confidentialite/page.tsx` |
| Couche d'événements (GA4-ready, **bloquée sans consentement**) | `src/app/wesley/analytics.ts` |
| Données seed typées (produits, catégories, magasins) | `src/app/wesley/data.ts` |

**Événements câblés** (nomenclature du brief) : `page_view`, `view_item`, `select_item`,
`add_to_cart`, `wishlist_add`, `product_share`, `city_request`. Les autres
(`begin_checkout`, `purchase`, `abandoned_cart`, `store_locator_view`,
`click_store_direction`, `newsletter_signup`) sont définis dans le type et à brancher avec
l'e-commerce (V2).

### Limites V1 assumées
- Données **statiques** (`data.ts`) — pas de DB catalogue ni de stock POS temps réel.
- Pas de panier persistant / paiement (émission d'événements seulement).
- `city-request` **logue** la demande (pas encore de table) — à persister en V2.
- Pas d'assets : visuels = emojis placeholders.

---

## 🟡 V2 — quand la base tourne

- **E-commerce complet** : panier persistant, checkout (CB/Apple Pay/Google Pay), livraison,
  **click & collect**, code promo, suivi commande, emails transactionnels, relance panier.
- **Catalogue en base (PIM)** : modèles Prisma Produit/Catégorie/Variante/Prix/Stock, remplace `data.ts`.
- **Stock par magasin + connexion POS** (réutiliser le pont POS existant de timewin24 : `PosProvider`/`PosStoreLink`/webhook HMAC).
- **Compte client** : commandes, factures, wishlist, magasin favori, **export/suppression RGPD**.
- **Fidélité** simple (1 € = X points → bon d'achat) ; **CRM** segments + emailing/SMS.
- **Influenceuses** : codes uniques, liens trackés, ventes par créatrice.
- **Dashboards** : trafic/produits/**villes**/paniers abandonnés, supply/reorder, expansion géographique.
- **Persistance `city_request`** → table dédiée → **score d'ouverture ville**.
- **Meta Conversions API** côté serveur (consentement propre).

## 🔵 V3 — quand le réseau grossit

- IA de pilotage (résumé direction, "pourquoi le CA baisse", reorder proposé, pricing).
- Prévision ventes + **réassort intelligent** (critique : délai Chine ~90 j).
- Personnalisation, app mobile + push, ambassadeurs, heatmap expansion, (live shopping si ROI prouvé).
- Connexion complète POS / TimeWin24 / Comptamax24.

---

## Modules "radar" (cœur de la valeur, V2/V3)

- **Viral Score** : vues + partages + ajouts panier + ventes rapides + mentions social + stock faible + conversion. → quoi pousser en magasin.
- **Produit abandonné** : ajouté souvent / acheté rarement, consulté non ajouté, abandon checkout, prix/photo/frais bloquants.
- **Ville chaude** : trafic local + recherches "magasin" + paniers abandonnés sans magasin + répétition régionale → aide à l'expansion.
- **Réassort intelligent** : ventes moy + accélération + stock + délai fournisseur + sécurité + saisonnalité + mise en avant prévue.
- **Magasin connecté** : vu en ligne vs vendu magasin, stock web vs POS, alignement prix.

## Dashboards prévus (V2+)
CEO/direction · e-commerce · acquisition · **géographique (score ouverture)** · produit ·
**stock/supply (vital vu les 90 j)** · magasin · client/CRM · SEO-IA · SAV/qualité · finance (export Comptamax24).

## À NE PAS faire en V1 (piège "Ferrari digitale")
Marketplace externe, réseau social interne, live shopping complexe, app mobile immédiate,
perso IA avancée, 50 dashboards, fidélité usine à gaz, gamification lourde, blog sans stratégie produit.

---

## Lancer en local
Le module est servi sous **`/wesley`** (public, hors auth) — ex. `http://localhost:3000/wesley`.
Aucune dépendance ajoutée ; build standard (`npm run build`).
