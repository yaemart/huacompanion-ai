import {checkOrigin,failure} from '@/server/content/auth';
import {supportAuth,supportPayload,visitorSession} from '@/server/support/auth';
import {boundedVoiceBody,uploadVoice,readVoice} from '@/server/support/voice';
import {validID} from '@/lib/support';
export const runtime='nodejs';
async function context(req:Request){return new URL(req.url).searchParams.get('staff')==='1'?await supportAuth(req.headers):{p:await supportPayload(),hash:visitorSession(req.headers).hash};}
export async function POST(req:Request){try{checkOrigin(req);const {p,...actor}=await context(req);const q=new URL(req.url).searchParams;return Response.json(await uploadVoice(p,actor,q.get('conversation'),req.headers.get('idempotency-key'),await boundedVoiceBody(req)),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function GET(req:Request){try{const {p,...actor}=await context(req);const audio=await readVoice(p,actor,validID(new URL(req.url).searchParams.get('audio')));return new Response(new Uint8Array(audio.bytes),{headers:{'Content-Type':'audio/wav','Content-Length':String(audio.bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="voice.wav"'}});}catch(e){return failure(e);}}
