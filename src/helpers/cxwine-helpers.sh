#!/usr/bin/env bash

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    echo "cxwine-helpers.sh is a library; source it from build-cxwine.sh instead." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
c_blue=$'\033[1;34m'; c_grn=$'\033[1;32m'; c_yel=$'\033[1;33m'
c_red=$'\033[1;31m'; c_cyn=$'\033[1;36m'; c_dim=$'\033[2m'; c_rst=$'\033[0m'

log()  { printf '\n%s==> %s%s\n' "$c_blue" "$*" "$c_rst"; }
ok()   { printf '%s  ✓ %s%s\n'   "$c_grn" "$*" "$c_rst"; }
warn() { printf '%s  ! %s%s\n'   "$c_yel" "$*" "$c_rst"; }
err()  { printf '%s  ✗ %s%s\n'   "$c_red" "$*" "$c_rst" >&2; }
die()  { err "$*"; exit 1; }

confirm() {   # confirm "question"  -> 0 if yes
    local a; printf '%s%s [y/N]%s ' "$c_yel" "$1" "$c_rst"; read -r a
    case "$(printf '%s' "${a:-}" | tr '[:upper:]' '[:lower:]')" in y|yes) return 0;; *) return 1;; esac
}
pause() { printf '\n%sPress Enter to continue…%s' "$c_dim" "$c_rst"; read -r _; }

# ---------------------------------------------------------------------------
# Environment probes
# ---------------------------------------------------------------------------
brew86() { arch -x86_64 "$X86_BREW" "$@"; }
have_brew86() { [ -x "$X86_BREW" ]; }
have_rosetta() { arch -x86_64 /usr/bin/true 2>/dev/null; }
have_clt() { local p; p="$(xcode-select -p 2>/dev/null)" && [ -n "$p" ] && [ -d "$p" ]; }

# ---------------------------------------------------------------------------
# Prerequisite installers
# ---------------------------------------------------------------------------
install_rosetta() {
    if have_rosetta; then ok "Rosetta 2 works"; return 0; fi
    warn "installing Rosetta 2 (softwareupdate)…"
    softwareupdate --install-rosetta --agree-to-license || warn "Rosetta install failed"
    have_rosetta && ok "Rosetta 2 installed" || warn "Rosetta still unavailable"
}

install_clt() {
    if have_clt; then ok "Xcode Command Line Tools present ($(xcode-select -p))"; return 0; fi
    warn "requesting Xcode Command Line Tools — a system dialog will pop up"
    xcode-select --install 2>/dev/null || true
    printf '%sComplete the CLT installer dialog, then press Enter…%s' "$c_dim" "$c_rst"; read -r _
    have_clt && ok "Command Line Tools installed" || warn "CLT still not detected — install it, then retry"
}

fix_brew86_perms() {
    log "repair — fixing $X86_BREW_PREFIX ownership for brew86 (needs sudo)"
    local d paths=()
    for d in bin etc include lib sbin share var opt Cellar Caskroom Frameworks Homebrew; do
        [ -e "$X86_BREW_PREFIX/$d" ] && paths+=("$X86_BREW_PREFIX/$d")
    done
    sudo mkdir -p "$X86_BREW_PREFIX/share/zsh/site-functions"
    [ "${#paths[@]}" -gt 0 ] && sudo chown -R "$(whoami):admin" "${paths[@]}" 2>/dev/null || true
    sudo chmod -R u+w "$X86_BREW_PREFIX/share/zsh" 2>/dev/null || true
    ok "permissions repaired"
}

# ---------------------------------------------------------------------------
# Toolchain helpers (SDK detection, formula patch, x86_64 env)
# ---------------------------------------------------------------------------
find_build_sdk() {
    local base s
    for base in /Library/Developer/CommandLineTools/SDKs \
                /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs; do
        for s in MacOSX15.sdk MacOSX15.4.sdk MacOSX14.sdk MacOSX14.4.sdk MacOSX13.sdk; do
            [ -d "$base/$s" ] && { printf '%s\n' "$base/$s"; return 0; }
        done
    done
    return 1
}

patch_gptk_formula() {
    local f; f="$(brew86 formula "$GPTK_COMPILER" 2>/dev/null)"
    [ -n "$f" ] && [ -f "$f" ] || { warn "GPTK compiler formula not found; skipping patch"; return 0; }
    if grep -q "CMAKE_POLICY_VERSION_MINIMUM" "$f"; then ok "GPTK compiler formula already patched"; return 0; fi

    local sdk; sdk="$(find_build_sdk)"
    local inject='                      "-DCMAKE_POLICY_VERSION_MINIMUM=3.5",\n'
    if [ -n "$sdk" ]; then
        inject="$inject""                      \"-DCMAKE_OSX_SYSROOT=$sdk\",\n"
        inject="$inject"'                      "-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0",\n'
        ok "using build SDK: $sdk"
    else
        warn "no macOS <=15 SDK found; build may fail on macOS 26 SDK libc++"
    fi
    INJECT="$inject" perl -0pi -e 's/(system "cmake", "-G", "Ninja",\n)/$1 . $ENV{INJECT}/e' "$f" \
        && grep -q "CMAKE_POLICY_VERSION_MINIMUM" "$f" \
        && ok "patched GPTK compiler formula (CMake policy + SDK)" \
        || warn "could not patch formula ($f)"
}

