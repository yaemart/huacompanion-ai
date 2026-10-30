export {supportText} from './support-copy.ts';
export function validateMessage(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>4000)throw Error('Message must contain 1–4000 characters');return value.trim();}
export function publicMessage(m:any){return m.visibility==='public'?{id:m.id,text:m.text,author:m.author,createdAt:m.createdAt,citations:m.citations||[]}:null;}
export function publicConversation(c:any){return {id:c.id,locale:c.locale,topic:c.topic,mode:c.mode,status:c.status,revision:c.revision,aiConsent:!!c.aiConsent,proposedRequest:c.proposedRequest?validateSupportDraft(c.proposedRequest):null,createdAt:c.createdAt,updatedAt:c.updatedAt};}
export function canDeliver(c:any,run:any){return c.mode==='ai'&&c.aiConsent===true&&(c.aiRevision??c.revision)===run.revision;}
export function validID(v:unknown):number{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid ID');return n;}
export const supportDraftFields=['city','people','arrivalDate','industry','purpose','budget','description','homeService','homeDistrict','homeArea','homeRooms','homeBathrooms','homeDate','homeFlexible','homeFrequency','homePets','homeEquipment'] as const;
export function validateSupportDraft(v:unknown):Record<string,string>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid request draft');const result:Record<string,string>={};for(const [k,value]of Object.entries(v)){if(!(supportDraftFields as readonly string[]).includes(k)||typeof value!=='string'||value.length>2000)throw Error('Invalid request draft field');result[k]=value;}return result;}
