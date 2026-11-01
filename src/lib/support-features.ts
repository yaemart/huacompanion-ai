export const featureNames = {
  textChat: "文字客服",
  aiReception: "AI 接待",
  voiceMessages: "语音消息",
  transcription: "语音转写",
  translation: "内部翻译",
  speechPlayback: "回答语音播放",
  aiCalls: "实时 AI 通话",
  humanCalls: "人工实时接入",
} as const;
export type Feature = keyof typeof featureNames;
const developed: Feature[] = Object.keys(featureNames) as Feature[];
export function featureState(
  key: Feature,
  settings: Record<string, unknown>,
  configured: Partial<Record<Feature, boolean>>,
) {
  const implemented = developed.includes(key);
  const connected = key === "textChat" || configured[key] === true;
  const enabled = settings[key] === true || (key === "textChat" && settings[key] === undefined);
  return {
    implemented,
    configured: connected,
    enabled,
    available: implemented && connected && enabled,
  };
}
