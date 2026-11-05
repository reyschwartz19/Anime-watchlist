import { requireUser } from '@/lib/current-user';
import { getVerifiedAuthSession } from '@/lib/auth';
import { ProfileForm } from '@/features/library/ProfileForm';
import { AccountSecurity } from '@/features/auth/AccountSecurity';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { HiddenTitles } from '@/features/feedback/HiddenTitles';
import { getHiddenTitles } from '@/features/feedback/actions';
import { parseFavorite } from '@/features/library/favorites';

export default async function ProfilePage() {
  const [user, session, hidden] = await Promise.all([requireUser(), getVerifiedAuthSession(), getHiddenTitles()]);
  const profile = { userId: user.id, displayName: user.displayName, photoURL: user.photoURL, interests: user.interests, favoriteAnimes: user.favoriteAnimes };
  const initials = (user.displayName || 'Anime viewer').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <section className="stack"><h1>Profile</h1><div className="profile-layout"><aside className="profile-aside"><div className="profile-identity"><span className="avatar" aria-label="Profile initials">{initials}</span><h2>{user.displayName || 'Your shelf'}</h2></div><nav aria-label="Profile sections"><a href="#identity">Your account</a><a href="#taste">My taste</a><a href="#hidden">Hidden titles</a><a href="#security">Account security</a></nav></aside><div className="profile-sections stack">
    <section id="identity" className="stack"><h2>Your account</h2><div className="summary-row"><div><strong>Display name</strong><p>{user.displayName || 'Not set'}</p></div></div><div className="summary-row"><div><strong>Email</strong><p>{session?.email ?? user.email ?? 'Not available'}</p></div></div><details><summary>Edit identity</summary><ProfileForm profile={profile} section="identity" /></details></section>
    <section id="taste" className="panel stack"><h2>My taste</h2><div className="genre-tags">{user.interests.length ? user.interests.map(genre => <span key={genre}>{genre}</span>) : <p>No favorite genres yet.</p>}</div><p>{user.favoriteAnimes.length ? user.favoriteAnimes.map(value => parseFavorite(value).title).join(' · ') : 'No favorite titles yet. Add a few to guide your picks.'}</p><details><summary>Edit taste</summary><ProfileForm profile={profile} section="taste" /></details></section>
    <section id="hidden" className="panel stack"><h2>Hidden titles ({hidden.length})</h2><HiddenTitles titles={hidden} /></section>
    <div id="security"><AccountSecurity email={session?.email ?? user.email ?? ''} emailVerified={session?.emailVerified ?? false} /></div>
    <div className="panel"><SignOutButton /></div>
    <details className="panel"><summary>Migration identity</summary><div className="stack"><p>Download the verified identity used by the private migration tool.</p><a className="button" href="/api/migration/identity" download>Download verified migration identity</a></div></details>
  </div></div></section>;
}
