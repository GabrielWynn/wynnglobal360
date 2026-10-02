import Navbar from "@/components/hub/Navbar";
import SessionTimeout from "@/components/SessionTimeout";
import { requireAppAccess } from "@/lib/app-access";

export default async function FinancialPlannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Ensure user has an ifas record and has been given this app
  await requireAppAccess("financial-planner");

  return (
    <>
      <Navbar />
      <SessionTimeout />
      <div className="pt-16 min-h-screen" style={{ background: "var(--wgi-bg)" }}>
        {children}
      </div>
    </>
  );
}
