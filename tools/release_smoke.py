#!/usr/bin/env python3
"""Boot a standalone release, physically move the keeper, verify resources, and exit."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from verify import ENGINE_ERRORS, REPORTS

def smoke(executable: Path) -> dict:
    executable = executable.resolve()
    if not executable.is_file():
        raise RuntimeError(f"Release executable is missing: {executable}")
    with tempfile.TemporaryDirectory(prefix="last-light-release-") as temporary:
        logfile = Path(temporary) / "smoke.log"
        environment = dict(os.environ, GODOT_SILENCE_ROOT_WARNING="1", XDG_DATA_HOME=temporary, APPDATA=temporary, LOCALAPPDATA=temporary)
        result = subprocess.run([str(executable), "--headless", "--audio-driver", "Dummy", "--fixed-fps", "60", "--log-file", str(logfile), "--", "--smoke-test"], cwd=executable.parent, env=environment, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", timeout=180)
        text = result.stdout + "\n" + (logfile.read_text(encoding="utf-8", errors="replace") if logfile.exists() else "")
    REPORTS.mkdir(exist_ok=True)
    tag = "windows" if executable.suffix == ".exe" else "linux"
    (REPORTS / f"release-smoke-{tag}.log").write_text(text, encoding="utf-8")
    lines = [line.split("LAST_LIGHT_RELEASE_SMOKE ", 1)[1] for line in text.splitlines() if "LAST_LIGHT_RELEASE_SMOKE " in line]
    if result.returncode or ENGINE_ERRORS.search(text) or not lines:
        raise RuntimeError(f"Embedded release failed; see reports/release-smoke-{tag}.log")
    data = json.loads(lines[-1])
    if not data.get("passed"):
        raise RuntimeError(f"Embedded release reported failure: {data}")
    (REPORTS / f"release-smoke-{tag}.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(json.dumps(data, indent=2))
    return data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", type=Path)
    smoke(parser.parse_args().executable)
