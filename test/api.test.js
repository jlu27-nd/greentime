import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
test('real HTTP flow: signup, link, chores, approval, ledger, sessions, and family isolation',async()=>{
 mkdirSync('.data',{recursive:true});const port=4186,origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server/local.js'],{env:{...process.env,PORT:String(port),DATABASE_URL:'',DEMO_MODE:'false',SQLITE_PATH:`.data/test-${randomUUID()}.sqlite`},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(new Error('Test server exited.')));});
 const landing=await fetch(origin+'/');assert.match(await landing.text(),/Sign up for GreenTime/);
 const app=await fetch(origin+'/app/?signin=1');assert.match(await app.text(),/id="session"/);
 const client=()=>({cookie:'',async call(action,p={}){const r=await fetch(origin+'/api',{method:action?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,Cookie:this.cookie},...(action?{body:JSON.stringify({...p,action,requestId:randomUUID()})}:{})});if(r.headers.get('set-cookie'))this.cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};}});
 const p=client(),k=client(),stranger=client();
 for(const [c,role,email]of [[p,'parent','parent@test.invalid'],[k,'kid','kid@test.invalid'],[stranger,'parent','other@test.invalid']])assert.equal((await c.call('register',{role,email,password:'test-password-123',name:role})).status,200);
 assert.equal((await k.call('pushStatus',{endpoint:'https://fcm.googleapis.com/test'})).status,403);assert.equal((await p.call('pushStatus',{endpoint:'https://fcm.googleapis.com/test'})).data.enabled,false);const code=(await k.call('linkCode')).data.code;assert(code);assert.equal((await p.call('link',{code})).status,200);assert.equal((await stranger.call('link',{code})).status,400);
 const initial=(await p.call()).data;const childId=initial.state.members.find(x=>x.role==='kid').id;
 assert.equal((await p.call('saveTask',{title:'Read a chapter',childId,minutes:15,photoRequired:false})).status,200);
 const task=(await k.call()).data.state.tasks[0];assert.equal((await k.call('submit',{taskId:task.id,note:'Done!',photo:'data:image/png;base64,iVBORw0KGgo='})).status,200);
 const sub=(await p.call()).data.state.submissions[0];assert.equal(sub.ai.verdict,'unavailable');assert.match(sub.photo,/^data:image/);assert.equal((await k.call()).data.state.members[0].balance,0);assert.equal((await k.call('review',{id:sub.id,decision:'approved'})).status,403);assert.equal((await stranger.call('review',{id:sub.id,decision:'approved'})).status,404);
 const approvals=await Promise.all([p.call('review',{id:sub.id,decision:'approved'}),p.call('review',{id:sub.id,decision:'approved'})]);assert(approvals.every(x=>x.status===200));
 const pv=(await p.call()).data.state.members.find(x=>x.id===childId),kv=(await k.call()).data.state.members[0];assert.equal(pv.balance,15);assert.equal(kv.balance,15);
 await k.call('requestTime',{minutes:10});const rid=(await p.call()).data.state.requests[0].id;await p.call('reviewTime',{id:rid,decision:'approved'});await p.call('reviewTime',{id:rid,decision:'approved'});assert.equal((await k.call()).data.state.members[0].balance,5);
 await p.call('review',{id:sub.id,decision:'revoked'});assert.equal((await k.call()).data.state.members[0].balance,-10);assert.equal((await k.call('requestTime',{minutes:1})).status,400);
 await p.call('saveRule',{childId,name:'Games',icon:'🎮',blocked:true});assert.equal((await k.call()).data.state.rules[0].name,'Games');
 const wrongOrigin=await fetch(origin+'/api',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://unrelated.example',Cookie:p.cookie},body:JSON.stringify({action:'logout'})});assert.equal(wrongOrigin.status,403);
 await k.call('logout');assert.equal((await k.call()).status,401);
 }finally{child.kill();}
});
