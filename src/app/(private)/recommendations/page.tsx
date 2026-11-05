import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/current-user';
import { DiscoverView } from '@/features/discovery/DiscoverView';

// Includes bounded catalog hydration and a single non-streaming Groq request.
export const maxDuration = 180;

export default async function RecommendationsPage() {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');
  return <section className="stack discover-page"><h1>Discover</h1><DiscoverView userId={user.id} /></section>;
}
