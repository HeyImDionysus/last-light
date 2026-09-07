#!/usr/bin/env python3
"""Install the pinned official engine and desktop templates; never change a system install."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import platform
from pathlib import Path
import shutil
import urllib.request
import zipfile

VERSION = "4.7.2"
ROOT = Path(__file__).resolve().parents[1]
PINNED = {
    f"Godot_v{VERSION}-stable_linux.x86_64.zip": "cadd3204e728a35d3f13adb7fd0d7902636b79f6b95c40c265eb73b6c35329e4",
    f"Godot_v{VERSION}-stable_export_templates.tpz": "f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011",
}

def template_directory() -> Path:
    if platform.system() == "Windows":
        base = Path(os.environ["APPDATA"])
    elif platform.system() == "Darwin":
        base = Path.home() / "Library/Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share")))
    return base / "godot/export_templates" / f"{VERSION}.stable"

def request(url: str):
    headers = {"User-Agent": "Last-Light-native-build", "Accept": "application/vnd.github+json"}
    token = os.environ.get("GH_TOKEN")
    if token and url.startswith("https://api.github.com/"):
        headers["Authorization"] = f"Bearer {token}"
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120)

def install(cache: Path) -> Path:
    system = platform.system()
    if system not in {"Windows", "Linux"}:
        raise SystemExit("This desktop release pipeline supports Windows and Linux. Install Godot 4.7.2 manually on other systems.")
    suffix = "win64.exe.zip" if system == "Windows" else "linux.x86_64.zip"
    engine_name = f"Godot_v{VERSION}-stable_{suffix}"
    names = [engine_name, f"Godot_v{VERSION}-stable_export_templates.tpz"]
    cache.mkdir(parents=True, exist_ok=True)
    with request(f"https://api.github.com/repos/godotengine/godot-builds/releases/tags/{VERSION}-stable") as response:
        release = json.load(response)
    lock = {"version": VERSION, "assets": []}
    for name in names:
        asset = next((x for x in release["assets"] if x["name"] == name), None)
        if asset is None:
            raise RuntimeError(f"Official release is missing {name}")
        digest = PINNED.get(name) or str(asset.get("digest", "")).removeprefix("sha256:")
        if len(digest) != 64:
            raise RuntimeError(f"No verifiable SHA256 for {name}")
        archive = cache / name
        if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest() != digest:
            part = archive.with_suffix(archive.suffix + ".part")
            with request(asset["browser_download_url"]) as source, part.open("wb") as output:
                shutil.copyfileobj(source, output)
            if hashlib.sha256(part.read_bytes()).hexdigest() != digest:
                part.unlink(missing_ok=True)
                raise RuntimeError(f"Checksum verification failed: {name}")
            part.replace(archive)
        lock["assets"].append({"name": name, "sha256": digest, "url": asset["browser_download_url"]})
        with zipfile.ZipFile(archive) as z:
            if name == engine_name:
                target = cache / "engine"
                target.mkdir(exist_ok=True)
                for item in z.infolist():
                    if item.is_dir():
                        continue
                    # Engine executables are flat; do not trust paths from an archive.
                    name_only = Path(item.filename).name
                    if name_only.startswith(f"Godot_v{VERSION}-stable_"):
                        output = target / name_only
                        output.write_bytes(z.read(item))
                        output.chmod(0o755)
            else:
                target = template_directory()
                target.mkdir(parents=True, exist_ok=True)
                keep = {"windows_debug_x86_64.exe", "windows_release_x86_64.exe", "linux_debug.x86_64", "linux_release.x86_64", "version.txt"}
                for item in z.infolist():
                    if Path(item.filename).name in keep:
                        output = target / Path(item.filename).name
                        output.write_bytes(z.read(item))
                        output.chmod(0o755)
    executable = cache / "engine" / (f"Godot_v{VERSION}-stable_win64_console.exe" if system == "Windows" else f"Godot_v{VERSION}-stable_linux.x86_64")
    if not executable.exists():
        raise RuntimeError(f"Engine extraction did not produce {executable}")
    (cache / "release-lock.json").write_text(json.dumps(lock, indent=2), encoding="utf-8")
    (cache / "godot-path.txt").write_text(str(executable.resolve()), encoding="utf-8")
    return executable.resolve()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / ".toolchain")
    args = parser.parse_args()
    print(install(args.cache.resolve()))
