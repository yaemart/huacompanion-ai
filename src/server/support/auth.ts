import {createHash,randomBytes} from 'node:crypto';
import {getPayload} from 'payload';
import config from '../../payload.config';
import {isOperator} from '../../cms/access';
import {ContentError} from '../content/service';
export const cookieName='hua-support';
export function visitorSession(headers:Headers,create=false){const token=headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);const valid=token&&/^[a-f0-9]{64}$/.test(token);const raw=valid?token:create?randomBytes(32).toString('hex'):'';return {hash:raw?createHash('sha256').update(raw).digest('hex'):'',token:raw,fresh:!valid&&!!raw};}
export async function supportAuth(headers:Headers){const p=await getPayload({config});const {user}=await p.auth({headers});if(user?.collection!=='staff'||!isOperator(user))throw new ContentError('请使用客服运营账号登录',403);return {p,user};}
export async function supportPayload(){return getPayload({config});}
