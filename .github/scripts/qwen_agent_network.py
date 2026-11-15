#!/usr/bin/env python3
import json, os, re, subprocess, sys, urllib.request
from pathlib import Path
MODEL = 'qwen2.5-coder:3b'
ALLOWED = ('app/', 'api/', 'services/', 'src/', 'lib/', 'tests/', 'test/', 'docs/', 'scripts/', 'stream-service/')
def patch_paths(patch):
    old_paths, new_paths = [], []
    for line in patch.splitlines():
        if line.startswith('--- a/'):
            old_paths.append(line[6:].strip())
        elif line == '--- /dev/null':
            old_paths.append(None)
        elif line.startswith('+++ b/'):
            new_paths.append(line[6:].strip())
        elif line == '+++ /dev/null':
            new_paths.append(None)
    if not new_paths or len(new_paths) > 8:
        raise ValueError('empty or oversized patch')
    if any(path is None for path in new_paths):
        raise ValueError('file deletions are forbidden')
    all_paths = [p for p in old_paths + new_paths if p is not None]
    if not all_paths or any(not allowed(path) for path in all_paths):
        raise ValueError('patch path violates allowlist')
    if len(old_paths) != len(new_paths):
        raise ValueError('patch old/new file counts do not match')
    if re.search(r'^deleted file mode|^rename from |^rename to |^copy from |^copy to |^GIT binary patch|^Binary files ', patch, re.M):
        raise ValueError('deletions, renames, copies and binary patches are forbidden')
    if re.search(r'^(?:old|new) mode 120000|^(?:old|new) mode 160000', patch, re.M):
        raise ValueError('symlinks and submodules are forbidden')
    return sorted(set(new_paths))

def main():
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    repo = os.environ['GITHUB_REPOSITORY']
    owner = repo.split('/')[0]
    if os.environ.get('GITHUB_ACTOR', '').lower() != owner.lower():
        raise SystemExit('Only the repository owner may invoke this agent.')
    comment = event.get('comment', {}).get('body', '')
    task = event.get('inputs', {}).get('task', '') or (comment[4:] if comment.startswith('/ai ') else '')
    if not task or len(task) > 3000: raise SystemExit('Invalid task')
    files = subprocess.check_output(['git','ls-files'], text=True).splitlines()
    context = ''
    for p in files:
        if p.startswith(ALLOWED) and not any(x in p.lower() for x in ('.env','secret','credential','.lock')):
            try: context += '\nFILE '+p+'\n'+Path(p).read_text()[:2000]
            except (OSError, UnicodeError): pass
        if len(context) > 12000: break
    def ask(messages, n):
        req = urllib.request.Request('http://127.0.0.1:11434/api/chat', data=json.dumps({'model':MODEL,'stream':False,'messages':messages,'options':{'temperature':0.1,'num_ctx':6144,'num_predict':n}}).encode(), headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req, timeout=900) as r: return json.loads(r.read())['message']['content']
    plan = ask([{'role':'system','content':'You are the planning agent. Give a concise plan and acceptance criteria.'},{'role':'user','content':task+'\n'+context}],500)
    patch = ask([{'role':'system','content':'You are the implementation agent. Return only a unified git diff. Change only app/, services/, tests/, test/, docs/, scripts/. No deletes, secrets, manifests, workflows or deployment config.'},{'role':'user','content':task+'\nPLAN:\n'+plan+'\nFILES:\n'+context}],1800)
    patch = patch[patch.find('diff --git '):] if 'diff --git ' in patch else ''
    try:
        paths = patch_paths(patch)
    except ValueError as exc:
        raise SystemExit('Patch rejected: ' + str(exc))
    chk = subprocess.run(['git','apply','--check','--'],input=patch,text=True,capture_output=True)
    if chk.returncode: raise SystemExit('Patch invalid: '+chk.stderr[-1000:])
    subprocess.run(['git','apply','--'],input=patch,text=True,check=True)
    diff = subprocess.check_output(['git','diff'],text=True)
    review = ask([{'role':'system','content':'Independent reviewer. Reply exactly APPROVE if no high severity issue; otherwise REJECT and explain.'},{'role':'user','content':task+'\n'+diff}],250)
    if not review.strip().startswith('APPROVE'): raise SystemExit('Review rejected: '+review[:1000])
    with open(os.environ['GITHUB_OUTPUT'],'a') as f: f.write('base_branch='+event.get('inputs',{}).get('base_ref','main')+'\n')
    print('Planner, implementer and reviewer completed.')
if __name__ == '__main__': main()
