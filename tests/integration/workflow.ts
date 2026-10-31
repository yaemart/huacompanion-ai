import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {getPayload} from 'payload';
import config from '../../src/payload.config';
import {enqueueWorkflowEvent,workflowRead,workflowAction,runWorkflowJobs} from '../../src/server/workflow/service';
if(process.env.APP_ENV!=='local'||!process.env.DATABASE_URL?.includes('@127.0.0.1:55438/hua_companion'))throw Error('Local test database required');
const p:any=await getPayload({config});const run=`workflow-${randomUUID()}`;const password=randomBytes(24).toString('hex');const created:{collection:string;id:number}[]=[];
async function create(collection:string,data:any,extra:any={}){const d=await p.create({collection,data,...extra});created.push({collection,id:d.id});return d;}
try{
 const admin=await create('staff',{name:run,email:`${run}@example.invalid`,password,role:'admin'},{context:{allowLocalStaffSetup:true}});
 const team=await create('teams',{name:run});const op=await create('staff',{name:'A',email:`a-${run}@example.invalid`,password,role:'operations',team:team.id},{user:admin});const other=await create('staff',{name:'B',email:`b-${run}@example.invalid`,password,role:'operations',team:team.id},{user:admin});
 const inquiry=await create('inquiries',{reference:run,requestKey:randomUUID(),contentHash:run,status:'new',name:'Fictional',email:'fictional@example.invalid',categories:['business'],city:'Shanghai',team:team.id,owner:op.id},{user:admin});
 const unassigned=await create('inquiries',{reference:`${run}-unassigned`,requestKey:randomUUID(),contentHash:run,status:'new',name:'Fictional',email:'fictional@example.invalid',categories:['business'],city:'Shanghai'},{user:admin});
 await enqueueWorkflowEvent(p,{key:`${run}-unassigned`,type:'inquiry-created',inquiry:unassigned.id,title:'未分派待办'});
 const pending=(await workflowRead(p,admin)).tasks.find(t=>t.title==='未分派待办');assert.ok(pending);assert.equal(pending.assignee,undefined);
 const claims=await Promise.allSettled([workflowAction(p,admin,{id:pending.id,action:'claim'}),workflowAction(p,admin,{id:pending.id,action:'claim'})]);assert.equal(claims.filter(x=>x.status==='fulfilled').length,1);
 const event={key:run,type:'inquiry-created' as const,inquiry:inquiry.id,title:'测试待办',dueAt:new Date(Date.now()-1000).toISOString()};await enqueueWorkflowEvent(p,event);await enqueueWorkflowEvent(p,event);
 assert.equal((await p.count({collection:'workflow-events',where:{key:{equals:run}}})).totalDocs,1);
 const list=await workflowRead(p,op);const task=list.tasks.find(t=>t.title==='测试待办');assert.ok(task);assert.ok(list.notifications.some(n=>n.title==='测试待办'));assert.equal((await workflowRead(p,other)).tasks.some(t=>t.id===task.id),false);
 await assert.rejects(()=>workflowAction(p,op,{id:task.id,action:'postpone',dueAt:'2099-01-01',reason:''}));
 // Never enable or contact an external email service during database tests.
 const original=process.env.WORKFLOW_MAIL_ENABLED;process.env.WORKFLOW_MAIL_ENABLED='false';try{await runWorkflowJobs(p);await runWorkflowJobs(p);}finally{if(original===undefined)delete process.env.WORKFLOW_MAIL_ENABLED;else process.env.WORKFLOW_MAIL_ENABLED=original;}
 assert.equal((await p.count({collection:'workflow-events',where:{key:{equals:`task:${task.id}:due:${event.dueAt}`}}})).totalDocs,1);
 await workflowAction(p,op,{id:task.id,action:'postpone',dueAt:'2099-01-01',reason:'客户申请延期'});
 await p.update({collection:'inquiries',id:inquiry.id,user:admin,data:{owner:other.id}});
 assert.equal((await workflowRead(p,op)).tasks.some(t=>t.id===task.id),false);assert.equal((await workflowRead(p,op)).notifications.some(t=>t.title==='测试待办'),false);await assert.rejects(()=>workflowAction(p,op,{id:task.id,action:'done'}));
 await workflowAction(p,admin,{id:task.id,action:'assign',assignee:other.id});await workflowAction(p,other,{id:task.id,action:'done'});
 console.log('PASS workflow durable dedupe, reminders, postponement, reassignment ACL and task completion');
}finally{
 const inquiries=created.filter(x=>x.collection==='inquiries').map(x=>x.id);const notes=await p.find({collection:'workflow-notifications',where:{inquiry:{in:inquiries}},limit:1000});await p.delete({collection:'workflow-mail-jobs',where:{notification:{in:notes.docs.map((n:any)=>n.id)}}});
 for(const collection of ['workflow-notifications','workflow-tasks','workflow-events'])await p.delete({collection,where:{inquiry:{in:inquiries}}});
 for(const item of created.reverse())await p.delete({...item});await p.destroy();
}
