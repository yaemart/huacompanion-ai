"use client";
import { useState, type FormEvent } from "react";
import type { IncidentAction, ReviewRow } from "./PerformanceDesk";
import { dutyLabels, type IncidentDuty } from "../../lib/performance-incidents";

type Props = { row: ReviewRow; busy: boolean; act: IncidentAction };
export function submit(event: FormEvent<HTMLFormElement>, action: (form: FormData) => void) {
  event.preventDefault();
  action(new FormData(event.currentTarget));
}

function Duty({ name, duties }: { name: string; duties: IncidentDuty[] }) {
  return (
    <label>
      责任环节
      <select name={name}>
        {duties.map((duty) => (
          <option key={duty} value={duty}>
            {dutyLabels[duty]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DecisionForm({ row, busy, act }: Props) {
  const [state, setState] = useState("confirmed");
  const [responsibility, setResponsibility] = useState("unassigned");
  const [selected, setSelected] = useState<number[]>([]);
  const service = row.source === "case";
  const attach = state === "confirmed" && responsibility === "company";
  return (
    <form
      onSubmit={(event) =>
        submit(
          event,
          (form) =>
            void act({
              action: "decide",
              id: row.id,
              state,
              responsibility,
              duplicateOf: form.get("duplicateOf"),
              redacted: form.has("redacted"),
              reason: form.get("reason"),
              findings: attach
                ? selected.map((staff) => ({
                    staff,
                    duty: form.get(`duty-${staff}`),
                    summary: form.get(`summary-${staff}`),
                  }))
                : [],
            }),
        )
      }
    >
      <fieldset disabled={busy}>
        <legend>首次判定</legend>
        {!row.completeHistory && <p>原记录不完整。用于个人判定前请先补齐当时的责任或发布记录。</p>}
        <label>
          判定结果
          <select value={state} onChange={(event) => setState(event.target.value)}>
            <option value="confirmed">成立</option>
            <option value="dismissed">不成立或重复</option>
          </select>
        </label>
        {state === "confirmed" && (
          <label>
            归属
            <select
              value={responsibility}
              onChange={(event) => setResponsibility(event.target.value)}
            >
              <option value="unassigned">成立，尚无法归责</option>
              {service && <option value="supplier">供应商单方责任</option>}
              <option value="company">华伴责任</option>
            </select>
          </label>
        )}
        {attach && (
          <fieldset>
            <legend>事发时相关员工</legend>
            {!row.people.length && <p>尚无可核对的相关人员记录。</p>}
            {row.people.map(({ id, name, duties }) => (
              <div key={id}>
                <label>
                  <input
                    type={service ? "radio" : "checkbox"}
                    name="staff"
                    checked={selected.includes(id)}
                    onChange={(event) =>
                      setSelected(
                        service
                          ? [id]
                          : event.target.checked
                            ? [...selected, id]
                            : selected.filter((staff) => staff !== id),
                      )
                    }
                  />{" "}
                  {name}
                </label>
                {selected.includes(id) && (
                  <>
                    <Duty name={`duty-${id}`} duties={duties} />
                    <label>
                      给本人的说明
                      <textarea name={`summary-${id}`} maxLength={1000} required />
                    </label>
                  </>
                )}
              </div>
            ))}
            <p>这里只写给本人看的判定理由和去隐私摘要。请勿填写客户姓名、联系方式或原话。</p>
            {!!selected.length && (
              <label>
                <input type="checkbox" name="redacted" required /> 已移除客户信息
              </label>
            )}
            {service && selected.length === 1 && (
              <button type="button" onClick={() => setSelected([])}>
                取消个人归属
              </button>
            )}
          </fieldset>
        )}
        {state === "dismissed" && (
          <label>
            原登记编号（判为重复时填写）
            <input name="duplicateOf" type="number" min={1} />
          </label>
        )}
        <label>
          内部判定理由与凭据
          <textarea name="reason" maxLength={2000} required />
        </label>
        <button>保存判定</button>
      </fieldset>
    </form>
  );
}

export function AppealReview({ row, finding, busy, act }: Props & { finding: number }) {
  const [result, setResult] = useState("upheld");
  const [staff, setStaff] = useState("");
  const other = row.people.filter(({ id }) => !row.findings.some((item) => item.staff === id));
  return (
    <form
      onSubmit={(event) =>
        submit(
          event,
          (form) =>
            void act({
              action: "resolve",
              id: row.id,
              finding,
              result,
              reason: form.get("reason"),
              summary: form.get("summary"),
              redacted: form.has("redacted"),
              ...(result === "changed" &&
                staff && {
                  replacement: {
                    staff,
                    duty: form.get("duty"),
                    summary: form.get("replacementSummary"),
                  },
                }),
            }),
        )
      }
    >
      <fieldset disabled={busy}>
        <legend>独立复核</legend>
        <label>
          复核结果
          <select value={result} onChange={(event) => setResult(event.target.value)}>
            <option value="upheld">维持本人的归属</option>
            <option value="changed">更正本人的归属</option>
            <option value="dismissed">撤销整条判定</option>
          </select>
        </label>
        {result === "changed" && (
          <>
            <label>
              调整归属
              <select value={staff} onChange={(event) => setStaff(event.target.value)}>
                <option value="">移除本人的归属</option>
                {other.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            {staff && (
              <>
                <Duty
                  name="duty"
                  duties={other.find((person) => String(person.id) === staff)?.duties || []}
                />
                <label>
                  给新当事员工的说明
                  <textarea name="replacementSummary" maxLength={1000} required />
                </label>
              </>
            )}
          </>
        )}
        <label>
          给本人的复核说明
          <textarea name="summary" maxLength={1000} required />
        </label>
        <label>
          <input type="checkbox" name="redacted" required /> 已移除客户信息
        </label>
        <label>
          内部复核依据
          <textarea name="reason" maxLength={2000} required />
        </label>
        <button>保存复核结果</button>
      </fieldset>
    </form>
  );
}
