/**
 * scripts/migrate-commission-users.ts
 *
 * One-time migration: copy all users and ifas records from the standalone
 * Commission app Supabase project into the shared Wynn Global 360 project.
 *
 * What it migrates:
 *   1. auth.users — all user accounts (email, metadata, email_confirmed_at)
 *   2. public.ifas — all advisor/admin records, preserving codes, roles, status
 *   3. Links each ifas row to its new auth user via user_id
 *
 * What it does NOT migrate:
 *   - Commission records, payments, uploads, etc. — those tables already exist
 *     in the shared project (same schema via migrations 001–031).  Their data
 *     stays in the old project until you run a separate data migration.
 *   - Passwords — Supabase does not expose password hashes via the Admin API.
 *     Migrated users will receive a password-reset email (optional, see below).
 *
 * Prerequisites:
 *   npm install --save-dev tsx @supabase/supabase-js
 *
 * Environment variables (set in .env.migration or pass inline):
 *   OLD_SUPABASE_URL          URL of the Commission app's Supabase project
 *   OLD_SUPABASE_SERVICE_KEY  service_role key of the old project
 *   NEW_SUPABASE_URL          URL of the new shared Wynn Global 360 project
 *   NEW_SUPABASE_SERVICE_KEY  service_role key of the new project
 *
 * Run:
 *   npx tsx scripts/migrate-commission-users.ts
 *   # Dry-run (no writes):
 *   DRY_RUN=true npx tsx scripts/migrate-commission-users.ts
 *   # Send password-reset emails after migration:
 *   SEND_RESET_EMAILS=true npx tsx scripts/migrate-commission-users.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// ─── Load env ────────────────────────────────────────────────────────────────

// Try .env.migration first, fall back to .env.local
const envFile = fs.existsSync(".env.migration") ? ".env.migration" : ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const OLD_URL = process.env.OLD_SUPABASE_URL;
const OLD_KEY = process.env.OLD_SUPABASE_SERVICE_KEY;
const NEW_URL = process.env.NEW_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "true";
const SEND_RESET_EMAILS = process.env.SEND_RESET_EMAILS === "true";

if (!OLD_URL || !OLD_KEY) {
  console.error(
    "❌  OLD_SUPABASE_URL and OLD_SUPABASE_SERVICE_KEY must be set.\n" +
    "    Create a .env.migration file or set them in the environment."
  );
  process.exit(1);
}

if (!NEW_URL || !NEW_KEY) {
  console.error(
    "❌  NEW_SUPABASE_URL and NEW_SUPABASE_SERVICE_KEY must be set."
  );
  process.exit(1);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface OldUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
}

interface IFARow {
  id: string;
  code: string | null;
  name: string;
  email: string;
  role: "admin" | "ifa";
  status: string;
  user_id: string | null;
}

interface MigrationResult {
  usersTotal: number;
  usersCreated: number;
  usersSkipped: number;
  usersFailed: number;
  ifasTotal: number;
  ifasCreated: number;
  ifasSkipped: number;
  ifasFailed: number;
  linkedCount: number;
  resetEmailsSent: number;
  errors: Array<{ email: string; error: string }>;
}

// ─── Clients ─────────────────────────────────────────────────────────────────

function makeClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

function warn(msg: string) {
  console.warn(`  ⚠  ${msg}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log(
    DRY_RUN
      ? "\n🔍  DRY RUN — no writes will be made\n"
      : "\n🚀  Starting user migration\n"
  );
  console.log(`    Source: ${OLD_URL}`);
  console.log(`    Target: ${NEW_URL}\n`);

  const oldClient = makeClient(OLD_URL!, OLD_KEY!);
  const newClient = makeClient(NEW_URL!, NEW_KEY!);

  const result: MigrationResult = {
    usersTotal: 0,
    usersCreated: 0,
    usersSkipped: 0,
    usersFailed: 0,
    ifasTotal: 0,
    ifasCreated: 0,
    ifasSkipped: 0,
    ifasFailed: 0,
    linkedCount: 0,
    resetEmailsSent: 0,
    errors: [],
  };

  // ── Step 1: Fetch all users from the old project ──────────────────────────

  console.log("Step 1 — Fetching users from old project…");

  // The Admin API paginates at 1000 users per page
  const oldUsers: OldUser[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await oldClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      console.error("❌  Failed to list users:", error.message);
      process.exit(1);
    }
    if (!data.users.length) break;
    oldUsers.push(...(data.users as unknown as OldUser[]));
    if (data.users.length < 1000) break;
    page++;
  }

  result.usersTotal = oldUsers.length;
  log(`Found ${oldUsers.length} user(s) in old project.`);

  // ── Step 2: Fetch all ifas rows from the old project ─────────────────────

  console.log("\nStep 2 — Fetching ifas records from old project…");

  const { data: oldIFAs, error: ifaFetchError } = await oldClient
    .from("ifas")
    .select("id, code, name, email, role, status, user_id");

  if (ifaFetchError) {
    console.error("❌  Failed to fetch ifas:", ifaFetchError.message);
    process.exit(1);
  }

  const ifas = (oldIFAs ?? []) as IFARow[];
  result.ifasTotal = ifas.length;
  log(`Found ${ifas.length} ifas record(s) in old project.`);

  // ── Step 3: Fetch existing users in the new project (for skip logic) ─────

  console.log("\nStep 3 — Fetching existing users in new project…");

  const existingEmails = new Set<string>();
  page = 1;
  while (true) {
    const { data, error } = await newClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      console.error("❌  Failed to list new-project users:", error.message);
      process.exit(1);
    }
    if (!data.users.length) break;
    for (const u of data.users) {
      if (u.email) existingEmails.add(u.email.toLowerCase());
    }
    if (data.users.length < 1000) break;
    page++;
  }

  log(`${existingEmails.size} user(s) already exist in new project (will skip).`);

  // ── Step 4: Create users in new project ───────────────────────────────────

  console.log("\nStep 4 — Creating users in new project…");

  // Map old user_id → new user_id for the ifas linking step
  const userIdMap = new Map<string, string>();

  for (const oldUser of oldUsers) {
    if (!oldUser.email) {
      warn(`Skipping user ${oldUser.id} — no email address.`);
      result.usersSkipped++;
      continue;
    }

    const emailLower = oldUser.email.toLowerCase();

    if (existingEmails.has(emailLower)) {
      // Resolve the existing new-project user_id so we can still link ifas
      const { data: existing } = await newClient.auth.admin.listUsers();
      const match = existing?.users.find(
        (u) => u.email?.toLowerCase() === emailLower
      );
      if (match) userIdMap.set(oldUser.id, match.id);

      log(`SKIP  ${oldUser.email} — already exists.`);
      result.usersSkipped++;
      continue;
    }

    if (DRY_RUN) {
      log(`DRY   ${oldUser.email} — would create.`);
      result.usersCreated++;
      continue;
    }

    // Create with a random placeholder password; user must reset via email.
    // We set email_confirm = true to preserve confirmed status from old project.
    const { data: created, error: createError } =
      await newClient.auth.admin.createUser({
        email: oldUser.email,
        email_confirm: Boolean(oldUser.email_confirmed_at),
        user_metadata: {
          ...oldUser.user_metadata,
          migrated_from_commission: true,
          original_id: oldUser.id,
        },
        // Generate a strong random password — user will reset it
        password: crypto.randomUUID() + crypto.randomUUID(),
      });

    if (createError) {
      warn(`FAIL  ${oldUser.email}: ${createError.message}`);
      result.usersFailed++;
      result.errors.push({ email: oldUser.email, error: createError.message });
      continue;
    }

    userIdMap.set(oldUser.id, created.user.id);
    log(`OK    ${oldUser.email} → ${created.user.id}`);
    result.usersCreated++;

    // Optionally send password-reset email so they can set a new password
    if (SEND_RESET_EMAILS) {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.wynnglobal360.com";

      const { error: resetError } = await newClient.auth.resetPasswordForEmail(
        oldUser.email,
        { redirectTo: `${siteUrl}/reset-password` }
      );

      if (resetError) {
        warn(`Reset email failed for ${oldUser.email}: ${resetError.message}`);
      } else {
        result.resetEmailsSent++;
      }
    }
  }

  // ── Step 5: Create ifas records in new project ────────────────────────────

  console.log("\nStep 5 — Migrating ifas records…");

  // Fetch existing ifas in new project to skip duplicates
  const { data: existingIFAs } = await newClient
    .from("ifas")
    .select("email");

  const existingIFAEmails = new Set(
    (existingIFAs ?? []).map((r: { email: string }) => r.email.toLowerCase())
  );

  for (const ifa of ifas) {
    const emailLower = ifa.email.toLowerCase();

    if (existingIFAEmails.has(emailLower)) {
      log(`SKIP  ifas ${ifa.email} — already exists.`);
      result.ifasSkipped++;

      // Still attempt to link user_id if it's missing
      if (!DRY_RUN && ifa.user_id) {
        const newUserId = userIdMap.get(ifa.user_id);
        if (newUserId) {
          await newClient
            .from("ifas")
            .update({ user_id: newUserId })
            .eq("email", emailLower)
            .is("user_id", null);
        }
      }
      continue;
    }

    if (DRY_RUN) {
      log(`DRY   ifas ${ifa.email} (${ifa.role}) — would create.`);
      result.ifasCreated++;
      continue;
    }

    // Resolve new user_id from the map (null if user wasn't migrated/found)
    const newUserId = ifa.user_id ? (userIdMap.get(ifa.user_id) ?? null) : null;

    const { error: insertError } = await newClient.from("ifas").insert({
      // Preserve all fields except the primary key (let DB generate new UUID)
      code: ifa.code,
      name: ifa.name,
      email: emailLower,
      role: ifa.role,
      status: ifa.status,
      user_id: newUserId,
    });

    if (insertError) {
      warn(`FAIL  ifas ${ifa.email}: ${insertError.message}`);
      result.ifasFailed++;
      result.errors.push({ email: ifa.email, error: insertError.message });
      continue;
    }

    if (newUserId) result.linkedCount++;
    log(`OK    ifas ${ifa.email} (${ifa.role})${newUserId ? " — linked" : " — unlinked"}`);
    result.ifasCreated++;
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n" + "─".repeat(60));
  console.log(DRY_RUN ? "DRY RUN COMPLETE (no writes made)" : "MIGRATION COMPLETE");
  console.log("─".repeat(60));
  console.log(`Auth users   total: ${result.usersTotal}`);
  console.log(`  created  : ${result.usersCreated}`);
  console.log(`  skipped  : ${result.usersSkipped}`);
  console.log(`  failed   : ${result.usersFailed}`);
  if (SEND_RESET_EMAILS) {
    console.log(`  reset emails sent: ${result.resetEmailsSent}`);
  }
  console.log(`ifas rows    total: ${result.ifasTotal}`);
  console.log(`  created  : ${result.ifasCreated}`);
  console.log(`  skipped  : ${result.ifasSkipped}`);
  console.log(`  failed   : ${result.ifasFailed}`);
  console.log(`  linked   : ${result.linkedCount}`);

  if (result.errors.length) {
    console.log(`\nErrors (${result.errors.length}):`);
    for (const e of result.errors) {
      console.log(`  ${e.email}: ${e.error}`);
    }
    process.exit(1);
  }

  console.log("\n✅  Done.\n");
}

run().catch((err) => {
  console.error("\n❌  Unhandled error:", err);
  process.exit(1);
});
