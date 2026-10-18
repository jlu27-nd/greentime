import test from 'node:test';
import assert from 'node:assert/strict';
import {assess} from '../server/greenie.js';

test('Greenie sends bounded photo evidence through Gateway and validates the assessment',async t=>{
 process.env.AI_GATEWAY_MODEL='openai/gpt-4.1-mini';
 process.env.AI_GATEWAY_API_KEY='test-only-key';
 t.after(()=>{delete process.env.AI_GATEWAY_MODEL;delete process.env.AI_GATEWAY_API_KEY;});
 const sub={title:'Shelf',criteria:'Books are shelved',note:'Done',photo:'data:image/png;base64,test'};
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'https://ai-gateway.vercel.sh/v1/responses');
  const body=JSON.parse(options.body);
  assert.equal(body.store,false);assert.equal(body.max_output_tokens,500);
  assert.equal(body.input[0].content[1].image_url,sub.photo);
  assert.match(body.instructions,/Never approve credits/);
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({verdict:'uncertain',confidence:'low',reason:'Shelf is not visible.'})}]}]})};
 });
 const result=await assess(sub);assert.equal(result.verdict,'uncertain');assert.equal(result.confidence,'low');
 assert.equal(sub.ai,undefined);
});

test('Greenie provider failures leave manual parent review available',async t=>{
 process.env.AI_GATEWAY_MODEL='openai/gpt-4.1-mini';process.env.AI_GATEWAY_API_KEY='test-only-key';
 t.after(()=>{delete process.env.AI_GATEWAY_MODEL;delete process.env.AI_GATEWAY_API_KEY;});
 t.mock.method(globalThis,'fetch',async()=>({ok:false,status:402}));
 t.mock.method(console,'error',()=>{});
 await assert.rejects(assess({photo:'data:image/png;base64,test'}),e=>e.status===503&&e.message.includes('approve this chore yourself'));
});
