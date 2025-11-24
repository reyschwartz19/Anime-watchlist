import React, { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { loginWithGoogle } from '../services/firebase';
import { Tv } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { user, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error("Login failed", error);
      alert("Login failed. Check console for details.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
      </div>

      <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700 p-8 rounded-2xl shadow-2xl w-full max-w-md z-10 text-center">
        <div className="mb-6 flex justify-center">
            <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg shadow-indigo-500/30">
                <Tv size={48} className="text-white" />
            </div>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-2">Anime Checklist</h1>
        <p className="text-slate-400 mb-8">Track your journey, discover new worlds with AI.</p>

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center space-x-3 bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 px-4 rounded-lg transition duration-200 transform active:scale-95"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          <span>Continue with Google</span>
        </button>

        <div className="mt-6 text-xs text-slate-500">
           By continuing, you agree to our Terms of Service.
           <br/>
           (Demo Mode: If API keys are missing, mock login works)
        </div>
      </div>
    </div>
  );
};