import {isLocale,type Locale} from './locales.ts';
import {formText} from './form-copy.ts';
export const homeServices=['regular','deep','move-in'] as const;
export const homeTexts=['districts','staffing','scope','exclusions','pricing','equipment','pets','entry','aftercare','insurance','languageEvidence'] as const;
export type Housekeeping=Record<typeof homeTexts[number],string>&{services:string[];customerLanguages:string[];workerLanguages:string[];equipmentBy:'provider'|'customer'|'confirm'};
export const emptyHousekeeping=():Housekeeping=>({...Object.fromEntries(homeTexts.map(k=>[k,''])) as Record<typeof homeTexts[number],string>,services:[],customerLanguages:[],workerLanguages:[],equipmentBy:'confirm'});
export function validateHousekeeping(h:Housekeeping|undefined,publish=false):asserts h is Housekeeping{
 if(!h||typeof h!=='object')throw Error('请补全家政专属资料');
 for(const k of homeTexts)if(typeof h[k]!=='string'||h[k].length>5000)throw Error('家政资料格式无效');
 if(!Array.isArray(h.services)||h.services.length>3||h.services.some(s=>!(homeServices as readonly string[]).includes(s)))throw Error('家政服务子类无效');
 for(const key of ['customerLanguages','workerLanguages'] as const)if(!Array.isArray(h[key])||h[key].length>7||h[key].some(l=>!isLocale(l)))throw Error('服务语言无效');
 if(!['provider','customer','confirm'].includes(h.equipmentBy))throw Error('工具材料安排无效');
 if(publish){if(!h.services.length)throw Error('请选择家政子类');for(const k of homeTexts)if(!h[k].trim())throw Error('发布前请补全家政范围、语言核实、收费、入户和售后说明；未知事项明确标注待确认');}
}
export function publicHousekeeping(h:Housekeeping):Housekeeping{const r=emptyHousekeeping();for(const k of homeTexts)r[k]=h[k];return {...r,services:[...h.services],customerLanguages:[...h.customerLanguages],workerLanguages:[...h.workerLanguages],equipmentBy:h.equipmentBy};}
export const homeRequestFields=['homeService','homeDistrict','homeArea','homeRooms','homeBathrooms','homeDate','homeFlexible','homeFrequency','homePets','homeEquipment'] as const;
export const homeProviderFields=['homeServices','homeDistrict','homeEntity','homeStaffing','homeCustomerLanguages','homeWorkerLanguages','homePricing','homeExclusions','homeEquipment','homeAftercare','homeInsurance'] as const;
export function validateHomeIntake(kind:'request'|'apply',v:Record<string,unknown>,locale:Locale){
 const e:Record<string,string>={};const req=(k:string)=>{if(typeof v[k]!=='string'||!String(v[k]).trim())e[k]=formText(locale,'Please complete this field.');};
 const choose=(k:string,opts:readonly string[])=>{if(!opts.includes(String(v[k])))e[k]=formText(locale,'Please complete this field.');};
 req('homeDistrict');choose('homeEquipment',['provider','customer','confirm']);
 if(kind==='request'){
 choose('homeService',homeServices);choose('homeFlexible',['yes','no']);choose('homeFrequency',['once','recurring']);
 for(const k of ['homeArea','homeRooms','homeBathrooms'])if(!/^\d+(\.\d+)?$/.test(String(v[k]))||Number(v[k])<1||Number(v[k])>100000||k!=='homeArea'&&!Number.isInteger(Number(v[k])))e[k]=formText(locale,'Please complete this field.');
 if(v.homeFlexible!=='yes'){req('homeDate');const s=String(v.homeDate||'');const d=new Date(s+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)e.homeDate=formText(locale,'Enter a valid date.');}
 }else{
 for(const k of homeProviderFields)req(k);choose('homeEntity',['company','team','other']);
 if(!String(v.homeServices||'').split(',').every(k=>(homeServices as readonly string[]).includes(k)))e.homeServices=formText(locale,'Please complete this field.');
 }return e;
}
export function houseProviderVerified(p:any){const v=p?.housekeepingVerification;return !!p?.categories?.includes('housekeeping')&&!!v?.reviewed&&!!v?.reviewedAt&&['entityEvidence','staffEvidence','languageEvidence','insuranceEvidence','aftercareEvidence'].every(k=>typeof v[k]==='string'&&!!v[k].trim());}
export function houseProviderCovers(project:Housekeeping|undefined,provider:Housekeeping|undefined){return !!project&&!!provider&&project.services.every(s=>provider.services.includes(s));}
