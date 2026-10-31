import {supportAuth} from '@/server/support/auth';
import {checkOrigin,limitedJSON,failure} from '@/server/content/auth';
import {businessAIRead,businessAIAction} from '@/server/business/ai';
export const runtime='nodejs';
export async function GET(req:Request){try{const {p,user}=await supportAuth(req.headers);return Response.json(await businessAIRead(p,user,new URL(req.url).searchParams.get('id')),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(req:Request){try{checkOrigin(req);const {p,user}=await supportAuth(req.headers);return Response.json(await businessAIAction(p,user,await limitedJSON(req,50000)),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
