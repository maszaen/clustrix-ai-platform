#!/usr/bin/env python3
# inspect_mjx_fs.py
# Cek isi node_modules/mathjax dan node_modules/@mathjax, plus file-file kunci untuk MathJax v3/v4.

import os
import sys
import argparse
from pathlib import Path

KEY_FILES = [
    ("mathjax/tex-svg.js", "Core combined component (TeX→SVG)"),
    ("mathjax/startup.js", "Startup component (modular mode)"),
    ("mathjax/input/tex.js", "TeX input (full)"),
    ("mathjax/input/tex-base.js", "TeX input (base)"),
    ("mathjax/output/svg.js", "SVG output"),
    ("mathjax/sre/speech-worker.js", "SRE worker (a11y)"),
    ("mathjax/sre/mathmaps/base.json", "SRE mathmaps (a11y)"),
    ("@mathjax/mathjax-newcm-font/svg.js", "MathJax NewCM SVG font"),
    ("@mathjax/mathjax-stix2-font/svg.js", "MathJax STIX2 SVG font"),
]

def human(p: Path) -> str:
    try:
        return str(p.resolve())
    except Exception:
        return str(p)

def check_exists(base: Path, rel: str) -> bool:
    return (base / rel).exists()

def print_status(base: Path):
    nm = base / "node_modules"
    print(f"\n[ROOT] {human(base)}")
    print(f"[CHECK] node_modules exists? {'YES' if nm.exists() else 'NO'}")
    print(f"[CHECK] mathjax dir      ? {'YES' if (nm/'mathjax').exists() else 'NO'}")
    print(f"[CHECK] @mathjax dir     ? {'YES' if (nm/'@mathjax').exists() else 'NO'}")

    print("\n[FILES → STATUS]")
    width = max(len(rel) for rel, _ in KEY_FILES)
    for rel, label in KEY_FILES:
        p = nm / rel
        print(f"  {rel.ljust(width)}  :: {'FOUND ' if p.exists() else 'MISSING'} | {label}")

    # List all @mathjax packages present
    aj = nm / "@mathjax"
    if aj.exists():
        pkgs = sorted([d.name for d in aj.iterdir() if d.is_dir()])
        print("\n[@mathjax packages]")
        for name in pkgs:
            mark = ""
            if name.endswith("-font"):
                mark = " (font)"
            print(f"  - {name}{mark}")
    else:
        print("\n[@mathjax packages] (folder not found)")

def print_tree(root: Path, max_entries: int = 100, depth: int = 2, only_under=None):
    """
    Cetak tree ringkas untuk folder tertentu.
    - max_entries: batas total item yang dicetak biar nggak kebanyakan.
    - depth: kedalaman maksimum.
    - only_under: list of relative subpaths (e.g., ['mathjax', '@mathjax'])
    """
    print("\n[DIR TREE]")
    nm = root / "node_modules"
    if not nm.exists():
        print("  node_modules/ (not found)")
        return

    targets = []
    if only_under:
        for sub in only_under:
            p = nm / sub
            if p.exists():
                targets.append(p)
            else:
                print(f"  {sub}/ (not found)")
    else:
        targets = [nm]

    printed = 0

    def walk(base: Path, cur: Path, level: int):
        nonlocal printed
        if printed >= max_entries:
            return
        rel = cur.relative_to(base)
        indent = "  " * level
        if cur.is_dir():
            try:
                items = sorted(cur.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
            except PermissionError:
                print(f"{indent}[D] {rel}/  (perm denied)")
                return
            print(f"{indent}[D] {rel}/")
            printed += 1
            if level >= depth:
                # ringkaskan isi
                try:
                    cnt = sum(1 for _ in cur.iterdir())
                except Exception:
                    cnt = -1
                print(f"{indent}  ... (depth limit; ~{cnt if cnt>=0 else '?'} items hidden)")
                printed += 1
                return
            for it in items:
                if printed >= max_entries:
                    return
                walk(base, it, level + 1)
        else:
            size = cur.stat().st_size if cur.exists() else 0
            print(f"{indent}[F] {rel} ({size} bytes)")
            printed += 1

    for t in targets:
        base = t.parent if t.is_dir() else nm
        walk(base, t, 0)
        if printed >= max_entries:
            break

    if printed >= max_entries:
        print(f"\n[NOTE] Output truncated at {max_entries} entries. "
              f"Increase --max-entries or --depth to see more.")

def find_interesting(base: Path):
    """
    Cari file 'svg.js' di paket font @mathjax/*-font untuk membuktikan resolusi path.
    """
    nm = base / "node_modules" / "@mathjax"
    print("\n[SCAN] Searching font svg.js under @mathjax/*-font ...")
    found_any = False
    if nm.exists():
        for pkg in sorted(nm.iterdir()):
            if pkg.is_dir() and pkg.name.endswith("-font"):
                svg = pkg / "svg.js"
                if svg.exists():
                    print(f"  FOUND  @mathjax/{pkg.name}/svg.js  ({svg.stat().st_size} bytes)")
                    found_any = True
                else:
                    # beberapa paket bisa punya struktur mjs/* atau lib/* → cek keduanya
                    mjs_svg = pkg / "mjs" / "svg.js"
                    lib_svg = pkg / "lib" / "svg.js"
                    if mjs_svg.exists():
                        print(f"  FOUND  @mathjax/{pkg.name}/mjs/svg.js")
                        found_any = True
                    elif lib_svg.exists():
                        print(f"  FOUND  @mathjax/{pkg.name}/lib/svg.js")
                        found_any = True
                    else:
                        print(f"  MISS   @mathjax/{pkg.name}/svg.js (also mjs/lib not found)")
    if not found_any:
        print("  No svg.js found under any @mathjax/*-font package.")

def main():
    ap = argparse.ArgumentParser(description="Inspect MathJax files under node_modules.")
    ap.add_argument("--root", default=".", help="Project root (folder yang selevel package.json)")
    ap.add_argument("--depth", type=int, default=2, help="Tree depth (default: 2)")
    ap.add_argument("--max-entries", type=int, default=120, help="Max printed entries (default: 120)")
    args = ap.parse_args()

    base = Path(args.root).resolve()
    if not base.exists():
        print(f"[ERROR] Root path not found: {base}")
        sys.exit(2)

    print_status(base)
    print_tree(base, max_entries=args.max_entries, depth=args.depth,
              only_under=["mathjax", "@mathjax"])
    find_interesting(base)

    # Ringkasan rekomendasi cepat:
    nm = base / "node_modules"
    missing_core = []
    for rel, _ in KEY_FILES:
        if rel.startswith("@"):  # skip font advise if user doesn't care
            continue
        if not (nm / rel).exists():
            missing_core.append(rel)
    if missing_core:
        print("\n[HINT] Missing core files detected:")
        for rel in missing_core:
            print(f"  - {rel}")
        print("  → Coba reinstall: `npm i mathjax`")

    # Cek minimal font NewCM (default untuk SVG di v4 modular)
    newcm = nm / "@mathjax" / "mathjax-newcm-font" / "svg.js"
    if not newcm.exists():
        print("\n[HINT] Font `mathjax-newcm` tidak ditemukan lokal.")
        print("  Jika pakai output SVG (modular) dan ingin tanpa CDN, install:")
        print("    npm i @mathjax/mathjax-newcm-font")
        print("  Lalu map namespace '@mathjax' ke protokol lokal (mjx:/@mathjax).")

if __name__ == "__main__":
    main()
