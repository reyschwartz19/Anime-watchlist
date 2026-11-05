import React, { useContext, useState, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext';
import { AnimeCard } from '../components/AnimeCard';
import { AnimeStatus, UserAnime } from '../types';
import { updateAnimeStatus, removeAnime } from '../services/firebase';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';

type Tab = AnimeStatus | 'all';

export const DashboardPage: React.FC = () => {
    const { userData, user, refreshUserData } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState<Tab>('watching');

    const watchlist = userData?.watchlist || {};
    const animeList = useMemo(() => Object.values(watchlist), [watchlist]);

    const filteredList = useMemo(() => {
        if (activeTab === 'all') return animeList;
        return animeList.filter(a => a.status === activeTab);
    }, [animeList, activeTab]);

    const handleStatusUpdate = async (anime: any, status: AnimeStatus) => {
        if (!user) return;
        await updateAnimeStatus(user.uid, anime as UserAnime, status);
        await refreshUserData();
    };

    const handleRemove = async (id: number) => {
        if (!user) return;
        if(window.confirm("Are you sure you want to remove this from your list?")) {
            await removeAnime(user.uid, id);
            await refreshUserData();
        }
    };

    const tabs: { id: Tab; label: string; count: number }[] = [
        { id: 'watching', label: 'Watching', count: animeList.filter(a => a.status === 'watching').length },
        { id: 'plan_to_watch', label: 'Plan to Watch', count: animeList.filter(a => a.status === 'plan_to_watch').length },
        { id: 'completed', label: 'Completed', count: animeList.filter(a => a.status === 'completed').length },
        { id: 'dropped', label: 'Dropped', count: animeList.filter(a => a.status === 'dropped').length },
    ];

    if (animeList.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
                <div className="bg-slate-800 p-6 rounded-full">
                    <Search size={48} className="text-slate-500" />
                </div>
                <h2 className="text-2xl font-bold text-white">Your list is empty</h2>
                <p className="text-slate-400 max-w-md">Start by searching for anime you love or use our AI to find new gems.</p>
                <div className="flex space-x-4">
                    <Link to="/search" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition">
                        Search Anime
                    </Link>
                    <Link to="/recommendations" className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-medium transition">
                        Get Recommendations
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
                <h1 className="text-3xl font-bold text-white mb-4 md:mb-0">My Dashboard</h1>
                <Link to="/recommendations" className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition">
                    <span>Ask AI for next watch</span>
                </Link>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-800 pb-4">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center space-x-2 ${
                            activeTab === tab.id
                                ? 'bg-slate-800 text-white shadow-inner'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}
                    >
                        <span>{tab.label}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-slate-700' : 'bg-slate-800'}`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {filteredList.map(anime => (
                    <AnimeCard
                        key={anime.mal_id}
                        anime={anime}
                        currentStatus={anime.status}
                        onUpdateStatus={handleStatusUpdate}
                        onRemove={handleRemove}
                    />
                ))}
            </div>

            {filteredList.length === 0 && (
                <div className="text-center py-20 text-slate-500 italic">
                    No anime found in this category.
                </div>
            )}
        </div>
    );
};