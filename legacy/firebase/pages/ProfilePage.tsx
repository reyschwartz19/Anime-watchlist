import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { updateUserProfile, updateUserEmailAddress, updateUserPasswordString, resendVerificationEmail } from '../services/firebase';
import { GENRES } from '../types';
import { User, Save, Check, X, Tag, Shield, AlertTriangle, Loader } from 'lucide-react';

export const ProfilePage: React.FC = () => {
    const { user, userData, refreshUserData } = useContext(AuthContext);

    // Profile Data
    const [displayName, setDisplayName] = useState('');
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [favoriteInput, setFavoriteInput] = useState('');

    // Security Data
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // UI State
    const [saving, setSaving] = useState(false);
    const [securityLoading, setSecurityLoading] = useState(false);
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        if (userData) {
            setDisplayName(userData.displayName || '');
            setSelectedGenres(userData.interests || []);
            setFavorites(userData.favoriteAnimes || []);
        }
        if (user) {
            setNewEmail(user.email || '');
        }
    }, [userData, user]);

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

    const handleProfileSave = async () => {
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

    const handleSecurityUpdate = async () => {
        if (!user) return;
        setMessage(null);
        setSecurityLoading(true);

        try {
            // Update Email if changed
            if (newEmail !== user.email) {
                await updateUserEmailAddress(user, newEmail);
                setMessage({ type: 'success', text: 'Email updated! Verification sent to new address.' });
            }

            // Update Password if provided
            if (newPassword) {
                if (newPassword.length < 6) throw new Error("Password must be at least 6 characters.");
                if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");

                await updateUserPasswordString(user, newPassword);
                setMessage({ type: 'success', text: 'Password updated successfully.' });
                setNewPassword('');
                setConfirmPassword('');
            }
        } catch (error: any) {
            console.error(error);
            setMessage({ type: 'error', text: error.message || 'Security update failed. You may need to re-login.' });
        } finally {
            setSecurityLoading(false);
        }
    };

    const handleResendVerification = async () => {
        if (!user) return;
        setVerificationLoading(true);
        setMessage(null);
        try {
            await resendVerificationEmail(user);
            setMessage({ type: 'success', text: '✉️ Verification email sent! Please check your inbox and spam folder.' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Failed to send verification email.' });
        } finally {
            setVerificationLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-10">
            <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-lg">
                    <User className="w-8 h-8 text-white" />
                </div>
                Edit Profile
            </h1>

            {message && (
                <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${message.type === 'success' ? 'bg-green-900/50 text-green-200 border border-green-700' : 'bg-red-900/50 text-red-200 border border-red-700'}`}>
                    {message.type === 'success' ? <Check size={20} className="shrink-0 mt-0.5" /> : <X size={20} className="shrink-0 mt-0.5" />}
                    <span className="text-sm md:text-base leading-relaxed">{message.text}</span>
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
                            <label className="block text-sm font-medium text-slate-400 mb-1">User ID</label>
                            <input
                                type="text"
                                value={user?.uid || ''}
                                disabled
                                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-500 cursor-not-allowed font-mono text-sm"
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
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${selectedGenres.includes(genre)
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

                    {/* Save Button */}
                    <div className="flex justify-end pt-6 border-t border-slate-700 mt-6">
                        <button
                            onClick={handleProfileSave}
                            disabled={saving}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 px-8 rounded-lg shadow-lg shadow-indigo-600/20 transition flex items-center space-x-2"
                        >
                            {saving ? (
                                <Loader className="animate-spin" />
                            ) : (
                                <Save size={20} />
                            )}
                            <span>Save Preferences</span>
                        </button>
                    </div>
                </div>

                {/* Security Settings */}
                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <Shield className="text-emerald-400" size={24} />
                        Security Settings
                    </h2>

                    <div className="space-y-6">
                        {/* Email Update */}
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Email Address</label>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition"
                                />
                                {user && !user.emailVerified && (
                                    <button
                                        onClick={handleResendVerification}
                                        disabled={verificationLoading}
                                        className="bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600/30 disabled:opacity-50 disabled:cursor-not-allowed px-4 rounded-lg text-sm font-medium border border-yellow-600/50 transition flex items-center gap-2"
                                        title="Send Verification Email"
                                    >
                                        {verificationLoading ? (
                                            <>
                                                <Loader className="animate-spin" size={14} />
                                                <span>Sending...</span>
                                            </>
                                        ) : (
                                            'Verify'
                                        )}
                                    </button>
                                )}
                            </div>
                            {user && !user.emailVerified && (
                                <p className="text-xs text-yellow-500 mt-1 flex items-center gap-1">
                                    <AlertTriangle size={12} /> Email not verified.
                                </p>
                            )}
                        </div>

                        {/* Password Update */}
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">New Password</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Leave blank to keep current"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Confirm Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new password"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition"
                                />
                            </div>
                        </div>

                        {/* Security Save */}
                        <div className="flex justify-end pt-4">
                            <button
                                onClick={handleSecurityUpdate}
                                disabled={securityLoading}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-lg shadow-lg shadow-emerald-600/20 transition flex items-center space-x-2"
                            >
                                {securityLoading ? <Loader className="animate-spin" size={18} /> : <Check size={18} />}
                                <span>Update Security</span>
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
