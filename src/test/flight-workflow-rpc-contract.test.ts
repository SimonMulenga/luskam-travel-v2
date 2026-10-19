import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261020100000_flight_quotation_booking_workflow.sql"), "utf8");
const staffUi = readFileSync(resolve(process.cwd(), "src/components/admin/FlightQuotationOperations.tsx"), "utf8");
const customerUi = readFileSync(resolve(process.cwd(), "src/components/account/MyRequests.tsx"), "utf8");

function assertFunctionContract(name: string, args: string, returnType: string) {
  const signature = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\s*\\(${args}\\)\\s*RETURNS ${returnType}`, "i");
  expect(migration, `${name} must match its frontend RPC contract`).toMatch(signature);
}

describe("Phase 6A / 7A frontend and migration RPC contract", () => {
  it("matches staff RPC names, argument names, and return types", () => {
    assertFunctionContract("create_flight_quotation_draft", "p_request_id uuid\\s*,\\s*p_items jsonb", "uuid");
    assertFunctionContract("edit_flight_quotation_draft", "p_quotation_id uuid\\s*,\\s*p_items jsonb", "void");
    assertFunctionContract("revise_flight_quotation", "p_quotation_id uuid\\s*,\\s*p_items jsonb", "uuid");
    assertFunctionContract("issue_flight_quotation", "p_quotation_id uuid", "jsonb");
    assertFunctionContract("expire_flight_quotation", "p_quotation_id uuid", "boolean");
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.update_flight_quote_booking_status\([\s\S]*?RETURNS jsonb/i);
    expect(migration).toMatch(/p_staff_note text DEFAULT ''\s*,\s*p_supplier_confirmation_reference text DEFAULT NULL\s*,\s*p_ticket_number text DEFAULT NULL/i);

    for (const rpcName of ["create_flight_quotation_draft", "edit_flight_quotation_draft", "revise_flight_quotation", "issue_flight_quotation", "expire_flight_quotation", "update_flight_quote_booking_status"]) {
      expect(staffUi).toContain(`rpc("${rpcName}"`);
    }
    expect(staffUi).toContain("p_request_id: selected.id");
    expect(staffUi).toContain("p_quotation_id: editingQuote");
    expect(staffUi).toContain("p_booking_id: row.id");
    expect(staffUi).toContain("p_supplier_confirmation_reference:");
    expect(staffUi).toContain("p_ticket_number:");
  });

  it("matches customer RPC arguments, response outcomes, and projected JSON item keys", () => {
    assertFunctionContract("respond_to_flight_quotation", "p_quotation_id uuid\\s*,\\s*p_accept boolean", "jsonb");
    expect(migration).toMatch(/FUNCTION public\.my_flight_quotations\(\)\s*RETURNS TABLE\([\s\S]*?items jsonb\)/i);
    expect(migration).toMatch(/FUNCTION public\.my_flight_quote_bookings\(\)\s*RETURNS TABLE\([\s\S]*?cabin_class text\)/i);
    for (const key of ["description", "quantity", "unitAmountZmw", "lineTotalZmw"]) {
      expect(migration).toContain(`'${key}'`);
    }
    for (const rpcName of ["my_flight_quotations", "my_flight_quote_bookings", "respond_to_flight_quotation"]) {
      expect(customerUi).toContain(`rpc("${rpcName}"`);
    }
    expect(customerUi).toContain("p_quotation_id: quotation.quotation_id");
    expect(customerUi).toContain("p_accept: accept");
    for (const outcome of ["accepted", "declined", "duplicate", "expired"]) {
      expect(migration).toContain(`'${outcome}'`);
    }
  });
});
