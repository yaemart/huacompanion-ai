import { staffDateTime, staffVersion } from "@/lib/staff-display";
import {
  scorecardMetrics,
  scorecardTemplates,
  scorecardObservationLabels,
  scorecardReviewLabels,
} from "@/lib/staff-scorecard";
import type { readScorecardObservation } from "@/server/performance/scorecard-observation";

type Observation = Awaited<ReturnType<typeof readScorecardObservation>>;
const numbers = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

export function ScorecardObservation({
  observation,
  individual,
}: {
  observation: Observation;
  individual: boolean;
}) {
  return (
    <section aria-labelledby="scorecard-observation" className="scorecard">
      <h2 id="scorecard-observation">月度评分卡 · 观察记录</h2>
      {!observation && <p>该月尚未安排观察规则。现有月报继续记录。</p>}
      {observation && (
        <>
          <p>
            {observation.mode === "trial" ? "试行期" : "记录模式"} · {observation.effectiveMonth}{" "}
            起采用{staffVersion(observation.version)}
          </p>
          <p>本阶段只记录指标、样本和复核结果。正式评分待另行确认。</p>
          {!individual ? (
            <p>选择员工可查看该月的个人观察记录。</p>
          ) : !observation.template ? (
            <p>该月尚未分配职责模板。</p>
          ) : null}
          {observation.template && observation.metrics && observation.coverage && (
            <>
              <h3>{scorecardTemplates[observation.template]}模板</h3>
              <p>
                样本覆盖原配置权重 {observation.coverage.weight}% · {observation.coverage.items}{" "}
                项样本满足
              </p>
              <p>
                {observation.coverage.waiting
                  ? "有已归属本人的待定记录。"
                  : observation.coverage.sufficient
                    ? "已达到建议样本门槛。"
                    : "建议门槛为两项且覆盖权重至少 70%。"}
              </p>
              <div
                className="scorecard-table-scroll"
                tabIndex={0}
                role="region"
                aria-label="指标及样本观察记录"
              >
                <table className="scorecard-table">
                  <thead>
                    <tr>
                      {["指标", "实际值", "达标值", "样本／最低", "权重", "状态"].map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {observation.metrics.map(({ key, value, samples, status, rule, pending }) => {
                      const metric = scorecardMetrics[key];
                      return (
                        <tr key={key}>
                          <th scope="row">{metric.label}</th>
                          <td>{value === null ? "—" : numbers.format(value) + metric.unit}</td>
                          <td>
                            {rule.weight
                              ? (metric.higher ? "≥ " : "≤ ") + rule.target + metric.unit
                              : "—"}
                          </td>
                          <td>
                            {samples ?? "—"}
                            {rule.weight ? ` / ${rule.minimum}` : ""}
                          </td>
                          <td>{rule.weight}%</td>
                          <td>
                            {scorecardObservationLabels[status]}
                            {status === "pending" ? `（${pending}）` : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!!observation.corrections?.length && (
            <>
              <h3>本月归属的复核更新</h3>
              <ul>
                {observation.corrections.map(({ id, result, at }, index) => (
                  <li key={`${id}:${at}:${index}`}>
                    <a href={`/performance-center?id=${id}`}>记录 #{id}</a> ·{" "}
                    {scorecardReviewLabels[result]} · {staffDateTime(at)}（北京时间）
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
