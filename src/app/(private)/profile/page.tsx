import { requireUser } from '@/lib/current-user';
import { getVerifiedAuthSession } from '@/lib/auth';
import { ProfileForm } from '@/features/library/ProfileForm';
import { AccountSecurity } from '@/features/auth/AccountSecurity';

export default async function ProfilePage() {
  const [user, session] = await Promise.all([requireUser(), getVerifiedAuthSession()]);
  return <section className="stack">
    <h1>Profile</h1>
    <ProfileForm profile={{ displayName: user.displayName, photoURL: user.photoURL, interests: user.interests, favoriteAnimes: user.favoriteAnimes }} />
    <AccountSecurity email={session?.email ?? user.email ?? ''} emailVerified={session?.emailVerified ?? false} />
    <details className="panel stack"><summary>Migration identity</summary>
      <p>Internal user ID: <code>{user.id}</code></p>
      <p>Auth provider ID: <code>{user.authProviderId}</code></p>
      <p>The internal ID owns your library. It is separate from your login provider’s ID.</p>
      <a className="button" href="/api/migration/identity" download>Download verified migration identity</a>
    </details>
  </section>;
}
