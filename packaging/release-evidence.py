"""Create review assets and evaluate release evidence without inventing acceptance."""
import argparse, hashlib, json, sys, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT / 'packaging'))
import importlib.util
spec=importlib.util.spec_from_file_location('source_audit', ROOT/'packaging/audit-repository.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
quarantine_spec=importlib.util.spec_from_file_location("quarantine_policy", ROOT/"packaging/release-quarantine.py")
quarantine_policy=importlib.util.module_from_spec(quarantine_spec);quarantine_spec.loader.exec_module(quarantine_policy)
def sha(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()
def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.is_file() else {}
def evaluate(installer,evidence):
    deps=read(ROOT/'licensing/DEPENDENCIES.json');sources=read(ROOT/'.cache/redistribution-sources/SOURCE-PROVENANCE.json')
    host=read(evidence/'host-windows.json');clean=read(evidence/'clean-windows.json');platforms=read(evidence/'platform-acceptance.json');signatures=read(evidence/'signatures.json')
    expected=sha(installer)
    required_clean={'previous-install-launch-local-worker','upgrade-library-settings-volume-history-duplicates','upgrade-media-preserved','license-bundle-and-connector-retained','uninstall-binaries-and-registration-removed-data-kept'}
    providers={'youtube','facebook','instagram','discord','tiktok','pinterest','x'}
    signed_files={f.get('name'):f for f in signatures.get('files',[]) if f.get('passed') is True and f.get('status')=='Valid' and f.get('timestamped') is True}
    required_exes={installer.name,'saveddesk.exe','saveddesk-worker.exe','saveddesk-native-host.exe'}
    gates={
      'historical_preview_policy':quarantine_policy.permitted_installer(installer.name),
      'project_license':(ROOT/'LICENSE').is_file() and deps.get('project_license')=='MIT',
      'redistribution_review':installer.name==f"SavedDesk_{deps.get('project_version')}_x64-setup.exe" and deps.get('worker_payload_verified') is True and deps.get('redistribution_cleared') is True and not deps.get('missing_notice_components') and sources.get('source_closure_complete') is True and not sources.get('download_failures'),
      'windows_installer':(clean.get('passed') is True and clean.get('fresh_guest') is True and clean.get('installer_sha256')==expected and required_clean.issubset(clean.get('checks',[]))) or (host.get('passed') is True and host.get('clean_machine') is False and host.get('environment')=='existing development host, empty temporary app profile' and host.get('owner_data_restored') is True and host.get('installer_sha256')==expected and (required_clean|{'owner-profile-hashes-registrations-shortcuts-restored'}).issubset(host.get('checks',[]))),
      'trusted_signing':signatures.get('passed') is True and signatures.get('installer_sha256')==expected and required_exes.issubset(signed_files) and signed_files.get(installer.name,{}).get('sha256')==expected,
      'live_platform_acceptance':platforms.get('passed') is True and platforms.get('installer_sha256')==expected and providers.issubset({p['platform'] for p in platforms.get('results',[]) if p.get('passed') is True and p.get('live') is True}),
    }
    return {'installer_sha256':expected,'public_release_ready':all(gates.values()),'gates':gates,'source_review_findings':deps.get('source_review_findings',[]),'missing_notice_components':deps.get('missing_notice_components',[]),'windows_test_environment':{'clean_machine':clean.get('passed') is True and clean.get('fresh_guest') is True and clean.get('installer_sha256')==expected,'host_test_passed':host.get('passed') is True and host.get('installer_sha256')==expected},'evidence_scope':'Local review evidence, not browser store approval or a guarantee of SmartScreen reputation.'}
def pack(output):
    report=audit.audit()
    if report['findings']: raise SystemExit('Source audit must pass before creating source archive.')
    version=report['version']
    with zipfile.ZipFile(output/f'SavedDesk-original-source-{version}.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for name in report['files']: archive.write(ROOT/name,name)
    with zipfile.ZipFile(output/f'SavedDesk-notices-{version}.zip','w',zipfile.ZIP_DEFLATED) as archive:
        archive.write(ROOT/'LICENSE','LICENSE')
        for path in sorted((ROOT/'licensing').rglob('*')):
            if path.is_file(): archive.write(path,path.relative_to(ROOT))
    provenance=read(ROOT/'.cache/redistribution-sources/SOURCE-PROVENANCE.json')
    with zipfile.ZipFile(output/f'SavedDesk-dependency-sources-{version}.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for record in provenance.get('archives',[]) + provenance.get('publisher_checksums',[]) + provenance.get('publisher_metadata',[]):
            path=ROOT/'.cache/redistribution-sources'/record['file']
            if not path.resolve().is_relative_to((ROOT/'.cache/redistribution-sources').resolve()) or sha(path)!=record['sha256']: raise SystemExit('Dependency source archive checksum/path mismatch.')
            archive.write(path,record['file'])
        archive.write(ROOT/'.cache/redistribution-sources/SOURCE-PROVENANCE.json','SOURCE-PROVENANCE.json')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--installer',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--evidence',type=Path,default=ROOT/'.cache/release-acceptance');parser.add_argument('--pack',action='store_true');parser.add_argument('--require-ready',action='store_true');args=parser.parse_args()
    result=evaluate(args.installer,args.evidence)
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'acceptance-review.json').write_text(json.dumps(result,indent=2)+'\n')
    if args.pack: pack(args.output)
    print(json.dumps(result,indent=2))
    if args.require_ready and not result['public_release_ready']: raise SystemExit(1)
