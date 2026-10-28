import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyExhibition, validateExhibition, publicExhibition, effectiveExhibitionStatus, filterExhibitions, validateExhibitionPublication, type Exhibition } from "../src/lib/exhibitions.ts";
import { publicBody, validateContent, type ContentBody } from "../src/lib/content-model.ts";
const event = (): Exhibition => ({...emptyExhibition(),edition:"2027",city:"shanghai",venue:"Convention center",address:"Official address",audience:"Trade visitors",exhibits:"Hardware",admission:"Register on official website",officialURL:"https://example.org/event",verifiedAt:"2026-10-01",industries:["hardware"],status:"announced",startDate:"2027-01-30",endDate:"2027-02-02"});
const body = (): ContentBody => ({kind:"exhibition",locale:"en",contentKey:"show-2027",slug:"show-2027",title:"Hardware show",blocks:[{type:"paragraph",text:"Official information"}],sources:[{id:"official",title:"Official event",url:"https://example.org/event",checkedAt:"2026-10-01"}],exhibition:event()});
test("exhibition dates reject rollover, partial and reversed dates", () => {
  assert.doesNotThrow(() => validateExhibition(event(),true));
  for (const dates of [{startDate:"2027-02-29"},{endDate:""},{endDate:"2027-01-01"}]) assert.throws(() => validateExhibition({...event(),...dates}));
  for (const status of ["pending","postponed"] as const) assert.doesNotThrow(() => validateExhibition({...event(),status,startDate:"",endDate:"",unresolved:"Dates to be announced"},true));
  assert.throws(() => validateExhibition({...event(),status:"cancelled",startDate:"",endDate:""}));
  assert.throws(() => validateExhibition({...event(),status:"invented"} as unknown as Exhibition));
});
test("status ends only after final day and preserves cancellation/postponement", () => {
  assert.equal(effectiveExhibitionStatus(event(),"2027-02-02"),"announced");
  assert.equal(effectiveExhibitionStatus(event(),"2027-02-03"),"ended");
  for (const status of ["cancelled","postponed"] as const) assert.equal(effectiveExhibitionStatus({...event(),status},"2028-01-01"),status);
});
test("filters overlap calendar months and separate archives", () => {
  const active=body(), past={...body(),contentKey:"past",exhibition:{...event(),startDate:"2025-01-01",endDate:"2025-01-02"}}, cancelled={...body(),contentKey:"cancelled",exhibition:{...event(),status:"cancelled" as const}};
  assert.deepEqual(filterExhibitions([active,past,cancelled],{month:"2027-02"},"2026-10-28").map(x=>x.contentKey),["show-2027"]);
  assert.equal(filterExhibitions([active],{month:"2027-03"},"2026-10-28").length,0);
  assert.equal(filterExhibitions([active,past,cancelled],{period:"past"},"2026-10-28").length,2);
  assert.equal(filterExhibitions([active,past,cancelled],{period:"all"},"2026-10-28").length,3);
  assert.equal(filterExhibitions([active],{industry:"electronics"},"2026-10-28").length,0);
});
test("publication requires human review and matching checked official source", () => {
  assert.doesNotThrow(() => validateExhibitionPublication(event(),body().sources,true));
  for (const reviewed of [false,undefined,"true",1]) assert.throws(() => validateExhibitionPublication(event(),body().sources,reviewed));
  assert.throws(() => validateExhibitionPublication(event(),[],true));
  assert.throws(() => validateExhibitionPublication(event(),[{url:"https://example.org/event",checkedAt:"2026-09-01"}],true));
  assert.throws(() => validateExhibition({...event(),officialURL:"javascript:alert(1)"}));
  assert.throws(() => validateExhibition({...event(),verifiedAt:"2099-01-01"}));
  assert.throws(() => validateExhibition({...event(),admission:""},true));
});
test("draft whitelist strips unknown fields without demanding live related projects", () => {
  const d={...body(),secret:"private",exhibition:{...event(),projectKeys:["unpublished-project"],internalNotes:"private",providerRef:9}};
  assert.doesNotThrow(() => validateContent(d));
  assert.equal(JSON.stringify(publicBody(d)).includes("private"),false);
  assert.equal("providerRef" in publicExhibition(d.exhibition),false);
  assert.deepEqual(publicBody(d).exhibition?.projectKeys,["unpublished-project"]);
});
test("date sorting is ascending for upcoming and descending for archive, with undated last", () => {
  const early={...body(),title:"Early",exhibition:{...event(),startDate:"2027-01-01",endDate:"2027-01-02"}},late={...body(),title:"Late"},undated={...body(),title:"Unknown",exhibition:{...event(),status:"pending" as const,startDate:"",endDate:""}};
  assert.deepEqual(filterExhibitions([undated,late,early],{},"2026-10-28").map(x=>x.title),["Early","Late","Unknown"]);
  assert.deepEqual(filterExhibitions([early,late],{period:"past"},"2028-01-01").map(x=>x.title),["Late","Early"]);
});
