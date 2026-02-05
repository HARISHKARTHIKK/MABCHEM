import { LayoutDashboard, Package, ClipboardList, FileText, Users, BarChart3, Settings, Truck, LogOut, X, TrendingUp, CreditCard, Box, Sun, Moon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';


const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Inventory / Product', href: '/inventory', icon: ClipboardList },
    { name: 'Invoices', href: '/invoices', icon: FileText },
    { name: 'Stock Management', href: '/stock-management', icon: Box },
    { name: 'Dispatch', href: '/dispatch', icon: Truck },
    { name: 'Customers', href: '/customers', icon: Users },
    { name: 'Purchase Orders', href: '/purchase-orders', icon: ClipboardList },
    { name: 'Transporters', href: '/transporters', icon: Truck },
    { name: 'Suppliers', href: '/suppliers', icon: Users },
    { name: 'Logistics Reports', href: '/transporter-reports', icon: TrendingUp },
    { name: 'Expenses', href: '/expenses', icon: CreditCard },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
    { name: 'Recycle Bin', href: '/recycle-bin', icon: Trash2 },
    { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar({ isOpen, onClose }) {
    const { settings } = useSettings();
    const { userRole, logout } = useAuth();
    const { isDarkMode, toggleTheme } = useTheme();


    const filteredNav = navigation.filter(item => {
        if (item.name === 'Dispatch') {
            return settings?.transport?.enable !== false;
        }
        if (item.name === 'Settings' || item.name === 'Users') {
            return userRole === 'admin';
        }
        return true;
    });

    return (
        <aside className={cn(
            "fixed inset-y-0 left-0 flex flex-col w-64 bg-slate-900 dark:bg-slate-950 border-r border-slate-800 dark:border-slate-800 text-white shadow-2xl z-40 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:z-0",
            isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
            <div className="flex h-16 items-center justify-between px-6 border-b border-slate-800 dark:border-slate-800 bg-slate-900 dark:bg-slate-950">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold tracking-wider text-blue-400">MAB<span className="text-white"> CHEM</span></h1>
                    <button
                        onClick={toggleTheme}
                        className="p-1.5 rounded-lg bg-slate-800/50 border border-slate-700 hover:bg-slate-800 hover:border-slate-600 transition-all duration-300 group/theme"
                        title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {isDarkMode ? (
                            <Sun className="h-4 w-4 text-amber-400 group-hover/theme:rotate-90 transition-transform duration-500" />
                        ) : (
                            <Moon className="h-4 w-4 text-blue-400 group-hover/theme:-rotate-12 transition-transform duration-500" />
                        )}
                    </button>
                </div>
                <button
                    onClick={onClose}
                    className="lg:hidden p-2 -mr-2 text-slate-400 hover:text-white transition-colors"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
            <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
                {filteredNav.map((item) => (
                    <NavLink
                        key={item.name}
                        to={item.href}
                        onClick={() => {
                            if (window.innerWidth < 1024) onClose();
                        }}
                        className={({ isActive }) =>
                            cn(
                                'group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all',
                                isActive
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            )
                        }
                    >
                        <item.icon className="mr-3 h-5 w-5 flex-shrink-0 transition-transform group-hover:scale-110" />
                        {item.name}
                    </NavLink>
                ))}
            </nav>
            <div className="border-t border-slate-800 p-4 bg-slate-900 dark:bg-slate-950 space-y-2">
                <button
                    onClick={() => logout()}
                    className="flex items-center gap-3 px-2 w-full text-left hover:bg-slate-800 dark:hover:bg-slate-900 p-2 rounded-lg transition-colors group"
                >
                    <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 ring-1 ring-red-500/50 group-hover:bg-red-500 group-hover:text-white transition-all">
                        <LogOut className="h-4 w-4" />
                    </div>
                    <div className="text-xs text-slate-400 group-hover:text-slate-200">
                        <p className="font-medium text-white">Sign Out</p>
                        <p className="">End Session</p>
                    </div>
                </button>
            </div>
        </aside>
    );
}
