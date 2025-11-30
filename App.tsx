import React, { useContext } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { SearchPage } from './pages/SearchPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { Loader, AlertTriangle } from 'lucide-react';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading, userData } = useContext(AuthContext);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-200">
                <Loader className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/auth" replace />;
    }

    // If user is logged in but hasn't completed onboarding (no interests set), redirect to onboarding
    // Unless we are already on the onboarding page (handled by routing structure below)
    if (user && !userData?.onboarded) {
        return <Navigate to="/onboarding" replace />;
    }

    return <>{children}</>;
};

const OnboardingRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading, userData } = useContext(AuthContext);

    if (loading) return null;
    if (!user) return <Navigate to="/auth" replace />;
    if (userData?.onboarded) return <Navigate to="/" replace />;

    return <>{children}</>;
};

const AppContent: React.FC = () => {
    const location = useLocation();
    const { user } = useContext(AuthContext);
    const isAuthPage = location.pathname === '/auth';
    const isOnboarding = location.pathname === '/onboarding';

    // Check if user is logged in but unverified (excluding demo users)
    const showVerificationWarning = user && !user.emailVerified && !user.email?.endsWith('@example.com');

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col">
            {!isAuthPage && !isOnboarding && <Navbar />}

            {/* Global Warning for Unverified Email */}
            {showVerificationWarning && !isAuthPage && (
                <div className="bg-yellow-600/90 text-white text-center text-sm py-1 px-4 flex justify-center items-center gap-2">
                    <AlertTriangle size={14} />
                    <span>Your email is not verified. Please check your inbox or go to </span>
                    <Link to="/profile" className="underline hover:text-white font-semibold">Profile</Link>
                    <span> to resend.</span>
                </div>
            )}

            <main className={`flex-grow ${!isAuthPage && !isOnboarding ? 'container mx-auto px-4 py-6 max-w-7xl' : ''}`}>
                <Routes>
                    <Route path="/auth" element={<AuthPage />} />
                    <Route path="/onboarding" element={
                        <OnboardingRoute>
                            <OnboardingPage />
                        </OnboardingRoute>
                    } />
                    <Route path="/" element={
                        <PrivateRoute>
                            <DashboardPage />
                        </PrivateRoute>
                    } />
                    <Route path="/search" element={
                        <PrivateRoute>
                            <SearchPage />
                        </PrivateRoute>
                    } />
                    <Route path="/recommendations" element={
                        <PrivateRoute>
                            <RecommendationsPage />
                        </PrivateRoute>
                    } />
                    <Route path="/profile" element={
                        <PrivateRoute>
                            <ProfilePage />
                        </PrivateRoute>
                    } />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
        </div>
    );
}

import { ENV } from './config/env';

const App: React.FC = () => {
    if (!ENV.FIREBASE.apiKey) {
        return (
            <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4 text-center">
                <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
                <h1 className="text-3xl font-bold mb-2">Configuration Error</h1>
                <p className="text-slate-400 max-w-md mb-6">
                    Firebase API keys are missing. Please check your <code>.env</code> file and ensure all <code>REACT_APP_FIREBASE_...</code> variables are set.
                </p>
                <div className="bg-slate-800 p-4 rounded-lg text-left text-sm font-mono overflow-auto max-w-full">
                    <p>REACT_APP_FIREBASE_API_KEY={ENV.FIREBASE.apiKey ? 'Set' : 'Missing'}</p>
                    <p>REACT_APP_FIREBASE_PROJECT_ID={ENV.FIREBASE.projectId || 'Missing'}</p>
                </div>
            </div>
        );
    }

    return (
        <HashRouter>
            <AppContent />
        </HashRouter>
    );
};

export default App;
