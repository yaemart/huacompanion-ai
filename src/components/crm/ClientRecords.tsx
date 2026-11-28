import type { View, OpenClientAction } from "./types";
import { Pager } from "./Pager";
export function ClientRecords({
  view,
  locked,
  editing,
  onOpen,
  onRefresh,
  onPage,
}: {
  view: View;
  locked: boolean;
  editing: boolean;
  onOpen: OpenClientAction;
  onRefresh: () => void;
  onPage: (pages: { contacts: number; links: number; candidates: number }) => void;
}) {
  const active = view.client.status === "active",
    open = onOpen;
  const base = () => ({ clientID: view.client.id, expectedClientRevision: view.client.revision });
  const loadView = (id: number, pages?: { contacts: number; links: number; candidates: number }) =>
    pages ? onPage(pages) : onRefresh();
  return (
    <>
      <div className="crm-actions">
        <button disabled={locked} onClick={() => void loadView(view.client.id)}>
          刷新详情
        </button>
        <button
          disabled={locked || !active}
          onClick={() =>
            open(
              "updateClient",
              "修改客户资料",
              { clientID: view.client.id, expectedRevision: view.client.revision },
              {
                displayName: view.client.displayName,
                language: view.client.language,
                countryCode: view.client.countryCode || "",
              },
            )
          }
        >
          修改资料
        </button>
        <button
          disabled={locked || !active}
          onClick={() =>
            open("archiveClient", "存档客户", {
              clientID: view.client.id,
              expectedRevision: view.client.revision,
            })
          }
        >
          存档客户
        </button>
      </div>
      <h3>联系人</h3>
      <button
        disabled={locked || !active}
        onClick={() => open("saveContact", "新增联系人", base())}
      >
        新增联系人
      </button>
      <ul className="crm-cards">
        {view.contacts.items.map((c) => (
          <li key={c.id}>
            <strong>
              {c.name}
              {c.isPrimary ? " · 主联系人" : ""}
            </strong>
            <p>
              {c.email || "未填邮箱"} · {c.phone || "未填电话"}
            </p>
            <p>{c.jobTitle}</p>
            <div className="crm-actions">
              <button
                disabled={locked || !active}
                onClick={() =>
                  open(
                    "saveContact",
                    "修改联系人",
                    { ...base(), contactID: c.id, expectedRevision: c.revision },
                    {
                      name: c.name,
                      email: c.email || "",
                      phone: c.phone || "",
                      jobTitle: c.jobTitle || "",
                    },
                  )
                }
              >
                修改联系人
              </button>
              <button
                disabled={locked || !active || c.isPrimary}
                onClick={() =>
                  open("setPrimaryContact", "设为主联系人", {
                    ...base(),
                    contactID: c.id,
                  })
                }
              >
                设为主联系人
              </button>
              <button
                disabled={locked || !active}
                onClick={() =>
                  open("archiveContact", "存档联系人", {
                    ...base(),
                    contactID: c.id,
                    expectedRevision: c.revision,
                  })
                }
              >
                存档联系人
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Pager
        label="联系人"
        data={view.contacts}
        disabled={locked || editing}
        onPage={(n) =>
          void loadView(view.client.id, {
            contacts: n,
            links: view.links.page,
            candidates: view.candidates.page,
          })
        }
      />
      <h3>关联咨询</h3>
      <p>有旧客户访问授权时，撤销会被阻止；请先由有权员工核对。</p>
      <ul className="crm-cards">
        {view.links.items.map((l) => (
          <li key={l.linkID}>
            <strong>
              {l.name} · {l.reference}
            </strong>
            {l.serviceCase && (
              <p>
                <a
                  href={`/business-center?id=${l.serviceCase.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开服务单：{l.serviceCase.title}
                </a>
              </p>
            )}
            <button
              disabled={locked || !active}
              onClick={() =>
                open("revokeInquiryLink", "撤销内部关联", {
                  ...base(),
                  linkID: l.linkID,
                  expectedRevision: l.linkRevision,
                })
              }
            >
              撤销关联
            </button>
          </li>
        ))}
      </ul>
      <Pager
        label="关联咨询"
        data={view.links}
        disabled={locked || editing}
        onPage={(n) =>
          void loadView(view.client.id, {
            contacts: view.contacts.page,
            links: n,
            candidates: view.candidates.page,
          })
        }
      />
      <h3>可关联咨询</h3>
      <ul className="crm-cards">
        {view.candidates.items.map((c) => (
          <li key={c.inquiryID}>
            <strong>
              {c.name} · {c.reference}
            </strong>
            <button
              disabled={locked || !active}
              onClick={() =>
                open("linkInquiry", "关联咨询", {
                  ...base(),
                  inquiryID: c.inquiryID,
                  expectedLinkRevision: c.expectedLinkRevision,
                })
              }
            >
              关联此咨询
            </button>
          </li>
        ))}
      </ul>
      <Pager
        label="可关联咨询"
        data={view.candidates}
        disabled={locked || editing}
        onPage={(n) =>
          void loadView(view.client.id, {
            contacts: view.contacts.page,
            links: view.links.page,
            candidates: n,
          })
        }
      />
    </>
  );
}
