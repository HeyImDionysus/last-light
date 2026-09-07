#!/usr/bin/env python3
"""Verify, export embedded Windows/Linux releases, and package reproducible deliverables."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import zipfile
from verify import ROOT, REPORTS, execute, resolve_godot, verify
from release_smoke import smoke

VERSION = "2.0.0"

def zip_directory(source: Path, target: Path, prefix: str) -> None:
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for file in sorted(source.rglob("*")):
            if file.is_file():
                z.write(file, str(Path(prefix) / file.relative_to(source)))

def source_package(target: Path) -> None:
    excluded = {".git", ".godot", ".toolchain", "build", "dist", "__pycache__"}
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for file in sorted(ROOT.rglob("*")):
            rel = file.relative_to(ROOT)
            if rel == Path("reports/build.json") or not file.is_file() or any(part in excluded for part in rel.parts) or file.suffix in {".pyc", ".log"} or "captures" in rel.parts:
                continue
            z.write(file, str(Path("LastLight-Godot-Source") / rel))

def build(godot: str, tested: bool = False) -> None:
    if not tested:
        verify(godot)
    else:
        execute([godot,"--headless","--path",str(ROOT),"--editor","--import","--quit"],"build-import")
    execute([godot,"--headless","--path",str(ROOT),"--script","res://tools/engine_notices.gd"],"engine-notices")
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    targets = [("Windows Desktop", "windows", "LastLight.exe"), ("Linux Desktop", "linux", "LastLight.x86_64")]
    for preset, name, binary in targets:
        folder = ROOT / "build" / name
        folder.mkdir(parents=True, exist_ok=True)
        exe = folder / binary
        execute([godot,"--headless","--path",str(ROOT),"--export-release",preset,str(exe)],f"export-{name}")
        if exe.stat().st_size < 20_000_000:
            raise RuntimeError(f"Suspiciously small executable: {exe}")
        shutil.copyfile(ROOT / "docs/PLAYING.md", folder / "READ ME FIRST.txt")
        shutil.copyfile(ROOT / "docs/ENGINE_NOTICES.txt", folder / "ENGINE_NOTICES.txt")
        if name == "windows":
            (folder / "Compatibility Mode.bat").write_text('@echo off\r\ncd /d "%~dp0"\r\nstart "" "LastLight.exe" --rendering-method gl_compatibility\r\n',encoding="utf-8")
        else:
            exe.chmod(0o755)
            launcher = folder / "compatibility-mode.sh"
            launcher.write_text('#!/bin/sh\nset -eu\ncd "$(dirname "$0")"\nexec ./LastLight.x86_64 --rendering-method gl_compatibility "$@"\n',encoding="utf-8")
            launcher.chmod(0o755)
        if (name == "windows" and platform.system() == "Windows") or (name == "linux" and platform.system() == "Linux"):
            smoke(exe)
        zip_directory(folder, dist / f"LastLight-{VERSION}-{name}.zip", f"LastLight-{name.title()}")
    source_package(dist / f"LastLight-{VERSION}-Godot-Source.zip")
    manifest = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(dist.glob("*.zip"))}
    (dist / "SHA256SUMS.txt").write_text("".join(f"{digest}  {name}\n" for name,digest in manifest.items()),encoding="utf-8")
    (REPORTS / "build.json").write_text(json.dumps({"version":VERSION,"engine":"4.7.2","exported":[x[1] for x in targets],"native_smoke_platform":platform.system(),"sha256":manifest},indent=2),encoding="utf-8")
    print("PACKAGED", *manifest, sep="\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--godot")
    parser.add_argument("--skip-tests", action="store_true", help="Use only after tools/verify.py passed for this same revision.")
    args = parser.parse_args()
    build(resolve_godot(args.godot), args.skip_tests)
