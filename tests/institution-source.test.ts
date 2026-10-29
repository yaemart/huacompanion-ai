import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCatalogSource,inquiryFormKey} from '../src/lib/catalog.ts';
test('institution selection preserves identity and revision but discards client metadata',()=>{
 assert.deepEqual(parseCatalogSource({institution:'sample',institutionRevision:3,title:'forged'}),{institution:'sample',institutionRevision:3});
 assert.throws(()=>parseCatalogSource({institutionRevision:2}));
 assert.throws(()=>parseCatalogSource({institution:'sample',institutionRevision:'2'}));
 assert.throws(()=>parseCatalogSource({institution:'sample',exhibition:'event'}));
 assert.notEqual(inquiryFormKey('en',undefined,{institution:'sample',institutionRevision:1}),inquiryFormKey('en',undefined,{institution:'sample',institutionRevision:2}));
});
