import { useAuth } from '../context/AuthContext';
import { LogOut, Bell, User, Search, Menu, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function Header({ onMenuClick }) {
    const { logout, currentUser } = useAuth();
    const { isDarkMode, toggleTheme } = useTheme();

    return (
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 h-16 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 shadow-sm w-full transition-colors duration-300">
            <div className="flex items-center gap-2 md:gap-4 flex-1">
                {/* Mobile Menu Toggle */}
                <button
                    onClick={onMenuClick}
                    className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg lg:hidden transition-colors"
                >
                    <Menu className="h-6 w-6" />
                </button>

                {/* Company Context */}
                <div className="hidden sm:flex items-center gap-2 mr-6 border-r border-slate-200 pr-6">
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-xs md:text-sm leading-tight">MAB CHEMICALS PVT. LTD.</span>
                        <span className="text-[10px] text-slate-500 font-mono hidden md:block">GSTIN: 27ABCDE1234F1Z5</span>
                    </div>
                </div>

                {/* Search Bar - Hidden on small mobile */}
                <div className="relative w-full max-w-xs md:max-w-md hidden sm:block">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full pl-10 pr-4 py-1.5 md:py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-700 placeholder:text-slate-400"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4">
                <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full relative transition-colors">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                </button>

                <div className="flex items-center gap-2 md:gap-3 border-l border-slate-200 dark:border-slate-800 pl-2 md:pl-4">
                    <div className="text-right hidden lg:block">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{currentUser?.email || 'Admin User'}</p>
                        <p className="text-xs text-slate-500 capitalize">Administrator</p>
                    </div>
                    <div className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                        <span className="font-bold text-xs md:text-sm">A</span>
                    </div>
                    <button
                        onClick={logout}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Sign out"
                    >
                        <LogOut className="h-5 w-5" />
                    </button>
                </div>

                {/* Theme Toggle - Moved to Far Right */}
                <button
                    onClick={toggleTheme}
                    className="p-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all duration-300 border-l border-slate-200 dark:border-slate-800 ml-2"
                    title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    <div className="relative h-5 w-5">
                        {isDarkMode ? (
                            <Sun className="h-5 w-5 text-amber-400 absolute inset-0 transition-all duration-500 rotate-0 scale-100" />
                        ) : (
                            <Moon className="h-5 w-5 text-blue-600 absolute inset-0 transition-all duration-500 rotate-0 scale-100" />
                        )}
                    </div>
                </button>
            </div>
        </header>
    );
}
