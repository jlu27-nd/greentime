import webpush from 'web-push';
import {createHash} from 'node:crypto';
import {transaction} from './db.js';
import {ensure} from './domain.js';
export const pushConfigured=()=>!!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
export const subscriptionId=endpoint=>createHash('sha256').update(endpoint).digest('hex');
export function validateSubscription(input){
 let url;try{url=new URL(input?.endpoint);}catch{ensure(false,'Invalid notification subscription.');}
 const host=url.hostname;
 ensure(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.href.length<2048&&
  (host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com')),'This notification service is not supported.');
 for(const [name,length]of [['p256dh',65],['auth',16]]){const value=input.keys?.[name];ensure(typeof value==='string'&&/^[A-Za-z0-9_-]+={0,2}$/.test(value)&&Buffer.from(value,'base64url').length===length,'Invalid notification keys.');}
 return {endpoint:url.href,keys:{p256dh:input.keys.p256dh,auth:input.keys.auth}};
}
export async function queueApproval(db,familyId,notification){
 if(!notification)return;
 const devices=await db.q("SELECT p.* FROM push_subscriptions p JOIN users u ON p.user_id=u.id WHERE u.family_id=$1 AND u.role='parent'",[familyId]);
 for(const device of devices){
  const payload={title:'Greenie approved a chore',body:'Provisional screen time was earned. Tap to view the photo and confirm or revoke it.',url:`${device.origin}/?review=${encodeURIComponent(notification.submissionId)}`,tag:`greentime-${notification.id}`};
  await db.q('INSERT INTO push_deliveries(id,subscription_id,family_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[`${notification.id}:${device.id}`,device.id,familyId,JSON.stringify(payload)]);
 }
}
export async function sendPush(subscription,payload){
 return webpush.sendNotification(subscription,JSON.stringify(payload),{vapidDetails:{subject:process.env.VAPID_SUBJECT,publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY},TTL:86400,urgency:'normal',timeout:5000});
}
export async function deliverPending(familyId){
 if(!familyId||!pushConfigured())return;
 try{
  const jobs=await transaction(db=>db.q('SELECT d.*,p.subscription FROM push_deliveries d JOIN push_subscriptions p ON d.subscription_id=p.id WHERE d.family_id=$1 AND d.sent=0 AND d.attempts<5 AND d.next_attempt<=$2 LIMIT 20',[familyId,Date.now()]));
  await Promise.allSettled(jobs.map(async job=>{
   const claimed=await transaction(db=>db.q('UPDATE push_deliveries SET next_attempt=$2,attempts=attempts+1 WHERE id=$1 AND sent=0 AND next_attempt<=$3 RETURNING id',[job.id,Date.now()+120000,Date.now()]));if(!claimed.length)return;
   try{await sendPush(JSON.parse(job.subscription),JSON.parse(job.payload));await transaction(db=>db.q('UPDATE push_deliveries SET sent=1 WHERE id=$1',[job.id]));}
   catch(e){if([404,410].includes(e.statusCode))await transaction(async db=>{await db.q('DELETE FROM push_subscriptions WHERE id=$1',[job.subscription_id]);await db.q('DELETE FROM push_deliveries WHERE subscription_id=$1',[job.subscription_id]);});else console.error('Push delivery deferred',{status:e.statusCode||'network'});}
  }));
 }catch{console.error('Push delivery unavailable; in-app notification remains saved.');}
}
