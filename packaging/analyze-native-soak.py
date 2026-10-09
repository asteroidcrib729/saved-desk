"""Check steady playback memory within the last uninterrupted native process lifetime."""
import argparse,json
from pathlib import Path
from statistics import median
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('report',type=Path);args=parser.parse_args()
p=args.report.resolve();base=(ROOT/'.cache/native-soak').resolve()
if not p.is_relative_to(base) or p.name!='acceptance.json':raise SystemExit('Use an isolated native soak acceptance report.')
r=json.loads(p.read_text(encoding='utf8'));samples=[s for s in r['samples'] if s['seconds']>=1200]
if not r.get('passed') or r.get('restarts')!=2 or len(samples)<16:raise SystemExit('A completed two-restart soak with enough final-generation samples is required.')
early=samples[:8];late=samples[-8:];growth=(median(s['private'] for s in late)-median(s['private'] for s in early))/1048576
out={'passed':growth<256,'scope':'Final uninterrupted process lifetime after the second scheduled restart; compares first and last eight private-memory samples. Does not infer a leak bound across different process generations.','private_memory_growth_mb':round(growth,2),'first_sample_seconds':samples[0]['seconds'],'last_sample_seconds':samples[-1]['seconds'],'samples':len(samples),'app_sha256':r['app_sha256'],'api_p95_ms':r['api_p95_ms'],'elapsed_seconds':r['elapsed_seconds']}
(p.parent/'steady-memory-analysis.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8');print(json.dumps(out,indent=2))
raise SystemExit(0 if out['passed'] else 1)
