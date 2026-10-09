"""Audit the actual frozen archive and adjacent payload, not dependency declarations."""
import argparse
import hashlib
import json
from pathlib import Path
from PyInstaller.archive.readers import CArchiveReader

ROOT=Path(__file__).resolve().parents[1]
PAYLOAD=ROOT/'desktop/src-tauri/resources/worker'
REPORT=ROOT/'licensing/BUNDLE-REVIEW.json'
FORBIDDEN=('gallery_dl','imageio_ffmpeg')

def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def inspect(payload=PAYLOAD):
    problems=[]
    exe=payload/'saveddesk-worker.exe'
    archive=CArchiveReader(str(exe))
    modules=archive.open_embedded_archive('PYZ.pyz').toc
    for name in modules:
        if name.split('.')[0] in FORBIDDEN:problems.append('Forbidden frozen module: '+name)
    for name in archive.toc:
        if any(part in FORBIDDEN for part in name.replace('\\','/').split('/')):problems.append('Forbidden archive member: '+name)
    files=[]
    for path in sorted(payload.rglob('*')):
        if path.is_symlink():raise ValueError('Linked payload entries are not allowed.')
        if not path.is_file():continue
        relative=path.relative_to(payload).as_posix()
        pieces=relative.lower().split('/')
        if any(part.replace('-','_').startswith(FORBIDDEN) for part in pieces):problems.append('Forbidden tool payload: '+relative)
        if path.suffix.lower()=='.exe' and any(v in path.name.lower() for v in ('ffmpeg','ffprobe')):problems.append('Forbidden FFmpeg binary: '+relative)
        files.append({'path':relative,'sha256':digest(path),'bytes':path.stat().st_size})
    adapter=payload/'_internal/external-adapter'
    expected={'entry.py':ROOT/'packaging/external-adapter/entry.py','LICENSE.txt':ROOT/'LICENSE'}
    expected.update({'social_downloader/'+p.name:p for p in (ROOT/'backend/src/social_downloader').glob('*.py')})
    for relative,source in expected.items():
        shipped=adapter/relative
        if not shipped.is_file() or digest(shipped)!=digest(source):problems.append('Adapter source mismatch: '+relative)
    actual={p.relative_to(adapter).as_posix() for p in adapter.rglob('*') if p.is_file()}
    if actual!=set(expected):problems.append('Adapter contains unexpected or missing files.')
    return {'schema_version':1,'project_version':json.loads((ROOT/'desktop/package.json').read_text())['version'],
        'scope':'Frozen worker archive and complete adjacent installer resource tree',
        'excluded_redistribution':['gallery-dl','imageio-ffmpeg','FFmpeg/FFprobe executables'],
        'adapter_source_verified':not any('Adapter' in p for p in problems),'frozen_module_count':len(modules),
        'files':files,'findings':problems,'passed':not problems}

def verify():
    try:
        recorded=json.loads(REPORT.read_text(encoding='utf-8'))
        current=inspect()
        return recorded==current and current['passed'] is True
    except (OSError,ValueError,KeyError,RuntimeError):return False

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');args=parser.parse_args()
    report=inspect()
    if args.write:REPORT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':report['passed'],'files':len(report['files']),'frozen_modules':report['frozen_module_count'],'findings':report['findings']}))
    raise SystemExit(0 if report['passed'] else 1)
