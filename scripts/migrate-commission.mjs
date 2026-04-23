/**
 * Commission app migration script.
 *
 * Reads every page/route from the source commission portal, applies URL path
 * substitutions, rewrites lib imports, and writes to the destination monorepo
 * under app/commission/* and app/api/commission/* prefixes.
 *
 * Run once: node scripts/migrate-commission.mjs
 */

import fs from "fs";
import path from "path";

const SOURCE = String.raw`C:\Users\gstanziola\OneDrive\OneDrive - Wynn Global Limited\Documentos\Visual Studio 18\WGIPortalCOMMS\wgi-commission-portal`;
const DEST = String.raw`C:\Users\gstanziola\OneDrive\OneDrive - Wynn Global Limited\Documentos\Cursor\WGIHub\wynnglobal360`;

// ---------------------------------------------------------------------------
// URL path substitutions — ORDER MATTERS (more specific first)
// Applied to string literals (href, fetch calls, router.push, redirect, etc.)
// ---------------------------------------------------------------------------
const PATH_SUBS = [
  // API routes — specific paths first to avoid partial matches
  ["/api/admin/ifa-preview/", "/api/commission/admin/ifa-preview/"],
  ["/api/azure-bulk-lookup", "/api/commission/azure-bulk-lookup"],
  ["/api/calculate-commissions", "/api/commission/calculate-commissions"],
  ["/api/commission-records/delete", "/api/commission/commission-records/delete"],
  ["/api/commission-records/reconcile", "/api/commission/commission-records/reconcile"],
  ["/api/commission-records", "/api/commission/commission-records"],
  ["/api/cron/kpi-alert", "/api/commission/cron/kpi-alert"],
  ["/api/dashboard", "/api/commission/dashboard"],
  ["/api/ifa-notes", "/api/commission/ifa-notes"],
  ["/api/ifa/ape", "/api/commission/ifa/ape"],
  ["/api/ifa/balance", "/api/commission/ifa/balance"],
  ["/api/ifa/export", "/api/commission/ifa/export"],
  ["/api/ifa/payments", "/api/commission/ifa/payments"],
  ["/api/ifa/transactions", "/api/commission/ifa/transactions"],
  ["/api/ifas/", "/api/commission/ifas/"],
  ["/api/ifas", "/api/commission/ifas"],
  ["/api/kpi-config", "/api/commission/kpi-config"],
  ["/api/kpi", "/api/commission/kpi"],
  ["/api/map-policy", "/api/commission/map-policy"],
  ["/api/admin/map-policy", "/api/commission/admin/map-policy"],
  ["/api/payment-matrix/", "/api/commission/payment-matrix/"],
  ["/api/payment-matrix", "/api/commission/payment-matrix"],
  ["/api/payments/history", "/api/commission/payments/history"],
  ["/api/payments", "/api/commission/payments"],
  ["/api/approvals/", "/api/commission/approvals/"],
  ["/api/approvals", "/api/commission/approvals"],
  ["/api/audit", "/api/commission/audit"],
  ["/api/platform-mappings/", "/api/commission/platform-mappings/"],
  ["/api/platform-mappings", "/api/commission/platform-mappings"],
  ["/api/process-upload", "/api/commission/process-upload"],
  ["/api/remap-unmapped", "/api/commission/remap-unmapped"],
  ["/api/reports", "/api/commission/reports"],
  ["/api/statements/", "/api/commission/statements/"],
  ["/api/test-azure-lookup", "/api/commission/test-azure-lookup"],
  ["/api/test-azure", "/api/commission/test-azure"],
  ["/api/uploads", "/api/commission/uploads"],
  // Auth API routes — keep as-is (shared with main app)
  // "/api/auth/link-ifa" and "/api/auth/me" stay unchanged

  // Page routes
  ["/admin/approvals", "/commission/admin/approvals"],
  ["/admin/audit-log", "/commission/admin/audit-log"],
  ["/admin/audit", "/commission/admin/audit"],
  ["/admin/ifas", "/commission/admin/ifas"],
  ["/admin/kpi", "/commission/admin/kpi"],
  ["/admin/master-file", "/commission/admin/master-file"],
  ["/admin/payment-matrix", "/commission/admin/payment-matrix"],
  ["/admin/payments", "/commission/admin/payments"],
  ["/admin/reports", "/commission/admin/reports"],
  ["/admin/test-azure", "/commission/admin/test-azure"],
  ["/admin/unmapped", "/commission/admin/unmapped"],
  ["/admin/upload", "/commission/admin/upload"],
  // Generic /admin redirect — must come AFTER all specific /admin/* above
  ["href=\"/admin\"", 'href="/commission/admin"'],
  ["router.push(\"/admin\")", 'router.push("/commission/admin")'],
  ["router.push('/admin')", "router.push('/commission/admin')"],
  ["redirect(\"/admin\")", 'redirect("/commission/admin")'],
  ["redirect('/admin')", "redirect('/commission/admin')"],
  ["/ifa\"", "/commission/ifa\""],
  ["/ifa'", "/commission/ifa'"],
  // Login redirect stays pointing to /login (shared)
];

