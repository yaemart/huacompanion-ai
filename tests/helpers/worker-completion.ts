export function observeWorkerCompletion<T>(completion: Promise<T>): Promise<T> {
  // Polling may delay the caller's await; retain its original rejection for that await.
  void completion.catch(() => {});
  return completion;
}
