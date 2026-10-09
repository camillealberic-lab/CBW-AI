#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CBW AI — installation en une ligne (macOS, Apple Silicon)
#
#   curl -fsSL https://cbw-ai-liard.vercel.app/install.sh | bash
#
# Ce que fait ce script, et rien d'autre :
#   1. Vérifie ton Mac : puce Apple Silicon (arm64) et macOS 14 ou plus.
#   2. Télécharge la dernière version publiée sur GitHub :
#        https://github.com/camillealberic-lab/CBW-AI/releases/latest
#      (CBW-AI-arm64.dmg + SHA256SUMS.txt) dans un dossier temporaire.
#   3. Vérifie l'empreinte SHA-256 du DMG. Si elle ne correspond pas : arrêt.
#   4. Monte le DMG en lecture seule (invisible dans le Finder).
#   5. Quitte CBW AI s'il est ouvert.
#   6. Copie « CBW AI.app » dans /Applications (ou $CBW_INSTALL_DIR).
#      L'ancienne version est gardée de côté jusqu'à la fin, puis supprimée.
#   7. Retire l'attribut de quarantaine (com.apple.quarantine) de l'app :
#      c'est ce qui évite l'avertissement « Élément non ouvert » de macOS.
#   8. Vérifie la signature de l'app (codesign --verify --deep --strict).
#   9. Démonte le DMG, supprime les fichiers temporaires, ouvre CBW AI.
#
# Jamais de sudo. Rien n'est envoyé nulle part. Le code est lisible ici :
#   https://github.com/camillealberic-lab/CBW-AI
#
# Variables optionnelles :
#   CBW_INSTALL_DIR=/chemin   dossier d'installation (défaut : /Applications)
#   CBW_NO_OPEN=1             ne pas ouvrir l'app à la fin
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Tout est dans une fonction appelée à la dernière ligne : si le téléchargement
# du script est coupé en route, rien ne s'exécute à moitié.
main() {
  local REPO_DL="https://github.com/camillealberic-lab/CBW-AI/releases/latest/download"
  local DMG_NAME="CBW-AI-arm64.dmg"
  local APP_NAME="CBW AI.app"
  DEST_DIR="${CBW_INSTALL_DIR:-/Applications}"
  DEST_DIR="${DEST_DIR%/}"
  TARGET="$DEST_DIR/$APP_NAME"   # global : utilisé par le nettoyage final

  if [ -t 1 ]; then
    B=$'\033[1m'; V=$'\033[32m'; R=$'\033[31m'; G=$'\033[2m'; N=$'\033[0m'
  else
    B=""; V=""; R=""; G=""; N=""
  fi
  etape() { printf '%s→%s %s\n' "$B" "$N" "$*"; }
  ok()    { printf '  %s✓%s %s\n' "$V" "$N" "$*"; }
  echec() { printf '\n%s✗ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }

  printf '\n%sCBW AI%s — installation\n\n' "$B" "$N"

  # 1. Compatibilité
  etape "Vérification du Mac"
  [ "$(uname -s)" = "Darwin" ] || echec "Ce script est réservé à macOS."
  [ "$(uname -m)" = "arm64" ] || echec "CBW AI demande une puce Apple Silicon (M1 et +). Les Mac Intel ne sont pas pris en charge."
  local VERS MAJ
  VERS="$(sw_vers -productVersion)"
  MAJ="${VERS%%.*}"
  [ "$MAJ" -ge 14 ] 2>/dev/null || echec "CBW AI demande macOS 14 ou plus (tu as macOS $VERS)."
  ok "Apple Silicon, macOS $VERS"

  # Droits d'écriture (jamais de sudo en douce)
  if [ ! -d "$DEST_DIR" ]; then
    echec "Le dossier « $DEST_DIR » n'existe pas."
  fi
  if [ ! -w "$DEST_DIR" ] || { [ -e "$TARGET" ] && [ ! -w "$TARGET" ]; }; then
    echec "Impossible d'écrire dans « $DEST_DIR » avec ton compte.
  Ce script n'utilise jamais sudo. Deux options :
   - installe depuis un compte administrateur ;
   - ou télécharge le DMG sur https://cbw-ai-liard.vercel.app et glisse l'app dans Applications."
  fi

  # Dossier temporaire + nettoyage garanti
  TMP="$(mktemp -d "${TMPDIR:-/tmp}/cbw-ai.XXXXXX")"
  MNT="$TMP/volume"
  MONTE=0
  BACKUP=""
  nettoyer() {
    local code=$?
    if [ "$MONTE" = 1 ]; then hdiutil detach "$MNT" -quiet -force >/dev/null 2>&1 || true; fi
    # Échec après le retrait de l'ancienne version : on la remet en place.
    if [ -n "$BACKUP" ] && [ -e "$BACKUP" ]; then
      if [ ! -e "$TARGET" ]; then mv "$BACKUP" "$TARGET" 2>/dev/null && printf '  Ancienne version restaurée.\n' >&2; else rm -rf "$BACKUP"; fi
    fi
    rm -rf "$TARGET.cbw-new" 2>/dev/null || true
    rm -rf "$TMP"
    exit "$code"
  }
  trap nettoyer EXIT
  trap 'exit 130' INT TERM

  # 2. Téléchargement
  etape "Téléchargement de la dernière version"
  curl -fL --progress-bar --retry 3 -o "$TMP/$DMG_NAME" "$REPO_DL/$DMG_NAME" </dev/null \
    || echec "Téléchargement impossible. Vérifie ta connexion et réessaie."
  curl -fsSL --retry 3 -o "$TMP/SHA256SUMS.txt" "$REPO_DL/SHA256SUMS.txt" </dev/null \
    || echec "Impossible de récupérer SHA256SUMS.txt."
  ok "$DMG_NAME ($(( $(stat -f%z "$TMP/$DMG_NAME") / 1048576 )) Mo)"

  # 3. Empreinte SHA-256
  etape "Vérification de l'empreinte SHA-256"
  local ATTENDU RECU
  ATTENDU="$(awk -v f="$DMG_NAME" '$2==f || $2=="*"f {print tolower($1); exit}' "$TMP/SHA256SUMS.txt")"
  [ -n "$ATTENDU" ] || echec "Empreinte de $DMG_NAME absente de SHA256SUMS.txt."
  RECU="$(shasum -a 256 "$TMP/$DMG_NAME" | awk '{print tolower($1)}')"
  [ "$ATTENDU" = "$RECU" ] || echec "Empreinte incorrecte : le fichier est corrompu ou modifié. Installation annulée.
  attendu : $ATTENDU
  reçu    : $RECU"
  ok "SHA-256 conforme ${G}${RECU}${N}"

  # 4. Montage en lecture seule
  etape "Ouverture du DMG"
  mkdir -p "$MNT"
  hdiutil attach "$TMP/$DMG_NAME" -nobrowse -readonly -noautoopen -mountpoint "$MNT" -quiet </dev/null \
    || echec "Impossible de monter le DMG."
  MONTE=1
  [ -d "$MNT/$APP_NAME" ] || echec "« $APP_NAME » introuvable dans le DMG."
  local VERSION_APP
  VERSION_APP="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$MNT/$APP_NAME/Contents/Info.plist" 2>/dev/null || echo '?')"
  ok "CBW AI $VERSION_APP"

  # 5. Quitter l'app si elle tourne (seulement celle qu'on remplace)
  if pgrep -f "$TARGET/Contents/MacOS/" >/dev/null 2>&1; then
    etape "Fermeture de CBW AI"
    local BID
    BID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$TARGET/Contents/Info.plist" 2>/dev/null || true)"
    if [ -n "$BID" ]; then osascript -e "tell application id \"$BID\" to quit" >/dev/null 2>&1 || true; fi
    local i
    for i in $(seq 1 20); do
      pgrep -f "$TARGET/Contents/MacOS/" >/dev/null 2>&1 || break
      sleep 0.5
    done
    if pgrep -f "$TARGET/Contents/MacOS/" >/dev/null 2>&1; then
      pkill -TERM -f "$TARGET/Contents/MacOS/" 2>/dev/null || true
      sleep 2
    fi
    pgrep -f "$TARGET/Contents/MacOS/" >/dev/null 2>&1 && echec "CBW AI ne se ferme pas. Quitte-le (⌘Q) puis relance la commande."
    ok "CBW AI fermé"
  fi

  # 6. Copie (l'ancienne version reste de côté jusqu'au succès)
  etape "Copie dans $DEST_DIR"
  rm -rf "$TARGET.cbw-new"
  ditto "$MNT/$APP_NAME" "$TARGET.cbw-new" || echec "La copie a échoué (espace disque ?)."
  if [ -e "$TARGET" ]; then
    BACKUP="$TARGET.cbw-backup"
    rm -rf "$BACKUP"
    mv "$TARGET" "$BACKUP" || { BACKUP=""; echec "Impossible de remplacer l'ancienne version."; }
  fi
  mv "$TARGET.cbw-new" "$TARGET" || echec "Impossible de mettre la nouvelle version en place."
  ok "$TARGET"

  # 7. Quarantaine
  etape "Retrait de la quarantaine macOS"
  xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true
  if xattr -lr "$TARGET" 2>/dev/null | grep -q com.apple.quarantine; then
    echec "La quarantaine n'a pas pu être retirée."
  fi
  ok "Aucun attribut com.apple.quarantine"

  # 8. Signature
  etape "Vérification de la signature"
  codesign --verify --deep --strict "$TARGET" 2>"$TMP/codesign.log" \
    || echec "Signature invalide : installation annulée.
$(cat "$TMP/codesign.log")"
  ok "codesign --verify --deep --strict : OK"

  # Succès : on supprime l'ancienne version
  if [ -n "$BACKUP" ]; then rm -rf "$BACKUP"; BACKUP=""; fi

  # 9. Démontage (le trap s'occupe du reste) puis ouverture
  hdiutil detach "$MNT" -quiet >/dev/null 2>&1 && MONTE=0 || true

  printf '\n%s✓ CBW AI %s est installé.%s\n' "$V$B" "$VERSION_APP" "$N"
  if [ "${CBW_NO_OPEN:-0}" != "1" ]; then
    open "$TARGET"
    printf "  L'app s'ouvre : elle te guide pour le micro et l'Accessibilité.\n\n"
  else
    printf "  Pour l'ouvrir : open \"%s\"\n\n" "$TARGET"
  fi
}

main "$@"
