import { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { transaction } from '../server/db.js';
import { emptyState, applyAction, view, ensure } from '../server/domain.js';
import { assess, greenieConfigured } from '../server/greenie.js';
const digest=x=>createHash('sha256').update(x).digest('hex');
const hashPassword=p=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex');};
const verify=(p,h)=>{const [salt,key]=h.split(':');return !!key&&timingSafeEqual(Buffer.from(key,'hex'),scryptSync(p,salt,64));};
const demo=()=>process.env.DEMO_MODE==='true'&&!process.env.VERCEL&&process.env.NODE_ENV!=='production';
async function session(db,req){const token=(req.headers.cookie||'').match(/(?:^|; )gt_session=([a-f0-9]+)/)?.[1];ensure(token,'Please sign in.',401);const [u]=await db.q('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=$1 AND s.expires>$2',[digest(token),Date.now()]);ensure(u,'Please sign in again.',401);return u;}
async function family(db,u){ensure(u.family_id,'Link to your parent first.');const [f]=await db.q('SELECT * FROM households WHERE id=$1'+db.lock,[u.family_id]);ensure(f,'Family not found.',404);return JSON.parse(f.state);}
async function members(db,u){return db.q('SELECT id,name,role FROM users WHERE family_id=$1',[u.family_id]);}
async function save(db,u,s){await db.q('UPDATE households SET state=$1 WHERE id=$2',[JSON.stringify(s),u.family_id]);}
async function issueSession(db,res,u){const token=randomBytes(32).toString('hex');await db.q('DELETE FROM sessions WHERE expires<$1',[Date.now()]);await db.q('INSERT INTO sessions(token,user_id,expires) VALUES($1,$2,$3)',[digest(token),u.id,Date.now()+7*86400000]);res.setHeader('Set-Cookie',`gt_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.VERCEL||process.env.NODE_ENV==='production'?'; Secure':''}`);return {ok:true};}
async function limit(db,key,max=15){const now=Date.now();let [a]=await db.q('SELECT * FROM attempts WHERE key=$1'+db.lock,[key]);if(!a||+a.expires<now){await db.q('DELETE FROM attempts WHERE key=$1',[key]);await db.q('INSERT INTO attempts(key,count,expires) VALUES($1,1,$2)',[key,now+900000]);return true;}if(a.count>=max)return false;await db.q('UPDATE attempts SET count=count+1 WHERE key=$1',[key]);return true;}
export default async function handler(req,res){
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 try{
  if(req.method==='GET'){const config=new URL(req.url,'http://local').searchParams.get('config');if(config){res.end(JSON.stringify({demo:demo(),greenie:greenieConfigured()}));return;}}
  ensure(['GET','POST'].includes(req.method),'Method not allowed.',405);
  if(req.method==='POST'){ensure(req.headers['content-type']?.includes('application/json'),'JSON required.',415);const origin=req.headers.origin;ensure(!origin||new URL(origin).host===req.headers.host,'Request origin is not allowed.',403);}
  let p=req.body;if(req.method==='POST'&&!p){let raw='';for await(const c of req){raw+=c;ensure(Buffer.byteLength(raw)<=3000000,'Upload is too large.',413);}p=JSON.parse(raw||'{}');}
  p=p||{};ensure(JSON.stringify(p).length<=3000000,'Upload is too large.',413);
  if(['login','register','link','greenie'].includes(p.action)){const key=digest(`${p.action}:${req.socket?.remoteAddress||'remote'}:${String(p.email||'').toLowerCase()}`);const allowed=await transaction(db=>limit(db,key,p.action==='greenie'?30:15));ensure(allowed,'Too many attempts. Please try again in 15 minutes.',429);}
  if(p.action==='greenie'){
   const snapshot=await transaction(async db=>{const u=await session(db,req);ensure(u.role==='parent','Only parents can ask Greenie to review photos.',403);const s=await family(db,u);const sub=s.submissions.find(x=>x.id===p.id);ensure(sub,'Submission not found.',404);return {sub,u};});
   const result=await assess(snapshot.sub);await transaction(async db=>{const u=await session(db,req);ensure(u.id===snapshot.u.id,'Session changed.',403);const s=await family(db,u);const sub=s.submissions.find(x=>x.id===p.id);ensure(sub&&sub.status!=='discarded','Submission is no longer available.');sub.ai=result;await save(db,u,s);});res.end(JSON.stringify({ok:true}));return;
  }
  const out=await transaction(async db=>{
   if(p.action==='demo'){
    ensure(demo(),'Demo login is disabled.',404);ensure(['parent','kid'].includes(p.role),'Invalid role.');
    let [u]=await db.q('SELECT * FROM users WHERE id=$1',[`demo-${p.role}`]);
    if(!u){let [f]=await db.q('SELECT id FROM households WHERE id=$1',['demo-family']);if(!f){const s=emptyState();s.tasks=[{id:'demo-task',title:'Tidy your room',description:'A little helping out goes a long way.',instructions:'Put books on the shelf and toys in the basket. Show the tidy room in your photo.',criteria:'Books are shelved and the floor is clear of toys.',icon:'🧹',minutes:15,category:'chore',childId:'demo-kid',photoRequired:true,recurring:true,active:true},{id:'demo-reading',title:'Read for 20 minutes',description:'Find a story you love.',instructions:'Tell your parent what you read.',criteria:'Parent confirms reading time.',icon:'📚',minutes:10,category:'healthy',childId:'demo-kid',photoRequired:false,recurring:true,active:true}];await db.q('INSERT INTO households(id,state) VALUES($1,$2)',['demo-family',JSON.stringify(s)]);}
    for(const role of ['parent','kid']){const [existing]=await db.q('SELECT id FROM users WHERE id=$1',[`demo-${role}`]);if(!existing)await db.q('INSERT INTO users(id,email,name,role,password,family_id) VALUES($1,$2,$3,$4,$5,$6)',[`demo-${role}`,`${role}@demo.invalid`,role==='parent'?'Parent':'Matthew',role,hashPassword(randomBytes(32).toString('hex')),'demo-family']);}[u]=await db.q('SELECT * FROM users WHERE id=$1',[`demo-${p.role}`]);}
    return issueSession(db,res,u);
   }
   if(p.action==='register'||p.action==='login'){
    const email=String(p.email||'').trim().toLowerCase(),password=String(p.password||'');ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254,'Enter a valid email.');ensure(password.length<=128,'Password is too long.');
    let [u]=await db.q('SELECT * FROM users WHERE email=$1',[email]);
    if(p.action==='register'){ensure(!u,'An account already exists. Please sign in.');ensure(password.length>=10,'Use at least 10 characters for your password.');ensure(['parent','kid'].includes(p.role),'Choose parent or kid.');const name=String(p.name||'').trim().slice(0,60);ensure(name,'Enter a display name.');const id=randomUUID(),fid=p.role==='parent'?randomUUID():null;if(fid)await db.q('INSERT INTO households(id,state) VALUES($1,$2)',[fid,JSON.stringify(emptyState())]);await db.q('INSERT INTO users(id,email,name,role,password,family_id) VALUES($1,$2,$3,$4,$5,$6)',[id,email,name,p.role,hashPassword(password),fid]);u={id};}
    else ensure(u&&verify(password,u.password),'Email or password did not match.',401);
    return issueSession(db,res,u);
   }
   const u=await session(db,req);
   if(p.action==='logout'){const token=(req.headers.cookie||'').match(/gt_session=([a-f0-9]+)/)?.[1];await db.q('DELETE FROM sessions WHERE token=$1',[digest(token||'')]);res.setHeader('Set-Cookie','gt_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return {ok:true};}
   if(p.action==='linkCode'){ensure(u.role==='kid'&&!u.family_id,'Only an unlinked child can generate a code.');const code=randomBytes(6).toString('hex').toUpperCase();await db.q('UPDATE users SET link_code=$1,link_expires=$2 WHERE id=$3',[digest(code),Date.now()+900000,u.id]);return {code};}
   if(p.action==='link'){ensure(u.role==='parent','Only a parent can link a child.',403);const [kid]=await db.q('SELECT * FROM users WHERE link_code=$1'+db.lock,[digest(String(p.code||'').trim().toUpperCase())]);ensure(kid&&kid.role==='kid'&&!kid.family_id&&+kid.link_expires>Date.now(),'This code is invalid or expired.');await db.q('UPDATE users SET family_id=$1,link_code=NULL,link_expires=NULL WHERE id=$2',[u.family_id,kid.id]);return {ok:true};}
   const publicUser={id:u.id,name:u.name,role:u.role,linked:!!u.family_id};
   if(!u.family_id){ensure(!p.action,'Link to a parent first.');return {user:publicUser,state:null,demo:demo()};}
   const s=await family(db,u),m=await members(db,u);
   if(p.action){ensure(typeof p.requestId==='string'&&p.requestId.length<=100,'Request identifier required.');applyAction(s,u,p.action,p,m);await save(db,u,s);}
   return {user:publicUser,state:view(s,u,m),demo:demo()};
  });res.end(JSON.stringify(out));
 }catch(e){res.statusCode=e.status||500;res.end(JSON.stringify({error:e.status?e.message:'Something went wrong. Please try again; no changes were committed.'}));if(!e.status)console.error('GreenTime request failed:',e.code||e.name);}
}
