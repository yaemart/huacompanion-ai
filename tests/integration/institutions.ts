import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { emptyInstitution } from "../../src/lib/institutions";
import { emptyCatalog, parseCatalogSource, inquiryFormKey } from "../../src/lib/catalog";
import { mutateContent, listPublished } from "../../src/server/content/service";
import { resolveCatalogSource } from "../../src/server/catalog/source";
import { saveIntake } from "../../src/server/intake";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({config});
const drafts: number[] = [];
try {
  const admin = (await p.find({collection:"staff",where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] }, sort: "createdAt",limit:1})).docs[0];
  assert.ok(admin,"Local admin required");
  const run = `institution-test-${Date.now()}`;
  const institution = {...emptyInstitution(),type:"medical" as const,city:"shanghai",address:"Fictional test address",addressEn:"Test address",directions:"Test outpatient services",audience:"Test adults",appointment:"Test appointments",preparation:"Test preparation",fees:"Confirm fees",foreignAcceptance:"confirmed" as const,acceptanceConditions:"Test conditions",interpretation:"Arrange interpretation in advance",officialURL:"https://example.org/test-institution",verifiedAt:"2026-10-01",qualification:"Fictional test licensing explanation",languages:["en"],projectKeys:[`${run}-project`]};
  const body = {kind:"institution",contentKey:run,slug:run,locale:"en",title:"Fictional integration institution",blocks:[{type:"paragraph",text:"TEST ONLY - not a real institution"}],sources:[{id:"official",title:"Test source",url:institution.officialURL,checkedAt:institution.verifiedAt}],institution:institution};
  async function save(body:any,id?:number) {
    const current=id ? await p.findByID({collection:"content-drafts",id}) : undefined;
    const d=await mutateContent(p,admin,{action:"save",body,id,revision:current?.revision});
    if (!id) drafts.push(d.id);
    return d;
  }
  async function submit(d:any) { return mutateContent(p,admin,{action:"submit",id:d.id,revision:d.revision}); }
  async function publish(d:any,extra:any={institutionReviewed:true,catalogReviewed:true}) { return mutateContent(p,admin,{action:"publish", overrideReason:"Local regression fixture review and cleanup",id:d.id,revision:d.revision,...extra}); }
  async function source() { return (await resolveCatalogSource(p,"en",{institution:run}))!.institution!; }
  const values={categories:["medical"],city:"Shanghai",people:"2",datesUnknown:true,name:"Fictional institution integration",email:"test@example.com",language:"English",consent:true};
  const input=(revision:number,extra:any={})=>({kind:"request",locale:"en",source:{institution:run,institutionRevision:revision,...extra},values});
  let draft=await save({...body,internalNote:"PRIVATE",institution:{...institution,internalNote:"PRIVATE"}});
  assert.equal((await listPublished(p,"en")).some(d=>d.contentKey===run),false);
  draft=await submit(draft);
  await assert.rejects(()=>mutateContent(p,{...admin,role:"editor"},{action:"publish", overrideReason:"Local regression fixture review and cleanup",id:draft.id,revision:draft.revision,institutionReviewed:true}),/只有内容审核员/);
  await assert.rejects(()=>publish(draft,{}),/人工核验/);
  const missing=await submit(await save({...body,contentKey:`${run}-missing`,slug:`${run}-missing`,sources:[]}));
  await assert.rejects(()=>publish(missing),/资料来源/);
  const mismatched=await submit(await save({...body,contentKey:`${run}-mismatch`,slug:`${run}-mismatch`,sources:[{...body.sources[0],checkedAt:"2026-09-01"}]}));
  await assert.rejects(()=>publish(mismatched),/资料来源/);
  const noQualification=await submit(await save({...body,contentKey:`${run}-qualification`,slug:`${run}-qualification`,institution:{...institution,qualification:""}}));
  await assert.rejects(()=>publish(noQualification),/核验说明/);
  draft=await publish(draft);
  // Institutions can add their optional internal partnership file after publication.
  const partner=await p.create({collection:"providers",data:{reference:run,name:"Fictional test",email:"test@example.com",organisation:"Fictional institution partner",phone:"not public",city:"Shanghai",categories:["medical"],languages:"en",capabilities:"test only",details:{},source:"website",locale:"en",consentAt:new Date().toISOString(),privacyVersion:"test",requestKey:run,contentHash:run,status:"applied",publicApproved:false}});
  draft=await mutateContent(p,admin,{action:"save",body,id:draft.id,revision:draft.revision,providerRef:partner.id});
  assert.equal(draft.providerRef,partner.id);
  draft=await publish(await submit(draft));
  const live=(await listPublished(p,"en")).find(d=>d.contentKey===run)!;
  assert.ok(live); assert.equal(live.acceptingInquiries,true); assert.ok(!JSON.stringify(live).includes("PRIVATE"));
  for (const locale of ["zh","es","fr","de","it","ar"]) assert.equal((await listPublished(p,locale)).some(d=>d.contentKey===run),false);
  await assert.rejects(()=>resolveCatalogSource(p,"fr",{institution:run}));
  const zh=await publish(await submit(await save({...body,locale:"zh",title:"虚构集成测试机构"})));
  assert.equal((await listPublished(p,"zh")).find(d=>d.contentKey===run)?.title,"虚构集成测试机构");
  let current=await source();
  assert.throws(()=>parseCatalogSource({institution:run,institutionRevision:"2"}));
  assert.throws(()=>parseCatalogSource({institutionRevision:2}));
  assert.notEqual(inquiryFormKey("en","medical",{institution:run,institutionRevision:1}),inquiryFormKey("en","medical",{institution:run,institutionRevision:2}));
  await assert.rejects(()=>saveIntake({...input(current.revision),source:{institution:run}},randomUUID()));
  await assert.rejects(()=>saveIntake(input(current.revision+100),randomUUID()));
  const key=randomUUID();
  const payload={...input(current.revision),catalogSource:{institution:{title:"FORGED",city:"beijing"}}};
  const receipt=await saveIntake(payload,key);
  const stored=(await p.find({collection:"inquiries",where:{reference:{equals:receipt.reference}},limit:1})).docs[0].catalogSource as any;
  const inquiry=(await p.find({collection:"inquiries",where:{reference:{equals:receipt.reference}},limit:1})).docs[0];
  assert.equal(inquiry.coordinationStage,"received");
  await p.update({collection:"inquiries",id:inquiry.id,data:{coordinationStage:"confirming"},user:admin,overrideAccess:false});
  assert.equal((await p.findByID({collection:"inquiries",id:inquiry.id})).coordinationStage,"confirming");
  assert.equal(stored.institution.title,body.title); assert.equal(stored.institution.city,institution.city); assert.equal(stored.institution.foreignAcceptance,"confirmed"); assert.equal(stored.institution.verifiedAt,institution.verifiedAt); assert.equal(stored.institution.revision,current.revision);
  assert.equal((await saveIntake(payload,key)).duplicate,true);
  await assert.rejects(()=>saveIntake(input(current.revision+1),key));
  await assert.rejects(()=>saveIntake(input(current.revision,{provider:"missing"}),randomUUID()));
  await assert.rejects(()=>saveIntake(input(current.revision,{project:`${run}-project`}),randomUUID()));
  const catalog={...emptyCatalog(),categories:["medical"],cities:[{code:"shanghai",name:"Shanghai"}],languages:["en"],audience:"Buyers",includes:"Test",excludes:"Test",process:"Test",deliverables:"Test",materials:"Test",bookingNotice:"Test",duration:"Test",people:"Test",changes:"Test"};
  await publish(await submit(await save({...body,kind:"service-project",contentKey:`${run}-project`,slug:`${run}-project`,catalog})));
  await publish(await submit(await save({...body,kind:"service-project",contentKey:`${run}-other`,slug:`${run}-other`,catalog})));
  await saveIntake(input(current.revision,{project:`${run}-project`}),randomUUID());
  await assert.rejects(()=>saveIntake(input(current.revision,{project:`${run}-other`}),randomUUID()));
  const oldRevision=current.revision;
  draft=await publish(await submit(await save({...body,institution:{...institution,city:"beijing"}},draft.id)));
  current=await source(); assert.notEqual(current.revision,oldRevision);
  await assert.rejects(()=>saveIntake(input(oldRevision),randomUUID()));
  await saveIntake(input(current.revision),randomUUID());
  draft=await publish(await submit(await save({...body,institution:{...institution,foreignAcceptance:"paused"}},draft.id)));
  await assert.rejects(()=>saveIntake(input(current.revision),randomUUID()));
  assert.equal((await listPublished(p,"en")).find(d=>d.contentKey===run)?.acceptingInquiries,false);
  draft=await publish(await submit(await save({...body,institution:{...institution,foreignAcceptance:"pending",unresolved:"Reception needs verification",languages:[]}},draft.id)));
  assert.equal((await listPublished(p,"en")).find(d=>d.contentKey===run)?.acceptingInquiries,false);
  await assert.rejects(()=>saveIntake(input(current.revision),randomUUID()));
  draft=await publish(await submit(await save(body,draft.id)));
  current=await source();
  await mutateContent(p,admin,{action:"unpublish", overrideReason:"Local regression fixture review and cleanup",id:draft.id,revision:draft.revision});
  await assert.rejects(()=>saveIntake(input(current.revision),randomUUID()));
  assert.ok((await listPublished(p,"zh")).find(d=>d.contentKey===run),"English withdrawal preserves Chinese publication");
  assert.equal((await saveIntake(payload,key)).duplicate,true,"Already accepted retries remain idempotent after withdrawal");
  console.log("PASS institution permissions, privacy, locale isolation, publication/source checks, authoritative snapshots, revision, status, compatibility and idempotency");
} finally {
  try {
    const admin=(await p.find({collection:"staff",where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] }, sort: "createdAt",limit:1})).docs[0];
    const failures:unknown[]=[];
    for (const id of drafts) try {
      const d=await p.findByID({collection:"content-drafts",id});
      await mutateContent(p,admin,{action:"unpublish", overrideReason:"Local regression fixture review and cleanup",id,revision:d.revision});
    } catch(error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures,"Test fixture unpublish failed");
  } finally { await p.destroy(); }
}

process.exit(0);
