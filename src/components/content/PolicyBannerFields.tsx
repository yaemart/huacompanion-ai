"use client";
import React from "react";
import type { Block } from "../../lib/content-model";
export function PolicyBannerFields({
  value,
  onChange,
}: {
  value: Block;
  onChange: (patch: Partial<Block>) => void;
}) {
  return (
    <fieldset>
      <legend>政策状态横幅</legend>
      <label>
        政策内容标识（contentKey）
        <input
          value={value.text || ""}
          maxLength={100}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.policyUnconfirmed === true}
          onChange={(event) => onChange({ policyUnconfirmed: event.target.checked })}
        />
        明确标记为尚未确认
      </label>
      <small>
        填写入境政策的内容标识，不是国家代码或数据库数字ID。仅读取同语言已发布快照；引用随本文审核发布。工具关闭时不显示横幅。
      </small>
    </fieldset>
  );
}
