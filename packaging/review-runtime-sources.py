"""Collect CPython Windows external sources and trace the actual shipped runtime DLLs."""
import concurrent.futures,hashlib,json,re,sys,tarfile,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'packaging'))
import importlib.util
spec=importlib.util.spec_from_file_location('collector',ROOT/'packaging/collect-licenses.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
base=Path(sys.base_prefix);version=sys.version.split()[0];sources=c.SOURCES
with tarfile.open(sources/f'Python-{version}.tar.xz') as archive:
 props=archive.extractfile(f'Python-{version}/PCbuild/python.props').read().decode()
 builds=archive.extractfile(f'Python-{version}/PCbuild/get_externals.bat').read().decode()
tags={k:re.search(rf'{k}Dir.*?\$\(ExternalsDir\)(?:\\)?([^<]+?)\\</',props).group(1) for k in ['sqlite3','bz2','lzma','openssl','libffi','zstd','zlibNg']}
# sqlite source tag is recorded exactly by CPython, including its fourth field.
def fetch(item):
 name,tag=item
 url=f'https://api.github.com/repos/python/cpython-source-deps/git/ref/tags/{tag}'
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SavedDesk-runtime-review'}),timeout=30) as r: meta=json.load(r)
 obj=meta['object']
 if obj['type']=='tag':
  with urllib.request.urlopen(urllib.request.Request(obj['url'],headers={'User-Agent':'SavedDesk-runtime-review'}),timeout=30) as r: obj=json.load(r)['object']
 assert obj['type']=='commit' and re.fullmatch('[a-f0-9]{40}',obj['sha'])
 entry=c.download(f"https://codeload.github.com/python/cpython-source-deps/tar.gz/{obj['sha']}",sources/'cpython-external'/f"{tag}-{obj['sha'][:12]}.tar.gz")
 entry['file']='cpython-external/'+entry['file'];entry.update(component=name,tag=tag,commit=obj['sha'],build_record=f'Python-{version}/PCbuild/python.props')
 texts=[]
 with tarfile.open(sources/entry['file']) as t:
  for member in t.getmembers():
   relative=Path(member.name)
   if member.isfile() and len(relative.parts)<=3 and re.match(r'^(?:LICEN[CS]E|COPYING|NOTICE|COPYRIGHT)(?:[._-].*)?$',relative.name,re.I):
    blob=t.extractfile(member).read();target=ROOT/'licensing/runtime'/tag/(hashlib.sha256(member.name.encode()).hexdigest()[:10]+'-'+relative.name+'.txt');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(blob)
    texts.append({'path':target.relative_to(ROOT/'licensing').as_posix(),'original':member.name,'sha256':hashlib.sha256(blob).hexdigest()})
 entry['notices']=texts;return entry
entries=[];failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 work=[(name,pool.submit(fetch,(name,tag))) for name,tag in tags.items()]
 for name,future in work:
  try: entries.append(future.result())
  except Exception as error: failures.append({'component':name,'error':str(error)})
worker=ROOT/'desktop/src-tauri/resources/worker/_internal'
dlls=[]
for path in sorted(worker.glob('*.dll')):
 original=base/path.name
 if not original.exists():original=base/'DLLs'/path.name
 dlls.append({'name':path.name,'sha256':c.digest(path),'cpython_distribution_match':original.is_file() and c.digest(original)==c.digest(path),'origin':'installed CPython Windows distribution' if original.is_file() else 'requires review'})
report={'python':version,'runtime_dlls':dlls,'external_sources':entries,'failures':failures,'runtime_source_records_complete':not failures and len(entries)==7 and bool(dlls) and all(d['cpython_distribution_match'] for d in dlls),'limits':['Source tags are read from exact CPython source; this is provenance evidence, not proof of every binary build flag.','Microsoft runtime terms are included in the installed CPython LICENSE.txt; retain its Additional Conditions for this Windows binary build.','Gallery-dl and FFmpeg are excluded from the 0.2.4 payload; historical tool findings do not affect this runtime-only record.']}
(ROOT/'licensing/RUNTIME-REVIEW.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'external_source_archives':len(entries),'failures':failures,'dlls':dlls},indent=2))
