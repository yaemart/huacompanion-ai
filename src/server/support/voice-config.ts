export function voiceFeatures() {
  let speech = false;
  try {
    const u = new URL(process.env.SUPPORT_SPEECH_ENDPOINT || "");
    speech =
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !!process.env.SUPPORT_SPEECH_KEY &&
      Number(process.env.SUPPORT_SPEECH_DAILY_UNITS) > 0;
  } catch {}
  return { voiceMessages: true, transcription: speech, speechPlayback: speech };
}
