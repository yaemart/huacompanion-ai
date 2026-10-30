# AI Customer Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Deliver website customer support, scoped staff workbench, durable AI jobs and confirmed business/housekeeping intake.
**Architecture:** Reuse inquiries and Payload permissions. Add scoped conversations, append-only messages, customer references and durable model runs; browser capability cookie protects anonymous access. All mutations use server transactions and locks; model output cannot execute arbitrary tools.
**Tech Stack:** Next.js, React, Payload, PostgreSQL, TypeScript.
**Spec:** docs/superpowers/specs/2026-10-30-customer-service-design.md (approved).

## Global Constraints
Seven languages; no external messaging, payments or automatic booking. No email-based anonymous lookup. No model access to internal notes or unrelated customer data. No fake model replies when unconfigured. Keep local existing development branch and preserve AGENTS.md.

## Review Focus
- Concurrent human takeover suppresses late model output: task 3 race test.
- Duplicate confirmation creates one inquiry: task 2 integration test.
- Another visitor/staff team cannot read messages or internal notes: task 2 scope test.
- Expired model jobs recover without duplicate public output: task 3 lease test.
- Missing model configuration still permits human support: task 4 browser/API test.

### Task 1: domain and persistence
Files: src/lib/support.ts, src/lib/support-copy.ts, src/cms/support/collections.ts, src/payload.config.ts, tests/support.test.ts.
Interfaces: supportScope(user):Where|boolean; publicConversation and publicMessage whitelist; validateMessage; transition mode ai/waiting/human and status open/waiting-customer/resolved; conversation revision integer.
- [x] Write tests asserting whitespace/oversized messages rejected and public projection excludes secret/note/customer metadata.
- [x] Run node --experimental-strip-types --test tests/support.test.ts; expect missing module RED.
- [x] Implement domain, seven-language labels, collections with denied direct writes and scoped reads; generate types and additive migration after backup.
- [x] Run same test PASS and typecheck; record progress.

### Task 2: transactional API and workbench operations
Files: src/server/support/service.ts, src/server/support/auth.ts, src/app/(frontend)/api/support/route.ts, src/app/(frontend)/api/support/staff/route.ts, tests/integration/support.ts.
Interfaces: visitorAction(p,visitorHash,input), staffAction(p,user,input), visitorRead(p,hash,id), staffRead(p,user,id?), supportTransaction(p,fn).
- [x] Integration RED: create/retry message, different visitor denied, internal note omitted, editor denied, confirmed inquiry retry returns same reference.
- [x] Implement capability cookie, origin/body/rate limits, append-only messages, explicit AI consent, manual handoff, team/owner assignment and revision checks. Support confirmation uses existing saveIntake validation and deterministic idempotency; only public inquiry progress projected.
- [x] Run integration PASS; preserve existing scope behavior.

### Task 3: durable AI worker
Files: src/server/support/agent.ts, scripts/support-worker.ts, tests/integration/support-agent.ts, package.json.
Interfaces: runSupportJob(p,adapter?), adapter.run(input,{signal,maxOutputTokens}):Promise<{reply,sourceIds,summary?,handoff?,usage}>. Production adapter uses documented configurable HTTPS JSON endpoint, secret only server-side. No vendor chosen implicitly.
- [x] RED tests: unconfigured fails safely, takeover suppresses late reply, invalid source discarded, expired lease invalidated, conversation/global budgets enforced.
- [x] Implement published-content retrieval, prompt boundaries, citations and source revalidation, durable leases, version fencing, timeout, conservative per-day token reservation and per-conversation cap. Failures go to human queue; no automatic repeat charge after uncertain execution.
- [x] Worker --once/continuous handles queued jobs independently of browser. Run tests PASS.

### Task 4: client experience and integration
Files: src/components/support/SupportChat.tsx, SupportDesk.tsx, src/app/(frontend)/support-center/page.tsx, locale route, Header, src/app/(frontend)/globals.css (actual stylesheet path confirmed before edit).
- [x] API tests verify consent, seven-language paths and unavailable-model messaging before UI completion.
- [x] Add localized entry, durable conversation list and messaging, AI identity/consent, human handoff, confirmed business/home intake via existing InquiryForm linked to owned conversation; staff queues, public reply/internal notes, claim/assign, follow-up, resumeAI, close/reopen. No attachment or unverified order lookup.
- [x] Browser verify visitor and staff flows; npm test, typecheck, build, integration + existing intake/catalog regressions PASS.

### Task 5: review and handover
Files: docs/customer-support.md, migrations, plan ledger.
- [x] Fresh whole-branch review per execution skill, fix material findings with regression tests.
- [x] Migration test, local runtime and HTTP checks; document worker/model setup, retention limitations and no external email.
- [x] Commit task changes only, provide concrete links and limitations.
