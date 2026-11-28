import type { FormEvent, RefObject } from "react";
import type { Draft, Options } from "./types";
export function ClientActionForm({
  draft,
  options,
  locked,
  sectionRef,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  options: Options;
  locked: boolean;
  sectionRef: RefObject<HTMLElement | null>;
  onChange: (key: string, value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  const values = (key: string) => draft.values[key] ?? "",
    setValue = onChange;
  const field = (name: string, label: string, required = false, type = "text", maxLength = 200) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        value={values(name)}
        onChange={(e) => setValue(name, e.target.value)}
      />
    </label>
  );
  return (
    <section ref={sectionRef} className="crm-panel crm-edit" aria-label="操作表单">
      <h2>{draft.title}</h2>
      <p>提交将按打开表单时的版本核对；刷新不会覆盖当前填写。</p>
      <form onSubmit={(e) => onSubmit(e)}>
        <fieldset disabled={locked}>
          {draft.action === "createClient" && (
            <label>
              客户类型
              <select value={values("kind")} onChange={(e) => setValue("kind", e.target.value)}>
                <option value="individual">个人客户</option>
                <option value="company">企业客户</option>
              </select>
            </label>
          )}
          {["createClient", "updateClient"].includes(draft.action) && (
            <>
              {field("displayName", "客户名称", true)}
              <label>
                沟通语言
                <select
                  value={values("language")}
                  onChange={(e) => setValue("language", e.target.value)}
                >
                  <option value="en">英文</option>
                  <option value="zh">中文</option>
                </select>
              </label>
              {field("countryCode", "国家／地区代码（可选，如 CN、JP）", false, "text", 2)}
            </>
          )}
          {draft.action === "createClient" && options.role === "admin" && (
            <label>
              所属团队
              <select
                required
                value={values("teamID")}
                onChange={(e) => {
                  setValue("teamID", e.target.value);
                  setValue("ownerID", "");
                }}
              >
                {options.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {draft.action === "createClient" && options.role !== "operations" && (
            <label>
              负责人
              <select
                required={options.role === "manager"}
                value={values("ownerID")}
                onChange={(e) => setValue("ownerID", e.target.value)}
              >
                <option value="">{options.role === "admin" ? "暂不分派" : "请选择负责人"}</option>
                {options.owners
                  .filter(
                    (s) =>
                      s.teamID ===
                      Number(options.role === "admin" ? values("teamID") : options.teamID),
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {draft.action === "saveContact" && (
            <>
              {field("name", "联系人姓名", true)}
              {field("email", "邮箱", false, "email", 254)}
              {field("phone", "电话", false, "tel", 100)}
              {field("jobTitle", "职务（可选）", false, "text", 100)}
            </>
          )}
          {["linkInquiry", "revokeInquiryLink", "archiveClient", "archiveContact"].includes(
            draft.action,
          ) && (
            <label>
              核对依据或原因（10–2000字）
              <textarea
                required
                minLength={10}
                maxLength={2000}
                value={values("reason")}
                onChange={(e) => setValue("reason", e.target.value)}
              />
            </label>
          )}
          <button type="submit">确认{draft.title}</button>
          <button
            type="button"
            onClick={() => {
              onCancel();
            }}
          >
            取消
          </button>
        </fieldset>
      </form>
    </section>
  );
}
