import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/current-user';
import { ProfileForm } from '@/features/library/ProfileForm';

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboarded) redirect('/library');
  return <section className="stack">
    <h1>Welcome to Anime Watchlist</h1>
    <p>Choose the genres you like and add favorite titles to guide your recommendations.</p>
    <ProfileForm onboarding profile={{ displayName: user.displayName, photoURL: user.photoURL, interests: user.interests, favoriteAnimes: user.favoriteAnimes }} />
  </section>;
}
