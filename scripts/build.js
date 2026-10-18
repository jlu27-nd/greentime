import { cpSync,mkdirSync } from 'node:fs';
import {prepareBrand} from './brand.js';
prepareBrand();
mkdirSync('dist',{recursive:true});cpSync('public','dist',{recursive:true,filter:source=>!source.endsWith('.b64')});console.log('GreenTime static app built. API runs in Vercel Functions.');
