import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createECDH} from 'node:crypto';
import webpush from 'web-push';
import {validateSubscription,subscriptionId,queueApproval,deliverPending} from '../server/push.js';
import {transaction} from '../server/db.js';
const ec=createECDH('prime256v1');ec.generateKeys();
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test-only',keys:{p256dh:ec.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,3).toString('base64url')}};
test('push endpoints cannot target private networks or unrelated services',()=>{
 assert.equal(validateSubscription(sub).endpoint,sub.endpoint);
 for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.example/a','https://user:pass@fcm.googleapis.com/a','https://example.com/a'])assert.throws(()=>validateSubscription({...sub,endpoint}));
 assert.throws(()=>validateSubscription({...sub,keys:{auth:'bad',p256dh:'bad'}}));
});
test('push delivery is queued once, uses a protected review link, and removes expired devices',async t=>{
 process.env.SQLITE_PATH=`.data/push-test-${randomUUID()}.sqlite`;process.env.DATABASE_URL='';
 const keys=webpush.generateVAPIDKeys();process.env.VAPID_PUBLIC_KEY=keys.publicKey;process.env.VAPID_PRIVATE_KEY=keys.privateKey;process.env.VAPID_SUBJECT='https://greentime-one.vercel.app';
 const id=subscriptionId(sub.endpoint);
 await transaction(async db=>{
  await db.q('INSERT INTO users(id,email,name,role,password,family_id) VALUES($1,$2,$3,$4,$5,$6)',['push-parent','push@test.invalid','Parent','parent','unused','push-family']);
  await db.q('INSERT INTO push_subscriptions(id,user_id,subscription,origin) VALUES($1,$2,$3,$4)',[id,'push-parent',JSON.stringify(sub),'https://greentime-one.vercel.app']);
  const n={id:'n1',submissionId:'s1'};await queueApproval(db,'push-family',n);await queueApproval(db,'push-family',n);
 });
 let calls=0;t.mock.method(webpush,'sendNotification',async(device,payload)=>{calls++;const p=JSON.parse(payload);assert.equal(device.endpoint,sub.endpoint);assert.equal(p.url,'https://greentime-one.vercel.app/?review=s1');assert(!payload.includes('data:image'));return {statusCode:201};});
 await deliverPending('push-family');await deliverPending('push-family');assert.equal(calls,1);
 await transaction(db=>queueApproval(db,'push-family',{id:'n2',submissionId:'s2'}));
 webpush.sendNotification.mock.mockImplementation(async()=>{throw {statusCode:410};});await deliverPending('push-family');
 const devices=await transaction(db=>db.q('SELECT id FROM push_subscriptions'));assert.equal(devices.length,0);
});
