"""Complete standalone notices using recorded parent projects and authoritative license text."""
import hashlib,json,re,shutil,tarfile,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'licensing'
index=json.loads((OUT/'UPSTREAM-NOTICES.json').read_text(encoding='utf-8'))
def notice(key,blob,origin,rationale):
 name=key.replace(':','-').replace('/','--').replace('@','-')
 dest=OUT/'upstream'/name/'LICENSE.txt';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(blob)
 index[key]=[{'url':origin,'path':dest.relative_to(OUT).as_posix(),'sha256':hashlib.sha256(blob).hexdigest(),'review_basis':rationale}]
def parent_notice(key,parent,license_name):
 package=json.loads((ROOT/'desktop/node_modules'/parent/'package.json').read_text(encoding='utf-8'))
 target=json.loads((ROOT/'desktop/node_modules'/key[4:].rsplit('@',1)[0].replace('--','/')/'package.json').read_text(encoding='utf-8'))
 repo=target.get('repository',{});repo=repo.get('url','') if isinstance(repo,dict) else repo
 parent_repo=package['repository'];parent_repo=parent_repo.get('url','') if isinstance(parent_repo,dict) else parent_repo
 assert repo.replace('git+','').removeprefix('https://github.com/').removesuffix('.git')==parent_repo.replace('git+','').removeprefix('https://github.com/').removesuffix('.git')
 assert package['version']==target['version']
 source=ROOT/'desktop/node_modules'/parent/license_name
 notice(key,source.read_bytes(),f"npm:{parent}@{package['version']}/{license_name}",'Same-version parent distribution and identical declared upstream repository; original text copied verbatim. Build tool binaries are not included in the installer.')
parent_notice('npm:@next--env@16.3.8','next','license.md')
parent_notice('npm:@next--swc-win32-x64-msvc@16.3.8','next','license.md')
parent_notice('npm:@tauri-apps--cli-win32-x64-msvc@2.12.1','@tauri-apps/cli','LICENSE-MIT')
# client-only is the React marker package; its publisher metadata identifies React.
client=json.loads((ROOT/'desktop/node_modules/client-only/package.json').read_text(encoding='utf-8'))
assert client['license']=='MIT' and client['bugs']=='https://github.com/facebook/react/issues'
react=json.loads((ROOT/'desktop/node_modules/react/package.json').read_text(encoding='utf-8'))
notice('npm:client-only@0.0.1',(ROOT/'desktop/node_modules/react/LICENSE').read_bytes(),f"npm:react@{react['version']}/LICENSE",'React publisher identified by client-only package homepage/bugs metadata and declared MIT terms. React copyright notice retained verbatim; this is a shared upstream notice, not a claim of identical release versions.')
selector=next((ROOT/'.tooling/cargo/registry/src').glob('*/selectors-0.38.0'))
header=(selector/'lib.rs').read_text(encoding='utf-8')[:600]
assert 'Mozilla Public' in header and '2.0' in header
# Mozilla publishes the normative MPL text, which is independent of crate version.
url='https://www.mozilla.org/media/MPL/2.0/index.f75d2927d3c1.txt'
with urllib.request.urlopen(url,timeout=30) as response: blob=response.read()
assert b'Mozilla Public License' in blob and b'2.0' in blob and b'<html' not in blob.lower()
notice('rust:selectors@0.38.0',blob,url,'Source headers and Cargo metadata specify MPL-2.0; normative Mozilla license text supplied, and unchanged exact crate sources retain their original copyright headers.')
(OUT/'UPSTREAM-NOTICES.json').write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'supplemented':len(index),'completed':5}))
