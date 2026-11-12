import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/current-user';
import { SearchPanel } from '@/features/library/SearchPanel';
import { searchCatalog } from '@/features/library/search-actions';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  const page = typeof params.page === 'string' ? Number(params.page) : 1;
  const result = await searchCatalog({ query, page });
  return <section className="stack reading-column"><h1>Search</h1><SearchPanel key={`${query}:${page}`} initialQuery={query} initialPage={page} initialResult={result} userId={user.id} /></section>;
}
