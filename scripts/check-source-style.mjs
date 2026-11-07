import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const errors = [];
let files = 0;
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(file);
      continue;
    }
    if (!/\.(?:[cm]?[jt]sx?|css)$/.test(file)) continue;
    files++;
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      if (line.length > 200)
        errors.push(`${file}:${index + 1}: ${line.length} characters (limit 200)`);
    });
  }
}
for (const directory of ["src", "scripts", "tests"]) await inspect(directory);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Source line lengths passed: ${files} files, no exceptions.`);
}
