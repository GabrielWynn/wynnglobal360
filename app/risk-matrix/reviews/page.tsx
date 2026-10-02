import ReviewsList from "@/components/risk-matrix/ReviewsList";
import { requireRiskMatrixAccess } from "@/lib/risk-matrix/access";
import { utcTodayISO } from "@/lib/risk-matrix/reviews";
import { listReviews } from "@/lib/risk-matrix/service";

export default async function RiskMatrixReviewsPage() {
  await requireRiskMatrixAccess();

  // Every scheduled review: overdue, upcoming and further ahead
  const clients = await listReviews();

  return <ReviewsList clients={clients} today={utcTodayISO()} />;
}
