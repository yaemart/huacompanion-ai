import path from "node:path";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { createRequire, syncBuiltinESMExports } from "node:module";
// Intercept only external startup side effects; keep the real worker and all DB operations.
const require = createRequire(import.meta.url);
const payloadRequire = createRequire(require.resolve("payload"));
const wsPath = payloadRequire.resolve("ws");
const WebSocket = payloadRequire("ws");
const guardedWebSocket = new Proxy(WebSocket, {
  construct(_target, args) {
    process.send?.({ forbiddenNetwork: true, origin: new URL(String(args[0])).origin });
    throw Error("External WebSocket is forbidden in this worker fixture");
  },
});
payloadRequire.cache[wsPath].exports = guardedWebSocket;
payloadRequire.cache[path.resolve(path.dirname(wsPath), "lib/websocket.js")].exports =
  guardedWebSocket;
const originalSpawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  if (Array.isArray(args) && args.includes("generate:types")) {
    process.send?.({ forbiddenGeneration: true });
    const child = new EventEmitter();
    process.nextTick(() => child.emit("exit", 0));
    return child;
  }
  return originalSpawn(command, args, options);
};
syncBuiltinESMExports();
// Child-process integration guard: a regression must never reach an external service.
globalThis.fetch = async (url) => {
  process.send?.({ forbiddenNetwork: true, origin: new URL(String(url)).origin });
  throw Error("External network is forbidden in this worker fixture");
};
