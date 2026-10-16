-- Read-only lock monitor for the Phase 9D staging concurrency test.
-- Run from a third privileged connection while Session B is waiting.
-- Replace PIDs if the two psql connections were restarted.

WITH expected AS (
  SELECT
    (pg_catalog.hashtext('2e33f3a7-61e6-4971-8c2e-4dc817df7937')::bigint & 4294967295)::oid AS lock_classid,
    (pg_catalog.hashtext('aabf8133-3ff1-4a6c-8b7c-c0fd91a02e01')::bigint & 4294967295)::oid AS lock_objid,
    59977::integer AS session_a_pid,
    60724::integer AS session_b_pid
)
SELECT a.pid, a.state, a.wait_event_type, a.wait_event,
       l.locktype, l.mode, l.granted, l.classid, l.objid, l.objsubid
FROM expected AS e
JOIN pg_locks AS l
  ON l.locktype = 'advisory'
 AND l.classid = e.lock_classid
 AND l.objid = e.lock_objid
 AND l.objsubid = 2
JOIN pg_stat_activity AS a ON a.pid = l.pid
WHERE a.pid IN (e.session_a_pid, e.session_b_pid)
ORDER BY a.pid, l.granted DESC;

WITH expected AS (
  SELECT
    (pg_catalog.hashtext('2e33f3a7-61e6-4971-8c2e-4dc817df7937')::bigint & 4294967295)::oid AS lock_classid,
    (pg_catalog.hashtext('aabf8133-3ff1-4a6c-8b7c-c0fd91a02e01')::bigint & 4294967295)::oid AS lock_objid,
    59977::integer AS session_a_pid,
    60724::integer AS session_b_pid
),
observed AS (
  SELECT l.pid, l.granted, a.wait_event_type, a.wait_event
  FROM expected AS e
  JOIN pg_locks AS l
    ON l.locktype = 'advisory'
   AND l.classid = e.lock_classid
   AND l.objid = e.lock_objid
   AND l.objsubid = 2
  JOIN pg_stat_activity AS a ON a.pid = l.pid
  WHERE l.pid IN (e.session_a_pid, e.session_b_pid)
)
SELECT CASE
  WHEN EXISTS (
         SELECT 1 FROM observed
         WHERE pid = 59977 AND granted
       )
   AND EXISTS (
         SELECT 1 FROM observed
         WHERE pid = 60724 AND NOT granted
           AND wait_event_type = 'Lock' AND wait_event = 'advisory'
       )
  THEN 'PASS: Session A holds the expected advisory lock and Session B waits for it'
  ELSE 'NOT VERIFIED: expected A-held/B-waiting advisory lock was not observed'
END AS lock_check;
