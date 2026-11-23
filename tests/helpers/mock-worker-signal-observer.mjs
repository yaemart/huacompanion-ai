// Observe signal dispatch after every synchronous listener, without implementing worker stop.
process.once("SIGTERM", () => {
  process.nextTick(() => process.send?.({ workerTestSignal: "SIGTERM" }));
});
