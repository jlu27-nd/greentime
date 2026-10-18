import {readFileSync,writeFileSync} from 'node:fs';
// Lossless text transport for the original user-supplied PNG assets.
export function prepareBrand(){for(const name of ['greentime-logo','greentime-icon'])writeFileSync(`public/brand/${name}.png`,Buffer.from(readFileSync(`public/brand/${name}.b64`,'utf8').trim(),'base64'));}
