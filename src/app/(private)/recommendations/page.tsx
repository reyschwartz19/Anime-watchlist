import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/current-user';
import { DiscoverView } from '@/features/discovery/DiscoverView';

export default async function RecommendationsPage() {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');
  return <section className="stack discover-page"><h1>Discover</h1><DiscoverView userId={user.id} /></section>;
}
