import assert from "node:assert/strict";
const base = process.env.APP_URL || "http://127.0.0.1:3100";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error("Local HTTP only");
async function html(path: string) {
  const r = await fetch(base + path);
  assert.equal(r.status, 200, path);
  return (await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
}
for (const locale of ["en", "zh"]) {
  const path = `/${locale}/exhibitions`;
  const initial = await html(path);
  assert.match(initial, /<details class="exhibition-filter-disclosure">/);
  assert.match(initial, /<summary[^>]*>/);
  assert.doesNotMatch(initial, /<details[^>]*\bopen(?:=|>)/);
  const form = initial.match(/<form\b[^>]*>/)?.[0] || "";
  assert.match(form, new RegExp(`action="${path}"`));
  assert.match(form, /method="get"/);
  assert.match(initial, /<select name="month">/);
  assert.doesNotMatch(initial, /type="month"/);
  assert.match(initial, /<option value="upcoming" selected="">/);
  assert.equal((initial.match(/<footer\b/g) || []).length, 1);
  const selected = await html(path + "?period=all&month=0001-01");
  assert.match(selected, /<option value="0001-01" selected="">/);
  assert.match(selected, /<option value="all" selected="">/);
  assert.match(selected, new RegExp(`href="${path}"`));
  const archive = await html(path + "?period=past");
  assert.match(archive, /<option value="past" selected="">/);
  const cleared = await html(path);
  assert.match(cleared, /<option value="upcoming" selected="">/);
  const month = initial.match(/<option value="(\d{4}-\d{2})"/m)?.[1];
  if (month)
    assert.match(
      await html(path + "?period=all&month=" + month),
      new RegExp(`<option value="${month}" selected="">`),
    );
}
console.log(
  "PASS bilingual production GET disclosure/month-select/default/archive/bookmark/clear/single-footer HTTP",
);
