#!/usr/bin/env python3
"""Run actual Godot scene, contract, combat and physical traversal tests."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
ENGINE_ERRORS = re.compile(r"(?m)^(?:SCRIPT ERROR|ERROR):")

def resolve_godot(value: str | None) -> str:
    candidate = value or os.environ.get("GODOT")
    cached = ROOT / ".toolchain/godot-path.txt"
    if not candidate and cached.exists():
        candidate = cached.read_text(encoding="utf-8").strip()
    candidate = candidate or shutil.which("godot") or shutil.which("godot4")
    if not candidate or not Path(candidate).is_file():
        raise SystemExit("Godot not found. Run python tools/toolchain.py or pass --godot the path to Godot 4.7.2.")
    return str(Path(candidate).resolve())

def execute(command: list[str], name: str, env: dict[str, str] | None = None, timeout: int = 600) -> str:
    REPORTS.mkdir(exist_ok=True)
    print("RUN", name, flush=True)
    result = subprocess.run(command, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    output = result.stdout
    (REPORTS / f"{name}.log").write_text(output, encoding="utf-8")
    if result.returncode or ENGINE_ERRORS.search(output):
        print(output)
        raise RuntimeError(f"{name} failed; inspect reports/{name}.log")
    return output

def verify(godot: str) -> dict:
    environment = dict(os.environ, GODOT_SILENCE_ROOT_WARNING="1")
    version = execute([godot, "--headless", "--version"], "engine-version", environment).strip()
    if not version.startswith("4.7.2.stable"):
        raise RuntimeError(f"Expected Godot 4.7.2 stable, received: {version}")
    execute([godot, "--headless", "--path", str(ROOT), "--editor", "--import", "--quit"], "import", environment)
    results = {"engine": version, "tests": {}}
    for name in ["contracts", "combat", "traversal"]:
        report = REPORTS / f"{name}.json"
        report.unlink(missing_ok=True)
        with tempfile.TemporaryDirectory(prefix="last-light-test-") as temporary:
            # Every scene gets isolated user data, including the intentional corrupt-save tests.
            test_env = dict(environment, XDG_DATA_HOME=temporary, APPDATA=temporary, LOCALAPPDATA=temporary)
            execute([godot, "--headless", "--path", str(ROOT), "--fixed-fps", "60", f"res://tests/{name}.tscn", "--", "--test"], name, test_env)
        data = json.loads(report.read_text(encoding="utf-8"))
        if not data.get("passed"):
            raise RuntimeError(f"Test scene reported failure: {name}")
        results["tests"][name] = data
    results["passed"] = True
    (REPORTS / "verification.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--godot")
    args = parser.parse_args()
    verify(resolve_godot(args.godot))
