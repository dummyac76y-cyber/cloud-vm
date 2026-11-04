import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const HIDDEN = new Set(['node_modules','dist','data','backups','.git','.npm','.cache','.claude','.codex','.desktop-commander-device','.claude-server-commander','.rdc-keeper','.local','.env','.env.local']);
export const TEXT_EXT = new Set(['.md','.txt','.js','.jsx','.mjs','.cjs','.ts','.tsx','.css','.html','.json','.yml','.yaml','.toml','.py','.sh','.xml','.svg','.gitignore','.csv','.log']);
export function assertSafePath(root, candidate='') {
  if (typeof candidate !== 'string' || candidate.includes('\0') || candidate.length > 2048) throw new Error('Invalid file path');
  const base=fs.realpathSync(root);
  const rel=candidate.replaceAll('\\','/');
  if (rel.startsWith('/') || rel.split('/').some(v=>v==='..')) throw new Error('Access outside workspace is denied');
  const target=path.resolve(base,rel);
  if (target!==base && !target.startsWith(base+path.sep)) throw new Error('Access outside workspace is denied');
  let walk=base;
  for(const part of path.relative(base,target).split(path.sep).filter(Boolean)){
    if (part.startsWith('.') || HIDDEN.has(part)) throw new Error('Protected path');
    walk=path.join(walk,part);
    if(fs.existsSync(walk) && fs.lstatSync(walk).isSymbolicLink()) throw new Error('Symbolic links are disabled');
  }
  return target;
}
export function isPreviewable(filename,size){
  return size<=200000 && (TEXT_EXT.has(path.extname(filename).toLowerCase()) || !path.extname(filename));
}
export function tokenMatches(actual,supplied){
  if(typeof supplied!=='string' || !actual || supplied.length!==actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(supplied));
}
export function scrubOutput(text){
  return String(text).replace(/(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/g,'$1[REDACTED]').replace(/(gh[opusr]_[A-Za-z0-9]{5})[A-Za-z0-9]+/g,'$1[REDACTED]').slice(0,24000);
}