const supported=()=> 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
let registration;
export function preparePush(){if(supported())registration=navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready);return registration;}
async function current(){if(!supported())return null;return (await (registration||preparePush())).pushManager.getSubscription();}
export async function pushStatus(api){const sub=await current();return sub?(await api('pushStatus',{endpoint:sub.endpoint})).enabled:false;}
export async function enablePush(key,api){
 if(!supported())throw new Error('On iPhone or iPad, add GreenTime to your Home Screen, open it there, and try again. Otherwise use a browser that supports notifications.');
 if(!key)throw new Error('Phone notifications are not available yet.');
 // Permission is requested directly from the parent's button tap.
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw new Error('Notifications are not allowed. You can change this in your browser or phone notification settings.');
 const reg=await (registration||preparePush());let sub=await reg.pushManager.getSubscription();
 if(!sub){const bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});}
 await api('pushSubscribe',{subscription:sub.toJSON()});await api('pushTest',{endpoint:sub.endpoint});return true;
}
export async function disablePush(api){const sub=await current();if(sub){await api('pushUnsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}return false;}
