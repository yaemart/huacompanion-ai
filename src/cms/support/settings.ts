import type {GlobalConfig} from 'payload';
import {isAdmin} from '../access';
import {featureNames} from '../../lib/support-features';
export const supportSettings:GlobalConfig={slug:'support-settings',label:'客服功能设置',admin:{group:'客户服务',description:'开启开关不代表已完成开发或配置外部服务。关闭 AI 会阻止新任务及尚未发出的结果；已有记录保留。'},access:{read:({req})=>isAdmin(req.user),update:({req})=>isAdmin(req.user)},fields:Object.entries(featureNames).map(([name,label])=>({name,label,type:'checkbox' as const,defaultValue:name==='textChat',admin:{description:['textChat','aiReception','translation'].includes(name)?'仅在服务已配置时生效':'尚未实现；即使勾选也不会开放入口或调用外部服务'}}))};
