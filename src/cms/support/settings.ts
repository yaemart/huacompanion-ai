import {voiceSettingsFields} from './voice';
import type {GlobalConfig} from 'payload';
import {isAdmin} from '../access';
import {featureNames} from '../../lib/support-features';
import {operationsSettingsFields} from './operations';
export const supportSettings:GlobalConfig={
 slug:'support-settings',label:'客服功能设置',
 admin:{group:'客户服务',description:'功能必须完成开发、配置并开启才可使用。关闭后禁止新调用和未发出的结果；已有记录保留。通话关闭后由维护进程结束在途通话。'},
 access:{read:({req})=>isAdmin(req.user),update:({req})=>isAdmin(req.user)},
 hooks:{beforeChange:[async({req,data})=>{const id=await req.transactionID;const session=id&&(req.payload.db.sessions as any)?.[id];if(session)await session.db.execute('SELECT pg_advisory_xact_lock(726280)');return data;}]},
 fields:[...Object.entries(featureNames).map(([name,label])=>({name,label,type:'checkbox' as const,defaultValue:name==='textChat',admin:{description:'仅在对应服务已配置、额度可用时生效；开启不会自动配置外部服务。'}})),...operationsSettingsFields,...voiceSettingsFields],
};
