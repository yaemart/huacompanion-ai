// Child-process integration guard: a regression must never reach an external service.
globalThis.fetch = async (url) => {
  process.send?.({ forbiddenNetwork: true, origin: new URL(String(url)).origin });
  throw Error("External network is forbidden in this worker fixture");
};
