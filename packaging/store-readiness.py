"""Require actual client-OS installed-package evidence before Store resubmission."""
from __future__ import annotations
import argparse, hashlib, json, subprocess, sys
from pathlib import Path

REQUIRED_CHECKS={"signed-local-package-installation","installed-fixed-runtime-worker-local-transfers-connector",
 "msix-upgrade-catalog-settings-player-history-duplicates","ordinary-msix-uninstall-observed-before-manual-cleanup",
 "exported-helper-cleans-connector-after-package-removal"}
STORE_IDENTITY=json.loads(Path(__file__).with_name("msix-store-identity.json").read_text(encoding="utf-8"))

def evaluate(review:dict,evidence:list[dict])->dict:
    blockers=[];covered=set()
    if not review.get("store_identity_confirmed"):blockers.append("Store package identity is not confirmed")
    if review.get("identity_name")!=STORE_IDENTITY["identity_name"] or review.get("publisher")!=STORE_IDENTITY["publisher"]:
        blockers.append("Package identity does not match the owner-confirmed Store identity")
    for entry in evidence:
        label=entry.get("environment","unnamed evidence")
        if entry.get("source_store_package_sha256")!=review.get("package_sha256") or entry.get("source_version")!=review.get("version"):
            blockers.append(f"{label}: evidence is not bound to this exact Store package");continue
        if not entry.get("passed") or not entry.get("owner_data_restored"):
            blockers.append(f"{label}: lifecycle or data-restoration checks did not pass");continue
        if not entry.get("clean_machine") or entry.get("windows_product_type")!=1:
            blockers.append(f"{label}: a fresh disposable Windows client guest is required");continue
        if not REQUIRED_CHECKS.issubset(entry.get("checks",[])):
            blockers.append(f"{label}: install, connector, upgrade, normal removal or post-uninstall cleanup evidence is missing");continue
        build=entry.get("windows_build",0)
        if not isinstance(build,int):blockers.append(f"{label}: invalid Windows build");continue
        if 19041<=build<22000:covered.add("Windows 10")
        elif build>=22000:covered.add("Windows 11")
        else:blockers.append(f"{label}: unsupported Windows build")
    for os_name in ("Windows 10","Windows 11"):
        if os_name not in covered:blockers.append(f"Missing {os_name} installed-package verification")
    return {"schema":1,"store_submission_ready":not blockers,"store_certification_received":False,
            "package_sha256":review.get("package_sha256"),"version":review.get("version"),"covered_windows":sorted(covered),"blockers":blockers}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory",type=Path);parser.add_argument("--evidence",type=Path,action="append",default=[])
    args=parser.parse_args();base=args.directory
    subprocess.run([sys.executable,str(Path(__file__).with_name("verify-msix.py")),str(base)],check=True)
    review=json.loads((base/"msix-review.json").read_text(encoding="utf-8-sig"))
    evidence=[json.loads(path.read_text(encoding="utf-8-sig")) for path in args.evidence]
    report=evaluate(review,evidence)
    (base/"store-readiness.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2));return 0 if report["store_submission_ready"] else 1

if __name__=="__main__":raise SystemExit(main())
