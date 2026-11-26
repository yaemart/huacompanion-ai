import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import type { ContentBody } from "../../src/lib/content-model";

/** Render the real preview page; replace only request authentication/storage, not the page's UI. */
export async function assertExhibitionPreview(body: ContentBody) {
  const require = createRequire(import.meta.url);
  const code = ts.transpileModule(
    readFileSync(
      new URL("../../src/app/(frontend)/content-preview/[id]/page.tsx", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const modules: Record<string, unknown> = {
    "next/headers": { headers: async () => new Headers() },
    "next/navigation": {
      redirect: () => {
        throw Error("Unexpected redirect");
      },
      notFound: () => {
        throw Error("Unexpected 404");
      },
    },
    "@/server/content/auth": { contentAuth: async () => ({ p: {}, user: { id: 1 } }) },
    "@/server/content/preview": {
      readContentPreview: async () => ({ draft: { revision: 2, body }, policy: undefined }),
    },
  };
  for (const [, name] of code.matchAll(/require\("(@\/[^"]+)"\)/g)) {
    if (name in modules) continue;
    const base = new URL("../../src/" + name.slice(2), import.meta.url);
    const file = new URL(base.href + (existsSync(base.pathname + ".ts") ? ".ts" : ".tsx"));
    modules[name] = await import(file.href);
  }
  const ctx = {
    exports: {} as {
      default?: (props: { params: Promise<{ id: string }> }) => Promise<React.ReactElement>;
    },
    require: (name: string) => {
      if (name in modules) return modules[name];
      return require(
        name.startsWith("@/")
          ? new URL("../../src/" + name.slice(2), import.meta.url).pathname
          : name,
      );
    },
  };
  runInNewContext(code, ctx);
  const html = renderToStaticMarkup(
    await ctx.exports.default!({ params: Promise.resolve({ id: "1" }) }),
  );
  assert.ok(
    html.includes(body.exhibition!.transport!),
    "authenticated draft preview must include visitor text",
  );
  assert.match(html, /Phase &lt;one&gt;/);
  assert.match(html, /Tools\n&lt;script&gt;PRIVATE_SCRIPT&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>PRIVATE_SCRIPT/);
  assert.match(html, /尚不代表网站已发布/);
}