// ---------------------------------------------------------------------------
// Import substitutions — rewrite relative @/lib imports to use shared lib
// These stay the same since we copied the files; no changes needed.
// But we do need to rewrite component imports.
// ---------------------------------------------------------------------------
const IMPORT_SUBS = [
  // IFAPreviewModal moved to commission subfolder
  [
    'from "@/components/IFAPreviewModal"',
    'from "@/components/commission/IFAPreviewModal"',
  ],
  [
    "from '@/components/IFAPreviewModal'",
    "from '@/components/commission/IFAPreviewModal'",
  ],
];

// ---------------------------------------------------------------------------
// File mapping: [sourcePath, destPath]
// sourcePath is relative to SOURCE/app or SOURCE/components
// destPath is relative to DEST
// ---------------------------------------------------------------------------
const FILE_MAP = [
  // Pages — commission prefix
  ["app/admin/approvals/page.tsx", "app/commission/admin/approvals/page.tsx"],
  ["app/admin/audit-log/page.tsx", "app/commission/admin/audit-log/page.tsx"],
  ["app/admin/audit/page.tsx", "app/commission/admin/audit/page.tsx"],
  ["app/admin/ifas/page.tsx", "app/commission/admin/ifas/page.tsx"],
  ["app/admin/kpi/page.tsx", "app/commission/admin/kpi/page.tsx"],
  ["app/admin/master-file/page.tsx", "app/commission/admin/master-file/page.tsx"],
  ["app/admin/page.tsx", "app/commission/admin/page.tsx"],
  ["app/admin/payment-matrix/page.tsx", "app/commission/admin/payment-matrix/page.tsx"],
  ["app/admin/payments/page.tsx", "app/commission/admin/payments/page.tsx"],
  ["app/admin/reports/page.tsx", "app/commission/admin/reports/page.tsx"],
  ["app/admin/test-azure/page.tsx", "app/commission/admin/test-azure/page.tsx"],
  ["app/admin/unmapped/page.tsx", "app/commission/admin/unmapped/page.tsx"],
  ["app/admin/upload/page.tsx", "app/commission/admin/upload/page.tsx"],
  ["app/ifa/page.tsx", "app/commission/ifa/page.tsx"],
  ["app/test-db/page.tsx", "app/commission/test-db/page.tsx"],

  // API routes — commission prefix
  ["app/api/admin/ifa-preview/ape/route.ts", "app/api/commission/admin/ifa-preview/ape/route.ts"],
  ["app/api/admin/ifa-preview/balance/route.ts", "app/api/commission/admin/ifa-preview/balance/route.ts"],
  ["app/api/admin/ifa-preview/payments/route.ts", "app/api/commission/admin/ifa-preview/payments/route.ts"],
  ["app/api/admin/ifa-preview/transactions/route.ts", "app/api/commission/admin/ifa-preview/transactions/route.ts"],
  ["app/api/admin/map-policy/route.ts", "app/api/commission/admin/map-policy/route.ts"],
  ["app/api/approvals/[id]/route.ts", "app/api/commission/approvals/[id]/route.ts"],
  ["app/api/approvals/route.ts", "app/api/commission/approvals/route.ts"],
  ["app/api/audit/route.ts", "app/api/commission/audit/route.ts"],
  ["app/api/azure-bulk-lookup/route.ts", "app/api/commission/azure-bulk-lookup/route.ts"],
  ["app/api/calculate-commissions/route.ts", "app/api/commission/calculate-commissions/route.ts"],
  ["app/api/commission-records/delete/route.ts", "app/api/commission/commission-records/delete/route.ts"],
  ["app/api/commission-records/reconcile/route.ts", "app/api/commission/commission-records/reconcile/route.ts"],
  ["app/api/cron/kpi-alert/route.ts", "app/api/commission/cron/kpi-alert/route.ts"],
  ["app/api/dashboard/route.ts", "app/api/commission/dashboard/route.ts"],
  ["app/api/ifa-notes/route.ts", "app/api/commission/ifa-notes/route.ts"],
  ["app/api/ifa/ape/route.ts", "app/api/commission/ifa/ape/route.ts"],
  ["app/api/ifa/balance/route.ts", "app/api/commission/ifa/balance/route.ts"],
  ["app/api/ifa/export/route.ts", "app/api/commission/ifa/export/route.ts"],
  ["app/api/ifa/payments/route.ts", "app/api/commission/ifa/payments/route.ts"],
  ["app/api/ifa/transactions/route.ts", "app/api/commission/ifa/transactions/route.ts"],
  ["app/api/ifas/[id]/route.ts", "app/api/commission/ifas/[id]/route.ts"],
  ["app/api/ifas/route.ts", "app/api/commission/ifas/route.ts"],
  ["app/api/kpi-config/route.ts", "app/api/commission/kpi-config/route.ts"],
  ["app/api/kpi/route.ts", "app/api/commission/kpi/route.ts"],
  ["app/api/map-policy/route.ts", "app/api/commission/map-policy/route.ts"],
  ["app/api/payment-matrix/[id]/route.ts", "app/api/commission/payment-matrix/[id]/route.ts"],
  ["app/api/payment-matrix/route.ts", "app/api/commission/payment-matrix/route.ts"],
  ["app/api/payments/history/route.ts", "app/api/commission/payments/history/route.ts"],
  ["app/api/payments/route.ts", "app/api/commission/payments/route.ts"],
  ["app/api/platform-mappings/[id]/route.ts", "app/api/commission/platform-mappings/[id]/route.ts"],
  ["app/api/platform-mappings/route.ts", "app/api/commission/platform-mappings/route.ts"],
  ["app/api/process-upload/route.ts", "app/api/commission/process-upload/route.ts"],
  ["app/api/remap-unmapped/route.ts", "app/api/commission/remap-unmapped/route.ts"],
  ["app/api/reports/route.ts", "app/api/commission/reports/route.ts"],
  ["app/api/statements/[ifa_id]/route.ts", "app/api/commission/statements/[ifa_id]/route.ts"],
  ["app/api/test-azure-lookup/route.ts", "app/api/commission/test-azure-lookup/route.ts"],
  ["app/api/test-azure/route.ts", "app/api/commission/test-azure/route.ts"],
  ["app/api/uploads/route.ts", "app/api/commission/uploads/route.ts"],

  // Auth API routes — keep at original paths (shared with main app logic)
  // NOTE: These already exist in the new project (from the earlier auth setup).
  // We skip them here to avoid overwriting.

  // Components
  ["components/IFAPreviewModal.tsx", "components/commission/IFAPreviewModal.tsx"],
];

