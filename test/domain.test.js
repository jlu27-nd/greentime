import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyAction,balance,badges,view,recordGreenie} from '../server/domain.js';
const parent={id:'p',role:'parent',name:'Parent'},kid={id:'k',role:'kid',name:'Kid'},members=[parent,kid];
function ready(){const s=emptyState();applyAction(s,parent,'saveTask',{title:'Read',childId:'k',minutes:15},members);applyAction(s,kid,'submit',{taskId:s.tasks[0].id},members);return s;}
test('duplicate approval and retries cannot duplicate credit',()=>{const s=ready(),id=s.submissions[0].id;for(let i=0;i<5;i++)applyAction(s,parent,'review',{id,decision:'approved'},members);assert.equal(balance(s,'k'),15);assert.equal(s.ledger.length,1);assert.equal(badges(s,'k')[0].earned,true);});
test('revoke, reapprove, and discard maintain exactly the expected credit',()=>{const s=ready(),id=s.submissions[0].id;for(const decision of ['approved','revoked','approved','discarded'])applyAction(s,parent,'review',{id,decision},members);assert.equal(balance(s,'k'),0);assert.equal(s.submissions[0].photo,null);assert.equal(badges(s,'k')[0].earned,false);assert.throws(()=>applyAction(s,parent,'review',{id,decision:'approved'},members));});
test('pending/denied/returned work earns nothing and can be resubmitted',()=>{const s=ready(),id=s.submissions[0].id;assert.throws(()=>applyAction(s,kid,'submit',{taskId:s.tasks[0].id},members));applyAction(s,parent,'review',{id,decision:'returned',feedback:'Try again'},members);applyAction(s,kid,'submit',{taskId:s.tasks[0].id},members);assert.equal(balance(s,'k'),0);assert.equal(s.submissions.length,2);});
test('child cannot approve own work or create tasks',()=>{const s=ready();assert.throws(()=>applyAction(s,kid,'review',{id:s.submissions[0].id,decision:'approved'},members),{status:403});assert.throws(()=>applyAction(s,kid,'saveTask',{title:'Fake',minutes:200,childId:'k'},members),{status:403});});
test('time requests deduct once and insufficient balance is rejected',()=>{const s=ready();applyAction(s,parent,'review',{id:s.submissions[0].id,decision:'approved'},members);applyAction(s,kid,'requestTime',{minutes:10},members);for(let i=0;i<3;i++)applyAction(s,parent,'reviewTime',{id:s.requests[0].id,decision:'approved'},members);assert.equal(balance(s,'k'),5);assert.throws(()=>applyAction(s,kid,'requestTime',{minutes:10},members));});
test('revocation after spending produces explicit debt, never fresh spendable credit',()=>{const s=ready(),id=s.submissions[0].id;applyAction(s,parent,'review',{id,decision:'approved'},members);applyAction(s,kid,'requestTime',{minutes:15},members);applyAction(s,parent,'reviewTime',{id:s.requests[0].id,decision:'approved'},members);applyAction(s,parent,'review',{id,decision:'revoked'},members);assert.equal(balance(s,'k'),-15);assert.throws(()=>applyAction(s,kid,'requestTime',{minutes:1},members));});
test('photo requirement and task ownership are enforced on the server',()=>{const s=emptyState();applyAction(s,parent,'saveTask',{title:'Clean',childId:'k',minutes:10,photoRequired:true},members);assert.throws(()=>applyAction(s,kid,'submit',{taskId:s.tasks[0].id},members));assert.throws(()=>applyAction(s,{...kid,id:'other'},'submit',{taskId:s.tasks[0].id,photo:'data:image/png;base64,AAAA'},members));});
test('child projection does not expose sibling data',()=>{const s=ready();s.tasks.push({id:'private',childId:'sibling'});s.submissions.push({id:'private',childId:'sibling',photo:'secret'});const v=view(s,kid,[...members,{id:'sibling',name:'Sibling',role:'kid'}]);assert(!v.tasks.some(x=>x.id==='private'));assert(!JSON.stringify(v).includes('secret'));assert.equal(v.members.length,1);});

const highPass={verdict:'pass',confidence:'high',reason:'Visible completion.'};
test('only a high-confidence pass on a photo provisionally awards credit once',()=>{
 for(const verdict of ['pass','fail','uncertain','unavailable'])for(const confidence of ['high','medium','low','unknown']){
  const s=ready(),sub=s.submissions[0];sub.photo='data:image/png;base64,AAAA';
  recordGreenie(s,sub.id,{verdict,confidence});recordGreenie(s,sub.id,{verdict,confidence});
  const auto=verdict==='pass'&&confidence==='high';assert.equal(balance(s,'k'),auto?15:0);assert.equal(sub.status,auto?'approved':'pending');assert.equal(!!sub.provisional,auto);
 }
 const s=ready();recordGreenie(s,s.submissions[0].id,highPass);assert.equal(balance(s,'k'),0);
});
test('parents can confirm provisional credit without double payment or revoke it once',()=>{
 const s=ready(),sub=s.submissions[0];sub.photo='data:image/png;base64,AAAA';recordGreenie(s,sub.id,highPass);
 applyAction(s,parent,'review',{id:sub.id,decision:'approved'},members);assert.equal(balance(s,'k'),15);assert.equal(sub.provisional,false);assert.equal(sub.approvalSource,'parent');
 applyAction(s,parent,'review',{id:sub.id,decision:'revoked'},members);applyAction(s,parent,'review',{id:sub.id,decision:'revoked'},members);recordGreenie(s,sub.id,highPass);assert.equal(balance(s,'k'),0);assert.equal(sub.status,'revoked');
});
test('late Greenie responses never override parent decisions',()=>{
 for(const decision of ['approved','denied','returned','discarded']){const s=ready(),sub=s.submissions[0];sub.photo='data:image/png;base64,AAAA';applyAction(s,parent,'review',{id:sub.id,decision},members);recordGreenie(s,sub.id,highPass);assert.equal(sub.status,decision);assert.equal(balance(s,'k'),decision==='approved'?15:0);assert.equal(sub.provisional,false);}
});
test('spent provisional credit is reclaimed as debt and cannot be restored by AI',()=>{
 const s=ready(),sub=s.submissions[0];sub.photo='data:image/png;base64,AAAA';recordGreenie(s,sub.id,highPass);
 applyAction(s,kid,'requestTime',{minutes:10},members);applyAction(s,parent,'reviewTime',{id:s.requests[0].id,decision:'approved'},members);
 applyAction(s,parent,'review',{id:sub.id,decision:'revoked'},members);recordGreenie(s,sub.id,highPass);assert.equal(balance(s,'k'),-10);assert.equal(badges(s,'k')[0].earned,false);assert.throws(()=>applyAction(s,kid,'requestTime',{minutes:1},members));
});
