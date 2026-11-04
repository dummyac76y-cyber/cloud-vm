import fs from 'node:fs';
const token=fs.readFileSync(new URL('../data/.access-key',import.meta.url),'utf8').trim();
let fail=0;
async function check(name,fn){try{await fn();console.log('PASS',name)}catch(e){fail++;console.error('FAIL',name,e.message)}}
const base='http://127.0.0.1:4317';
const api=(p,o={})=>fetch(base+p,{...o,headers:{Authorization:'Bearer '+token,...o.headers}});
await check('Local health responds',async()=>{const r=await fetch(base+'/api/health');if(r.status!==200)throw Error(String(r.status))});
await check('API rejects unauthorized caller',async()=>{const r=await fetch(base+'/api/system');if(r.status!==401)throw Error(String(r.status))});
await check('Origin is validated',async()=>{const r=await api('/api/system',{headers:{Origin:'https://evil.example'}});if(r.status!==403)throw Error(String(r.status))});
await check('Token authorizes system metrics',async()=>{const r=await api('/api/system');const j=await r.json();if(!r.ok||!j.memory?.total||!j.cpu?.cores)throw Error('Bad metrics')});
await check('File root lists allowed files',async()=>{const r=await api('/api/files?path=');const j=await r.json();if(!r.ok||!Array.isArray(j.files))throw Error('Invalid listing')});
await check('Workspace traversal blocked',async()=>{const r=await api('/api/files?path=..%2F..%2Fetc');if(r.status!==400)throw Error('Traversal not rejected: '+r.status)});
await check('Hidden path blocked',async()=>{const r=await api('/api/files?path=.ssh');if(r.status!==400)throw Error('Hidden path not rejected: '+r.status)});
await check('Task allowlist rejects arbitrary commands',async()=>{const r=await api('/api/task',{method:'POST',body:JSON.stringify({name:'delete-all'}),headers:{'Content-Type':'application/json'}});if(r.status!==400)throw Error('Invalid task accepted')});
await check('Agent endpoint returns catalog',async()=>{const r=await api('/api/agents');const j=await r.json();if(!r.ok||!Array.isArray(j.agents)||j.agents.length<4)throw Error('Missing agents')});
console.log(fail?'SMOKE CHECKS FAILED':'ALL SMOKE CHECKS PASSED');process.exitCode=fail?1:0;