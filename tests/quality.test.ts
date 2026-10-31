import test from 'node:test';
import assert from 'node:assert/strict';
import { completeness, translationCoverage, publicQualityMetadata, validateQualityReview, contentVersion } from '../src/lib/quality.ts';
const body = {kind:'guide',title:'Guide',summary:'Summary',blocks:[{type:'paragraph',text:'Text'}],sources:[{id:'a',title:'Official',url:'https://example.com'}]};
test('completeness identifies missing specialized data without asserting factual verification',()=>{
 assert.deepEqual(completeness(body).missing,[]);
 assert.ok(completeness({...body,kind:'institution'}).missing.includes('institution'));
 assert.ok(completeness({...body,kind:'institution',institution:{}}).missing.includes('institution'));
 assert.ok(completeness({...body,kind:'service-project',catalog:{}}).missing.includes('catalog'));
 assert.ok(completeness({...body,sources:[]}).missing.includes('sources'));
});
test('translation coverage separates absent, independent, current and stale drafts',()=>{
 const result=translationCoverage([{id:1,locale:'zh',revision:8},{id:2,locale:'en',sourceDraft:1,sourceRevision:7},{id:3,locale:'ar'}]);
 assert.equal(result.en,'review-needed');assert.equal(result.zh,'independent');assert.equal(result.ar,'independent');assert.equal(result.fr,'missing');assert.equal(Object.keys(result).length,7);
});
test('public metadata cannot leak owner notes or claim a different revision was checked',()=>{
 const meta={state:'checked',checkedRevision:4,checkedAt:'2026-10-31T00:00:00Z',nextReviewAt:'2026-12-01T00:00:00Z',owner:5,reason:'private'};
 assert.deepEqual(publicQualityMetadata(meta,4),{checkedAt:meta.checkedAt,nextReviewAt:meta.nextReviewAt});
 assert.deepEqual(publicQualityMetadata(meta,3),{});
});
test('review requires actual source references and a future review date',()=>{
 const now=new Date('2026-10-31T00:00:00Z');
 assert.throws(()=>validateQualityReview({reason:'Checked',sourceIds:['invented'],nextReviewAt:'2026-12-01'},body,now));
 assert.throws(()=>validateQualityReview({reason:'',sourceIds:['a'],nextReviewAt:'2026-12-01'},body,now));
 assert.doesNotThrow(()=>validateQualityReview({reason:'Checked official information',sourceIds:['a'],nextReviewAt:'2026-12-01'},body,now));
});
test('content version ignores object key order but detects actual edits',()=>{
 assert.equal(contentVersion({title:'a',summary:'b'}),contentVersion({summary:'b',title:'a'}));
 assert.notEqual(contentVersion(body),contentVersion({...body,title:'Changed'}));
});
