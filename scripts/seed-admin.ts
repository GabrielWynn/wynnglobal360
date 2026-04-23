/**
 * scripts/seed-admin.ts
 *
 * One-time script to bootstrap an admin user in the Wynn Global 360 hub.
 *
 * What it does:
 *   1. Checks Supabase Auth for an existing account with ADMIN_EMAIL.
 *      - If not found, sends a Supabase invite email so the user can set
 *        their password (same flow as inviting via /admin/users UI).
 *   2. Upserts the ifas table row for the user:
 *      - Inserts a new row if none exists.
 *      - Updates role → "admin" and status → "active" if a row exists.
 *
 * After running, the user will receive an invite email (if they had no auth
 * account) or will be able to log in immediately (if they already did).
 * The /admin/* section will be accessible as soon as their ifas row has
 * role = "admin" and status = "active".
 *
 * Prerequisites:
 *   npm install --save-dev tsx @supabase/supabase-js dotenv
 *
 * Environment variables (from .env.local or .env.migration):
 *   NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service_role key (never expose client-side)
 *
 * Run:
 *   npx tsx scripts/seed-admin.ts
 *   # Dry-run (no writes):
 *   DRY_RUN=true npx tsx scripts/seed-admin.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// ─── Configuration ────────────────────────────────────────────────────────────

const ADMIN_EMAIL = "gabrielstanziola@wynnglobal.com";
const ADMIN_NAME  = "Gabriel Stanziola";

// ─── Load env ────────────────────────────────────────────────────────────────

const envFile = fs.existsSync(".env.migration") ? ".env.migration" : ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL     = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.wynnglobal360.com";
const DRY_RUN      = process.env.DRY_RUN === "true";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
    "    Add them to .env.local or .env.migration and re-run."
  );
  process.exit(1);
}

// ─── Supabase admin client ────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Main ────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log(DRY_RUN ? "\n🔍  DRY RUN — no writes will be made\n" : "\n🚀  Seeding admin user\n");
  console.log(`    Email : ${ADMIN_EMAIL}`);
  console.log(`    Name  : ${ADMIN_NAME}`);
  console.log(`    Target: ${SUPABASE_URL}\n`);

  // ── Step 1: Check / create Supabase Auth account ──────────────────────────

  console.log("Step 1 — Checking Supabase Auth for existing account…");

  let authUserId: string | null = null;

  // List all users and find by email (Admin API doesn't offer email lookup directly)
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    console.error("❌  Failed to list auth users:", listError.message);
    process.exit(1);
  }

  const existing = listData.users.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  if (existing) {
    authUserId = existing.id;
    console.log(`  ✓  Auth account already exists (id: ${authUserId})`);
  } else {
    console.log("  →  No auth account found. Sending invite email…");

    if (!DRY_RUN) {
      const { data: invited, error: inviteError } =
        await supabase.auth.admin.inviteUserByEmail(ADMIN_EMAIL, {
          redirectTo: `${SITE_URL}/`,
          data: { name: ADMIN_NAME, role: "admin" },
        });

      if (inviteError) {
        console.error("❌  Failed to send invite:", inviteError.message);
        process.exit(1);
      }

      authUserId = invited.user?.id ?? null;
      console.log(`  ✓  Invite sent. Auth user id: ${authUserId}`);
    } else {
      console.log("  DRY  Would send invite email.");
    }
  }

  // ── Step 2: Upsert ifas row ───────────────────────────────────────────────

  console.log("\nStep 2 — Upserting ifas record…");

  const { data: existingIfa } = await supabase
    .from("ifas")
    .select("id, role, status, user_id")
    .eq("email", ADMIN_EMAIL.toLowerCase())
    .maybeSingle();

  if (existingIfa) {
    console.log(`  →  Row exists (id: ${existingIfa.id}, role: ${existingIfa.role}, status: ${existingIfa.status})`);

    if (existingIfa.role === "admin" && existingIfa.status === "active" && existingIfa.user_id === authUserId) {
      console.log("  ✓  Already admin + active + linked. Nothing to do.");
    } else {
      const updates: Record<string, unknown> = { role: "admin", status: "active" };
      if (authUserId && !existingIfa.user_id) updates.user_id = authUserId;

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("ifas")
          .update(updates)
          .eq("id", existingIfa.id);

        if (updateError) {
          console.error("❌  Failed to update ifas row:", updateError.message);
          process.exit(1);
        }
        console.log(`  ✓  Updated: ${JSON.stringify(updates)}`);
      } else {
        console.log(`  DRY  Would update: ${JSON.stringify(updates)}`);
      }
    }
  } else {
    console.log("  →  No ifas row found. Inserting…");

    if (!DRY_RUN) {
      const { error: insertError } = await supabase.from("ifas").insert({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL.toLowerCase(),
        role: "admin",
        status: "active",
        user_id: authUserId,
      });

      if (insertError) {
        console.error("❌  Failed to insert ifas row:", insertError.message);
        process.exit(1);
      }
      console.log("  ✓  Inserted new admin row.");
    } else {
      console.log("  DRY  Would insert new admin row.");
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n" + "─".repeat(60));
  if (DRY_RUN) {
    console.log("DRY RUN COMPLETE (no writes made)");
  } else {
    console.log("✅  Done.");
    console.log(`\n    ${ADMIN_EMAIL} is now set as admin.`);
    if (!existing) {
      console.log("    An invite email has been sent. The user must click the link");
      console.log("    to set their password before they can log in.");
    }
  }
  console.log("─".repeat(60) + "\n");
}

run().catch((err) => {
  console.error("\n❌  Unhandled error:", err);
  process.exit(1);
});
