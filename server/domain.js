import { randomUUID } from 'node:crypto';
export const emptyState = () => ({tasks:[],submissions:[],ledger:[],requests:[],rules:[],events:[],receipts:[]});
export const balance = (s,id) => s.ledger.filter(x=>x.childId===id).reduce((n,x)=>n+x.amount,0);
export function ensure(ok,message,status=400){if(!ok)throw Object.assign(new Error(message),{status});}
const text=(v,max=200)=>String(v??'').trim().slice(0,max);
const minutes=v=>{ensure(Number.isInteger(+v)&&+v>0&&+v<=240,'Minutes must be between 1 and 240.');return +v;};
export function badges(s,id){const count=s.submissions.filter(x=>x.childId===id&&x.status==='approved').length;return [{name:'First little win',icon:'🌱',goal:1},{name:'Helping Hand',icon:'⭐',goal:5},{name:'Family teammate',icon:'🏆',goal:15}].map(x=>({...x,count,earned:count>=x.goal}));}
// Only server-obtained assessments reach this function, under the household transaction lock.
export function recordGreenie(s,id,result){
 const sub=s.submissions.find(x=>x.id===id);
 if(!sub||sub.status==='discarded')return;
 sub.ai=result;
 // Never undo a parent's decision, including when a late AI response arrives.
 if(!sub.photo||sub.status!=='pending'||sub.reviewedBy||result.verdict!=='pass'||result.confidence!=='high')return;
 const now=Date.now(),net=s.ledger.filter(x=>x.submissionId===id).reduce((n,x)=>n+x.amount,0),delta=sub.minutes-net;
 if(delta)s.ledger.push({id:randomUUID(),at:now,childId:sub.childId,amount:delta,reason:`Greenie provisional approval: ${sub.title}`,submissionId:id});
 sub.status='approved';sub.approvalSource='greenie';sub.provisional=true;sub.reviewedAt=now;
 const notification={id:randomUUID(),submissionId:id,childId:sub.childId,title:sub.title,minutes:sub.minutes,at:now,readBy:[]};
 (s.notifications??=[]).unshift(notification);
 s.events.unshift({id:randomUUID(),at:now,actor:'Greenie',message:`Provisionally approved: ${sub.title}`,childId:sub.childId,amount:delta});
 return notification;
}
export function applyAction(s,user,action,p={},members=[]){
  const now=Date.now(),id=randomUUID(),parent=()=>ensure(user.role==='parent','Only a parent can do that.',403);
  const child=()=>ensure(user.role==='kid','Only a child can do that.',403);
  const log=(message,childId=null,amount=0)=>s.events.unshift({id,at:now,actor:user.name,message,childId,amount});
  const credit=(childId,amount,reason,submissionId=null)=>s.ledger.push({id:randomUUID(),at:now,childId,amount,reason,submissionId});
  if(p.requestId&&s.receipts.includes(p.requestId))return;
  switch(action){
  case 'readNotification':{parent();const n=(s.notifications||[]).find(x=>x.id===p.id);ensure(n,'Notification not found.',404);if(!n.readBy.includes(user.id))n.readBy.push(user.id);break;}
  case 'saveCriteria':{
    parent();const task=s.tasks.find(x=>x.id===p.id);ensure(task,'Task not found.',404);
    const criteria=String(p.criteria||'').trim();ensure(criteria&&criteria.length<=1500,'Describe the completion standard in 1–1500 characters.');
    (task.criteriaHistory??=[]).push({at:now,by:user.id,previous:task.criteria,criteria});task.criteria=criteria;
    log(`Updated Greenie criteria for ${task.title}: ${criteria}`,task.childId);break;
  }
  case 'saveTask':{
    parent();ensure(members.some(x=>x.id===p.childId&&x.role==='kid'),'Choose a linked child.');
    const title=text(p.title,100);ensure(title,'Give the task a title.');
    let t=s.tasks.find(x=>x.id===p.id);if(p.id)ensure(t,'Task not found.',404);
    const fields={title,childId:p.childId,icon:text(p.icon,8)||'✅',description:text(p.description,1000),instructions:text(p.instructions,1500),criteria:text(p.criteria,1500),minutes:minutes(p.minutes),category:['chore','outdoor','responsibility','healthy'].includes(p.category)?p.category:'chore',photoRequired:!!p.photoRequired,recurring:!!p.recurring,active:true};
    if(t)Object.assign(t,fields);else s.tasks.push({id,createdAt:now,...fields});log(`${p.id?'Updated':'Created'} task: ${title}`,p.childId);break;
  }
  case 'archiveTask':parent();{const t=s.tasks.find(x=>x.id===p.id);ensure(t,'Task not found.',404);t.active=false;log(`Archived task: ${t.title}`,t.childId);}break;
  case 'submit':{
    child();const t=s.tasks.find(x=>x.id===p.taskId&&x.childId===user.id&&x.active);ensure(t,'Task not available.',404);
    const prior=s.submissions.filter(x=>x.taskId===t.id&&x.childId===user.id);
    ensure(!prior.some(x=>x.status==='pending'),'This task is already waiting for review.');
    ensure(!prior.some(x=>x.status==='approved'&&(!t.recurring||new Date(x.createdAt).toISOString().slice(0,10)===new Date(now).toISOString().slice(0,10))),'This task has already been completed for this cycle.');
    ensure(!t.photoRequired||p.photo,'A photo is required.');
    if(p.photo)ensure(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.photo)&&p.photo.length<=2800000,'Choose a JPEG, PNG, or WebP under 2 MB.');
    s.submissions.unshift({id,taskId:t.id,childId:user.id,title:t.title,icon:t.icon,minutes:t.minutes,criteria:t.criteria,photo:p.photo||null,note:text(p.note,1000),status:'pending',feedback:'',createdAt:now,ai:null});log(`Submitted: ${t.title}`,user.id);break;
  }
  case 'review':{
    parent();const sub=s.submissions.find(x=>x.id===p.id);ensure(sub,'Submission not found.',404);
    const decision=p.decision;ensure(['approved','denied','returned','revoked','discarded'].includes(decision),'Invalid review decision.');
    ensure(sub.status!=='discarded','This submission is discarded.');
    if(p.learnCriteria){
      const task=s.tasks.find(x=>x.id===sub.taskId),feedback=text(p.feedback,1000);ensure(task&&feedback,'Add a clear completion standard for Greenie first.');
      const criteria=[task.criteria,feedback].filter(Boolean).join('\n');ensure(criteria.length<=1500,'These criteria are too long. Use Teach Greenie to edit them.');
      (task.criteriaHistory??=[]).push({at:now,by:user.id,previous:task.criteria,criteria,submissionId:sub.id});task.criteria=criteria;
      log(`Learned parent standard for ${task.title}: ${feedback}`,sub.childId);
    }
    for(const n of s.notifications||[])if(n.submissionId===sub.id&&!n.readBy.includes(user.id))n.readBy.push(user.id);
    if(sub.status===decision&&!(decision==='approved'&&sub.provisional))break;
    ensure(decision!=='revoked'||sub.status==='approved','Only approved credit can be revoked.');
    const net=s.ledger.filter(x=>x.submissionId===sub.id).reduce((n,x)=>n+x.amount,0);
    const target=decision==='approved'?sub.minutes:0,delta=target-net;
    // A reversal may create debt if earned time was already spent. Available time is clamped in the view; no new spending until repaid.
    if(delta)credit(sub.childId,delta,`${decision}: ${sub.title}`,sub.id);
    sub.status=decision;sub.feedback=text(p.feedback,1000);sub.reviewedAt=now;sub.reviewedBy=user.id;sub.provisional=false;sub.approvalSource='parent';
    if(decision==='discarded')sub.photo=null;
    log(`${decision}: ${sub.title}`,sub.childId,delta);break;
  }
  case 'requestTime':child();{const amount=minutes(p.minutes);ensure(amount<=Math.max(0,balance(s,user.id)),'Not enough available minutes.');ensure(!s.requests.some(x=>x.childId===user.id&&x.status==='pending'),'You already have a screen-time request waiting.');s.requests.unshift({id,childId:user.id,minutes:amount,status:'pending',createdAt:now});log(`Requested ${amount} minutes`,user.id);}break;
  case 'reviewTime':{
    parent();const r=s.requests.find(x=>x.id===p.id);ensure(r,'Request not found.',404);if(r.status!=='pending')break;
    ensure(['approved','denied'].includes(p.decision),'Choose approve or deny.');
    if(p.decision==='approved'){ensure(balance(s,r.childId)>=r.minutes,'Balance changed. Not enough minutes remain.');credit(r.childId,-r.minutes,'Screen-time request approved');r.endsAt=now+r.minutes*60000;}
    r.status=p.decision;log(`Screen time ${r.status}`,r.childId,p.decision==='approved'?-r.minutes:0);break;
  }
  case 'saveRule':parent();ensure(members.some(x=>x.id===p.childId&&x.role==='kid'),'Child not found.');ensure(text(p.name,60),'Enter an app name.');{let rule=s.rules.find(x=>x.childId===p.childId&&x.name.toLowerCase()===text(p.name,60).toLowerCase());if(rule){rule.blocked=!!p.blocked;rule.icon=text(p.icon,8)||'📱';}else s.rules.push({id,childId:p.childId,name:text(p.name,60),icon:text(p.icon,8)||'📱',blocked:!!p.blocked});log(`Updated app rule: ${text(p.name,60)}`,p.childId);}break;
  case 'removeRule':parent();s.rules=s.rules.filter(x=>x.id!==p.id);log('Removed app rule');break;
  default:ensure(false,'Unknown action.');
  }
  if(p.requestId)s.receipts.push(p.requestId);s.receipts=s.receipts.slice(-1000);
}
export function view(s,user,members){
  const allowed=x=>user.role==='parent'||x.childId===user.id;
  return {...s,notifications:user.role==='parent'?(s.notifications||[]):[],tasks:s.tasks.filter(allowed),submissions:s.submissions.filter(allowed),requests:s.requests.filter(allowed),ledger:s.ledger.filter(allowed),rules:s.rules.filter(allowed),events:s.events.filter(allowed),receipts:undefined,members:members.filter(x=>user.role==='parent'||x.id===user.id).map(x=>({id:x.id,name:x.name,role:x.role,balance:balance(s,x.id),badges:badges(s,x.id)}))};
}
