import 'dotenv/config';
import {getPayload} from 'payload';
import config from '../src/payload.config';
import {configuredAdapter,runSupportJob} from '../src/server/support/agent';
const p=await getPayload({config});let stopped=false;process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
try{const adapter=configuredAdapter();console.log(adapter?'Support worker: configured AI gateway':'Support worker: AI unavailable; human fallback enabled');do{try{const worked=await runSupportJob(p,adapter);if(!worked&&!process.argv.includes('--once'))await new Promise(r=>setTimeout(r,2000));}catch(e){console.error('Support worker failed safely:',e instanceof Error?e.name:'Error');if(process.argv.includes('--once'))throw e;await new Promise(r=>setTimeout(r,5000));}}while(!stopped&&!process.argv.includes('--once'));}finally{await p.destroy();}process.exit(0);
