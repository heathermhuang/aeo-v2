import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
import edge,{isV2Path,legacyWriteAllowed,cleanHeaders,trackingMarkup,ga4Markup} from '../../deploy/aeo-edge/worker.mjs';
const env={AEO_EDGE_MODE:'production',AEO_PREVIEW_AUTH:'Basic synthetic-preview-only',AEO_ORIGIN_URL:'https://staging.aeo.io',AEO_CANONICAL_ORIGIN:'https://aeo.io',AEO_EDGE_ORIGIN_KEY:'a'.repeat(64),LEGACY_AEO:{fetch:async request=>new Response(JSON.stringify({path:new URL(request.url).pathname}),{headers:{'Content-Type':'application/json'}})}};
test('preserves v1 reads and rejects report, account creation, and billing writes',async()=>{
 assert.equal(isV2Path('/r/'),false);assert.equal(isV2Path('/api/reports/private-id'),false);
 for(const path of ['/api/check-jobs','/api/reports/id/recheck','/api/workspaces','/api/auth/signup','/api/billing/webhook']){
  assert.equal(legacyWriteAllowed(path,'POST'),false);
  assert.equal((await edge.fetch(new Request('https://aeo.io'+path,{method:'POST'}),env)).status,423);
 }
 for(const path of ['/api/reports/id','/r/','/legacy'])assert.equal((await edge.fetch(new Request('https://aeo.io'+path),env)).status,200);
 assert.equal((await(await edge.fetch(new Request('https://aeo.io/legacy'),env)).json()).path,'/');
 assert.equal(legacyWriteAllowed('/api/shared-report/resolve','POST'),true);
});
test('private preview and exact-origin mutations stay protected',async()=>{
 assert.equal((await edge.fetch(new Request('https://aeo-v2-edge.synthetic.workers.dev/'),env)).status,401);
 assert.equal((await edge.fetch(new Request('https://unrelated.example/'),env)).status,404);
 assert.equal((await edge.fetch(new Request('https://aeo.io/api/aeo/login',{method:'POST',headers:{origin:'https://evil.example'}}),env)).status,403);
});
test('forwards only gateway-derived visitor identity, and preserves signed cache tokens',async()=>{
 const original=globalThis.fetch;let seen;globalThis.fetch=async request=>{seen=request;return new Response('{}',{headers:{'Content-Type':'application/json'}});};
 try{
  const req=new Request('https://aeo-v2-edge.synthetic.workers.dev/api/aeo/login',{method:'POST',headers:{authorization:env.AEO_PREVIEW_AUTH,origin:'https://aeo-v2-edge.synthetic.workers.dev','cf-connecting-ip':'203.0.113.7','x-aeo-client-ip':'203.0.113.99','x-real-ip':'203.0.113.100','x-umami-cache':'signed-synthetic-cache'},body:'{}'});
  assert.equal((await edge.fetch(req,env)).status,200);assert.equal(seen.url,'https://staging.aeo.io/api/aeo/login');assert.equal(seen.headers.get('origin'),'https://aeo.io');assert.equal(seen.headers.get('x-aeo-client-ip'),'203.0.113.7');assert.equal(seen.headers.get('x-aeo-origin-key'),env.AEO_EDGE_ORIGIN_KEY);assert.equal(seen.headers.has('authorization'),false);assert.equal(seen.headers.has('x-real-ip'),false);assert.equal(seen.headers.get('x-umami-cache'),'signed-synthetic-cache');assert.equal(await seen.text(),'{}');
 }finally{globalThis.fetch=original;}
 const h=cleanHeaders(new Headers({'x-real-ip':'forged','authorization':'forged','cookie':'synthetic-cookie'}));assert.equal(h.has('x-real-ip'),false);assert.equal(h.has('authorization'),false);assert.equal(h.get('cookie'),'synthetic-cookie');
});
test('measurement excludes authentication fragments and query values and labels operator visits',()=>{
 const id='00000000-0000-4000-8000-000000000001';const html=trackingMarkup(id,true);assert.match(html,/data-exclude-search="true"/);assert.match(html,/data-exclude-hash="true"/);assert.match(html,/aeo_operator_qualification/);assert.equal(trackingMarkup('<script>',false),'');
 const ga=ga4Markup('G-BN7420NXBW');assert.match(ga,/page_location:location.origin\+location.pathname/);assert.match(ga,/page_referrer:aeoRef/);assert.match(ga,/allow_google_signals:false/);assert.equal(ga4Markup('G-unsafe"><script>'), '');
});

test('executes measurement hooks without disclosing proof material or hiding automation',()=>{
 const context={window:{},location:new URL('https://aeo.io/?token=private-query#account=private-proof'),document:{referrer:'https://aeo.io/api/auth/confirm?code=private-referrer#secret'},URL,Date};
 const scripts=[...ga4Markup('G-BN7420NXBW').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 for(const source of scripts)if(source.trim())runInNewContext(source,context);
 const config=context.window.dataLayer.find(args=>args[0]==='config')[2];
 assert.equal(config.page_location,'https://aeo.io/');assert.equal(config.page_referrer,'https://aeo.io/api/auth/confirm');assert.ok(!JSON.stringify(config).includes('private-'));assert.equal(config.allow_google_signals,false);
 const own=[...trackingMarkup('00000000-0000-4000-8000-000000000001',true).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 for(const source of own)if(source.trim())runInNewContext(source,context);
 const result=context.window.aeoPrivateSafe('event',{url:'https://aeo.io/?token=private-query#account=private-proof',referrer:'https://aeo.io/api/auth/confirm?code=private-referrer',webdriver:true});
 assert.equal(result.url,'https://aeo.io/');assert.equal(result.referrer,'https://aeo.io/api/auth/confirm');assert.equal(result.webdriver,true);assert.equal(result.tag,'aeo_operator_qualification');assert.ok(!JSON.stringify(result).includes('private-'));
});

test('freeze preserves legacy reads while draining writes before root replacement',async()=>{
 const frozen={...env,AEO_EDGE_MODE:'freeze'};
 assert.equal((await edge.fetch(new Request('https://aeo.io/api/check-jobs',{method:'POST'}),frozen)).status,423);
 const r=await edge.fetch(new Request('https://aeo.io/legacy'),frozen);assert.equal(r.status,200);assert.equal(r.headers.get('X-AEO-Release'),'v1-read-only');
});
test('collector preserves the actual website Origin even during staged observation',async()=>{
 const original=globalThis.fetch;let seen;globalThis.fetch=async request=>{seen=request;return new Response('{}');};
 try{
  const staged={...env,AEO_EDGE_MODE:'observe',AEO_CANONICAL_ORIGIN:'https://staging.aeo.io'};
  const r=await edge.fetch(new Request('https://aeo.io/api/send',{method:'POST',headers:{origin:'https://aeo.io'},body:'{}'}),staged);assert.equal(r.status,200);assert.equal(seen.headers.get('origin'),'https://aeo.io');
 }finally{globalThis.fetch=original;}
});
