-- Diagnose where a user's data ended up after the org backfill migration.
-- Usage:
--   psql -h localhost -p 5433 -U postgres -d postgres \
--     -v user_email="'YOUR_EMAIL@example.com'" \
--     -f scripts/diagnose-org-data.sql
--
-- If you don't know psql variable substitution, just replace :user_email
-- with the literal email string in single quotes.

\echo '== User identity =='
SELECT id, email, display_name, roles FROM users WHERE email = :user_email;

\echo ''
\echo '== Memberships (all, including hidden orgs) =='
SELECT
  m.organisation_id,
  o.slug,
  o.name,
  m.role,
  m.accepted_at,
  CASE WHEN o.slug IN ('personal-athletes', 'system') THEN 'HIDDEN' ELSE 'visible' END AS visibility
FROM organisation_memberships m
JOIN organisations o ON o.id = m.organisation_id
WHERE m.user_id = (SELECT id FROM users WHERE email = :user_email)
ORDER BY m.accepted_at NULLS LAST;

\echo ''
\echo '== Data ownership: where did your workouts / plans / schedules land? =='
SELECT 'workouts' AS table, o.slug, o.name, COUNT(*) AS rows
FROM workouts w
JOIN organisations o ON o.id = w.organisation_id
WHERE w.user_id = (SELECT id FROM users WHERE email = :user_email)
GROUP BY o.slug, o.name
UNION ALL
SELECT 'workout_plans', o.slug, o.name, COUNT(*)
FROM workout_plans wp
JOIN organisations o ON o.id = wp.organisation_id
WHERE wp.user_id = (SELECT id FROM users WHERE email = :user_email)
GROUP BY o.slug, o.name
UNION ALL
SELECT 'workout_schedules', o.slug, o.name, COUNT(*)
FROM workout_schedules ws
JOIN organisations o ON o.id = ws.organisation_id
WHERE ws.user_id = (SELECT id FROM users WHERE email = :user_email)
GROUP BY o.slug, o.name
UNION ALL
SELECT 'exercises', o.slug, o.name, COUNT(*)
FROM exercises e
JOIN organisations o ON o.id = e.organisation_id
WHERE e.user_id = (SELECT id FROM users WHERE email = :user_email)
GROUP BY o.slug, o.name
ORDER BY 1, 2;
