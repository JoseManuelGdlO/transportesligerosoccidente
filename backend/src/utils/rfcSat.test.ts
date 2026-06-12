import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidSatRfc, satRfcIssue } from "./rfcSat";

describe("rfcSat", () => {
  it("acepta RFCs válidos del SAT", () => {
    assert.equal(isValidSatRfc("XAXX010101000"), true);
    assert.equal(isValidSatRfc("CCM080101IL8"), true);
    assert.equal(isValidSatRfc("CPR850101AB8"), true);
  });

  it("rechaza homoclave que termina en letra distinta de A", () => {
    assert.equal(isValidSatRfc("CPR850101ABC"), false);
  });

  it("genera mensaje de issue legible", () => {
    const issue = satRfcIssue("Cliente", "CPR850101ABC");
    assert.match(issue ?? "", /Cliente: RFC "CPR850101ABC"/);
  });
});