setup_x86_env() {
    local gptk="$X86_BREW_PREFIX/opt/game-porting-toolkit-compiler/bin/clang"
    local llvm="$X86_BREW_PREFIX/opt/llvm/bin/clang"
    local cc=""
    if [ -x "$gptk" ]; then cc="$gptk"
    elif [ -x "$llvm" ]; then cc="$llvm"; fi
    [ -n "$cc" ] || die "no x86_64 clang found. Run 'deps' first (installs llvm; tries GPTK compiler)."
    export CC="$cc" CXX="${cc}++"
    ok "toolchain: $cc"
    export PATH="$X86_BREW_PREFIX/opt/bison/bin:$X86_BREW_PREFIX/opt/flex/bin:$X86_BREW_PREFIX/bin:$PATH"
    export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig:$X86_BREW_PREFIX/lib/pkgconfig:$X86_BREW_PREFIX/share/pkgconfig"
    export CPPFLAGS="-I$X86_BREW_PREFIX/include ${CPPFLAGS:-}"
    export LDFLAGS="-L$X86_BREW_PREFIX/lib ${LDFLAGS:-}"
}

# ---------------------------------------------------------------------------
# Live progress runner
# ---------------------------------------------------------------------------
run_step() {
    local label="$1"; shift
    local logf="${TMPDIR:-/tmp}/cxwine.$$.$(date +%s).log"
    local start; start=$(date +%s)
    "$@" >"$logf" 2>&1 &
    local pid=$! sp='|/-\' i=0
    while kill -0 "$pid" 2>/dev/null; do
        local n el last
        n=$(wc -l <"$logf" 2>/dev/null | tr -d ' ')
        el=$(( $(date +%s) - start ))
        last=$(tail -n 1 "$logf" 2>/dev/null | tr -d '\r\t')
        i=$(( (i + 1) % 4 ))
        printf '\r\033[K  %s%s%s %s  [%02d:%02d · %s lines] %.44s' \
               "$c_cyn" "${sp:$i:1}" "$c_rst" "$label" $((el/60)) $((el%60)) "${n:-0}" "$last"
        sleep 1
    done
    wait "$pid"; local rc=$?
    local el=$(( $(date +%s) - start ))
    printf '\r\033[K'
    if [ "$rc" -eq 0 ]; then
        ok "$label — done in $((el/60))m$((el%60))s"; rm -f "$logf"
    else
        err "$label — FAILED (rc=$rc). Last 25 lines:"; tail -n 25 "$logf" >&2
        printf '%s  full log: %s%s\n' "$c_dim" "$logf" "$c_rst" >&2
    fi
    return $rc
}

# ---------------------------------------------------------------------------
# Shared UI pieces
# ---------------------------------------------------------------------------
banner() {
    printf '%s' "$c_blue"
    cat <<'ART'
 _____              __        ___
| ____|__ _ ___ _   \ \      / (_)_ __   ___
|  _| / _` / __| | | \ \ /\ / /| | '_ \ / _ \
| |__| (_| \__ \ |_| |\ V  V / | | | | |  __/
|_____\__,_|___/\__, | \_/\_/ _|_|_| |_|\___|     _
 / ___|___  _ __|___/ _ __ (_) | ___  | | | | ___| |_ __   ___ _ __
| |   / _ \| '_ ` _ \| '_ \| | |/ _ \ | |_| |/ _ \ | '_ \ / _ \ '__|
| |__| (_) | | | | | | |_) | | |  __/ |  _  |  __/ | |_) |  __/ |
 \____\___/|_| |_| |_| .__/|_|_|\___| |_| |_|\___|_| .__/ \___|_|
                     |_|                           |_|
ART
    printf '%s' "$c_rst"
    printf '   %sEasy Wine Compile Helper%s — CrossOver Wine + D3DMetal · x86_64 · Apple Silicon\n\n' "$c_cyn" "$c_rst"
}

downloads_help() {
    printf '  %s┌─ Downloads you need ─────────────────────────────────────────────┐%s\n' "$c_dim" "$c_rst"
    printf '  %s1. CrossOver source%s  (the Wine tree + bundled deps this script builds)\n' "$c_cyn" "$c_rst"
    printf '       %shttps://media.codeweavers.com/pub/crossover/source/%s\n' "$c_blue" "$c_rst"
    printf '       pick  crossover-sources-<version>.tar.gz , extract it so a\n'
    printf '       %swine/%s folder exists in the CrossOver source root:\n' "$c_grn" "$c_rst"
    printf '       %sSRC_ROOT=%s%s\n' "$c_dim" "$SRC_ROOT" "$c_rst"
    printf '\n'
    printf '  %s2. Apple Game Porting Toolkit%s  (provides D3DMetal — the fast D3D→Metal layer)\n' "$c_cyn" "$c_rst"
    printf '       %shttps://developer.apple.com/games/game-porting-toolkit/%s\n' "$c_blue" "$c_rst"
    printf '       • you MUST sign in with your Apple Account to download\n'
    printf '         (a %sfree%s Apple Developer account is enough — no paid membership)\n' "$c_grn" "$c_rst"
    printf '       • mount the .dmg, then its inner “Evaluation environment for Windows\n'
    printf '         games” .dmg → contains  redist/lib  (D3DMetal.framework + d3d DLLs)\n'
    printf '       • after building Wine, use menu option 4 to overlay it.\n'
    printf '  %s└──────────────────────────────────────────────────────────────────┘%s\n\n' "$c_dim" "$c_rst"
}
