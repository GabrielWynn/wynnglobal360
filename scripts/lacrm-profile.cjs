/**
 * Read-only summary of ContactsExport (the Azure SQL copy of LACRM) for the
 * Risk Matrix field mapping. Prints category values with counts and the
 * digit-patterns of date/amount columns — no names, no client records.
 *
 * Run from the wynnglobal360 folder:
 *   node --env-file=.env.local scripts/lacrm-profile.cjs
 */

const sql = require("mssql");

(async () => {
  const pool = new sql.ConnectionPool({
    server: process.env.AZURE_SERVER,
    database: process.env.AZURE_DATABASE,
    user: process.env.AZURE_USERNAME,
    password: process.env.AZURE_PASSWORD,
    options: { encrypt: true, trustServerCertificate: false, connectTimeout: 30000, requestTimeout: 60000 },
  });
  await pool.connect();
  const q = async (s) => (await pool.request().query(s)).recordset;

  console.log("TOTALS", JSON.stringify(await q(`
    SELECT COUNT(*) AS rows_total,
      SUM(CASE WHEN LTRIM(RTRIM(ISNULL(WynnGlobalClientNumber,''))) <> '' THEN 1 ELSE 0 END) AS with_client_no,
      COUNT(DISTINCT NULLIF(LTRIM(RTRIM(WynnGlobalClientNumber)),'')) AS distinct_client_no,
      COUNT(DISTINCT ContactId) AS distinct_contact_id,
      SUM(CASE WHEN LTRIM(RTRIM(ISNULL(PlanNumber,''))) <> '' THEN 1 ELSE 0 END) AS with_plan_no,
      SUM(CASE WHEN LTRIM(RTRIM(ISNULL(Birthday,''))) <> '' THEN 1 ELSE 0 END) AS with_birthday,
      MIN(SyncedAt) AS synced_min, MAX(SyncedAt) AS synced_max, MAX(LastEditedDate) AS last_edit
    FROM ContactsExport`)));

  // Category columns: most common values and how many distinct values exist
  const categories = [
    "Type", "PEP", "Risk", "ApprovedByCompliance", "Status", "PlanType", "Product",
    "CoverageType", "LifeCompanyPlatform", "RiskToleranceAnalyst",
    "Nationality", "CountryOfResidence", "PrimaryCountry",
  ];
  for (const c of categories) {
    const top = await q(
      `SELECT TOP 14 LEFT(ISNULL(${c},''),60) AS v, COUNT(*) AS n FROM ContactsExport GROUP BY LEFT(ISNULL(${c},''),60) ORDER BY COUNT(*) DESC`
    );
    const distinct = await q(`SELECT COUNT(DISTINCT ISNULL(${c},'')) AS d FROM ContactsExport`);
    console.log(c, `(${distinct[0].d} distinct)`, top.map((x) => `${x.v || "<empty>"}=${x.n}`).join(" | "));
  }

  // Date / amount / id columns: shape only (every digit shown as 9)
  const patterns = [
    "ContactId", "Birthday", "IDExpirationDate", "DateOfDueDiligenceUpdate",
    "DateOfLatestComplianceApprovalMonth", "DateOfLatestComplianceApprovalYear",
    "PremiumAmountUtmost", "WynnGlobalClientNumber",
  ];
  for (const c of patterns) {
    const top = await q(
      `SELECT TOP 8 p AS v, COUNT(*) AS n FROM (SELECT TRANSLATE(LEFT(ISNULL(${c},''),40),'0123456789','9999999999') AS p FROM ContactsExport) t GROUP BY p ORDER BY COUNT(*) DESC`
    );
    console.log("PATTERN", c, top.map((x) => `${x.v || "<empty>"}=${x.n}`).join(" | "));
  }

  await pool.close();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