// ---------------------------------------------------------------------------
// Helper: apply all substitutions to a string
// ---------------------------------------------------------------------------
function applySubstitutions(content) {
  let result = content;

  for (const [from, to] of PATH_SUBS) {
    // Replace all occurrences using a global string replace
    result = result.split(from).join(to);
  }

  for (const [from, to] of IMPORT_SUBS) {
    result = result.split(from).join(to);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let migratedCount = 0;
let skippedCount = 0;
const errors = [];

for (const [relSrc, relDest] of FILE_MAP) {
  const srcPath = path.join(SOURCE, relSrc);
  const destPath = path.join(DEST, relDest);

  if (!fs.existsSync(srcPath)) {
    console.warn(`  SKIP (not found): ${relSrc}`);
    skippedCount++;
    continue;
  }

  let content;
  try {
    content = fs.readFileSync(srcPath, "utf8");
  } catch (err) {
    errors.push(`READ ${relSrc}: ${err.message}`);
    continue;
  }

  const transformed = applySubstitutions(content);

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  fs.mkdirSync(destDir, { recursive: true });

  try {
    fs.writeFileSync(destPath, transformed, "utf8");
    console.log(`  OK: ${relDest}`);
    migratedCount++;
  } catch (err) {
    errors.push(`WRITE ${relDest}: ${err.message}`);
  }
}

console.log("\n─────────────────────────────────────");
console.log(`Migrated: ${migratedCount} files`);
console.log(`Skipped:  ${skippedCount} files`);
if (errors.length) {
  console.error(`Errors:   ${errors.length}`);
  errors.forEach((e) => console.error("  " + e));
} else {
  console.log("Errors:   0");
}
