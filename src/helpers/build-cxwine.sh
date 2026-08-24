#!/usr/bin/env bash

if [ -z "${BASH_VERSION:-}" ] || case ":${SHELLOPTS:-}:" in (*:posix:*) true ;; (*) false ;; esac; then
    exec bash "$0" "$@"
fi

set -uo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # the helper/ folder

_find_src_root() {
    local d
    for d in "$HERE/.." "$HERE" "$PWD"; do
        [ -d "$d/wine" ] && { (cd "$d" && pwd); return 0; }
    done
    (cd "$HERE/.." && pwd)   # sensible fallback: parent of helper/
}
SRC_ROOT="${SRC_ROOT:-$(_find_src_root)}"
PREFIX="${PREFIX:-$HOME/cxwine}"
JOBS="$(sysctl -n hw.ncpu)"
X86_BREW_PREFIX="/usr/local"
X86_BREW="$X86_BREW_PREFIX/bin/brew"
GPTK_COMPILER="apple/apple/game-porting-toolkit-compiler"
AUTHOR_NAME="${AUTHOR_NAME:-Mohammadreza Abdolalipour}"
AUTHOR_GITHUB="${AUTHOR_GITHUB:-https://github.com/mhmdrz}"

TOOLCHAIN_PKGS="mingw-w64 meson ninja cmake pkgconf bison flex nasm glslang llvm"
LIB_PKGS="freetype gnutls gstreamer gst-plugins-base gst-plugins-good glib molten-vk vulkan-headers vulkan-loader"

ALL_PHASES="prereqs brew86 deps vkd3d wine dxvk assemble launcher"

