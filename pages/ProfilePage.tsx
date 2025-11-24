import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { updateUserProfile } from '../services/firebase';
import { GENRES } from '../types';
import { User, Save, Check, X, Tag } from 'lucide-react';

export const ProfilePage: React.FC = () => {
    const { user, userData, refreshUserData } = useContext(AuthContext);
    const [displayName, setDisplayName] = useState('');
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [favoriteInput, setFavoriteInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        if (userData) {
            setDisplayName(userData.displayName || '');
            setSelectedGenres(userData.interests || []);
            setFavorites(userData.favoriteAnimes || []);
        }
    }, [userData]);

    const toggleGenre = (genre: string) => {
        if (selectedGenres.includes(genre)) {
            setSelectedGenres(selectedGenres.filter(g => g !== genre));
        } else {
            setSelectedGenres([...selectedGenres, genre]);
        }
    };

    const addFavorite = (e: React.FormEvent) => {
        e.preventDefault();
        if (favoriteInput.trim()) {
            setFavorites([...favorites, favoriteInput.trim()]);
            setFavoriteInput('');
        }
    };

    const removeFavorite = (fav: string) => {
        setFavorites(favorites.filter(f => f !== fav));
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        setMessage(null);

        try {
            await updateUserProfile(user.uid, {
                displayName,
                interests: selectedGenres,
                favoriteAnimes: favorites
            });
            await refreshUserData();
            setMessage({ type: 'success', text: 'Profile updated successfully!' });
        } catch (error) {
            console.error(error);
            setMessage({ type: 'error', text: 'Failed to update profile.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-lg">
                    <User className="w-8 h-8 text-white" />
                </div>
                Edit Profile
            </h1>

            {message && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-900/50 text-green-200 border border-green-700' : 'bg-red-900/50 text-red-200 border border-red-700'}`}>
                    {message.type === 'success' ? <Check size={20} /> : <X size={20} />}
                    {message.text}
                </div>
            )}

            <div className="grid gap-8">
                {/* Personal Info */}
                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
                    <h2 className="text-xl font-semibold text-white mb-4">Personal Information</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Display Name</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Email</label>
                            <input
                                type="text"
                                value={userData?.email || ''}
                                disabled
                                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-500 cursor-not-allowed"
                            />
                        </div>
                    </div>
                </div>

                {/* Anime Preferences */}
                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
                    <h2 className="text-xl font-semibold text-white mb-4">Anime Preferences</h2>
                    
                    {/* Genres */}
                    <div className="mb-8">
                        <label className="block text-sm font-medium text-slate-400 mb-3">Favorite Genres</label>
                        <div className="flex flex-wrap gap-2">
                            {GENRES.map(genre => (
                                <button
                                    key={genre}
                                    onClick={() => toggleGenre(genre)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                                        selectedGenres.includes(genre)
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-800'
                                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                                >
                                    {genre}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Favorites */}
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-3">Top Favorites</label>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {favorites.map(fav => (
                                <div key={fav} className="bg-slate-900 border border-slate-600 text-indigo-300 px-3 py-1.5 rounded-md flex items-center gap-2 text-sm shadow-sm">
                                    <Tag size={14} />
                                    <span>{fav}</span>
                                    <button onClick={() => removeFavorite(fav)} className="hover:text-red-400 ml-1 p-0.5 rounded-full hover:bg-slate-800 transition">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={addFavorite} className="flex gap-2 max-w-md">
                            <input
                                type="text"
                                value={favoriteInput}
                                onChange={(e) => setFavoriteInput(e.target.value)}
                                placeholder="Add another favorite..."
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                            />
                            <button type="submit" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                                Add
                            </button>
                        </form>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 px-8 rounded-lg shadow-lg shadow-indigo-600/20 transition flex items-center space-x-2"
                    >
                        {saving ? (
                            <span>Saving...</span>
                        ) : (
                            <>
                                <Save size={20} />
                                <span>Save Changes</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};