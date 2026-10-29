import { catalogCities } from './catalog-options.ts';
import { isLocale } from './locales.ts';
import { shanghaiToday, validExhibitionDate } from './exhibitions.ts';
export const lifeCategories = ['dining','nightlife','music','social','culture','sports','family'] as const;
export const lifeKinds = ['venue','activity'] as const;
export type LifeKind = typeof lifeKinds[number];
export const isLife = (kind: string): kind is LifeKind => (lifeKinds as readonly string[]).includes(kind);
export const lifeTextFields = ['subcategory','tags','city','district','address','transport','mapURL','audience','languageNotes','currency','priceUnit','fees','booking','ageRestriction','dressCode','accessibility','officialURL','verifiedAt','reviewDue','unresolved','assistance','hours','startAt','endAt','deadline','organizer','venueKey','participation','refunds','cuisine','specialties','menuURL','menuLanguages','diningScenes','facilities','dietary','dietaryEvidence','sponsorship'] as const;
export type Lifestyle = Record<typeof lifeTextFields[number],string> & {category:typeof lifeCategories[number]; status:string; languages:string[]; projectKeys:string[]; priceMin:number|null; priceMax:number|null};
export function emptyLifestyle(kind:LifeKind):Lifestyle {
 return {...(Object.fromEntries(lifeTextFields.map(k=>[k,''])) as Record<typeof lifeTextFields[number],string>),category:kind==='venue'?'dining':'social',status:kind==='venue'?'open':'scheduled',languages:[],projectKeys:[],priceMin:null,priceMax:null,currency:'CNY',priceUnit:'',} as Lifestyle;
}
const urlOK=(s:string)=>{try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
const validTime=(s:string)=>/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\+08:00$/.test(s)&&validExhibitionDate(s.slice(0,10))&&Number.isFinite(Date.parse(s));
export function validateLifestyle(v:Lifestyle|undefined,kind:LifeKind,publishing=false):asserts v is Lifestyle {
 if(!v || typeof v!=='object') throw Error('请填写场所或活动信息');
 for(const k of lifeTextFields) if(typeof v[k]!=='string'||v[k].length>5000) throw Error('场所或活动字段格式无效');
 if(!(lifeCategories as readonly string[]).includes(v.category)) throw Error('请选择有效分类');
 if(!(kind==='venue'?['open','paused','closed']:['scheduled','full','cancelled','postponed','ended']).includes(v.status)) throw Error('营业或活动状态无效');
 if(v.city&&!catalogCities.some(c=>c.code===v.city)) throw Error('请选择有效城市');
 for(const n of [v.priceMin,v.priceMax]) if(n!==null && (typeof n!=='number'||!Number.isFinite(n)||n<0)) throw Error('价格必须为非负数字或留空');
 if(v.priceMin!==null&&v.priceMax!==null&&v.priceMin>v.priceMax) throw Error('最高价格不能低于最低价格');
 if(!/^[A-Z]{3}$/.test(v.currency)) throw Error('币种需为三个大写字母');
 if(!Array.isArray(v.languages)||v.languages.length>7||v.languages.some(l=>!isLocale(l))||new Set(v.languages).size!==v.languages.length) throw Error('服务语言无效');
 if(!Array.isArray(v.projectKeys)||v.projectKeys.length>100||v.projectKeys.some(k=>typeof k!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(k))) throw Error('关联项目编号无效');
 if(v.venueKey&&!/^[a-z0-9][a-z0-9-]{0,99}$/.test(v.venueKey)) throw Error('关联场所编号无效');
 for(const k of ['officialURL','mapURL','menuURL'] as const) if(v[k]&&!urlOK(v[k])) throw Error('网址必须为不含登录信息的 http/https 地址');
 for(const k of ['verifiedAt','reviewDue'] as const) if(v[k]&&!validExhibitionDate(v[k])) throw Error('核实日期无效');
 if(v.verifiedAt>shanghaiToday()) throw Error('核实日期不能晚于今天');
 for(const k of ['startAt','endAt','deadline'] as const) if(v[k]&&!validTime(v[k])) throw Error('活动时间必须包含中国时区 +08:00');
 if(v.startAt&&v.endAt&&Date.parse(v.endAt)<=Date.parse(v.startAt)) throw Error('结束时间须晚于开始时间');
 if(v.deadline&&v.startAt&&Date.parse(v.deadline)>Date.parse(v.startAt)) throw Error('报名截止不得晚于开始时间');
 if(publishing){
  for(const k of ['city','address','audience','booking','fees','languageNotes','officialURL','verifiedAt','assistance'] as const) if(!v[k].trim()) throw Error('发布前请补全地址、适合人群、预约、收费、语言核实说明、来源及华伴协助');
  if((v.priceMin!==null||v.priceMax!==null)&&!v.priceUnit.trim()) throw Error('请填写计价单位');
  if(kind==='activity'&&(!v.startAt||!v.endAt||!v.organizer||!v.participation||!v.refunds)) throw Error('请填写活动时间、主办方、参加条件和退改说明');
  if(kind==='venue'&&!v.hours.trim()) throw Error('请填写营业时间');
  if(v.dietary.trim()&&!v.dietaryEvidence.trim()) throw Error('饮食要求须附核实说明，不得作未经确认的保证');
 }
}
export function validateLifePublication(v:Lifestyle|undefined,kind:LifeKind,sources:{url:string;checkedAt?:string}[],reviewed:unknown){
 validateLifestyle(v,kind,true);
 if(reviewed!==true) throw Error('请人工核实来源、收费、语言及参加要求');
 if(!sources.some(s=>s.url===v.officialURL&&s.checkedAt===v.verifiedAt)) throw Error('请添加与官方来源及核实日期一致的资料来源');
}
export function publicLifestyle(v:Lifestyle):Lifestyle {
 const out=emptyLifestyle('venue');for(const k of lifeTextFields)out[k]=v[k];
 return {...out,category:v.category,status:v.status,languages:[...v.languages],projectKeys:[...v.projectKeys],priceMin:v.priceMin,priceMax:v.priceMax};
}
export function effectiveLifeStatus(v:Lifestyle,kind:LifeKind,now=Date.now()):string {
 if(kind==='venue'||['cancelled','postponed','ended'].includes(v.status))return v.status;
 if(v.endAt&&Date.parse(v.endAt)<=now)return 'ended';
 if(v.status==='full')return 'full';
 if(v.deadline&&Date.parse(v.deadline)<=now)return 'registrationClosed';
 if(v.startAt&&Date.parse(v.startAt)<=now)return 'registrationClosed';
 return v.status;
}
export const lifeCanEnquire=(v:Lifestyle,kind:LifeKind,now=Date.now())=>['open','scheduled'].includes(effectiveLifeStatus(v,kind,now));
export const lifePath=(d:{locale:string;kind:string;slug:string})=>`/${d.locale}/life/${d.kind}/${d.slug}`;
export type LifeFilters={city?:string;category?:string;kind?:string;language?:string;q?:string;date?:string;status?:string;cuisine?:string;scene?:string;budget?:string};
export function filterLifestyle<T extends {kind:string;title:string;summary?:string;lifestyle?:Lifestyle}>(items:T[],f:LifeFilters={}):T[]{
 return items.filter(d=>{const v=d.lifestyle;if(!isLife(d.kind)||!v)return false;
 if(f.kind&&d.kind!==f.kind||f.city&&v.city!==f.city||f.category&&v.category!==f.category||f.language&&!v.languages.includes(f.language)||f.status&&effectiveLifeStatus(v,d.kind)!==f.status)return false;
 if(f.date&&(d.kind!=='activity'||v.startAt.slice(0,10)>f.date||v.endAt.slice(0,10)<f.date))return false;
 if(f.cuisine&&!v.cuisine.toLowerCase().includes(f.cuisine.toLowerCase())||f.scene&&!v.diningScenes.toLowerCase().includes(f.scene.toLowerCase()))return false;
 if(f.budget&&(v.currency!=='CNY'||v.priceMin===null||v.priceMin>Number(f.budget)))return false;
 return !f.q||[d.title,d.summary,v.tags,v.address,v.subcategory].join(' ').toLowerCase().includes(f.q.trim().toLowerCase());});
}

export function lifeInquiryPath(d:{locale:string;kind:string;contentKey:string;publicationRevision?:number},project?:string){
 return `/${d.locale}/request?${new URLSearchParams({life:d.contentKey,lifeKind:d.kind,lifeRevision:String(d.publicationRevision||0),service:'travel',...(project?{project}:{})})}`;
}
export const lifeTranslationFields=['subcategory','tags','address','transport','audience','languageNotes','priceUnit','fees','booking','ageRestriction','dressCode','accessibility','unresolved','assistance','hours','organizer','participation','refunds','cuisine','specialties','menuLanguages','diningScenes','facilities','dietary','dietaryEvidence','sponsorship'] as const;
