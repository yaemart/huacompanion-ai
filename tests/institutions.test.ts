import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContent, publicBody, type ContentBody } from "../src/lib/content-model.ts";
const draft = (): ContentBody => ({kind:"institution",locale:"en",contentKey:"hospital",slug:"hospital",title:"Hospital",blocks:[],sources:[],institution:{type:"medical",city:"",address:"",addressEn:"",directions:"",audience:"",appointment:"",preparation:"",fees:"",foreignAcceptance:"pending",acceptanceConditions:"",interpretation:"",officialURL:"",verifiedAt:"",qualification:"",unresolved:"",languages:[],projectKeys:[]}});
test("institution drafts are accepted and private fields are omitted", () => {
  const d = {...draft(), providerRef:99, institution:{...draft().institution!, internalNotes:"secret"}};
  assert.doesNotThrow(() => validateContent(d));
  const clean = publicBody(d);
  assert.equal(clean.institution?.type,"medical");
  assert.equal(JSON.stringify(clean).includes("secret"),false);
  assert.equal("providerRef" in clean,false);
});

import { emptyInstitution, validateInstitution, validateInstitutionPublication, filterInstitutions, institutionPath, type Institution } from "../src/lib/institutions.ts";
const institution = (): Institution => ({...emptyInstitution(),type:"medical",city:"shanghai",address:"医院路一号",addressEn:"1 Hospital Road",directions:"General outpatient services",audience:"Adults",appointment:"Appointment required",preparation:"Bring identification",fees:"Confirm with institution",foreignAcceptance:"confirmed",acceptanceConditions:"Subject to appointment and clinical assessment",interpretation:"Interpreter by advance arrangement",officialURL:"https://example.org/hospital",verifiedAt:"2026-10-01",qualification:"Official site describes institution licensing; check scope directly",languages:["en"]});
test("publication requires all material facts and explicit acceptance evidence", () => {
  assert.doesNotThrow(() => validateInstitution(institution(),true));
  for (const key of ["city","address","addressEn","directions","audience","appointment","preparation","fees","interpretation","officialURL","verifiedAt","qualification","acceptanceConditions"] as const) assert.throws(() => validateInstitution({...institution(),[key]:""},true),key);
  assert.throws(() => validateInstitution({...institution(),languages:[]},true));
  assert.throws(() => validateInstitution({...institution(),foreignAcceptance:"pending"},true));
  assert.doesNotThrow(() => validateInstitution({...institution(),foreignAcceptance:"pending",languages:[],acceptanceConditions:"",unresolved:"Foreign reception needs verification"},true));
  assert.doesNotThrow(() => validateInstitution({...institution(),foreignAcceptance:"paused",languages:[],acceptanceConditions:""},true));
});
test("malformed enums, arrays, unsafe official URLs and invalid verification dates fail", () => {
  for (const patch of [{type:"unknown"},{foreignAcceptance:"yes"},{languages:["en","en"]},{languages:["ja"]},{languages:"en"},{projectKeys:["bad key"]},{city:"unknown"},{officialURL:"javascript:alert(1)"},{officialURL:"https://user:password@example.org"},{verifiedAt:"2026-02-30"},{verifiedAt:"2099-01-01"},{fees:42}]) assert.throws(() => validateInstitution({...institution(),...patch} as Institution));
});
test("publication requires manual review and exact official URL plus checked date", () => {
  const sources=[{url:institution().officialURL,checkedAt:institution().verifiedAt}];
  assert.doesNotThrow(() => validateInstitutionPublication(institution(),sources,true));
  for (const reviewed of [undefined,false,1,"true"]) assert.throws(() => validateInstitutionPublication(institution(),sources,reviewed));
  for (const bad of [[],[{url:"https://example.org/other",checkedAt:institution().verifiedAt}],[{url:institution().officialURL,checkedAt:"2026-09-01"}]]) assert.throws(() => validateInstitutionPublication(institution(),bad,true));
});
test("filters distinguish service languages from translation locales and unknown languages", () => {
  const known={...draft(),institution:institution()},unknown={...draft(),contentKey:"unknown",institution:{...institution(),languages:[]}},other={...draft(),kind:"guide" as const,institution:institution()};
  assert.deepEqual(filterInstitutions([known,unknown,other],{language:"en"}).map(i=>i.contentKey),["hospital"]);
  assert.equal(filterInstitutions([known],{language:"zh"}).length,0);
  assert.equal(filterInstitutions([known],{type:"wellness"}).length,0);
  assert.equal(filterInstitutions([known],{city:"beijing"}).length,0);
  assert.equal(filterInstitutions([known],{q:"HOSPITAL road"}).length,1);
  assert.equal(institutionPath(known),"/en/institutions/hospital");
});
test("public sources and institution objects exclude private properties and clone arrays", () => {
  const d={...draft(),institution:{...institution(),internalContact:"secret"},sources:[{id:"official",title:"Official",url:institution().officialURL,checkedAt:institution().verifiedAt,internalNote:"secret"}]};
  const clean=publicBody(d);
  assert.equal(JSON.stringify(clean).includes("secret"),false);
  clean.institution!.languages.push("fr");
  assert.deepEqual(d.institution.languages,["en"]);
});
