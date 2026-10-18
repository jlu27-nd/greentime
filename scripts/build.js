import { cpSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import {prepareBrand} from './brand.js';
prepareBrand();
for(const file of ['greentime-hero.mp4','greentime-family.mp4','poster.jpg'])writeFileSync('public/welcome/'+file,Buffer.from(readFileSync('public/welcome/'+file+'.b64','utf8'),'base64'));
mkdirSync('dist',{recursive:true});cpSync('public','dist',{recursive:true,filter:source=>!source.endsWith('.b64')});console.log('GreenTime static app built. API runs in Vercel Functions.');
