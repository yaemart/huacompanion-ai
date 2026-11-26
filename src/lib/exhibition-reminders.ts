import { createHash } from "node:crypto";
import type { ContentBody } from "./content-model.ts";
import type { Subscription } from "../../payload-types.ts";
import { customerEmail, customerHash } from "./customer.ts";
import { exhibitionPath, validExhibitionDate, type Exhibition } from "./exhibitions.ts";

export const reminderHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type ReminderScope = { key: string; locale: "zh" | "en" };
type Snapshot = Pick<ContentBody, "contentKey" | "locale" | "title"> &
  Pick<Exhibition, "startDate" | "endDate" | "venue" | "address"> & {
    id: number;
    revision: number;
    path: string;
  };
export type ReminderBody = {
  status: "local-held" | "local-cancelled";
  snapshot: Snapshot;
  offset: 30 | 7;
  nominalDate: string;
  consentVersion: number;
  recipientHash: string;
  actor?: number;
  cancelledAt?: string;
  cancelledBy?: number;
  reason?: string;
};
export type ReminderState = {
  source?: { id: number; revision: number; body: ContentBody };
  subscriptions: Pick<
    Subscription,
    | "id"
    | "email"
    | "topic"
    | "locale"
    | "status"
    | "consentVersion"
    | "privacyVersion"
    | "confirmedAt"
    | "consentedAt"
  >[];
  jobs: { id: number; key: string; subscription: number; body: ReminderBody }[];
  suppressed: string[];
};

export function planExhibitionReminder(
  state: ReminderState,
  scope: ReminderScope,
  today: string,
  privacy: string,
) {
  scope = { key: scope.key, locale: scope.locale };
  if (!validExhibitionDate(today)) throw Error("提醒业务日期无效");
  const s = state.source,
    b = s?.body,
    e = b?.exhibition;
  const valid =
    b?.kind === "exhibition" &&
    b.locale === scope.locale &&
    b.contentKey === scope.key &&
    Number.isSafeInteger(s?.revision) &&
    s!.revision > 0 &&
    e?.status === "announced" &&
    validExhibitionDate(e.startDate) &&
    validExhibitionDate(e.endDate) &&
    e.startDate <= e.endDate &&
    e.startDate > today;
  const snapshot: Snapshot | undefined = valid
    ? {
        id: s!.id,
        revision: s!.revision,
        contentKey: scope.key,
        locale: scope.locale,
        title: b!.title,
        startDate: e!.startDate,
        endDate: e!.endDate,
        venue: e!.venue,
        address: e!.address,
        path: exhibitionPath(b!),
      }
    : undefined;
  const days = snapshot ? (Date.parse(snapshot.startDate) - Date.parse(today)) / 86400000 : 0;
  const offset: 30 | 7 | null = days === 30 || days === 7 ? days : null;
  const seen = new Set<string>(),
    excluded: Record<string, number> = {};
  const eligible: { subscription: number; recipientHash: string; consentVersion: number }[] = [];
  const ordered = [...state.subscriptions]
    .filter((s) => s.topic === `exhibition:${scope.key}`)
    .sort((a, b) => Date.parse(b.consentedAt) - Date.parse(a.consentedAt) || b.id - a.id);
  for (const row of ordered) {
    let email: string;
    try {
      email = customerEmail(row.email);
    } catch {
      excluded.invalid = (excluded.invalid || 0) + 1;
      continue;
    }
    const hash = customerHash(email);
    const reason = seen.has(email)
      ? "duplicate"
      : row.status !== "confirmed" ||
          !row.confirmedAt ||
          !Number.isSafeInteger(row.consentVersion) ||
          row.consentVersion < 1
        ? "unconfirmed"
        : row.locale !== scope.locale
          ? "language"
          : !privacy || row.privacyVersion !== privacy
            ? "privacy"
            : state.suppressed.includes(hash)
              ? "suppressed"
              : null;
    seen.add(email);
    if (reason) excluded[reason] = (excluded[reason] || 0) + 1;
    else
      eligible.push({
        subscription: row.id,
        recipientHash: hash,
        consentVersion: row.consentVersion,
      });
  }
  const desired =
    snapshot && offset
      ? eligible.map((row) => ({
          key: reminderHash([
            1,
            scope,
            snapshot.id,
            snapshot.revision,
            snapshot.startDate,
            offset,
            row,
          ]),
          subscription: row.subscription,
          body: {
            status: "local-held" as const,
            snapshot,
            offset,
            nominalDate: today,
            consentVersion: row.consentVersion,
            recipientHash: row.recipientHash,
          },
        }))
      : [];
  const wanted = new Set(desired.map((row) => row.key)),
    existing = new Map(state.jobs.map((row) => [row.key, row]));
  const current = desired.filter((row) => existing.get(row.key)?.body.status !== "local-cancelled");
  if (current.length > 1000) throw Error("合资格订阅超过1000，本次未生成");
  const create = current.filter((row) => !existing.has(row.key));
  const cancel = state.jobs
    .filter((row) => row.body.status === "local-held" && !wanted.has(row.key))
    .map((row) => ({
      id: row.id,
      reason: !snapshot
        ? "source-unavailable"
        : row.body.snapshot.id !== snapshot.id || row.body.snapshot.revision !== snapshot.revision
          ? "source-changed"
          : row.body.offset !== offset
            ? "window-changed"
            : "recipient-ineligible",
    }));
  return {
    snapshot,
    offset,
    create,
    cancel,
    counts: {
      subscribers: eligible.length,
      eligible: current.length,
      terminal: desired.length - current.length,
      create: create.length,
      existing: current.length - create.length,
      cancel: cancel.length,
      excluded,
    },
    fingerprint: reminderHash({
      scope,
      today,
      privacy,
      source: state.source,
      subscriptions: [...state.subscriptions].sort((a, b) => a.id - b.id),
      jobs: [...state.jobs].sort((a, b) => a.id - b.id),
      suppressed: [...state.suppressed].sort(),
    }),
  };
}
