import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { loginWithGoogle, registerWithEmail, loginWithEmail } from '../services/firebase';
import { Tv, Mail, Lock, User, AlertCircle, Loader } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { user, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      await loginWithGoogle();
    } catch (error: any) {
      console.error("Login failed", error);
      setError("Google Login failed. Please try again.");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!email || !password) {
          setError("Please fill in all fields.");
          return;
      }
      
      setAuthLoading(true);
      try {
          if (mode === 'signup') {
            if (!displayName) {
                setError("Please enter a display name.");
                setAuthLoading(false);
                return;
            }
            await registerWithEmail(email, password, displayName);
          } else {
            await loginWithEmail(email, password);
          }
      } catch (err: any) {
          setError(err.message || "Authentication failed.");
      } finally {
          setAuthLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
      </div>

      <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700 p-8 rounded-2xl shadow-2xl w-full max-w-md z-10">
        <div className="mb-6 flex flex-col items-center">
            <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg shadow-indigo-500/30 mb-4">
                <Tv size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Anime Checklist</h1>
            <p className="text-slate-400 text-sm">Track your journey, discover new worlds.</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-900/50 p-1 rounded-lg mb-6">
            <button 
                onClick={() => { setMode('login'); setError(null); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition ${mode === 'login' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
                Login
            </button>
            <button 
                onClick={() => { setMode('signup'); setError(null); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition ${mode === 'signup' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
                Sign Up
            </button>
        </div>

        {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-200 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
            </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
            {mode === 'signup' && (
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase">Display Name</label>
                    <div className="relative">
                        <User className="absolute left-3 top-3 text-slate-500" size={18} />
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Otaku King"
                            className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-indigo-500 transition"
                        />
                    </div>
                </div>
            )}

            <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Email</label>
                <div className="relative">
                    <Mail className="absolute left-3 top-3 text-slate-500" size={18} />
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-indigo-500 transition"
                    />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Password</label>
                <div className="relative">
                    <Lock className="absolute left-3 top-3 text-slate-500" size={18} />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-indigo-500 transition"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition transform active:scale-95 flex items-center justify-center space-x-2"
            >
                {authLoading ? <Loader className="animate-spin" size={20} /> : <span>{mode === 'login' ? 'Login' : 'Create Account'}</span>}
            </button>
        </form>

        <div className="my-6 flex items-center">
            <div className="flex-grow border-t border-slate-700"></div>
            <span className="mx-4 text-slate-500 text-xs uppercase">Or continue with</span>
            <div className="flex-grow border-t border-slate-700"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          type="button"
          className="w-full flex items-center justify-center space-x-3 bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 px-4 rounded-lg transition duration-200"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          <span>Google</span>
        </button>
      </div>
    </div>
  );
};
