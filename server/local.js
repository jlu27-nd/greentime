import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {prepareBrand} from '../scripts/brand.js';
prepareBrand();
process.env.DEMO_MODE=process.env.DEMO_MODE||'true';
const {default:handler}=await import('../api/index.js');
const root=path.resolve('public');
http.createServer(async(req,res)=>{if(req.url.startsWith('/api'))return handler(req,res);try{const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname==='/app'?'/app/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.mp4':'video/mp4','.vtt':'text/vtt','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(Number(process.env.PORT||4174),'127.0.0.1',()=>console.log('GreenTime: http://127.0.0.1:'+(process.env.PORT||4174)));
