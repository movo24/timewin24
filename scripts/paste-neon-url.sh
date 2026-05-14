#!/bin/bash
# Wizard simple : demande l'URL Neon, l'enregistre dans /tmp/neon-saas.url
# avec permissions 600. URL masquée pendant la saisie.

set -e

TARGET="/tmp/neon-saas.url"

echo "════════════════════════════════════════════════════════════════════════"
echo " Wizard — récupération URL Neon SaaS"
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo " Colle ici l'URL Neon (commence par postgresql://)"
echo " Elle sera masquée pendant la saisie. Appuie sur Entrée à la fin."
echo ""

# -s = silent (masque la saisie), -r = pas d'interprétation des backslashes
read -s -r -p " URL : " URL
echo ""

# Validation basique
if [ -z "$URL" ]; then
  echo "❌ Aucune URL collée. Abandon."
  exit 1
fi

if [[ ! "$URL" =~ ^postgres(ql)?:// ]]; then
  echo "❌ L'URL ne commence pas par postgresql:// — abandon."
  exit 1
fi

if [[ "$URL" == *"USER:PASS"* ]] || [[ "$URL" == *"@HOST"* ]]; then
  echo "❌ C'est encore le placeholder (USER/PASS/HOST). Abandon."
  echo "   Copie la vraie URL depuis le bouton Connect de Neon."
  exit 1
fi

# Écriture sécurisée
echo -n "$URL" > "$TARGET"
chmod 600 "$TARGET"

SIZE=$(wc -c < "$TARGET" | tr -d ' ')
echo ""
echo "✅ Fichier écrit dans $TARGET"
echo "   Taille      : $SIZE octets"
echo "   Permissions : $(stat -f '%Mp%Lp' "$TARGET")"
echo "   Début masqué: $(echo "$URL" | cut -c1-20)..."
echo "   Host        : $(echo "$URL" | sed -E 's|.*@([^:/]+).*|\1|' | sed 's/^\(......\)/\1***/')"
echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo " Étape suivante : retourne dans le chat et écris 'fichier prêt'"
echo "════════════════════════════════════════════════════════════════════════"
