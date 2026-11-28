import http from "node:http";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
assertCrmTarget(process.env.DATABASE_URL);
if (process.env.HUA_CRM_ISOLATED !== "true") throw Error("Isolated fixture required");
const flag = resolve(".local/crm-a2/drop-next-response");
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, ...args) {
  if (event === "request") {
    const [request, response] = args;
    const end = response.end;
    response.end = function (...params) {
      if (
        request.method === "POST" &&
        request.url?.split("?")[0] === "/api/crm" &&
        response.statusCode === 200 &&
        existsSync(flag)
      ) {
        unlinkSync(flag);
        response.destroy();
        return response;
      }
      return Reflect.apply(end, this, params);
    };
  }
  return Reflect.apply(emit, this, [event, ...args]);
};
