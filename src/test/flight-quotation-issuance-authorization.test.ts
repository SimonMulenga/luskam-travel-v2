import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const originalMigrationPath = resolve(process.cwd(), "supabase/migrations/20261020100000_flight_quotation_booking_workflow.sql");
// This historical source has unresolved deployed-content provenance. When it is
// absent from a limited checkout, skip only the baseline-source audit below;
// never reconstruct or silently substitute historical SQL.
const originalMigrationAvailable = existsSync(originalMigrationPath);
const originalMigration = originalMigrationAvailable ? readFileSync(originalMigrationPath, "utf8") : "";
const forwardMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261020110000_flight_quotation_issue_and_revision_controls.sql"), "utf8");
const staffUi = readFileSync(resolve(process.cwd(), "src/components/admin/FlightQuotationOperations.tsx"), "utf8");

function functionBody(sql: string, name: string) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`, "i"));
  expect(match, `${name} function must exist`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("quotation issuance and post-issuance authorization regression", () => {
  it("documents the original issue-event INSERT arity defect and corrects it in the forward migration", () => {
    const fixedIssue = functionBody(forwardMigration, "issue_flight_quotation");
    expect(fixedIssue).toMatch(/INSERT INTO public\.flight_quotation_events\(quotation_id, actor_id, event_type, from_status, to_status, details\)\s*VALUES\s*\(\s*p_quotation_id,\s*auth\.uid\(\),\s*'issued',\s*'draft',\s*'issued',\s*jsonb_build_object\('validUntil', v_now \+ interval '24 hours'\)\s*\);/i);
    expect(fixedIssue).toMatch(/UPDATE public\.flight_quotations[\s\S]*?SET status = 'issued'[\s\S]*?valid_until = v_now \+ interval '24 hours'/i);
    expect(fixedIssue).toMatch(/RETURN jsonb_build_object\('id', p_quotation_id, 'status', 'issued', 'valid_until'/i);
  });

  it("limits revision initiation and post-issuance issue control to admins", () => {
    expect(forwardMigration).toMatch(/FUNCTION private\.assert_flight_ops_admin\(\)[\s\S]*?public\.has_role\(auth\.uid\(\), 'admin'::public\.app_role\)/i);

    const revise = functionBody(forwardMigration, "revise_flight_quotation");
    expect(revise).toMatch(/PERFORM private\.assert_flight_ops_admin\(\)/i);
    expect(revise).toMatch(/status IN \('issued', 'declined', 'expired', 'superseded'\)/i);
    expect(revise).toMatch(/'revision_created'[\s\S]*?'revisionOf'/i);
    expect(revise).toMatch(/revision > v_source_revision[\s\S]*?only the current quotation revision can be revised/i);

    const create = functionBody(forwardMigration, "create_flight_quotation_draft");
    expect(create).toMatch(/status <> 'draft'[\s\S]*?use the revision action/i);
    const edit = functionBody(forwardMigration, "edit_flight_quotation_draft");
    expect(edit).toMatch(/v_has_prior_issued boolean/i);
    expect(edit).toMatch(/IF v_has_prior_issued THEN\s+PERFORM private\.assert_flight_ops_admin\(\)/i);
    const issue = functionBody(forwardMigration, "issue_flight_quotation");
    expect(issue).toMatch(/status <> 'draft'[\s\S]*?only an admin can issue a revision/i);
    const expire = functionBody(forwardMigration, "expire_flight_quotation");
    expect(expire).toMatch(/PERFORM private\.assert_flight_ops_admin\(\)/i);

    expect(forwardMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_flight_quotation_draft[\s\S]*?TO authenticated/i);
  });

  it("enforces a single draft and serializes concurrent workflow creation per request", () => {
    expect(forwardMigration).toMatch(/DO \$\$[\s\S]*?HAVING count\(\*\) > 1[\s\S]*?issued\.status = 'issued'[\s\S]*?draft\.status = 'draft'[\s\S]*?quotation data needs owner review/i);
    expect(forwardMigration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS flight_quotations_one_draft_per_request[\s\S]*?WHERE status = 'draft'/i);
    const invariantTrigger = forwardMigration.match(/CREATE OR REPLACE FUNCTION private\.enforce_one_flight_quotation_draft\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";
    expect(invariantTrigger).toMatch(/pg_advisory_xact_lock\(hashtextextended\('flight-quotation:' \|\| NEW\.request_id::text, 0\)\)/i);
    expect(invariantTrigger).toMatch(/existing\.status IN \('draft', 'issued'\)/i);
    expect(forwardMigration).toMatch(/BEFORE INSERT OR UPDATE ON public\.flight_quotations/i);

    const create = functionBody(forwardMigration, "create_flight_quotation_draft");
    expect(create).toMatch(/pg_advisory_xact_lock[\s\S]*?status = 'draft'[\s\S]*?open and edit that draft/i);
    const revise = functionBody(forwardMigration, "revise_flight_quotation");
    expect(revise).toMatch(/pg_advisory_xact_lock[\s\S]*?status = 'draft'[\s\S]*?open and edit that draft/i);
  });

  it("audits withdrawal of the prior offer when an admin starts a revision, without changing accepted bookings", () => {
    const revise = functionBody(forwardMigration, "revise_flight_quotation");
    expect(revise).toMatch(/PERFORM private\.assert_flight_ops_admin\(\)/i);
    expect(revise).toMatch(/UPDATE public\.flight_quotations[\s\S]*?SET status = 'superseded'[\s\S]*?status = 'issued'[\s\S]*?'superseded', 'issued', 'superseded'/i);
    expect(revise).toMatch(/status IN \('issued', 'declined', 'expired', 'superseded'\)/i);
    expect(revise).not.toMatch(/status = 'accepted'[\s\S]*?UPDATE public\.flight_quote_bookings/i);
    expect(functionBody(forwardMigration, "issue_flight_quotation")).toMatch(/UPDATE public\.flight_quotations SET status = 'superseded'[\s\S]*?status = 'issued'[\s\S]*?id <> p_quotation_id/i);
  });

  it("updates the existing request status atomically and presents issued as Quote Sent only after RPC success", () => {
    const issue = functionBody(forwardMigration, "issue_flight_quotation");
    expect(issue).toMatch(/UPDATE public\.flight_quote_requests[\s\S]*?SET status = 'quoted'[\s\S]*?status IN \('pending', 'reviewing', 'quoted'\)/i);
    expect(issue).toMatch(/IF NOT FOUND THEN[\s\S]*?flight request is not in a state that can receive a quotation/i);
    expect(issue).toMatch(/status = 'issued'[\s\S]*?INSERT INTO public\.flight_quotation_events/i);
    expect(staffUi).toMatch(/issued\?\.status !== "issued"[\s\S]*?setQuoteView\("sent"\)[\s\S]*?await load\(\)[\s\S]*?Quote sent/i);
    expect(staffUi).toContain('aria-label="Sent quotations"');
    expect(staffUi).toContain('Quote Sent');
    expect(staffUi).toMatch(/quotes\.filter\(\(quote\) => quote\.status !== "draft"\)/i);
  });

  it("returns only staff issuer names through an authenticated staff-only RPC", () => {
    const issuerNames = functionBody(forwardMigration, "flight_quotation_issuer_names");
    expect(issuerNames).toMatch(/PERFORM private\.assert_flight_ops_staff\(\)/i);
    expect(forwardMigration).toMatch(/FUNCTION public\.flight_quotation_issuer_names\(\)[\s\S]*?RETURNS TABLE\(issuer_id uuid, full_name text\)/i);
    expect(issuerNames).toMatch(/profile\.full_name[\s\S]*?FROM public\.profiles/i);
    expect(issuerNames).not.toMatch(/profile\.phone|profile\.email/i);
    expect(forwardMigration).toMatch(/REVOKE ALL ON FUNCTION public\.flight_quotation_issuer_names\(\) FROM PUBLIC, anon, authenticated, service_role/i);
    expect(forwardMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.flight_quotation_issuer_names\(\) TO authenticated/i);
    expect(staffUi).toContain('rpc("flight_quotation_issuer_names")');
  });

  it.skipIf(!originalMigrationAvailable)("checks customer acceptance, expiry and booking safeguards in the historical baseline source", () => {
    const respond = functionBody(originalMigration, "respond_to_flight_quotation");
    expect(respond).toMatch(/v_q\.valid_until<=v_now[\s\S]*?SET status='expired'/i);
    expect(respond).toMatch(/INSERT INTO public\.flight_quote_bookings\(quotation_id,request_id,customer_id,status\)/i);
    expect(respond).toMatch(/'accepted','booking_id',v_booking,'booking_status','booking_requested'/i);
    expect(respond).toMatch(/'declined','issued','declined'/i);
    expect(originalMigration).toMatch(/GRANT EXECUTE ON FUNCTION [\s\S]*public\.update_flight_quote_booking_status\(uuid,text,text,text,text\) TO authenticated/i);
    expect(forwardMigration).not.toMatch(/kakande_|flight_bookings/i);
  });

  it.skipIf(!originalMigrationAvailable)("checks the recorded historical issuance defect and baseline authorization invariants", () => {
    const oldIssue = functionBody(originalMigration, "issue_flight_quotation");
    expect(oldIssue).toMatch(/INSERT INTO public\.flight_quotation_events\(quotation_id,actor_id,event_type,from_status,to_status\)\s*VALUES\(p_quotation_id,auth\.uid\(\),'issued','draft','issued',jsonb_build_object\('validUntil'/i);
    expect(originalMigration).toMatch(/REVOKE ALL ON TABLE public\.flight_quotations,[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i);
    expect(originalMigration).toMatch(/flight_quote_bookings_one_per_request/i);
    const immutableGuard = originalMigration.match(/CREATE OR REPLACE FUNCTION private\.guard_flight_quotation_update\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";
    expect(immutableGuard).toMatch(/issued quotation contents and metadata are immutable/i);
    expect(immutableGuard).toMatch(/OLD\.status<>'issued' OR NEW\.status NOT IN \('accepted','declined','expired','superseded'\)/i);
    expect(originalMigration).toMatch(/CREATE UNIQUE INDEX flight_quotations_one_live_issue_per_request[\s\S]*?WHERE status = 'issued'/i);
  });

  it("shows staff read-only issued history and reserves revision and persisted expiry actions for admins", () => {
    expect(staffUi).toContain("export function FlightQuotationOperations({ isAdmin }: { isAdmin: boolean })");
    expect(staffUi).toContain("Issued — locked");
    expect(staffUi).toMatch(/isAdmin && latest && quote\.status !== "accepted"[\s\S]*?Create revision/);
    expect(staffUi).toMatch(/pastDue && isAdmin[\s\S]*?Persist expiry/);
    expect(staffUi).toContain("Quotation event history");
    expect(staffUi).toContain('rpc("issue_flight_quotation"');
    expect(staffUi).toContain('rpc("revise_flight_quotation"');
    expect(staffUi).toContain("Draft Quotes");
    expect(staffUi).toContain("Sent Quotes");
    expect(staffUi).toContain("Quotation reference:");
    expect(staffUi).toContain("Quotation reference: {quote.id}");
    expect(staffUi).toContain("Issued by {issuerName(quote)}");
    expect(staffUi).toContain('displayStatus === "issued" ? "Quote Sent"');
    expect(staffUi).toMatch(/issued\?\.status !== "issued"[\s\S]*?setQuoteView\("sent"\)[\s\S]*?await load\(\)[\s\S]*?Quote sent/i);
    expect(staffUi).toMatch(/quotes\.filter\(\(quote\) => quote\.status !== "draft"\)/);
    expect(staffUi).toMatch(/isAdmin && latest && quote\.status !== "accepted"[\s\S]*?Create revision/);
    expect(staffUi).toMatch(/history\.length === 0 \|\| history\.some\(\(quote\) => quote\.status === "draft"\)/);
  });
});
