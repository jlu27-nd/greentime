self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 let url=new URL('/app/',self.location.origin);try{const candidate=new URL(data.url,self.location.origin);if(candidate.origin===self.location.origin)url=candidate;}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'GreenTime update',{
  body:data.body||'Open GreenTime to review the latest family update.',icon:'/brand/greentime-icon.png',
  tag:data.tag||'greentime-update',data:{url:url.href},actions:[{action:'review',title:'View photo & review'}]
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const url=new URL(event.notification.data?.url||'/app/',self.location.origin);if(url.origin!==self.location.origin)return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===url.origin){await client.navigate(url.href);return client.focus();}}
  return self.clients.openWindow(url.href);
 })());
});
