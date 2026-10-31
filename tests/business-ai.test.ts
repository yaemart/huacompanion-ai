import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAIRequest,validateAIResult,aiQuoteSendAllowed,businessAIConfig} from '../src/lib/business-ai.ts';
const input={brief:'Two days of exhibition interpretation',locale:'en',currency:'CNY',expiresAt:new Date(Date.now()+86400000).toISOString(),lines:[{label:'Interpreter day',quantity:2,unitMinor:10000}],privacyConfirmed:true};
test('AI pricing uses only staff supplied fee rows and calculates total',()=>{
 const source=validateAIRequest(input);const result=validateAIResult({title:'Visit',scope:'Two days',included:'Interpretation',excluded:'Travel',terms:'Subject to staff confirmation',questions:['Which venue?'],warnings:[]},source);
 assert.equal(result.quote.totalMinor,20000);assert.deepEqual(result.quote.lines,input.lines);
 assert.throws(()=>validateAIResult({...result.quote,questions:[],warnings:[],totalMinor:1},source));
});
test('AI input requires explicit redaction confirmation and valid bounded prices',()=>{
 assert.throws(()=>validateAIRequest({...input,privacyConfirmed:false}));assert.throws(()=>validateAIRequest({...input,brief:'Contact me at a@example.com'}));assert.throws(()=>validateAIRequest({...input,locale:'xx'}));assert.throws(()=>validateAIRequest({...input,lines:[{label:'x',quantity:1,unitMinor:0.1}]}));
});
test('AI output rejects hidden actions, unknown fields and unbounded questions',()=>{
 const source=validateAIRequest(input);const good={title:'Visit',scope:'Scope',included:'Help',excluded:'Flights',terms:'Confirm first',questions:[],warnings:[]};
 assert.throws(()=>validateAIResult({...good,send:true},source));assert.throws(()=>validateAIResult({...good,questions:Array(21).fill('q')},source));assert.throws(()=>validateAIResult({...good,scope:''},source));
});
test('AI quote cannot be sent without explicit human approval',()=>{
 assert.equal(aiQuoteSendAllowed({}),true);assert.equal(aiQuoteSendAllowed({aiTask:4}),false);assert.equal(aiQuoteSendAllowed({aiTask:4,reviewStatus:'approved'}),false);assert.equal(aiQuoteSendAllowed({aiTask:4,reviewStatus:'approved',reviewedBy:2,reviewedAt:new Date().toISOString(),reviewReason:'Checked'}),true);
});
test('business AI is disabled unless explicitly configured with a bounded budget',()=>{
 assert.equal(businessAIConfig({}).enabled,false);assert.equal(businessAIConfig({BUSINESS_AI_ENABLED:'true',BUSINESS_AI_ENDPOINT:'http://example.com',BUSINESS_AI_KEY:'k',BUSINESS_AI_DAILY_TOKENS:'100000'}).enabled,false);
 assert.equal(businessAIConfig({BUSINESS_AI_ENABLED:'true',BUSINESS_AI_ENDPOINT:'https://example.com/gateway',BUSINESS_AI_KEY:'k',BUSINESS_AI_MODEL:'m',BUSINESS_AI_DAILY_TOKENS:'100000'}).enabled,true);
});
