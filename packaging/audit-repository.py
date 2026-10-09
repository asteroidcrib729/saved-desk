"""Inspect Git candidates without initializing the project repository or reading ignored data."""
from __future__ import annotations
import argparse
import ast
import json
import re
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def run(*args: str) -> str:
    return subprocess.check_output(args, cwd=ROOT, text=True, encoding="utf-8").strip()

def version() -> str:
    frontend = json.loads((ROOT / "desktop/package.json").read_text(encoding="utf-8"))
    npm_lock = json.loads((ROOT / "desktop/package-lock.json").read_text(encoding="utf-8"))
    native = tomllib.loads((ROOT / "desktop/src-tauri/Cargo.toml").read_text(encoding="utf-8"))
    cargo_lock = tomllib.loads((ROOT / "desktop/src-tauri/Cargo.lock").read_text(encoding="utf-8"))
    app = json.loads((ROOT / "desktop/src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
    worker = tomllib.loads((ROOT / "backend/pyproject.toml").read_text(encoding="utf-8"))
    module = ast.parse((ROOT / "backend/src/social_downloader/__init__.py").read_text(encoding="utf-8"))
    runtime_versions = [node.value.value for node in module.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "__version__" for target in node.targets) and isinstance(node.value, ast.Constant)]
    if len(runtime_versions) != 1: raise ValueError("The worker runtime must declare one version")
    versions = [*runtime_versions, frontend["version"], npm_lock["version"], npm_lock["packages"][""]["version"],
                native["package"]["version"], app["version"], worker["project"]["version"]]
    native_locked = [p["version"] for p in cargo_lock["package"] if p["name"] == native["package"]["name"]]
    if len(native_locked) != 1:
        raise ValueError("The native package must appear once in Cargo.lock")
    versions += native_locked
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", versions[0]) or len(set(versions)) != 1:
        raise ValueError(f"Release versions do not match: {versions}")
    return versions[0]

def audit() -> dict:
    git_dir = ROOT / ".cache/git-audit.git"
    git_dir.parent.mkdir(exist_ok=True)
    if not git_dir.exists():
        subprocess.run(["git", "init", "--bare", str(git_dir)], check=True, capture_output=True)
    git = ["git", f"--git-dir={git_dir}", f"--work-tree={ROOT}"]
    files = run(*git, "ls-files", "--others", "--exclude-standard").splitlines()
    tracked = []
    if (ROOT / ".git").exists():
        tracked = run("git", "-C", str(ROOT), "ls-files").splitlines()
        files = sorted(set(files) | set(tracked))
    checks = {
        ".env": True, ".env.local": True, "insta-cookies.txt": True,
        "oauth-clients/desktop-registration.json": True,
        "oauth-clients/provider-client.txt": True,
        "private/certificate.pfx": True, "private/signing.key": True,
        "private/session.dpapi": True, "private/catalog.sqlite3": True,
        "private/catalog.db-wal": True, "downloads/photo.jpg": True,
        ".venv/Scripts/python.exe": True, ".tooling/toolchain.txt": True,
        "desktop/src-tauri/target/debug/saveddesk.exe": True,
        "desktop/src-tauri/resources/worker/runtime.json": True,
        "desktop/src-tauri/resources/browser-connector/chromium/manifest.json": True,
        "browser-connector/chromium/manifest.json": True,
        "release-artifacts/v0.2.0/SHA256SUMS.txt": True,
        "desktop/playwright-report/index.html": True,
        "desktop/test-results/screenshot.png": True,
        "desktop/src-tauri/gen/schemas/desktop-schema.json": True,
        "README.md": False, "PRIVACY_POLICY.md": False, "TERMS_OF_SERVICE.md": False, "CODE_SIGNING_POLICY.md": False,
        "desktop/package-lock.json": False,
        "desktop/src-tauri/Cargo.lock": False, "browser-connector/identity.json": False,
        "desktop/src-tauri/icons/icon.ico": False, ".vscode/settings.json": False,
        "packaging/requirements-lock.txt": False, ".env.example": False,
    }
    failures = []
    locked = {}
    for line in (ROOT / "packaging/requirements-lock.txt").read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            name, pinned = line.split("==")
            if name in locked:
                failures.append({"path": "packaging/requirements-lock.txt", "problem": "duplicate dependency pin"})
            locked[name] = pinned
    requirements = tomllib.loads((ROOT / "backend/pyproject.toml").read_text(encoding="utf-8"))["project"]["dependencies"]
    requirements += [line for line in (ROOT / "packaging/requirements-build.txt").read_text(encoding="utf-8").splitlines() if line and not line.startswith("#")]
    for requirement in requirements:
        name, pinned = requirement.split("==")
        if locked.get(name) != pinned:
            failures.append({"path": "packaging/requirements-lock.txt", "problem": "direct/build dependency mismatch", "dependency": name})
    ignored_tracked = set()
    for name in tracked:
        result = subprocess.run([*git, "check-ignore", "--no-index", "-q", name], cwd=ROOT)
        if result.returncode == 0:
            ignored_tracked.add(name)
            failures.append({"path": name, "problem": "tracked file matches ignore rules"})
    for path, expected in checks.items():
        result = subprocess.run([*git, "check-ignore", "--no-index", "-q", path], cwd=ROOT)
        if result.returncode not in (0, 1) or (result.returncode == 0) != expected:
            failures.append({"path": path, "problem": "ignore classification"})
    patterns = {
        "private key": r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        "GitHub token": r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b",
        "AWS access key": r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
    }
    candidate_set = set(files)
    total = 0
    for name in files:
        if name in ignored_tracked:
            continue  # Report force-staged private/build paths without reading them.
        path = ROOT / name
        if path.is_symlink():
            failures.append({"path": name, "problem": "unreviewed symbolic link"})
            continue
        if not path.is_file():
            failures.append({"path": name, "problem": "tracked file absent from worktree"})
            continue
        size = path.stat().st_size
        total += size
        if size > 10 * 1024 * 1024:
            failures.append({"path": name, "problem": "candidate exceeds 10 MiB"})
        if path.suffix.lower() in {".png", ".ico", ".icns", ".jpg", ".jpeg", ".woff2"}:
            continue
        try:
            content = path.read_text(encoding="utf-8-sig")
        except UnicodeError:
            failures.append({"path": name, "problem": "unreviewed binary"})
            continue
        for label, pattern in patterns.items():
            if re.search(pattern, content):
                failures.append({"path": name, "problem": label})
        if path.suffix == ".md":
            if name not in {"README.md", "PRIVACY_POLICY.md", "TERMS_OF_SERVICE.md", "CODE_SIGNING_POLICY.md"} and not name.startswith("development-plans/"):
                failures.append({"path": name, "problem": "Markdown outside development-plans"})
            for target in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", content):
                target = target.split("#")[0].strip("<>")
                if not target or re.match(r"[a-z]+:", target) or target.startswith("/"):
                    continue
                resolved = (path.parent / target).resolve()
                try:
                    relative = resolved.relative_to(ROOT).as_posix()
                except ValueError:
                    relative = ""
                if relative not in candidate_set and not any(entry.startswith(relative + "/") for entry in candidate_set):
                    failures.append({"path": name, "problem": "Markdown link absent from source repository", "target": target})
    return {"version": version(), "candidate_files": len(files), "candidate_bytes": total,
            "ignore_checks": len(checks), "findings": failures,
            "limitations": "Pattern scan is not a complete secret/security audit. Ignored personal data is never scanned.",
            "project_license": "MIT" if (ROOT / "LICENSE").is_file() else None,
            "public_release_gates": ["bundled-tool notices and corresponding source review",
                                     "Windows installer lifecycle acceptance", "code signing and platform acceptance"],
            "files": files}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", action="store_true")
    parser.add_argument("--tag")
    args = parser.parse_args()
    current = version()
    if args.tag and args.tag != f"v{current}":
        raise SystemExit("Tag must match all project versions: v" + current)
    if args.version:
        print(current)
    else:
        report = audit()
        (ROOT / ".cache/git-readiness-audit.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({key: value for key, value in report.items() if key != "files"}, indent=2))
        sys.exit(bool(report["findings"]))
