import {validateQuote} from './business.ts';
import {isLocale} from './locales.ts';
import {requiresPrivateHandling} from './support-privacy.ts';
export const aiTaskLabels:Record<string,string>={unconfigured:'模型未配置',queued:'等待生成',running:'正在生成',succeeded:'待人工整理',adopted:'已转报价草稿',failed:'生成失败',discarded:'资料或权限已变化',cancelled:'已取消'};
export function businessAIConfig(env:Record<string,string|undefined>){
 const dailyTokens=Number(env.BUSINESS_AI_DAILY_TOKENS||0);let valid=false;
 try{const u=new URL(env.BUSINESS_AI_ENDPOINT||'');valid=u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}catch{}
 return {enabled:env.BUSINESS_AI_ENABLED==='true'&&valid&&!!env.BUSINESS_AI_KEY&&!!env.BUSINESS_AI_MODEL&&Number.isSafeInteger(dailyTokens)&&dailyTokens>0&&dailyTokens<=10000000,dailyTokens};
}
export function validateAIRequest(input:any){
 if(input?.privacyConfirmed!==true)throw Error('请确认摘要已去除客户身份、联系方式和敏感资料');
 if(typeof input.brief!=='string'||!input.brief.trim()||input.brief.length>6000||requiresPrivateHandling(input.brief))throw Error('请填写不含身份、联系方式及敏感地址的需求摘要（最多6000字）');
 if(!isLocale(input.locale))throw Error('请选择目标语言');
 const q=validateQuote({title:'draft',scope:'draft',included:'draft',excluded:'draft',terms:'draft',currency:input.currency,expiresAt:input.expiresAt,lines:input.lines});
 if(q.lines.some((l:any)=>requiresPrivateHandling(l.label)))throw Error('费用名称不得包含联系方式或敏感资料');
 return {brief:input.brief.trim(),locale:input.locale,currency:q.currency,expiresAt:q.expiresAt,lines:q.lines};
}
export function validateAIResult(value:any,input:ReturnType<typeof validateAIRequest>){
 const fields=['title','scope','included','excluded','terms','questions','warnings'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))throw Error('AI 输出包含不允许的字段');
 for(const field of ['questions','warnings'])if(!Array.isArray(value[field])||value[field].length>20||value[field].some((v:any)=>typeof v!=='string'||!v.trim()||v.length>500))throw Error('AI 待核实事项格式无效');
 const quote=validateQuote({...value,currency:input.currency,expiresAt:input.expiresAt,lines:input.lines});
 return {quote,questions:value.questions as string[],warnings:value.warnings as string[]};
}
export function aiQuoteSendAllowed(q:any){return !q.aiTask||(q.reviewStatus==='approved'&&!!q.reviewedBy&&!!q.reviewedAt&&typeof q.reviewReason==='string'&&!!q.reviewReason.trim());}
