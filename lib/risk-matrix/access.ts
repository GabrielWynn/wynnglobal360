import { requireAppAccess } from "@/lib/app-access";

/**
 * Server-side guard for Risk Matrix pages: only users who have been given
 * the Risk Matrix app (and admins) get through. Called from the layout and
 * from every page that reads data, since a layout is not re-run on client
 * navigation.
 */
export async function requireRiskMatrixAccess(): Promise<void> {
  await requireAppAccess("risk-matrix");
}
