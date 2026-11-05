// Offline CLI regression: the fake transport never contacts GitHub.
const {mkdtempSync, mkdirSync, writeFileSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const root = mkdtempSync(join(tmpdir(), 'icf-regression-'));
try {
  mkdirSync(join(root, 'icf-nodejs'), {recursive:true});
  writeFileSync(join(root, 'icf-nodejs/config.json'), JSON.stringify({auth:{github_token:'test-only',github_user:'tester'}}));
  const mock = join(root, 'mock.cjs');
  writeFileSync(mock, `global.fetch = async (input, init) => {
    const url = String(input.url || input);
    if (init.method === 'GET' && url.includes('/issues?')) {
      const page2 = url.includes('page=2');
      return new Response(JSON.stringify([{number:page2?534:533, title:'[P0] test', body:'Kuma monitor id: '+(page2?'111':'11'), labels:[], created_at:'2026-11-05T00:00:00Z', html_url:'https://example.test'}]), {status:200, headers:{'content-type':'application/json', ...(page2?{}:{link:'<https://api.github.com/repos/test/incidents/issues?page=2>; rel="next"'})}});
    }
    if (url.endsWith('/comments')) {
      if (process.env.SCENARIO === 'comment-fails') throw new Error('Connect Timeout Error');
      return new Response(JSON.stringify({id:1}), {status:201,headers:{'content-type':'application/json'}});
    }
    if (url.endsWith('/issues') && init.method === 'POST') {
      if (process.env.SCENARIO === 'create-fails') return new Response('{}', {status:503,headers:{'content-type':'application/json'}});
      return new Response(JSON.stringify({number:533,html_url:'https://example.test/533'}), {status:201,headers:{'content-type':'application/json'}});
    }
    throw new Error('Unexpected network request: '+url);
  };`);
  for (const scenario of ['ok','comment-fails','create-fails']) {
    const res = spawnSync(process.execPath, ['--require',mock,join(__dirname,'dist/index.js'),'incident','create','--repo','test/incidents','--input-json',JSON.stringify({title:'test',service:'db-01',severity:'P0'}),'--json'], {env:{...process.env,XDG_CONFIG_HOME:root,SCENARIO:scenario},encoding:'utf8',timeout:15000});
    assert.equal(res.error, undefined);
    const result = JSON.parse(res.stdout);
    if (scenario === 'create-fails') {assert.notEqual(res.status,0);assert.equal(result.ok,false);}
    else {assert.equal(res.status,0,res.stderr);assert.equal(result.ok,true);assert.equal(result.data.id,'INC-533');}
    if (scenario === 'comment-fails') assert.match(res.stderr,/timeline comment failed/);
  }
  const listed = spawnSync(process.execPath, ['--require',mock,join(__dirname,'dist/index.js'),'incident','list','--repo','test/incidents','--json'], {env:{...process.env,XDG_CONFIG_HOME:root},encoding:'utf8',timeout:15000});
  assert.equal(listed.status,0,listed.stderr);
  const items = JSON.parse(listed.stdout).data;
  assert.equal(items.length,2);
  assert.equal(items[1].body,'Kuma monitor id: 111');
  console.log('CLI regression: 3 create scenarios + paginated list with body passed');
} finally { rmSync(root,{recursive:true,force:true}); }
