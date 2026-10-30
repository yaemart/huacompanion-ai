import 'dotenv/config';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const base=process.env.AUTHZ_HTTP_URL||'http://127.0.0.1:3000';if(!base.startsWith('http://127.0.0.1:'))throw Error('Local HTTP only');
let cookie='';async function post(body:any,customCookie=cookie,origin=base){return fetch(base+'/api/support',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:customCookie},body:JSON.stringify(body)});}
const start=await post({action:'start',key:randomUUID(),locale:'en',topic:'business',aiConsent:false});assert.equal(start.status,200);const set=start.headers.get('set-cookie')!;assert.ok(set.includes('HttpOnly'));cookie=set.split(';')[0];const c=await start.json();
assert.equal((await post({action:'message',id:c.id,key:randomUUID(),text:'Fictional exhibition inquiry'})).status,200);
const own=await fetch(base+'/api/support?id='+c.id,{headers:{Cookie:cookie}});assert.equal(own.status,200);const body=await own.json();assert.ok(body.messages.some((m:any)=>m.text==='Fictional exhibition inquiry'));assert.equal('visitorHash' in body.conversation,false);
const stranger=await fetch(base+'/api/support?id='+c.id,{headers:{Cookie:'hua-support='+'a'.repeat(64)}});assert.ok(stranger.status>=400);
assert.equal((await post({action:'handoff',id:c.id},cookie,'https://not-hua.invalid')).status,403);
assert.equal((await fetch(base+'/api/support/staff')).status,403);
for(const locale of ['zh','en','es','fr','de','it','ar'])assert.equal((await fetch(base+'/'+locale+'/support')).status,200);
console.log('PASS support HTTP cookies, visitor isolation, origin protection, staff auth and seven languages');
