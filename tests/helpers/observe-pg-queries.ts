import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

export type ObservedStatement = { text: string; values: unknown[] };
export async function observePGQueries<T>(p: Payload, run: () => Promise<T>) {
  const prototype = (p.db as unknown as Pick<PostgresAdapter, "pg">).pg.Client.prototype;
  const original = prototype.query;
  const statements: ObservedStatement[] = [];
  prototype.query = new Proxy(original, {
    apply(target, self, args) {
      const request = args[0] as string | { text?: unknown; values?: unknown };
      const text = typeof request === "string" ? request : request?.text;
      if (
        typeof text === "string" &&
        /^\s*(SELECT|WITH)\b/i.test(text) &&
        /\baudit_events\b/i.test(text)
      ) {
        const values = Array.isArray(args[1])
          ? args[1]
          : typeof request === "object" && Array.isArray(request.values)
            ? request.values
            : [];
        statements.push({ text, values: [...values] });
      }
      return Reflect.apply(target, self, args);
    },
  });
  const start = performance.now();
  try {
    const result = await run();
    return { result, statements, elapsedMs: performance.now() - start };
  } finally {
    prototype.query = original;
  }
}