# ---------------------------------------------------------------------------
# Load helpers (colours, output, brew86, toolchain, run_step, banner, …)
# ---------------------------------------------------------------------------
CXWINE_LIB="${CXWINE_LIB:-$HERE}"   # helpers live in the same folder
# shellcheck source=cxwine-helpers.sh
. "$CXWINE_LIB/cxwine-helpers.sh" 2>/dev/null \
    || { echo "ERROR: cannot source $CXWINE_LIB/cxwine-helpers.sh" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Build phases
# ---------------------------------------------------------------------------
phase_prereqs() {
    log "prereqs — Apple Silicon · Rosetta 2 · Xcode CLT"
    [ "$(uname -m)" = "arm64" ] || die "This script targets Apple Silicon (got $(uname -m))."
    install_rosetta
    install_clt
    [ -d "$SRC_ROOT/wine" ] || die "No 'wine' dir under SRC_ROOT=$SRC_ROOT"
    ok "source: $SRC_ROOT"; ok "prefix: $PREFIX"
}

phase_brew86() {
    log "brew86 — private x86_64 Homebrew in $X86_BREW_PREFIX (arm64 brew untouched)"
    if have_brew86; then ok "x86_64 brew already present"
    else
        warn "installing x86_64 Homebrew (asks for sudo password)"
        arch -x86_64 /bin/bash -c \
          "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
          || die "x86_64 Homebrew install failed"
    fi
    brew86 --version >/dev/null || die "brew86 not runnable"
    if ! brew86 update --force --quiet 2>/dev/null; then
        warn "brew update failed (likely $X86_BREW_PREFIX permissions) — repairing"
        fix_brew86_perms
        brew86 update --force --quiet 2>/dev/null || warn "brew update still noisy; continuing"
    fi
    ok "brew86 = arch -x86_64 $X86_BREW"
}

phase_deps() {
    log "deps — x86_64 toolchain + libraries via brew86"
    have_brew86 || die "brew86 missing — run the 'brew86' phase first"
    export HOMEBREW_NO_AUTO_UPDATE=1
    export CMAKE_POLICY_VERSION_MINIMUM=3.5
    brew86 install $TOOLCHAIN_PKGS || die "toolchain install failed"
    brew86 install $LIB_PKGS || warn "some libraries failed; Wine will build with fewer features"
    [ -x "$X86_BREW_PREFIX/opt/llvm/bin/clang" ] \
        && ok "x86_64 clang ready: $X86_BREW_PREFIX/opt/llvm/bin/clang" \
        || die "llvm (x86_64 clang) did not install"

    # Enable only if you specifically want it:  TRY_GPTK_COMPILER=1 helper/build-cxwine.sh deps
    if [ "${TRY_GPTK_COMPILER:-0}" = 1 ]; then
        local sdk; sdk="$(find_build_sdk)"; [ -n "$sdk" ] && export HOMEBREW_SDKROOT="$sdk"
        brew86 tap apple/apple https://github.com/apple/homebrew-apple 2>/dev/null || true
        brew86 trust apple/apple 2>/dev/null || brew86 trust --formula "$GPTK_COMPILER" 2>/dev/null || true
        patch_gptk_formula
        run_step "building Apple GPTK compiler (optional, ~long)" brew86 install "$GPTK_COMPILER" \
            && ok "GPTK compiler built" \
            || warn "GPTK compiler failed on this macOS SDK — using brew86 llvm clang instead"
    else
        ok "using brew86 llvm clang (set TRY_GPTK_COMPILER=1 to attempt Apple's compiler)"
    fi
    ok "x86_64 dependencies ready under $X86_BREW_PREFIX"
}

phase_vkd3d() {
    log "vkd3d — bundled D3D12→Vulkan (tolerant)"
    setup_x86_env
    cd "$SRC_ROOT/vkd3d" 2>/dev/null || { warn "no vkd3d dir — skipping"; return 0; }
    [ -x configure ] || arch -x86_64 ./autogen.sh >/dev/null 2>&1
    if arch -x86_64 ./configure --host=x86_64-apple-darwin --prefix="$PREFIX" --disable-tests >/dev/null 2>&1; then
        if run_step "compiling vkd3d" arch -x86_64 make -j"$JOBS"; then
            arch -x86_64 make install >/dev/null 2>&1 && ok "vkd3d installed" || warn "vkd3d install failed — continuing"
        else warn "vkd3d build failed — continuing"; fi
    else warn "vkd3d configure failed — continuing"; fi
    cd "$SRC_ROOT"
}

phase_wine() {
    log "wine — configure + build + install (x86_64)"
    setup_x86_env
    cd "$SRC_ROOT/wine" 2>/dev/null || die "no wine dir at $SRC_ROOT/wine"
    local pkg="$X86_BREW_PREFIX/bin/pkg-config"; command -v pkg-config >/dev/null && pkg="pkg-config"
    local opts="--prefix=$PREFIX --enable-archs=i386,x86_64 --disable-tests"
    "$pkg" --exists freetype2     2>/dev/null && opts="$opts --with-freetype"
    "$pkg" --exists gnutls        2>/dev/null && opts="$opts --with-gnutls"
    "$pkg" --exists gstreamer-1.0 2>/dev/null && opts="$opts --with-gstreamer"
    "$pkg" --exists libvkd3d      2>/dev/null && opts="$opts --with-vkd3d"
    local clog="${TMPDIR:-/tmp}/cxwine-configure.log"
    printf '  configuring [%s] (log: %s)…\n' "$opts" "$clog"
    if ! arch -x86_64 ./configure $opts >"$clog" 2>&1; then
        err "configure failed — last 25 lines:"; tail -n 25 "$clog" >&2; cd "$SRC_ROOT"; die "Wine configure failed"
    fi
    run_step "compiling Wine" arch -x86_64 make -j"$JOBS"     || { cd "$SRC_ROOT"; die "Wine build failed"; }
    run_step "installing Wine" arch -x86_64 make install       || { cd "$SRC_ROOT"; die "Wine install failed"; }
    cd "$SRC_ROOT"
    ok "Wine installed to $PREFIX"
}

phase_dxvk() {
    log "dxvk — bundled D3D9/10/11→Vulkan PE DLLs (tolerant)"
    setup_x86_env
    cd "$SRC_ROOT/dxvk" 2>/dev/null || { warn "no dxvk dir — skipping"; return 0; }
    [ -f build-win64.txt ] || { warn "no build-win64.txt cross file — skipping"; cd "$SRC_ROOT"; return 0; }
    arch -x86_64 meson setup --cross-file build-win64.txt --buildtype release \
         --prefix "$PREFIX/dxvk" build.w64 >/dev/null 2>&1 \
      || arch -x86_64 meson setup --reconfigure --cross-file build-win64.txt \
           --buildtype release --prefix "$PREFIX/dxvk" build.w64 >/dev/null 2>&1
    if run_step "compiling DXVK" arch -x86_64 ninja -C build.w64; then
        mkdir -p "$PREFIX/share/dxvk/x64"
        find build.w64 -name '*.dll' -exec cp {} "$PREFIX/share/dxvk/x64/" \;
        ok "DXVK DLLs staged in $PREFIX/share/dxvk/x64"
    else warn "DXVK build failed — continuing"; fi
    cd "$SRC_ROOT"
}

phase_assemble() {
    log "assemble — MoltenVK + libs into the prefix"
    mkdir -p "$PREFIX/lib"
    local mvk="$X86_BREW_PREFIX/opt/molten-vk"
    if [ -f "$mvk/lib/libMoltenVK.dylib" ]; then
        cp -f "$mvk/lib/libMoltenVK.dylib" "$PREFIX/lib/"
        mkdir -p "$PREFIX/share/vulkan/icd.d"
        cat > "$PREFIX/share/vulkan/icd.d/MoltenVK_icd.json" <<JSON
{ "file_format_version": "1.0.0",
  "ICD": { "library_path": "$PREFIX/lib/libMoltenVK.dylib", "api_version": "1.2.0" } }
JSON
        ok "MoltenVK staged"
    else warn "molten-vk not found under brew86; Vulkan (DXVK/vkd3d) won't work"; fi
    ok "prefix assembled at $PREFIX"
}

phase_launcher() {
    log "launcher — $PREFIX/bin/cxwine"
    mkdir -p "$PREFIX/bin"
    cat > "$PREFIX/bin/cxwine" <<LAUNCH
#!/usr/bin/env bash
set -uo pipefail
HERE="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
X86_BREW="/usr/local"
export WINEPREFIX="\${WINEPREFIX:-\$HOME/.cxwine-prefix}"
export PATH="\$HERE/bin:\$PATH"
export VK_ICD_FILENAMES="\$HERE/share/vulkan/icd.d/MoltenVK_icd.json"
export DYLD_FALLBACK_LIBRARY_PATH="\$HERE/lib:\$HERE/lib/external:\$X86_BREW/lib:\${DYLD_FALLBACK_LIBRARY_PATH:-/usr/lib}"
export D3DM_ENABLE_METALFX="\${D3DM_ENABLE_METALFX:-1}"
export ROSETTA_ADVERTISE_AVX="\${ROSETTA_ADVERTISE_AVX:-1}"
exec arch -x86_64 "\$HERE/bin/wine64" "\$@" 2>/dev/null || exec arch -x86_64 "\$HERE/bin/wine" "\$@"
LAUNCH
    chmod +x "$PREFIX/bin/cxwine"
    ok "launcher ready: $PREFIX/bin/cxwine <program.exe>"
}

# ---------------------------------------------------------------------------
# D3DMetal overlay (with volume picker)
# ---------------------------------------------------------------------------
do_overlay() {   # do_overlay <redist/lib path>
    local redist="$1"
    [ -d "$redist" ] || { err "not a directory: $redist"; return 1; }
    [ -d "$redist/external" ] || warn "no 'external/' under it — is this really redist/lib?"
    [ -d "$PREFIX/lib" ] || { err "build Wine (+assemble) first — $PREFIX/lib missing"; return 1; }
    log "overlaying D3DMetal from: $redist"
    ( cd "$PREFIX/lib" && ditto "$redist/" . ) || { err "ditto failed"; return 1; }
    ok "D3DMetal overlaid into $PREFIX/lib"
    warn "D3DMetal and DXVK are alternative backends — pick one per game."
}

scan_redist_dirs() {
    local v
    for v in /Volumes/*; do
        [ -e "$v" ] || continue
        [ -d "$v/redist/lib/external" ] && printf '%s\n' "$v/redist/lib"
    done
}

pick_redist_and_overlay() {
    while true; do
        clear; banner
        printf '%sOverlay Apple D3DMetal (GPTK evaluation redist)%s\n\n' "$c_cyn" "$c_rst"
        local dirs=() line
        while IFS= read -r line; do [ -n "$line" ] && dirs+=("$line"); done < <(scan_redist_dirs)

        if [ "${#dirs[@]}" -gt 0 ]; then
            printf 'Detected D3DMetal redist on mounted volumes:\n'
            local i=1
            for line in "${dirs[@]}"; do printf '   %s%d)%s %s\n' "$c_grn" "$i" "$c_rst" "$line"; i=$((i+1)); done
        else
            warn "No 'redist/lib/external' found on any mounted volume."
            printf '   Mount the outer GPTK dmg AND the inner\n'
            printf '   %s“Evaluation environment for Windows games …”%s dmg, then rescan.\n' "$c_dim" "$c_rst"
        fi
        printf '\n   %sl)%s List all mounted volumes and choose\n' "$c_cyn" "$c_rst"
        printf '   %sp)%s Enter a redist/lib path manually\n' "$c_cyn" "$c_rst"
        printf '   %sr)%s Rescan volumes\n' "$c_cyn" "$c_rst"
        printf '   %sb)%s Back\n\n' "$c_cyn" "$c_rst"
        printf 'Select: '; local choice; read -r choice

        case "$choice" in
            b|B) return ;;
            r|R) continue ;;
            l|L) _pick_from_all_volumes && pause ; ;;
            p|P) local pth; printf 'Path to redist/lib: '; read -r pth
                 confirm "Overlay from '$pth' into $PREFIX/lib?" && do_overlay "$pth"; pause ;;
            ''  ) : ;;
            *)   if printf '%s' "$choice" | grep -qE '^[0-9]+$' && [ "$choice" -ge 1 ] && [ "$choice" -le "${#dirs[@]}" ]; then
                     local sel="${dirs[$((choice-1))]}"
                     confirm "Overlay from '$sel' into $PREFIX/lib?" && do_overlay "$sel"; pause
                 else err "invalid choice"; pause; fi ;;
        esac
    done
}

_pick_from_all_volumes() {
    local vols=() v
    for v in /Volumes/*; do [ -e "$v" ] && vols+=("$v"); done
    [ "${#vols[@]}" -gt 0 ] || { err "no mounted volumes"; return 1; }
    printf '\nMounted volumes:\n'
    local i=1
    for v in "${vols[@]}"; do printf '   %s%d)%s %s\n' "$c_grn" "$i" "$c_rst" "$(basename "$v")"; i=$((i+1)); done
    printf 'Choose volume #: '; local n; read -r n
    printf '%s' "$n" | grep -qE '^[0-9]+$' || { err "invalid"; return 1; }
    [ "$n" -ge 1 ] && [ "$n" -le "${#vols[@]}" ] || { err "out of range"; return 1; }
    local base="${vols[$((n-1))]}" cand
    for cand in "$base/redist/lib" "$base/lib" "$base"; do
        if [ -d "$cand/external" ]; then
            confirm "Use '$cand' and overlay into $PREFIX/lib?" && do_overlay "$cand"; return 0
        fi
    done
    err "no redist/lib (with external/) found under $base"
    return 1
}

phase_d3dmetal() {
    local redist="${REDIST_LIB:-/Volumes/Evaluation environment for Windows games 4.0 beta 2/redist/lib}"
    do_overlay "$redist"
}

# ---------------------------------------------------------------------------
# Uninstall / revert
# ---------------------------------------------------------------------------
uninstall_packages() {
    log "revert — uninstall the x86_64 packages this script installed"
    have_brew86 || { warn "brew86 not present; nothing to do"; return 0; }
    confirm "brew86 uninstall: $TOOLCHAIN_PKGS $LIB_PKGS game-porting-toolkit-compiler ?" || { warn "cancelled"; return 0; }
    brew86 uninstall --ignore-dependencies $LIB_PKGS $TOOLCHAIN_PKGS game-porting-toolkit-compiler 2>/dev/null || true
    ok "packages removed (brew86 itself kept)"
}

uninstall_brew86() {
    log "revert — FULLY remove the x86_64 Homebrew ($X86_BREW_PREFIX)"
    have_brew86 || { warn "brew86 not present; nothing to do"; return 0; }
    warn "This removes the entire x86_64 Homebrew in $X86_BREW_PREFIX."
    warn "Your arm64 Homebrew in /opt/homebrew is NOT affected."
    confirm "Proceed with full x86_64 Homebrew uninstall?" || { warn "cancelled"; return 0; }
    arch -x86_64 /bin/bash -c \
      "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)" -- --path="$X86_BREW_PREFIX" \
      || warn "official uninstaller reported errors (some files may remain in $X86_BREW_PREFIX)"
    ok "x86_64 Homebrew removed"
}

remove_prefix() {
    log "revert — remove the built Wine prefix"
    [ -d "$PREFIX" ] || { warn "$PREFIX does not exist"; return 0; }
    confirm "Delete $PREFIX (the built Wine + launcher)?" || { warn "cancelled"; return 0; }
    rm -rf "$PREFIX" && ok "removed $PREFIX"
}

uninstall_brew86_and_deps() {
    log "revert — remove brew86 AND its build dependencies (keeps $PREFIX)"
    have_brew86 || { warn "brew86 not present; nothing to do"; return 0; }
    confirm "Remove the x86_64 Homebrew and all build deps it installed?" || { warn "cancelled"; return 0; }
    brew86 uninstall --ignore-dependencies $LIB_PKGS $TOOLCHAIN_PKGS game-porting-toolkit-compiler 2>/dev/null || true
    arch -x86_64 /bin/bash -c \
      "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)" -- --path="$X86_BREW_PREFIX" \
      || warn "uninstaller reported errors (some files may remain in $X86_BREW_PREFIX)"
    ok "brew86 + build deps removed (your arm64 /opt/homebrew and $PREFIX are untouched)"
}

# ---------------------------------------------------------------------------
# Status & credits
# ---------------------------------------------------------------------------
show_status() {
    clear; banner
    printf '%sEnvironment%s\n' "$c_cyn" "$c_rst"
    printf '   CPU / arch     : %s (%s)\n' "$(sysctl -n machdep.cpu.brand_string 2>/dev/null)" "$(uname -m)"
    printf '   Rosetta 2      : %s\n' "$(have_rosetta && echo "$c_grn"working"$c_rst" || echo "$c_red"missing"$c_rst")"
    printf '   Xcode CLT      : %s\n' "$(have_clt && echo "$c_grn$(xcode-select -p)$c_rst" || echo "$c_red"missing"$c_rst")"
    printf '   arm64 brew     : %s\n' "$([ -x /opt/homebrew/bin/brew ] && echo /opt/homebrew || echo none)"
    printf '   x86_64 brew86  : %s\n' "$(have_brew86 && echo "$c_grn$X86_BREW_PREFIX$c_rst" || echo "$c_yel"not installed"$c_rst")"
    printf '   x86_64 clang   : %s\n' "$([ -x "$X86_BREW_PREFIX/opt/llvm/bin/clang" ] && echo "$c_grn"present"$c_rst" || echo "$c_yel"missing"$c_rst")"
    printf '   Source tree    : %s\n' "$SRC_ROOT"
    printf '   Wine version   : %s\n' "$(cat "$SRC_ROOT/wine/VERSION" 2>/dev/null || echo '?')"
    printf '   Build prefix   : %s\n' "$([ -x "$PREFIX/bin/cxwine" ] && echo "$c_grn$PREFIX (built)$c_rst" || echo "$PREFIX (not built)")"
    printf '\n%sMounted D3DMetal redist%s\n' "$c_cyn" "$c_rst"
    local found=0 line
    while IFS= read -r line; do [ -n "$line" ] && { printf '   %s✓%s %s\n' "$c_grn" "$c_rst" "$line"; found=1; }; done < <(scan_redist_dirs)
    [ "$found" = 0 ] && printf '   %snone detected%s\n' "$c_dim" "$c_rst"
    pause
}

show_acknowledgements() {
    clear; banner
    printf '%sAcknowledgements & Credits%s\n\n' "$c_cyn" "$c_rst"
    printf '  This helper only glues together the work of many great projects.\n'
    printf '  Each is used under its own license (shown in %s[brackets]%s):\n\n' "$c_dim" "$c_rst"
    printf '   %s• CodeWeavers / CrossOver%s  %s[Wine sources & D3DMetal hooks: LGPL-2.1]%s\n' "$c_grn" "$c_rst" "$c_dim" "$c_rst"
    printf '     the Wine sources + the D3DMetal driver hooks in winemac.drv. Huge\n'
    printf '     thanks for CrossOver and for making the sources available.\n'
    printf '     https://www.codeweavers.com/crossover\n\n'
    printf '   %s• Apple — Game Porting Toolkit / D3DMetal%s  %s[proprietary — Apple SLA]%s\n' "$c_grn" "$c_rst" "$c_dim" "$c_rst"
    printf '   %s• Wine%s  %s[LGPL-2.1-or-later]%s — https://www.winehq.org\n' "$c_grn" "$c_rst" "$c_dim" "$c_rst"
    printf '   %s• DXVK%s  %s[zlib/libpng]%s — Direct3D 9/10/11 → Vulkan\n' "$c_grn" "$c_rst" "$c_dim" "$c_rst"
    printf '   %s• vkd3d%s  %s[LGPL-2.1-or-later]%s — Direct3D 12 → Vulkan\n' "$c_grn" "$c_rst" "$c_dim" "$c_rst"
    printf '   %s• MoltenVK%s  %s[Apache-2.0]%s — Vulkan on Metal\n' "$c_grn" "$c_rst" "$c_dim" "$c_rst"
    printf '   %s• GStreamer%s %s[LGPL-2.1+]%s  ·  %sGLib%s %s[LGPL-2.1+]%s\n' "$c_grn" "$c_rst" "$c_dim" "$c_rst" "$c_grn" "$c_rst" "$c_dim" "$c_rst"
    printf '   %s• GnuTLS%s %s[LGPL-2.1+]%s  ·  %sFreeType%s %s[FTL or GPL-2.0]%s\n' "$c_grn" "$c_rst" "$c_dim" "$c_rst" "$c_grn" "$c_rst" "$c_dim" "$c_rst"
    printf '   %s• GCenX homebrew-wine%s  %s[BSD-2-Clause]%s — GPTK packaging\n' "$c_grn" "$c_rst" "$c_dim" "$c_rst"
    printf '   %s• Homebrew%s  %s[BSD-2-Clause]%s — the package manager\n\n' "$c_grn" "$c_rst" "$c_dim" "$c_rst"
    printf '  %sAuthor%s\n' "$c_cyn" "$c_rst"
    printf '     %s\n' "$AUTHOR_NAME"
    printf '     GitHub:  %s%s%s\n\n' "$c_blue" "$AUTHOR_GITHUB" "$c_rst"
    printf '  %sNote%s: Wine and the D3DMetal hooks are LGPL-2.1. D3DMetal itself is\n' "$c_dim" "$c_rst"
    printf '  proprietary to Apple and is NOT built here — it comes from Apple'"'"'s GPTK redist.\n'
    pause
}

# ---------------------------------------------------------------------------
# TUI menus
# ---------------------------------------------------------------------------
menu_phases() {
    while true; do
        clear; banner
        printf '%sBuild a single phase%s\n\n' "$c_cyn" "$c_rst"
        local i=1 p
        for p in $ALL_PHASES; do printf '   %s%d)%s %s\n' "$c_grn" "$i" "$c_rst" "$p"; i=$((i+1)); done
        printf '\n   %sb)%s Back\n\n' "$c_cyn" "$c_rst"
        printf 'Select phase: '; local c; read -r c
        case "$c" in
            b|B|'') return ;;
            *) if printf '%s' "$c" | grep -qE '^[0-9]+$'; then
                   local n=1 chosen=""
                   for p in $ALL_PHASES; do [ "$n" = "$c" ] && chosen="$p"; n=$((n+1)); done
                   [ -n "$chosen" ] && { "phase_$chosen"; pause; } || { err "invalid"; pause; }
               else err "invalid"; pause; fi ;;
        esac
    done
}

menu_uninstall() {
    while true; do
        clear; banner
        printf '%sUninstall / revert%s\n\n' "$c_cyn" "$c_rst"
        printf '   %s1)%s Uninstall the build packages only (keep brew86)\n' "$c_grn" "$c_rst"
        printf '   %s2)%s Uninstall brew86 + its build deps (keep built Wine)\n' "$c_grn" "$c_rst"
        printf '   %s3)%s FULLY remove the x86_64 Homebrew (%s)\n' "$c_grn" "$c_rst" "$X86_BREW_PREFIX"
        printf '   %s4)%s Remove the built Wine prefix (%s)\n' "$c_grn" "$c_rst" "$PREFIX"
        printf '\n   %sb)%s Back\n\n' "$c_cyn" "$c_rst"
        printf 'Select: '; local c; read -r c
        case "$c" in
            1) uninstall_packages;          pause ;;
            2) uninstall_brew86_and_deps;   pause ;;
            3) uninstall_brew86;            pause ;;
            4) remove_prefix;               pause ;;
            b|B|'') return ;;
            *) err "invalid"; pause ;;
        esac
    done
}

menu_prereqs() {
    clear; banner
    printf '%sCheck & install prerequisites%s\n\n' "$c_cyn" "$c_rst"
    printf '   Rosetta 2 : %s\n' "$(have_rosetta && echo "$c_grn"ok"$c_rst" || echo "$c_red"missing"$c_rst")"
    printf '   Xcode CLT : %s\n' "$(have_clt && echo "$c_grn"ok"$c_rst" || echo "$c_red"missing"$c_rst")"
    printf '   brew86    : %s\n\n' "$(have_brew86 && echo "$c_grn"ok"$c_rst" || echo "$c_yel"not installed"$c_rst")"
    confirm "Install/verify Rosetta 2 now?" && install_rosetta
    confirm "Install/verify Xcode Command Line Tools now?" && install_clt
    if have_brew86; then
        confirm "Repair brew86 (/usr/local) permissions now?" && fix_brew86_perms
    fi
    pause
}

main_menu() {
    while true; do
        clear; banner
        downloads_help
        printf '   %s1)%s Check & install prerequisites (Rosetta 2 · Xcode CLT)\n' "$c_grn" "$c_rst"
        printf '   %s2)%s Full build (all phases)\n' "$c_grn" "$c_rst"
        printf '   %s3)%s Build a single phase ▸\n' "$c_grn" "$c_rst"
        printf '   %s4)%s Overlay D3DMetal from a mounted volume ▸\n' "$c_grn" "$c_rst"
        printf '   %s5)%s Environment status\n' "$c_grn" "$c_rst"
        printf '   %s6)%s Uninstall / revert ▸\n' "$c_grn" "$c_rst"
        printf '   %s7)%s Acknowledgements & credits\n' "$c_grn" "$c_rst"
        printf '\n   %s0)%s Quit\n\n' "$c_cyn" "$c_rst"
        printf 'Select: '; local c; read -r c
        case "$c" in
            1) menu_prereqs ;;
            2) clear; banner; for p in $ALL_PHASES; do "phase_$p"; done
               log "Done. Use option 4 to overlay D3DMetal."; pause ;;
            3) menu_phases ;;
            4) pick_redist_and_overlay ;;
            5) show_status ;;
            6) menu_uninstall ;;
            7) show_acknowledgements ;;
            0|q|Q) clear; exit 0 ;;
            *) err "invalid"; pause ;;
        esac
    done
}

# ---------------------------------------------------------------------------
# CLI dispatch (scripted mode) vs TUI (no args)
# ---------------------------------------------------------------------------
run_token() {
    case "$1" in
        prereqs|brew86|deps|vkd3d|wine|dxvk|assemble|launcher) "phase_$1" ;;
        d3dmetal)                 phase_d3dmetal ;;
        install-rosetta)          install_rosetta ;;
        install-clt)              install_clt ;;
        fix-perms)                fix_brew86_perms ;;
        uninstall-packages)       uninstall_packages ;;
        uninstall-brew86)         uninstall_brew86 ;;
        uninstall-brew86-deps)    uninstall_brew86_and_deps ;;
        remove-prefix)            remove_prefix ;;
        credits|acknowledgements) show_acknowledgements ;;
        all)                      for p in $ALL_PHASES; do "phase_$p"; done ;;
        *) die "unknown: $1 (phases: $ALL_PHASES | d3dmetal | install-rosetta | install-clt | fix-perms | uninstall-packages | uninstall-brew86 | uninstall-brew86-deps | remove-prefix | credits | all)" ;;
    esac
}

if [ "$#" -eq 0 ]; then
    main_menu
else
    for tok in "$@"; do run_token "$tok"; done
    printf '\n%sBuild prefix: %s%s\n' "$c_grn" "$PREFIX" "$c_rst"
    printf '%sRun a program: %s/bin/cxwine /path/app.exe%s\n' "$c_grn" "$PREFIX" "$c_rst"
fi
