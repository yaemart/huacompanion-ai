import { followupLabel, type FollowUp } from "../lib/intake-followups";
export function FollowUpHistory({ rows }: { rows: FollowUp[] }) {
  return rows.length ? (
    <ol>
      {rows.map((row) => (
        <li key={row.id} style={{ marginBottom: 16, overflowWrap: "anywhere" }}>
          <strong>{followupLabel(row)}</strong>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.body}</p>
        </li>
      ))}
    </ol>
  ) : (
    <p>暂无跟进记录。</p>
  );
}
