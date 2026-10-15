"""Resolve a branch preview or existing release tag before expensive Windows builds."""
from pathlib import Path
import argparse
import importlib.util
import json
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def git(root, *arguments, optional=False):
    result = subprocess.run(["git", *arguments], cwd=root, text=True, capture_output=True)
    if result.returncode:
        if optional:
            return None
        raise ValueError(result.stderr.strip() or "Git source inspection failed.")
    return result.stdout.strip()

def normalize_tag(value):
    value = value.strip()
    if not value:
        return ""
    if not re.fullmatch(r"v?[0-9]+\.[0-9]+\.[0-9]+", value):
        raise ValueError("Use an existing vMAJOR.MINOR.PATCH tag, or leave release_tag blank to build the selected branch.")
    return value if value.startswith("v") else "v" + value

def select(root, requested="", draft=False, version_reader=None):
    tag = normalize_tag(requested)
    if tag:
        commit = git(root, "rev-parse", "--verify", "--end-of-options", "refs/tags/" + tag + "^{commit}", optional=True)
        if not commit:
            raise ValueError(f"Tag {tag} does not exist. Leave release_tag blank for a branch preview, or create and push that tag first.")
        git(root, "checkout", "--detach", commit)
    commit = git(root, "rev-parse", "HEAD")
    version = version_reader(root) if version_reader else json.loads((root / "desktop/package.json").read_text())["version"]
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError("Invalid application version.")
    label = "v" + version
    if tag and tag != label:
        raise ValueError(f"Tag {tag} differs from application version {label}.")
    tagged = git(root, "rev-parse", "--verify", "--end-of-options", "refs/tags/" + label + "^{commit}", optional=True)
    matches = tagged == commit
    if draft and not matches:
        raise ValueError(f"Creating a draft requires existing tag {label} at the selected commit. Push that tag first, or turn create_draft off for an artifact-only build.")
    return {"version": version, "release_tag": label, "source_commit": commit,
            "requested_tag": tag, "tag_matches_source": str(matches).lower()}

def all_versions(root):
    spec = importlib.util.spec_from_file_location("release_version_audit", root / "packaging/audit-repository.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.version()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", default=os.environ.get("RELEASE_TAG", ""))
    parser.add_argument("--draft", action="store_true", default=os.environ.get("CREATE_DRAFT", "").lower() == "true")
    args = parser.parse_args()
    try:
        if git(ROOT, "status", "--porcelain"):
            raise ValueError("Start the release workflow from a clean source checkout.")
        result = select(ROOT, args.tag, args.draft, all_versions)
        if not args.tag.strip() and os.environ.get("GITHUB_SHA") and result["source_commit"] != os.environ["GITHUB_SHA"]:
            raise ValueError("The checkout differs from the selected workflow commit.")
        if os.environ.get("GITHUB_REF", "").startswith("refs/tags/") and not args.tag.strip():
            if os.environ["GITHUB_REF"] != "refs/tags/" + result["release_tag"]:
                raise ValueError("The selected workflow tag differs from the application version.")
        for required in ("packaging/build-media-tools.py", "packaging/build-release.ps1"):
            if not (ROOT / required).is_file():
                raise ValueError("This source predates the current packaging tools. Use its matching historical workflow or select current main.")
        if os.environ.get("GITHUB_OUTPUT"):
            with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
                for key, value in result.items():
                    output.write(f"{key}={value}\n")
        print(json.dumps(result, indent=2))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, str(error) + "\n")

if __name__ == "__main__":
    main()
