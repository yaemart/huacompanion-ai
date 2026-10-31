import type {CollectionConfig, Field} from 'payload';
import {isAdmin} from '../access';
const privateAccess = {read:({req}:any)=>isAdmin(req.user), create:()=>false, update:()=>false, delete:()=>false};
const conversation:Field={name:'conversation',type:'relationship',relationTo:'support-conversations',required:true,index:true};
export const operationsCollections:CollectionConfig[]=[
 {slug:'support-feedback',labels:{singular:'客服满意度',plural:'客服满意度'},access:privateAccess,admin:{group:'客户服务'},fields:[conversation,{name:'dedupe',type:'text',required:true,unique:true},{name:'rating',type:'number',required:true,min:1,max:5},{name:'comment',type:'textarea',maxLength:2000}]},
 {slug:'support-reviews',labels:{singular:'客服复盘',plural:'客服复盘'},access:privateAccess,admin:{group:'客户服务'},fields:[conversation,{name:'dedupe',type:'text',required:true,unique:true},{name:'actor',type:'relationship',relationTo:'staff',required:true},{name:'category',type:'select',required:true,options:['knowledge-gap','quality','follow-up']},{name:'note',type:'textarea',required:true,maxLength:2000}]},
 {slug:'support-retention-audits',labels:{singular:'客服保留审计',plural:'客服保留审计'},access:privateAccess,admin:{group:'客户服务'},fields:[{name:'actor',type:'relationship',relationTo:'staff',required:true},{name:'kind',type:'select',required:true,options:['text','audio','transcript']},{name:'token',type:'text',required:true,unique:true},{name:'status',type:'select',required:true,options:['preview','executed']},{name:'expiresAt',type:'date',required:true},{name:'candidates',type:'json',required:true},{name:'policy',type:'json',required:true},{name:'executedAt',type:'date'},{name:'result',type:'json'}]},
];
export const operationsSettingsFields:Field[]=[
 {name:'retentionDeletionEnabled',label:'允许管理员确认后清理客服内容',type:'checkbox',defaultValue:false,admin:{description:'默认关闭。必须先预览，再确认执行。不会删除会话或关联服务申请。'}},
 ...(['text','audio','transcript'] as const).map(kind=>({name:`${kind}RetentionDays`,label:{text:'文字内容保留天数',audio:'音频保留天数',transcript:'转录保留天数'}[kind],type:'number',defaultValue:kind==='audio'?30:365,min:1,max:3650,required:true} as Field)),
];
