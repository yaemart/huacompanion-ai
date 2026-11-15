// All queries receive the authenticated scope, inclusive month start and exclusive reporting cutoff.
export const monthlyIncidents = `
  SELECT i.id, i.source, i.state, f.active, f.notified_at AS "notifiedAt",
         f.appeal_at AS "appealAt", f.resolved_at AS "resolvedAt"
  FROM performance_incidents i
  LEFT JOIN performance_findings f
    ON f.incident_id = i.id AND ($1::integer IS NULL OR f.staff_id = $1)
  WHERE (
    i.state = 'pending' AND i.created_at >= $2 AND i.created_at < $3
    AND ($1 IS NULL OR i.reported_by = $1)
  ) OR (
    i.state = 'confirmed' AND i.duplicate_of IS NULL AND i.first_confirmed_at >= $2 AND i.first_confirmed_at < $3
    AND ($1 IS NULL OR (f.active AND i.responsibility = 'company'))
  )
  ORDER BY i.id DESC
`;

export const monthlyResponses = `
  WITH responses AS (
    SELECT q.id AS inquiry, q.created_at AS opened, m.created_at AS responded, m.staff_id AS staff, 1 AS kind, m.id
    FROM support_messages m
    JOIN support_conversations c ON c.id = m.conversation_id
    JOIN LATERAL (
      SELECT min(i.id) AS id, min(i.created_at) AS created_at
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(c.inquiry_links) = 'array' THEN c.inquiry_links ELSE '[]'::jsonb END
      ) link
      JOIN inquiries i ON i.reference = link->>'reference' AND i.created_at <= m.created_at
      HAVING count(DISTINCT i.id) = 1
    ) q ON true
    WHERE m.author = 'staff' AND m.visibility = 'public' AND m.staff_id IS NOT NULL
      AND m.created_at >= q.created_at AND m.created_at < $3::timestamptz
    UNION ALL
    SELECT q.id, q.created_at, v.sent_at, e.actor_id, 2, v.id
    FROM service_quotes v
    JOIN service_cases c ON c.id = v.service_case_id
    JOIN inquiries q ON q.id = c.inquiry_id
    LEFT JOIN LATERAL (
      SELECT actor_id FROM service_events
      WHERE service_case_id = c.id AND action = 'send' AND detail->>'quote' = v.id::text
      ORDER BY id LIMIT 1
    ) e ON true
    WHERE v.sent_at >= q.created_at AND v.sent_at < $3
  ), first_response AS (
    SELECT DISTINCT ON (inquiry) opened, responded, staff
    FROM responses ORDER BY inquiry, responded, kind, id
  )
  SELECT count(*)::integer AS samples,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM responded - opened) / 60) AS minutes
  FROM first_response
  WHERE responded >= $2 AND staff IS NOT NULL AND ($1::integer IS NULL OR staff = $1)
`;

export const monthlyReviews = `
  WITH review_events AS (
    SELECT 'content' AS kind, draft_id::text AS draft, revision::text AS version,
           id, action, actor AS staff, created_at AS happened
    FROM content_events WHERE action IN ('submit', 'return', 'publish') AND created_at < $3::timestamptz
    UNION ALL
    SELECT entity, "after"->>'draft',
           CASE WHEN action = 'submit' THEN "after"->>'revision' ELSE "before"->>'revision' END,
           id, action, actor_id, created_at
    FROM audit_events
    WHERE entity IN ('policy-group', 'policy-note') AND action IN ('submit', 'return', 'publish') AND created_at < $3
    UNION ALL
    SELECT 'quote', service_case_id::text, detail->>'quote', id,
           CASE WHEN action = 'submit-review' THEN 'submit'
                WHEN detail->>'decision' = 'rejected' THEN 'return' ELSE 'publish' END,
           actor_id, created_at
    FROM service_events
    WHERE created_at < $3 AND (action = 'submit-review' OR (action = 'review' AND detail->>'decision' IN ('approved', 'rejected')))
  ), decisions AS (
    SELECT e.action, extract(epoch FROM e.happened - s.happened) / 60 AS minutes
    FROM review_events e
    LEFT JOIN LATERAL (
      SELECT happened, action FROM review_events
      WHERE kind = e.kind AND draft = e.draft AND (kind IN ('content', 'policy-group') OR version = e.version)
        AND (happened, id) < (e.happened, e.id)
      ORDER BY happened DESC, id DESC LIMIT 1
    ) s ON s.action = 'submit'
    WHERE e.action IN ('return', 'publish') AND e.staff IS NOT NULL AND e.happened >= $2
      AND ($1::integer IS NULL OR e.staff = $1)
  )
  SELECT count(*)::integer AS decisions, count(*) FILTER (WHERE action = 'return')::integer AS returned,
         count(minutes)::integer AS samples, percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) AS minutes
  FROM decisions
`;

export const monthlyFollowups = `
  WITH inquiry_history AS (
    SELECT * FROM audit_events WHERE entity = 'inquiries' AND created_at < $2::timestamptz
      AND (action = 'followup-appended' OR "after" ?| ARRAY['owner', 'nextFollowUp'])
  ), due_inquiries AS (
    SELECT record_id FROM inquiry_history
    GROUP BY record_id
    HAVING min(NULLIF("after"->>'nextFollowUp', '')::timestamptz) < $2
      AND ($1::integer IS NULL OR bool_or("after"->>'owner' = $1::integer::text))
  )
  SELECT a.record_id AS inquiry, a.created_at AS at, a.action, a.actor_id AS actor,
         a."after" ? 'owner' AS "ownerChanged", NULLIF(a."after"->>'owner', '')::integer AS owner,
         a."after" ? 'nextFollowUp' AS "dueChanged", NULLIF(a."after"->>'nextFollowUp', '')::timestamptz AS due
  FROM inquiry_history a JOIN due_inquiries d USING (record_id)
  ORDER BY a.record_id, a.created_at, a.id
`;

export const monthlyReviewTasks = `
  SELECT COALESCE(e.recipient_id, CASE WHEN changes.assignment IS NULL THEN t.assignee_id END) AS assignee,
         COALESCE(e.due_at, CASE WHEN changes.deadline IS NULL THEN t.due_at END) AS due,
         t.history
  FROM workflow_tasks t
  LEFT JOIN workflow_events e ON e.key = t.key
  CROSS JOIN LATERAL (
    SELECT bool_or(true) FILTER (WHERE h->>'action' IN ('claim', 'assign', 'system-unassign')) AS assignment,
           bool_or(true) FILTER (WHERE h->>'action' = 'postpone') AS deadline,
           bool_or(h->>'assignee' = $1::integer::text) AS has_staff
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.history) = 'array' THEN t.history ELSE '[]'::jsonb END) h
  ) changes
  WHERE t.created_at < $2::timestamptz
    AND (t.key LIKE 'quality:%' OR t.key LIKE 'policy-review:%' OR t.key LIKE 'policy-note-review:%')
    AND ($1::integer IS NULL OR t.assignee_id = $1::integer OR e.recipient_id = $1::integer OR changes.has_staff)
    AND (t.status <> 'done' OR jsonb_typeof(t.history) = 'array' AND jsonb_array_length(t.history) > 0)
`;
