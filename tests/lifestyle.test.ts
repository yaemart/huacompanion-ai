import test from 'node:test';
import {validateCandidate} from '../src/lib/content-model.ts';
import assert from 'node:assert/strict';
import { emptyLifestyle, validateLifestyle, effectiveLifeStatus, lifeCanEnquire, filterLifestyle, publicLifestyle } from '../src/lib/lifestyle.ts';
test('venue drafts accept unknown facts but reject invalid price and city',()=>{
 const v=emptyLifestyle('venue'); validateLifestyle(v,'venue');
 assert.throws(()=>validateLifestyle({...v,priceMin:-1},'venue'));
 assert.throws(()=>validateLifestyle({...v,city:'invalid'},'venue'));
 assert.throws(()=>validateLifestyle({...v,officialURL:'javascript:alert(1)'},'venue'));
});
test('activities close at deadline/end and manual status wins',()=>{
 const a={...emptyLifestyle('activity'),startAt:'2026-11-01T10:00:00+08:00',endAt:'2026-11-01T12:00:00+08:00',deadline:'2026-10-31T18:00:00+08:00'};
 assert.equal(lifeCanEnquire(a,'activity',Date.parse('2026-10-31T09:00:00Z')),true);
 assert.equal(lifeCanEnquire(a,'activity',Date.parse('2026-10-31T10:00:00Z')),false);
 assert.equal(effectiveLifeStatus(a,'activity',Date.parse('2026-11-02T00:00:00Z')),'ended');
 assert.equal(lifeCanEnquire({...a,status:'full'},'activity'),false);
 assert.throws(()=>validateLifestyle({...a,endAt:'2026-10-01T12:00:00+08:00'},'activity'));
});
test('public output strips private fields and filters preserve kind',()=>{
 const v={...emptyLifestyle('venue'),city:'shanghai',category:'dining' as const,privateContact:'secret'};
 assert.equal('privateContact' in publicLifestyle(v),false);
 const items=[{kind:'venue',title:'Tea',lifestyle:v},{kind:'guide',title:'Tea',lifestyle:v}];
 assert.equal(filterLifestyle(items,{city:'shanghai'}).length,1);
 assert.equal(filterLifestyle(items,{city:'beijing'}).length,0);
});
test('life detail enquiry preserves the displayed publication revision',async()=>{
 const {lifeInquiryPath}=await import('../src/lib/lifestyle.ts');
 assert.match(lifeInquiryPath({locale:'en',kind:'venue',contentKey:'test',publicationRevision:7}),/lifeRevision=7/);
});
test('AI structured translation accepts text only, never factual changes',async()=>{
 const base={title:'Translated',blocks:[],sourceIds:[],questions:[]};
 assert.throws(()=>validateCandidate({...base,lifestyleText:{priceMin:0}},[]));
 assert.throws(()=>validateCandidate({...base,lifestyleText:{booking:42}},[]));
 validateCandidate({...base,lifestyleText:{booking:'Réserver auprès de Hua'}},[]);
});
