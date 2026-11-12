import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/current-user';
import { ProfileForm } from '@/features/library/ProfileForm';

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboarded) redirect('/recommendations');
  return <section className="onboarding-shell stack">
    <ProfileForm onboarding profile={{ userId: user.id, displayName: user.displayName, photoURL: user.photoURL, interests: user.interests, favoriteAnimes: user.favoriteAnimes }} />
  </section>;
}
