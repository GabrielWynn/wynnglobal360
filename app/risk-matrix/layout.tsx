import Navbar from "@/components/hub/Navbar";
import SessionTimeout from "@/components/SessionTimeout";
import SubNav from "@/components/risk-matrix/SubNav";
import { requireRiskMatrixAccess } from "@/lib/risk-matrix/access";
import { REVIEW_NOTICE_DAYS, addDaysISO, utcTodayISO } from "@/lib/risk-matrix/reviews";
import { countReviewsDue } from "@/lib/risk-matrix/service";
import "./risk-matrix.css";

export default async function RiskMatrixLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Admin and compliance only
  await requireRiskMatrixAccess();

  // Reminder badge on the sub-nav; never let it take the whole module down
  let reviewsDue = 0;
  try {
    reviewsDue = await countReviewsDue(addDaysISO(utcTodayISO(), REVIEW_NOTICE_DAYS));
  } catch (err) {
    console.error("risk-matrix: review count failed", err);
  }

  return (
    <>
      <Navbar />
      {/* 40 px sub-nav sits directly below the 64 px main navbar */}
      <SubNav reviewsDue={reviewsDue} />
      <SessionTimeout />
      {/* pt-[104px] = 64 px navbar + 40 px sub-nav */}
      <div
        className="rm-shell pt-[104px] min-h-screen"
        style={{ background: "var(--wgi-bg)" }}
      >
        {children}
      </div>
    </>
  );
}
