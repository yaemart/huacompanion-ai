import {checkOrigin,failure,limitedJSON} from '@/server/content/auth';
import {supportAuth,supportPayload,visitorSession} from '@/server/support/auth';
import {queueVoiceJob,readVoiceJob} from '@/server/support/voice-jobs';
import {validID} from '@/lib/support';
export const runtime='nodejs';
async function context(req:Request){return new URL(req.url).searchParams.get('staff')==='1'?await supportAuth(req.headers):{p:await supportPayload(),hash:visitorSession(req.headers).hash};}
export async function POST(req:Request){try{checkOrigin(req);const {p,...actor}=await context(req);return Response.json(await queueVoiceJob(p,actor,await limitedJSON(req,8192)),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function GET(req:Request){try{const {p,...actor}=await context(req);return Response.json(await readVoiceJob(p,actor,validID(new URL(req.url).searchParams.get('job'))),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
