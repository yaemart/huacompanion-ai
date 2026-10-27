"use client";
import type { Catalog } from "@/lib/catalog";
import { services } from "@/lib/content";
const labels = {
  capabilities: "服务能力",
  audience: "适用对象",
  includes: "包含项目",
  excludes: "不包含项目",
  process: "服务流程",
  deliverables: "交付内容",
  materials: "客户准备材料",
  bookingNotice: "提前预约要求",
  duration: "服务时长与条件",
  people: "人数范围与条件",
  changes: "变更与取消规则",
};
export function CatalogFields({
  value: c,
  onChange,
  kind,
  choices,
}: {
  value: Catalog;
  onChange: (v: Catalog) => void;
  kind: string;
  choices: any[];
}) {
  const set = (k: keyof Catalog, v: any) => onChange({ ...c, [k]: v });
  return (
    <section>
      <h2>{kind === "provider-profile" ? "服务商公开资料" : "项目服务规格"}</h2>
      <p>
        这里只填写可公开资料；联系方式、内部价格与资质文件请保留在业务后台。图片不得含直联电话、微信或二维码。
      </p>
      <label>
        服务分类
        <select
          multiple
          value={c.categories}
          onChange={(e) =>
            set(
              "categories",
              Array.from(e.target.selectedOptions, (o) => o.value),
            )
          }
        >
          {services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.title.zh}
            </option>
          ))}
        </select>
      </label>
      <label>
        语言代码（每行一个，例如 en、zh）
        <textarea
          value={c.languages.join("\n")}
          onChange={(e) => set("languages", e.target.value.split("\n"))}
        />
      </label>
      <h3>服务城市</h3>
      {c.cities.map((city, i) => (
        <div className="row" key={i}>
          <label>
            城市代码
            <input
              value={city.code}
              placeholder="shanghai"
              onChange={(e) =>
                set(
                  "cities",
                  c.cities.map((x, j) =>
                    j === i ? { ...x, code: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            城市显示名称
            <input
              value={city.name}
              placeholder="上海"
              onChange={(e) =>
                set(
                  "cities",
                  c.cities.map((x, j) =>
                    j === i ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            onClick={() =>
              set(
                "cities",
                c.cities.filter((_, j) => j !== i),
              )
            }
          >
            移除城市
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => set("cities", [...c.cities, { code: "", name: "" }])}
      >
        ＋ 城市
      </button>
      {Object.entries(labels)
        .filter(([k]) => kind === "service-project" || k === "capabilities")
        .map(([k, label]) => (
          <label key={k}>
            {label}
            <textarea
              value={c[k as keyof typeof labels]}
              onChange={(e) => set(k as keyof Catalog, e.target.value)}
            />
          </label>
        ))}
      {kind === "provider-profile" ? (
        <>
          <h3>可公开的核验项目</h3>
          <p>
            仅填写实际核验过的事项，不等于服务效果保证。详细证件仍留在内部。
          </p>
          {c.verification.map((v, i) => (
            <div className="row" key={i}>
              <label>
                核验事项
                <input
                  value={v.label}
                  onChange={(e) =>
                    set(
                      "verification",
                      c.verification.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                核验日期
                <input
                  type="date"
                  value={v.checkedAt}
                  onChange={(e) =>
                    set(
                      "verification",
                      c.verification.map((x, j) =>
                        j === i ? { ...x, checkedAt: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  set(
                    "verification",
                    c.verification.filter((_, j) => j !== i),
                  )
                }
              >
                移除核验项
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              set("verification", [
                ...c.verification,
                { label: "", checkedAt: "" },
              ])
            }
          >
            ＋ 核验事项
          </button>
        </>
      ) : (
        <>
          <label>
            履约方式
            <select
              value={c.fulfillment}
              onChange={(e) =>
                onChange({
                  ...c,
                  fulfillment: e.target.value as Catalog["fulfillment"],
                  providerKeys: [],
                })
              }
            >
              <option value="arranged">华伴按需求安排，尚未指定服务商</option>
              <option value="specified">由以下指定服务商履约，华伴协调</option>
            </select>
          </label>
          {c.fulfillment === "specified" && (
            <label>
              指定服务商（同语言公开编号）
              <select
                multiple
                value={c.providerKeys}
                onChange={(e) =>
                  set(
                    "providerKeys",
                    Array.from(e.target.selectedOptions, (o) => o.value),
                  )
                }
              >
                {choices
                  .filter((d) => d.kind === "provider-profile")
                  .map((d) => (
                    <option key={d.contentKey} value={d.contentKey}>
                      {d.title} · {d.contentKey}
                    </option>
                  ))}
              </select>
              <small>
                选择不代表已获准发布；发布时重新检查服务商许可与正式版本。
              </small>
            </label>
          )}
        </>
      )}
      <label>
        计价方式
        <select
          value={c.price.mode}
          onChange={(e) => set("price", { mode: e.target.value })}
        >
          <option value="quote">按需求询价</option>
          <option value="fixed">固定价（按适用条件）</option>
          <option value="from">起价</option>
        </select>
      </label>
      {c.price.mode !== "quote" && (
        <>
          <div className="row">
            <label>
              金额
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={c.price.amount ?? ""}
                onChange={(e) =>
                  set("price", {
                    ...c.price,
                    amount: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </label>
            <label>
              币种代码
              <input
                placeholder="CNY"
                value={c.price.currency || ""}
                onChange={(e) =>
                  set("price", {
                    ...c.price,
                    currency: e.target.value.toUpperCase(),
                  })
                }
              />
            </label>
            <label>
              计价单位
              <input
                value={c.price.unit || ""}
                onChange={(e) =>
                  set("price", { ...c.price, unit: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            价格适用条件
            <textarea
              value={c.price.conditions || ""}
              onChange={(e) =>
                set("price", { ...c.price, conditions: e.target.value })
              }
            />
          </label>
        </>
      )}
      <label>
        关联知识文章
        <select
          multiple
          value={c.guideKeys}
          onChange={(e) =>
            set(
              "guideKeys",
              Array.from(e.target.selectedOptions, (o) => o.value),
            )
          }
        >
          {choices
            .filter((d) => d.kind === "guide")
            .map((d) => (
              <option key={d.contentKey} value={d.contentKey}>
                {d.title}
              </option>
            ))}
        </select>
      </label>
    </section>
  );
}
