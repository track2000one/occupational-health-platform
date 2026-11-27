"""Print package/advisory metadata only, and explicitly flag unavailable scans."""
import json
from pathlib import Path
import sys

def main():
    mode,path,status=sys.argv[1:]
    try:
        data=json.loads(Path(path).read_text(encoding='utf-8'))
        if mode=='python':
            deps=data['dependencies']
            findings=[(d['name'],d.get('version',''),v['id'],v.get('fix_versions',[]))
                      for d in deps for v in d.get('vulns',[])]
            skipped=[d['name'] for d in deps if d.get('skip_reason')]
            print(f'DEPENDENCY AUDIT PYTHON: packages={len(deps)} findings={len(findings)} skipped={len(skipped)}')
            for name,version,advisory,fix in findings:
                print(f'{name} {version}: {advisory} fixed_versions={",".join(fix)}')
            if skipped or (int(status)!=0 and not findings):
                print('SCAN INCOMPLETE: skipped packages or scanner error');return 2
            return 1 if findings else 0
        if mode=='npm':
            if data.get('error') or 'vulnerabilities' not in data or 'metadata' not in data:
                raise ValueError('npm audit unavailable')
            counts=data['metadata']['vulnerabilities']
            print('DEPENDENCY AUDIT NPM: '+json.dumps(counts,sort_keys=True))
            for name,v in sorted(data['vulnerabilities'].items()):
                ids=[str(item.get('source','')) for item in v.get('via',[]) if isinstance(item,dict)]
                print(f'{name}: {v.get("severity","unknown")} advisory_ids={",".join(ids)}')
            if int(status)!=0 and not data['vulnerabilities']:
                print('SCAN INCOMPLETE: scanner error');return 2
            return 1 if data['vulnerabilities'] else 0
        raise ValueError('unknown scanner')
    except (OSError,ValueError,KeyError,TypeError):
        print('SCAN UNAVAILABLE OR INVALID: manual review required')
        return 2

if __name__=='__main__':
    raise SystemExit(main())
