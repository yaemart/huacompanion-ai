import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
if(process.env.APP_ENV!=='local')throw Error('Local only');
const base='http://127.0.0.1:3000';const creds=readFileSync('.local/admin-credentials.txt','utf8');
const login=await fetch(base+'/api/staff/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:creds.match(/邮箱：([^\n]+)/)![1],password:creds.match(/密码：([^\n]+)/)![1]})});assert.equal(login.status,200);const token=(await login.json()).token;const headers={Authorization:'JWT '+token,Origin:base,'Content-Type':'application/json'};
try{
 assert.equal((await fetch(base+'/api/business/ai?id=1')).status,403);assert.equal((await fetch(base+'/api/business-ai-tasks')).status,403);
 const list=await(await fetch(base+'/api/business',{headers})).json();const c=list.cases.find((c:any)=>c.title==='Fictional AI proposal'&&c.stage==='received');assert.ok(c,'Run local business AI integration first');
 const request={action:'create',id:c.id,revision:c.revision,key:randomUUID(),request:{brief:'Fictional HTTP test: exhibition coordination',locale:'en',privacyConfirmed:true,currency:'CNY',expiresAt:new Date(Date.now()+86400000).toISOString(),lines:[{label:'Coordination',quantity:1,unitMinor:10000}]}};
 const post=(body:any,origin=base)=>fetch(base+'/api/business/ai',{method:'POST',headers:{...headers,Origin:origin},body:JSON.stringify(body)});
 assert.equal((await post(request,'https://example.invalid')).status,403);
 const status=await(await fetch(base+'/api/business/ai?id='+c.id,{headers})).json();assert.equal(status.enabled,false,'Real model must remain disabled during HTTP test');
 const first=await post(request);assert.equal(first.status,200);const task=await first.json();assert.equal(task.status,'unconfigured');assert.equal(task.result??null,null);
 const duplicate=await post(request);assert.equal((await duplicate.json()).id,task.id);
 assert.equal((await post({...request,request:{...request.request,brief:'Different content'}})).status,409);
 assert.equal((await post({action:'queue',id:c.id,task:task.id})).status,409);
 assert.equal((await post({action:'cancel',id:c.id,task:task.id})).status,200);
 console.log('PASS HTTP AI: authenticated scope, no generic access, cross-origin denial, disabled model, idempotent task, key conflict, queue refusal and cancellation');
}finally{await fetch(base+'/api/staff/logout',{method:'POST',headers});}
