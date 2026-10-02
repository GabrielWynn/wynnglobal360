// ---------------------------------------------------------------------------
// LACRM contacts for the Risk Matrix — read-only queries against
// ContactsExport, the Azure SQL copy of Less Annoying CRM (see lib/azure.ts).
// Server-side only. Callers are responsible for the admin/compliance role
// check and for handling an unreachable database.
// ---------------------------------------------------------------------------

import sql from "mssql";
import { withAzurePool } from "@/lib/azure";

export interface LacrmSearchHit {
  contactId: string;
  clientNumber: string;
  name: string;
  planNumber: string;
  platform: string;
}

/** The LACRM fields the Risk Matrix uses; everything else stays in LACRM. */
export interface LacrmContact {
  contactId: string;
  clientNumber: string;
  name: string;
  birthday: string;
  nationality: string;
  countryOfResidence: string;
  pep: string;
  risk: string;
  status: string;
  planType: string;
  planNumber: string;
  platform: string;
  riskTolerance: string;
  responsibleIfa: string;
  idExpirationDate: string;
  dueDiligenceDate: string;
}

const text = (v: unknown) => (v == null ? "" : String(v).trim());

function fullName(r: Record<string, unknown>): string {
  const person = [r.FirstName, r.MiddleName, r.LastName].map(text).filter(Boolean).join(" ");
  return person || text(r.CompanyName);
}

/** Up to 20 contacts matching a client number, plan number or name. */
export async function searchLacrmContacts(query: string): Promise<LacrmSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Treat the user's text literally inside LIKE
  const like = `%${q.replace(/[[%_]/g, "[$&]")}%`;

  return withAzurePool(async (pool) => {
    const result = await pool
      .request()
      .input("q", sql.NVarChar, like)
      .query(`
        SELECT TOP 20
          ContactId, WynnGlobalClientNumber, FirstName, MiddleName, LastName,
          CompanyName, PlanNumber, LifeCompanyPlatform
        FROM ContactsExport
        WHERE WynnGlobalClientNumber LIKE @q
           OR PlanNumber LIKE @q
           OR LastName LIKE @q
           OR CONCAT(FirstName, ' ', LastName) LIKE @q
           OR CONCAT(FirstName, ' ', MiddleName, ' ', LastName) LIKE @q
        ORDER BY LastName, FirstName
      `);

    return result.recordset.map((r) => ({
      contactId: text(r.ContactId),
      clientNumber: text(r.WynnGlobalClientNumber),
      name: fullName(r),
      planNumber: text(r.PlanNumber),
      platform: text(r.LifeCompanyPlatform),
    }));
  });
}

export async function getLacrmContact(contactId: string): Promise<LacrmContact | null> {
  return withAzurePool(async (pool) => {
    const result = await pool
      .request()
      .input("id", sql.NVarChar, contactId)
      .query(`
        SELECT TOP 1
          ContactId, WynnGlobalClientNumber, FirstName, MiddleName, LastName, CompanyName,
          Birthday, Nationality, CountryOfResidence, PEP, Risk, Status, PlanType,
          PlanNumber, LifeCompanyPlatform, RiskToleranceAnalyst, ResponsibleIFA,
          IDExpirationDate, DateOfDueDiligenceUpdate
        FROM ContactsExport
        WHERE ContactId = @id
      `);

    const r = result.recordset[0];
    if (!r) return null;

    return {
      contactId: text(r.ContactId),
      clientNumber: text(r.WynnGlobalClientNumber),
      name: fullName(r),
      birthday: text(r.Birthday),
      nationality: text(r.Nationality),
      countryOfResidence: text(r.CountryOfResidence),
      pep: text(r.PEP),
      risk: text(r.Risk),
      status: text(r.Status),
      planType: text(r.PlanType),
      planNumber: text(r.PlanNumber),
      platform: text(r.LifeCompanyPlatform),
      riskTolerance: text(r.RiskToleranceAnalyst),
      responsibleIfa: text(r.ResponsibleIFA),
      idExpirationDate: text(r.IDExpirationDate),
      dueDiligenceDate: text(r.DateOfDueDiligenceUpdate),
    };
  });
}
