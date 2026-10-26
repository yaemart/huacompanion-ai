import "dotenv/config";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { getPayload } from "payload";
import config from "../src/payload.config";
if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw Error("Local-only bootstrap refused");
Object.assign(process.env, { NODE_ENV: "development" });
const payload = await getPayload({ config });
const count = await payload.count({
  collection: "staff",
  overrideAccess: true,
});
if (count.totalDocs === 0) {
  const password = randomBytes(20).toString("base64url");
  await payload.create({
    collection: "staff",
    overrideAccess: true,
    context: { allowLocalStaffSetup: true },
    data: {
      email: "admin@huacompanion.local",
      password,
      name: "华伴本地管理员",
      role: "admin",
    },
  });
  mkdirSync(".local", { recursive: true, mode: 0o700 });
  writeFileSync(
    ".local/admin-credentials.txt",
    `仅本地开发使用，请妥善保存。\n后台：http://127.0.0.1:3000/admin\n邮箱：admin@huacompanion.local\n密码：${password}\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "初始管理员已创建。凭据已写入 .local/admin-credentials.txt（不输出至日志）。",
  );
} else console.log("已有员工账号，未重置任何密码。");
await payload.destroy();
process.exit(0);
