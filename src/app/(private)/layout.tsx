import { requireUser } from '@/lib/current-user';
import { Navigation } from '@/features/library/Navigation';

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <Navigation />
    <main className="app-shell" id="main-content" tabIndex={-1}>{children}</main>
  </>;
}
