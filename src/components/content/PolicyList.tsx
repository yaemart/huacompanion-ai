"use client";
import React, { useState } from "react";
import {
  filterPolicyRows,
  sortPolicyRows,
  policyStateLabels,
  policyTypeLabels,
  type PolicyListRow,
  type PolicyListFilter,
  type PolicyListSort,
} from "@/lib/immigration-policy-list";
const columns: { key: PolicyListSort; label: string }[] = [
  { key: "country", label: "国家" },
  { key: "policyType", label: "类型" },
  { key: "reviewState", label: "状态" },
  { key: "validUntil", label: "截止日" },
  { key: "lastVerifiedOn", label: "核实日" },
];
export function PolicyList({
  rows,
  today,
  selectedId,
  disabled,
  onSelect,
}: {
  rows: PolicyListRow[];
  today: string;
  selectedId?: number;
  disabled: boolean;
  onSelect: (id: number) => void;
}) {
  const [filter, setFilter] = useState<PolicyListFilter>("all");
  const [sort, setSort] = useState<PolicyListSort>("country");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const visible = sortPolicyRows(filterPolicyRows(rows, filter, today), sort, direction);
  function order(key: PolicyListSort) {
    setSort(key);
    setDirection(key === sort && direction === "asc" ? "desc" : "asc");
  }
  return (
    <>
      <label>
        筛选政策
        <select value={filter} onChange={(e) => setFilter(e.target.value as PolicyListFilter)}>
          <option value="all">全部状态</option>
          <option value="review">待审核</option>
          <option value="returned">已退回</option>
          <option value="expiring">30 天内到期</option>
        </select>
      </label>
      <p role="status">
        共 {visible.length} 条；到期筛选按中国日期 {today} 计算。
      </p>
      <div
        className="policy-table-scroll"
        role="region"
        aria-label="政策列表（可横向滚动）"
        tabIndex={0}
      >
        <table className="policy-list">
          <caption>政策工作稿；点击国家打开，点击列标题排序。</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sort === column.key
                      ? direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button type="button" onClick={() => order(column.key)}>
                    {column.label}
                    {sort === column.key ? (direction === "asc" ? " ↑" : " ↓") : " ↕"}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-current={selectedId === row.id ? "true" : undefined}
                    onClick={() => onSelect(row.id)}
                  >
                    {row.country || "国家待填写"}
                    <small>
                      {row.title} · {row.locale === "zh" ? "中文" : "English"}
                    </small>
                  </button>
                </td>
                <td>{row.policyType ? policyTypeLabels[row.policyType] : "待填写"}</td>
                <td>{policyStateLabels[row.reviewState]}</td>
                <td>{row.validUntil || "未填写"}</td>
                <td>{row.lastVerifiedOn || "未填写"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <p>没有符合条件的政策。</p>}
      </div>
    </>
  );
}
