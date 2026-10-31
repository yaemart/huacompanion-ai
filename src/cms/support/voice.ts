import type {CollectionConfig,Field} from 'payload';
import {MAX_VOICE_BYTES} from '../../lib/voice';
const access={create:()=>false,read:()=>false,update:()=>false,delete:()=>false};
const text=(name:string,extra:object={}):Field=>({name,type:'text',...extra});
export const voiceMessageFields:Field[]=[{name:'voiceAudio',type:'relationship',relationTo:'support-voice-audio'},{name:'voiceTranscript',type:'textarea',maxLength:8000}];
export const voiceCollections:CollectionConfig[]=[
 {slug:'support-voice-audio',access,admin:{hidden:true},fields:[{name:'conversation',type:'relationship',relationTo:'support-conversations',required:true,index:true},text('dedupe',{required:true,unique:true}),text('digest',{required:true}),{name:'body',type:'textarea',required:true,maxLength:Math.ceil(MAX_VOICE_BYTES/3)*4,access:{read:()=>false}}, {name:'seconds',type:'number',required:true}]},
 {slug:'support-voice-jobs',access,admin:{hidden:true},fields:[{name:'conversation',type:'relationship',relationTo:'support-conversations',required:true,index:true},{name:'message',type:'relationship',relationTo:'support-messages',required:true},text('dedupe',{required:true,unique:true}),{name:'kind',type:'select',options:['transcribe','synthesize'],required:true},{name:'status',type:'select',options:['queued','running','succeeded','failed','discarded'],required:true,index:true},text('lease'),{name:'leaseUntil',type:'date'},{name:'consentAt',type:'date',required:true},text('day',{index:true}),{name:'reserved',type:'number',defaultValue:0},text('error'),{name:'audio',type:'relationship',relationTo:'support-voice-audio'},{name:'actor',type:'relationship',relationTo:'staff'}]}
];
export const voiceSettingsFields:Field[]=[{name:'voiceMaxSeconds',label:'语音最大时长（秒）',type:'number',min:1,max:60,defaultValue:60},{name:'voiceMaxBytes',label:'语音最大字节数',type:'number',min:16044,max:6000000,defaultValue:6000000},{name:'voiceUploadsPerMinute',label:'每会话每分钟语音数量',type:'number',min:1,max:4,defaultValue:4}];
