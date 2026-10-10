"""Verify the actual MSIX archive against the recorded staging inventory."""
import argparse,hashlib,json,zipfile
from pathlib import Path
from urllib.parse import unquote
from xml.etree import ElementTree as ET
parser=argparse.ArgumentParser();parser.add_argument('directory',type=Path);args=parser.parse_args()
base=args.directory;r=json.loads((base/'msix-review.json').read_text());package=base/r['package']
with package.open('rb') as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
if actual!=r['package_sha256']:raise SystemExit('MSIX package checksum differs from its review')
with zipfile.ZipFile(package) as z:
 if z.testzip() is not None:raise SystemExit('MSIX archive CRC failure')
 # MSIX is OPC: part names encode URI characters such as @ and spaces.
 names={unquote(n):n for n in z.namelist()}
 if len(names)!=len(z.namelist()):raise SystemExit('Colliding decoded MSIX part names')
 m=ET.fromstring(z.read(names['AppxManifest.xml']));identity=m.find('{*}Identity').attrib
 if identity['Name']!=r['identity_name'] or identity['Publisher']!=r['publisher'] or identity['Version']!=r['version'] or identity['ProcessorArchitecture']!='x64':raise SystemExit('MSIX identity/version/architecture mismatch')
 for entry in r['files']:
  if hashlib.sha256(z.read(names[entry['path']])).hexdigest()!=entry['sha256']:raise SystemExit('Archived payload differs: '+entry['path'])
 if any(n.endswith(('/ffmpeg.exe','/ffprobe.exe')) for n in names):raise SystemExit('Excluded tool executable in MSIX')
 required={'AppxManifest.xml','AppxBlockMap.xml','[Content_Types].xml'}
 if not required.issubset(names):raise SystemExit('Missing MSIX package structure')
 allowed={p['path'] for p in r['files']}|required|{'AppxSignature.p7x','AppxMetadata/CodeIntegrity.cat'}
 if set(names)-allowed:raise SystemExit('Unreviewed archived files: '+str(sorted(set(names)-allowed)))
report={'passed':True,'package_sha256':actual,'identity':identity,'payload_files':len(r['files']),'archive_crc_and_payload_sha256':True,'store_identity_confirmed':r['store_identity_confirmed'],'signed':False,'windows_installation_tested':False,'store_certification_received':False}
(base/'msix-archive-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'payload_files':len(r['files']),'package_sha256':actual,'identity':identity},indent=2))
