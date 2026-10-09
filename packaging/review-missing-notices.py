"""Fetch missing license texts only from upstream commits recorded in package metadata."""
import concurrent.futures, hashlib, json, re, tomllib, urllib.parse, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'licensing/upstream'
HEADERS={'User-Agent':'SavedDesk-license-review'}
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=60) as response: return response.read()
def fetch(scope,name,version,repo,commit,subpath):
    key=f'{scope}:{name}@{version}'
    if not re.fullmatch('[0-9a-f]{40}',commit or ''): return key,[], 'No immutable upstream commit in package metadata'
    repo=repo.removeprefix('git+').removesuffix('.git')
    if not re.fullmatch(r'https://github\.com/[^/]+/[^/]+',repo): return key,[], 'Unsupported upstream source'
    tree=json.loads(get(f'https://api.github.com/repos/{repo.split("github.com/")[1]}/git/trees/{commit}?recursive=1'))
    ancestors={'.'} | {str(a) for a in Path(subpath or '.').parents} | {subpath or '.'}
    matches=[e['path'] for e in tree.get('tree',[]) if e['type']=='blob' and str(Path(e['path']).parent) in ancestors and re.match(r'^(?:LICEN[CS]E|COPYING|NOTICE|COPYRIGHT)(?:[._-].*)?$',Path(e['path']).name,re.I)]
    result=[]
    for relative in matches:
        url=f'https://raw.githubusercontent.com/{repo.split("github.com/")[1]}/{commit}/{urllib.parse.quote(relative)}'
        blob=get(url);folder=OUT/f'{scope}-{name}-{version}';folder.mkdir(parents=True,exist_ok=True)
        path=folder/(hashlib.sha256(relative.encode()).hexdigest()[:10]+'-'+Path(relative).name+'.txt');path.write_bytes(blob)
        result.append({'url':url,'path':path.relative_to(ROOT/'licensing').as_posix(),'sha256':hashlib.sha256(blob).hexdigest()})
    return key,result,None if result else 'No license text found at the recorded upstream commit'
missing=set(json.loads((ROOT/'licensing/DEPENDENCIES.json').read_text(encoding="utf-8"))['missing_notice_components'])
requests=[]
for folder in (ROOT/'.tooling/cargo/registry/src').glob('*/*'):
    manifest=folder/'Cargo.toml';vcs=folder/'.cargo_vcs_info.json'
    if not manifest.is_file() or not vcs.is_file(): continue
    meta=tomllib.loads(manifest.read_text(encoding="utf-8"))['package'];key=f"rust:{meta['name']}@{meta['version']}"
    if key not in missing: continue
    info=json.loads(vcs.read_text(encoding="utf-8"));requests.append(('rust',meta['name'],meta['version'],meta.get('repository',''),info['git']['sha1'],info.get('path_in_vcs','')))
for key in sorted(missing):
    if not key.startswith('npm:'): continue
    name,version=key[4:].rsplit('@',1);original=name.replace('--','/')
    try:
        meta=json.loads(get(f'https://registry.npmjs.org/{urllib.parse.quote(original,safe="")}/{version}'))
        repo=meta.get('repository',{});repo={'url':repo} if isinstance(repo,str) else repo
        requests.append(('npm',name,version,repo.get('url',''),meta.get('gitHead',''),repo.get('directory','')))
    except Exception as error: print(key,type(error).__name__)
index_path=ROOT/'licensing/UPSTREAM-NOTICES.json'
index=json.loads(index_path.read_text(encoding='utf-8')) if index_path.is_file() else {}
failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    work=[(r,pool.submit(fetch,*r)) for r in requests]
    for request,future in work:
        try:
            key,notices,error=future.result()
            if notices: index[key]=notices
            if error: failures.append({'component':key,'reason':error})
        except Exception as error: failures.append({'component':request[1],'reason':str(error)})
(ROOT/'licensing/UPSTREAM-NOTICES.json').write_text(json.dumps(index,indent=2)+'\n')
print(json.dumps({'supplemented':list(index),'unresolved':failures},indent=2))
