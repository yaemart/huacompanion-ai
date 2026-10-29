import 'dotenv/config';
import {getPayload} from 'payload';
import config from '../src/payload.config';
import {mutateContent} from '../src/server/content/service';
import {validateContent} from '../src/lib/content-model';
import {buildStarterInstitutions} from './content/starter-institutions';
if(process.env.APP_ENV!=='local'||!process.env.DATABASE_URL?.includes('@127.0.0.1:55438/hua_companion'))throw Error('Dedicated local database required');
const bodies=buildStarterInstitutions();bodies.forEach(validateContent);
const p=await getPayload({config});
try{
 const admin=(await p.find({collection:'staff',where:{role:{equals:'admin'}},limit:1})).docs[0];if(!admin)throw Error('Administrator required');
 let created=0,skipped=0;
 for(const body of bodies){
  if((await p.count({collection:'content-drafts',where:{identity:{equals:body.contentKey+':'+body.locale}}})).totalDocs){skipped++;continue;}
  await mutateContent(p,admin,{action:'save',body});created++;
 }
 console.log(JSON.stringify({created,skipped,institutions:6,languageDrafts:12,published:false}));
}catch(e){console.error(e);process.exitCode=1;}finally{await p.destroy();process.exit(process.exitCode||0);}
