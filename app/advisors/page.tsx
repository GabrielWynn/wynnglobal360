import CarouselHub from "@/components/hub/CarouselHub";
import { createServerClient } from "@/lib/supabase";
import { getHubUser } from "@/lib/app-access";

export default async function AdvisorsPage() {
  // Identify the authenticated user from the cookie-based session
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // user_id first, email fallback for rows not yet linked. A user without
  // an ifas row has no apps.
  const hubUser = user ? await getHubUser(user.id, user.email) : null;

  return <CarouselHub name={hubUser?.name ?? ""} apps={hubUser?.apps ?? []} />;
}
