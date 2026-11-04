import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve('data/.access-key');
if(!fs.existsSync(file)){console.error('Access key not created. Start Kael Cloud OS first.');process.exit(1)}
console.log('Kael Cloud OS access key (keep private):\n'+fs.readFileSync(file,'utf8').trim());