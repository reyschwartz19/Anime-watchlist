import React, { useContext, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { logout } from '../services/firebase';
import { Search, List, Sparkles, LogOut, Menu, X, Tv, User as UserIcon } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { userData } = useContext(AuthContext);
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path ? 'text-indigo-400 bg-slate-800' : 'text-slate-300 hover:text-white hover:bg-slate-800';

  const handleLogout = async () => {
    await logout();
  };

  const NavLinks = () => (
    <>
      <Link to="/" className={`flex items-center space-x-2 px-3 py-2 rounded-md transition ${isActive('/')}`}>
        <List size={20} />
        <span>My List</span>
      </Link>
      <Link to="/search" className={`flex items-center space-x-2 px-3 py-2 rounded-md transition ${isActive('/search')}`}>
        <Search size={20} />
        <span>Search</span>
      </Link>
      <Link to="/recommendations" className={`flex items-center space-x-2 px-3 py-2 rounded-md transition ${isActive('/recommendations')}`}>
        <Sparkles size={20} className={location.pathname === '/recommendations' ? 'text-indigo-400' : 'text-yellow-400'} />
        <span>AI Recs</span>
      </Link>
    </>
  );

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 font-bold text-xl text-white">
            <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-1.5 rounded-lg">
                <Tv size={20} className="text-white" />
            </div>
            <span className="hidden sm:inline">Anime Checklist</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-4">
            <NavLinks />
          </div>

          {/* User Profile / Logout */}
          <div className="hidden md:flex items-center space-x-4 pl-4 border-l border-slate-800">
             {userData && (
                <Link to="/profile" className="flex items-center space-x-2 text-sm text-slate-400 hover:text-white transition group">
                   <div className="bg-slate-800 p-1 rounded-full group-hover:bg-slate-700 transition">
                      <UserIcon size={16} />
                   </div>
                   <span className="truncate max-w-[150px]">
                      {userData.displayName?.split(' ')[0]}
                   </span>
                </Link>
             )}
             <button 
                onClick={handleLogout}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-red-400 transition"
                title="Logout"
             >
                <LogOut size={20} />
             </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
             <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-300">
                {mobileMenuOpen ? <X /> : <Menu />}
             </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 pt-2 pb-4 space-y-1">
            <NavLinks />
            <div className="border-t border-slate-800 mt-4 pt-4 flex justify-between items-center px-3">
                 <Link 
                    to="/profile" 
                    className="flex items-center space-x-2 text-slate-400 text-sm hover:text-white"
                    onClick={() => setMobileMenuOpen(false)}
                 >
                    <UserIcon size={16} />
                    <span>{userData?.email}</span>
                 </Link>
                <button onClick={handleLogout} className="text-red-400 text-sm flex items-center space-x-1">
                    <LogOut size={16} /> <span>Logout</span>
                </button>
            </div>
        </div>
      )}
    </nav>
  );
};