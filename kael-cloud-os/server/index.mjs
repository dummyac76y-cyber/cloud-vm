import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { assertSafePath, isPreviewable, tokenMatches, scrubOutput } from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = path.join(ROOT, 'workspace');
const DATA = path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist');
const PORT = 4317;
fs.mkdirSync(DATA, {recursive:true, mode:0o700});
fs.chmodSync(DATA,0o700);
fs.mkdirSync(WORKSPACE,{recursive:true});
const KEYFILE=path.join(DATA,'.access-key');
if (!fs.existsSync(KEYFILE)) fs.writeFileSync(KEYFILE,crypto.randomBytes(32).toString('hex')+'\n',{mode:0o600,flag:'wx'});
const KEY=fs.readFileSync(KEYFILE,'utf8').trim();
const db=new DatabaseSync(path.join(DATA,'kael.db'));
db.exec('CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT NOT NULL, action TEXT NOT NULL, result TEXT NOT NULL)');
const insert=db.prepare('INSERT INTO activity(time,action,result) VALUES(?,?,?)');
const history=db.prepare('SELECT time,action,result FROM activity ORDER BY id DESC LIMIT 40');
function audit(action,result) { try {insert.run(new Date().toISOString(),String(action).slice(0,80),String(result).slice(0,180));} catch {} }
const defaults={ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
function send(res,status,obj){res.writeHead(status,defaults);res.end(JSON.stringify(obj));}
function authorized(req){const header=req.headers.authorization||''; return tokenMatches(KEY,header.startsWith('Bearer ')?header.slice(7):'');}
function validOrigin(req){const o=req.headers.origin;if(!o)return true;try{const u=new URL(o);return ['127.0.0.1','localhost'].includes(u.hostname) && ['4317','5173'].includes(u.port) && u.protocol==='http:';}catch{return false}}
async function readBody(req){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>32768)throw new Error('Request body too large');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
const call=(bin,args=[],timeout=3000)=>{try{return execFileSync(bin,args,{encoding:'utf8',timeout,maxBuffer:64000,stdio:['ignore','pipe','ignore']}).trim()}catch{return ''}};
let lastCpu=os.cpus().map(c=>({...c.times}));
function snapshotCPU(){const next=os.cpus();let idle=0,total=0;next.forEach((c,i)=>{const prev=lastCpu[i]||c.times;const old=Object.values(prev).reduce((a,v)=>a+v,0);const cur=Object.values(c.times).reduce((a,v)=>a+v,0);idle+=c.times.idle-prev.idle;total+=cur-old;});lastCpu=next.map(c=>({...c.times}));return total>0?Math.round(100*(1-idle/total)):0;}
function memory(){const m={};try{for(const line of fs.readFileSync('/proc/meminfo','utf8').split('\n')){const mt=line.match(/^(\w+):\s+(\d+)/);if(mt)m[mt[1]]=Number(mt[2])*1024;}}catch{}return{total:m.MemTotal||os.totalmem(),available:m.MemAvailable??os.freemem(),used:(m.MemTotal||os.totalmem())-(m.MemAvailable??os.freemem())};}
function disk(){const raw=call('df',['-kP',ROOT]);const l=raw.split('\n').at(-1).trim().split(/\s+/);return{total:Number(l[1]||0)*1024,used:Number(l[2]||0)*1024,available:Number(l[3]||0)*1024,percentage:parseInt(l[4])||0};}
function processes(){return call('ps',['-eo','pid,ppid,stat,rss,comm','--sort=-rss']).split('\n').slice(1,17).map(s=>s.trim().split(/\s+/)).filter(a=>a.length>=5).map(a=>({pid:Number(a[0]),ppid:Number(a[1]),state:a[2],memoryMB:Math.round(Number(a[3])/1024),name:a.slice(4).join(' ')}));}
function currentServiceHealth(){const p=call('ps',['-eo','args','--cols','300']);return{desktopCommander:p.includes('desktop-commander')&&p.includes('remote'),rdcKeeper:p.includes('rdc-keeper/keeper.sh'),kaelOS:true};}
function system(){return{host:os.hostname(),platform:os.platform(),arch:os.arch(),node:process.version,uptimeSeconds:os.uptime(),cpu:{cores:os.cpus().length,usage:snapshotCPU()},memory:memory(),disk:disk(),processes:processes(),services:currentServiceHealth(),time:new Date().toISOString()};}
const catalog=[['Desktop Commander','desktop-commander'],['Claude Code','claude'],['Codex CLI','codex'],['OpenCode','opencode'],['OpenClaw','openclaw'],['Freestyle CLI','freestyle']];
function agents(){const p=call('ps',['-eo','args','--cols','300']);return catalog.map(([name,bin])=>{const installed=bin==='desktop-commander'?p.includes('desktop-commander'):Boolean(call('which',[bin]));let loggedIn=false, auth='Not configured';
if(bin==='desktop-commander'){loggedIn=p.includes('desktop-commander')&&p.includes('remote');auth=loggedIn?'Paired / running':'Not connected'}
else if(bin==='claude'){const v=call('claude',['auth','status','--json'],4000);try{loggedIn=JSON.parse(v).loggedIn===true}catch{}auth=loggedIn?'Authenticated':'Not signed in'}
else if(bin==='codex'){loggedIn=/^Logged in(?:\s|$)/im.test(call('codex',['login','status'],4000));auth=loggedIn?'Authenticated':'Not signed in'}
else if(bin==='opencode'){const v=call('opencode',['auth','list'],4000);loggedIn=!v.includes('0 credentials')&&v.includes('Credentials');auth=loggedIn?'Configured':'No credentials'}
else if(bin==='openclaw'){loggedIn=fs.existsSync(path.join(os.homedir(),'.openclaw','openclaw.json'));auth=loggedIn?'Configuration present':'Not configured'}
else auth='CLI not signed in';
return{name,installed,running:bin==='desktop-commander'?loggedIn:false,authenticated:loggedIn,auth};});}
function listFiles(rel){const dir=assertSafePath(WORKSPACE,rel);if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())throw new Error('Directory not found');return fs.readdirSync(dir,{withFileTypes:true}).filter(f=>!f.name.startsWith('.')&&!['data','backups','dist','node_modules'].includes(f.name)&&!f.isSymbolicLink()).map(f=>{const stat=fs.statSync(path.join(dir,f.name));return{name:f.name,path:path.posix.join(rel,f.name),directory:f.isDirectory(),size:stat.size,modified:stat.mtime.toISOString()}}).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));}
const allowedTasks={
'uptime':['uptime',['-p']],
'disk':['df',['-h',ROOT]],
'identity':['id',['-un']],
'git-status':['git',['-C',ROOT,'status','--short']],
'tests':['npm',['test']],
'build':['npm',['run','build']]
};
let busy=false;
function runTask(name){return new Promise((resolve,reject)=>{const tuple=allowedTasks[name];if(!tuple)return reject(new Error('Task is not allowed'));if(busy)return reject(new Error('Another task is currently running'));busy=true;const [bin,args]=tuple;execFile(bin,args,{cwd:ROOT,timeout:name==='build'?90000:30000,maxBuffer:90000,env:{...process.env,FORCE_COLOR:'0'}},(err,stdout,stderr)=>{busy=false;const output=scrubOutput((stdout||'')+(stderr||''));const result={name,ok:!err,exitCode:err?.code??0,output:output||'(no output)',time:new Date().toISOString()};audit(name,result.ok?'PASS':'FAIL');resolve(result);});});}
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.json':'application/json'};
function staticFile(req,res,pathname){if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});const safe=path.posix.normalize(pathname).replace(/^\/+/,'');if(safe.startsWith('..')||safe.split('/').some(p=>p.startsWith('.')))return send(res,403,{error:'Forbidden'});const full=path.resolve(DIST,safe||'index.html');if(!full.startsWith(DIST+path.sep))return send(res,403,{error:'Forbidden'});const target=fs.existsSync(full)&&fs.statSync(full).isFile()?full:path.join(DIST,'index.html');if(!fs.existsSync(target))return send(res,503,{error:'Frontend not built. Run npm run build.'});res.writeHead(200,{...defaults,'Content-Type':MIME[path.extname(target)]||'application/octet-stream','Cache-Control':target.endsWith('index.html')?'no-store':'public,max-age=300'});fs.createReadStream(target).pipe(res);}
const server=http.createServer(async (req,res)=>{try{
  if (!validOrigin(req))return send(res,403,{error:'Origin not allowed'});
  const u=new URL(req.url||'/', 'http://127.0.0.1:'+PORT);
  if(u.pathname==='/api/health')return send(res,200,{status:'ok',name:'Kael Cloud OS',localOnly:true});
  if(!u.pathname.startsWith('/api/'))return staticFile(req,res,u.pathname);
  if(!authorized(req))return send(res,401,{error:'Access key required'});
  if(req.method==='GET'&&u.pathname==='/api/me')return send(res,200,{authorized:true,name:'Kael Cloud OS',version:'0.1.0'});
  if(req.method==='GET'&&u.pathname==='/api/system')return send(res,200,system());
  if(req.method==='GET'&&u.pathname==='/api/agents')return send(res,200,{agents:agents()});
  if(req.method==='GET'&&u.pathname==='/api/history')return send(res,200,{events:history.all()});
  if(req.method==='GET'&&u.pathname==='/api/files')return send(res,200,{path:u.searchParams.get('path')||'',files:listFiles(u.searchParams.get('path')||'')});
  if(req.method==='GET'&&u.pathname==='/api/file'){
    const rel=u.searchParams.get('path')||'';const file=assertSafePath(WORKSPACE,rel);const st=fs.statSync(file);if(!st.isFile()||!isPreviewable(file,st.size))return send(res,415,{error:'Preview not supported'});
    const content=fs.readFileSync(file,'utf8');return send(res,200,{path:rel,content,size:st.size});
  }
  if(req.method==='POST'&&u.pathname==='/api/task'){const body=await readBody(req);const result=await runTask(body.name);return send(res,200,result)}
  return send(res,404,{error:'Not found'});
}catch(e){const message=String(e.message||e);return send(res,/not found|ENOENT/i.test(message)?404:400,{error:message.slice(0,170)})}});
server.listen(PORT,'127.0.0.1',()=>console.log('Kael Cloud OS v0.1.0 listening locally on http://127.0.0.1:'+PORT+' (access key stored in data/.access-key)'));