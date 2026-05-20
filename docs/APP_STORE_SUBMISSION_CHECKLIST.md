# TimeWin24 — App Store Connect submission checklist

> Generated 2026-05-19. Pre-submission audit of the iOS Capacitor build.
>
> **Architecture rappel** : Capacitor v8 en mode *Remote URL* → la WebView
> charge directement `https://app.timewin24.com` (déployé via Vercel depuis
> la branche `appstore-saas`). La couche native est minimale : `@capacitor/app`,
> `keyboard`, `preferences`, `splash-screen`, `status-bar`.

---

## 0. État vérifié — server side

| Élément | Statut | Détail |
|---|---|---|
| Domaine WebView | ✅ | `https://app.timewin24.com` répond `HTTP/2 307 → /login` (Vercel + Next.js) |
| Projet Vercel | ✅ | `timewin24-saas-appstore` (`prj_6UALlEBC8drJreyoaDkxiiBrlGvk`) |
| Branche de prod | ✅ | `appstore-saas` (commit `3300f5e` au moment de l'audit) |
| UX mobile manager | ✅ | PR #3 `feat/mobile-manager-ux` mergée → safe-area sidebar + page `/aujourd-hui` + filtre établissement |
| HTTPS + HSTS | ✅ | `strict-transport-security: max-age=63072000; includeSubDomains; preload` |
| CSP | ✅ | Bloque iframes externes, frame-ancestors 'none' (OK pour WKWebView) |
| Permissions-Policy | ✅ | `camera=(self), geolocation=(self)` |

→ **Aucune action serveur requise pour soumettre.** L'archive iOS chargera la UI mobile fixée.

---

## 1. Configuration native iOS — audit

### `capacitor.config.ts`
- ✅ `appId: 'com.timewin24.app'`
- ✅ `appName: 'TimeWin24'`
- ✅ `server.url: 'https://app.timewin24.com'`, `cleartext: false`, `iosScheme: 'https'`
- ✅ `ios.contentInset: 'always'` (laisse iOS gérer la safe-area)
- ✅ `ios.limitsNavigationsToAppBoundDomains: false` (pas d'App-Bound Domains forcés)
- ✅ Plugins déclarés : `SplashScreen`, `StatusBar` (`DEFAULT` = texte sombre)

### `ios/App/App.xcodeproj/project.pbxproj`
- ✅ `PRODUCT_BUNDLE_IDENTIFIER = com.timewin24.app`
- ✅ `MARKETING_VERSION = 1.0`
- ✅ `CURRENT_PROJECT_VERSION = 2` (bump 1 → 2 actuellement **non commité**, à committer avant archive — chaque upload App Store doit avoir un build number unique)
- ✅ `DEVELOPMENT_TEAM = N45AQ98BS5`
- ✅ `CODE_SIGN_STYLE = Automatic`
- ✅ `IPHONEOS_DEPLOYMENT_TARGET = 15.0`

### `ios/App/App/Info.plist`
- ✅ `CFBundleDisplayName = TimeWin24`
- ✅ `ITSAppUsesNonExemptEncryption = false` (évite la question export compliance à chaque upload)
- ✅ `LSRequiresIPhoneOS = true`
- ⚠️ **`CFBundleDevelopmentRegion = en`** — devrait être `fr` (app française-first). Sinon la fiche App Store par défaut bascule en anglais et iOS prend l'anglais comme locale par défaut si la langue système n'est pas dans la liste.
- ⚠️ **Aucune `NSLocationWhenInUseUsageDescription`** — bloquant : `/pointage` (employé) et `/stores` (admin) appellent `navigator.geolocation.getCurrentPosition`. Sans usage string, iOS rejette silencieusement la permission, et **Apple Review reject** si le binaire contient un symbole de géoloc sans description.
- ⚠️ `UIRequiredDeviceCapabilities = [armv7]` — obsolète (armv7 = iPhone 5/5C/5S, plus supportés depuis iOS 11). À retirer ou remplacer par `arm64`. Pas bloquant mais Apple Review peut warn.
- ⚠️ `UISupportedInterfaceOrientations` inclut landscape iPhone — la UI sidebar/drawer est pensée portrait. Pas un blocker, mais en landscape la safe-area horizontale peut être ratée. **Recommandé V1** : portrait-only iPhone (laisser iPad libre).
- ℹ️ Pas de `UIBackgroundModes` — OK tant qu'on n'utilise pas push silencieux ni background fetch.

### Plugins Capacitor installés
```
@capacitor/app          @capacitor/keyboard      @capacitor/preferences
@capacitor/splash-screen @capacitor/status-bar
```
- ❌ Pas de `@capacitor/geolocation` — la géoloc passe par `navigator.geolocation` (Web API dans WKWebView). Fonctionne mais nécessite la usage string Info.plist ci-dessus.
- ❌ Pas de `@capacitor/push-notifications` — l'app utilise Web Push via service worker (`pushManager.subscribe` dans `src/components/register-sw.tsx`). **Web Push ne fonctionne PAS dans une WKWebView Capacitor** (uniquement en PWA standalone Safari iOS 16.4+).
  → **V1 : ne pas mentionner les notifications push dans la description App Store.** Si tu veux les push natives, il faudra ajouter le plugin Capacitor + APNs (out of scope soumission V1).

---

## 2. Bloquants à corriger AVANT archive

Ces 2 changements sont des modifs Info.plist + 1 commit pbxproj. Tous sur la branche `mobile-ios` :

### 2.1 Ajouter la usage string géolocation (bloquant Apple Review)

Dans `ios/App/App/Info.plist`, ajouter :

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>TimeWin24 utilise votre position uniquement au moment du pointage pour vérifier que vous êtes bien sur votre lieu de travail.</string>
```

(FR car app française-first. Apple accepte une seule string FR si CFBundleDevelopmentRegion=fr.)

### 2.2 Passer la région par défaut en français

```xml
<key>CFBundleDevelopmentRegion</key>
<string>fr</string>
```

### 2.3 Committer le bump build number

```bash
git -C /Users/omarfartas/time_win checkout mobile-ios
git add ios/App/App.xcodeproj/project.pbxproj ios/App/App/Info.plist
git commit -m "chore(ios): bump build to 2 + add geoloc usage string + locale fr"
```

---

## 3. Améliorations recommandées (non bloquantes)

- Retirer `UIRequiredDeviceCapabilities = [armv7]` (obsolète)
- Restreindre `UISupportedInterfaceOrientations` à portrait sur iPhone
- Ajouter une `LaunchScreen` brandée (actuellement storyboard par défaut Capacitor → écran blanc 1.5s)
- Considérer un dark mode StatusBar conditionnel (actuellement `style: DEFAULT` figé)

---

## 4. Workflow archive + upload (manuel — toi devant Xcode)

```bash
# 1. Toujours sur mobile-ios, après les fixes 2.1/2.2/2.3 :
nvm use 22
npx cap sync ios          # déjà fait dans cette session, à ré-exécuter après fixes
npx cap open ios          # ouvre Xcode sur ios/App/App.xcworkspace
```

Dans Xcode :
1. Sélectionner le scheme **App** + destination **Any iOS Device (arm64)**
2. Menu **Product → Archive** (5-10 min)
3. Window **Organizer** s'ouvre → **Distribute App** → **App Store Connect** → **Upload**
4. Signing : Automatically manage signing (team `N45AQ98BS5`)
5. Distribution Options : ✅ Upload symbols (Sentry crash symbolication), ✅ Manage version & build (laisse Apple gérer)
6. Upload (5-15 min selon réseau) → "Build received by App Store Connect"

→ Le build apparaît dans App Store Connect après 5-30 min de traitement (status "Processing" → "Ready to Submit").

---

## 5. Fiche App Store Connect — métadonnées à préparer

À remplir sur https://appstoreconnect.apple.com avant submission :

### App Information
- **Name** : TimeWin24 (30 char max — OK)
- **Subtitle** (30 char max) : *suggestion* "Pointage & planning équipe"
- **Primary category** : Business
- **Secondary category** : Productivity
- **Content Rights** : Does not contain third-party content
- **Age Rating** : 4+ (aucun contenu sensible)

### Pricing and Availability
- **Price** : Free (l'abonnement SaaS est géré côté Vercel/Stripe, hors App Store IAP). ⚠️ Si tu fais payer le SaaS via une URL externe accessible depuis l'app, **Apple peut rejeter** sous guideline 3.1.1 (les abonnements numériques consommés dans l'app doivent passer par IAP). Si l'abonnement est strictement *business-to-business* (gestion RH d'une entreprise, comme Slack/Asana), tu es probablement OK sous guideline 3.1.3(b) "Multiplatform Services" — il faut le justifier dans Review Notes.
- **Availability** : France (+ pays francophones cible : Belgique, Suisse, Luxembourg, Canada, Maroc, Tunisie, Algérie)

### App Privacy (Data Collection — obligatoire)
Cliquer "Get Started" → déclarer (vrai pour TimeWin24) :
- **Contact Info → Name, Email** : collecté, lié à l'identité, pour App Functionality
- **Identifiers → User ID** : collecté, lié à l'identité, App Functionality
- **Location → Precise Location** : collecté **uniquement au pointage**, lié à l'identité, App Functionality
- **Usage Data → Product Interaction** : collecté (Sentry), non lié à l'identité, Analytics
- **Diagnostics → Crash Data, Performance Data** : collecté (Sentry), non lié à l'identité, App Functionality

### Description (FR — locale par défaut)
Brouillon :
```
TimeWin24 est l'app de gestion d'équipe pour les gérants et les employés
des magasins, restaurants et services. Pointez en un geste, suivez vos
heures, échangez vos shifts.

Pour les employés :
• Pointage géolocalisé en 1 tap
• Mon planning de la semaine
• Demandes d'absence et de remplacement
• Marché d'échange de shifts entre collègues

Pour les managers :
• Vue "Aujourd'hui" — qui est en poste, qui est en retard, qui manque
• Planning hebdo drag & drop
• Alertes en temps réel (retard, non-pointage, absence)
• Gestion multi-établissement

TimeWin24 nécessite un compte créé par votre employeur.
Plus d'infos : https://timewin24.com
```

### Keywords (100 char max, virgules sans espaces)
*Suggestion* : `pointage,planning,équipe,RH,horaires,shift,manager,employé,absence,restaurant`

### Support URL
`https://timewin24.com/support` (à créer si pas encore là)

### Marketing URL (optionnel)
`https://timewin24.com`

### Privacy Policy URL (**obligatoire**)
`https://timewin24.com/privacy` — **vérifier qu'elle existe et qu'elle couvre** :
- Collecte de la position (avec mention "uniquement au moment du pointage")
- Cookies de session NextAuth
- Sentry (anonymisation IP, durée de rétention)
- Droits RGPD (accès, rectification, suppression)

### Screenshots (obligatoires)
Apple exige **minimum 2 tailles** :

1. **iPhone 6.7"** (1290 × 2796 px) — iPhone 15 Pro Max / 14 Pro Max / 16 Pro Max
2. **iPhone 6.5"** (1242 × 2688 px ou 1284 × 2778 px) — iPhone 11 Pro Max / XS Max

> Optionnel mais recommandé : iPad 13" (2064 × 2752 px) si tu veux pousser iPad.

3-5 screenshots minimum. Suggestion de cadrage (depuis le simulateur iPhone 15 Pro Max, après login) :
- Page `/aujourd-hui` (manager) — vue "Qui est en poste ?"
- Page `/planning` desktop (week timeline drag&drop) — démonter la valeur manager
- Page `/mon-planning` (employé) — vue semaine
- Page `/pointage` — bouton géoloc + état pointé
- Page `/marche-shifts` (échanges) — différenciateur

### Review Notes (champ critique pour passer Review)
```
Test account (manager):
  Email: review@timewin24.com
  Password: <à fournir>

Test account (employee):
  Email: review-emp@timewin24.com
  Password: <à fournir>

Architecture:
  TimeWin24 is a Capacitor wrapper around a Next.js SaaS hosted at
  https://app.timewin24.com. The native shell adds status-bar / keyboard
  / lifecycle handling. All business logic lives server-side.

  This is a B2B workforce management tool for retail/restaurant teams.
  Accounts are provisioned by the employer (admin) — there is no public
  signup. The reviewer should use the provided manager and employee
  test accounts.

  The location permission is requested ONLY when an employee taps
  "Pointer mon arrivée" on the /pointage screen — to verify physical
  presence at the workplace. No background location tracking.

  Subscriptions: The SaaS subscription is paid by the employer
  (business entity) outside the app, via standard web checkout. This
  is a multiplatform B2B service per guideline 3.1.3(b) — comparable
  to Slack / Asana / Notion. No IAP is required for end-user access.
```

### Export Compliance
- ✅ Déjà déclaré dans Info.plist : `ITSAppUsesNonExemptEncryption = false` → Apple ne posera pas la question à chaque upload.
- L'app utilise HTTPS standard (exempté par défaut, voir Encryption Registration Number = N/A).

---

## 6. Checklist finale avant "Submit for Review"

- [ ] Fixes Info.plist appliqués (NSLocationWhenInUseUsageDescription + CFBundleDevelopmentRegion=fr)
- [ ] Commit du bump CURRENT_PROJECT_VERSION → 2 sur `mobile-ios`
- [ ] `npx cap sync ios` ré-exécuté après les fixes
- [ ] Build archive Xcode → Upload OK → "Ready to Submit" dans App Store Connect
- [ ] Fiche App Store remplie (nom, subtitle, description FR, keywords, catégorie, age rating)
- [ ] Privacy Policy en ligne sur `https://timewin24.com/privacy`
- [ ] Support URL en ligne
- [ ] App Privacy déclarée (5 catégories : Contact, ID, Location, Usage, Diagnostics)
- [ ] 3+ screenshots iPhone 6.7" + 3+ screenshots iPhone 6.5"
- [ ] Test accounts manager + employee créés en prod et fournis dans Review Notes
- [ ] Review Notes rédigées (architecture remote URL + justification B2B subscription)
- [ ] Build sélectionné dans la version 1.0 de la fiche
- [ ] **Submit for Review** → délai Apple moyen 24-48h

---

## 7. Plan de réponse aux rejets probables

| Rejet probable | Réponse |
|---|---|
| 3.1.1 (paiements hors IAP) | Renvoyer vers guideline **3.1.3(b)** : multiplatform B2B service, comptes provisionnés par employeur, comparable Slack/Asana. Joindre URL d'un employeur signataire. |
| 4.2 (Minimum Functionality — "looks like a website") | Argumenter la **couche native** : push (à terme), géoloc, status bar, keyboard handling, splash screen, biometric (à venir). Joindre screenshots où la chrome native est visible. |
| 5.1.1 (privacy) | Vérifier que la usage string géoloc explique CLAIREMENT le but. Pointer vers la Privacy Policy en ligne. |
| 5.1.5 (Location services without functional benefit) | Démontrer que sans géoloc le pointage perd sa valeur anti-fraude (un employé peut pointer depuis chez lui sinon). |
