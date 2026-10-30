import 'dotenv/config';
import {getPayload} from 'payload';
import config from '../src/payload.config';
import {locales} from '../src/lib/locales';
import {homeText} from '../src/lib/housekeeping-copy';
import {mutateContent} from '../src/server/content/service';
if(process.env.APP_ENV!=='local')throw Error('Local seed only');
const p=await getPayload({config});
try {
 const admin=(await p.find({collection:'staff',where:{and:[{role:{equals:'admin'}},{active:{not_equals:false}}]},sort:'createdAt',limit:1})).docs[0];
 if(!admin)throw Error('Active administrator required');
 for(const locale of locales){
  const contentKey='service-housekeeping';
  const exists=await p.find({collection:'content-drafts',where:{identity:{equals:`${contentKey}:${locale}`}},limit:1});
  if(exists.totalDocs)continue;
  let d=await mutateContent(p,admin,{action:'save',body:{contentKey,kind:'service',locale,slug:'housekeeping',title:homeText(locale,'title'),summary:homeText(locale,'intro'),blocks:[{type:'list',text:['regular','deep','move-in'].map(k=>homeText(locale,k)).join('\n')},{type:'paragraph',text:homeText(locale,'boundary')},{type:'paragraph',text:homeText(locale,'notice')}],sources:[]}});
  d=await mutateContent(p,admin,{action:'submit',id:d.id,revision:d.revision});
  await mutateContent(p,admin,{action:'publish',id:d.id,revision:d.revision,overrideReason:'User-approved local housekeeping service introduction; no real provider claims'});
 }
 console.log('Housekeeping introductions ready; no provider records created.');
}finally{await p.destroy();}
process.exit(0);
