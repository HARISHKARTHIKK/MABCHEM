import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Products from './pages/Products';
import Invoices from './pages/Invoices';
import Customers from './pages/Customers';
import Reports from './pages/Reports';
import Dispatch from './pages/Dispatch';
import Settings from './pages/Settings';
import Transporters from './pages/Transporters';
import TransporterReports from './pages/TransporterReports';
import Expenses from './pages/Expenses';
import StockManagement from './pages/StockManagement';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import RecycleBin from './pages/RecycleBin';
import { ThemeProvider, useTheme } from './context/ThemeContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, userRole, loading, logout } = useAuth();
  return (
    <LayoutWrapper
      allowedRoles={allowedRoles}
      userRole={userRole}
      currentUser={currentUser}
      loading={loading}
      logout={logout}
    >
      {children}
    </LayoutWrapper>
  );
};

import { useState } from 'react';
import { Menu, X } from 'lucide-react';

function LayoutWrapper({ children, allowedRoles, userRole, currentUser, loading, logout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { isDarkMode } = useTheme();

  if (loading) return <div className="h-screen w-screen flex items-center justify-center dark:bg-slate-900 dark:text-white">Loading...</div>;
  if (!currentUser) return <Navigate to="/login" />;

  if (userRole === 'suspended') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg border border-red-100 dark:border-red-900/30 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Account Inactive</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">Your access to this system has been suspended by an administrator.</p>
          <button
            onClick={() => logout()}
            className="bg-slate-800 hover:bg-slate-900 dark:bg-blue-600 dark:hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden relative">
      {/* Sidebar - Desktop (Static) & Mobile (Overlay) */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile Header - Visible only on small screens */}
        <header className="lg:hidden flex items-center justify-between px-5 h-16 bg-slate-900 dark:bg-slate-950 text-white shadow-xl z-20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xs">M</span>
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              MAB <span className="text-blue-400">CHEM</span>
            </h1>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -mr-1 text-slate-400 hover:text-white transition-colors active:bg-slate-800 rounded-lg"
            aria-label="Open Menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </header>

        {/* Content Scroll Area */}
        <main className="flex-1 overflow-y-auto w-full bg-slate-50 dark:bg-slate-900 scroll-smooth">
          <div className="p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Sidebar Overlay/Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
              <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
              <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
              <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
              <Route path="/purchase-orders" element={<ProtectedRoute><PurchaseOrders /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/dispatch" element={<ProtectedRoute><Dispatch /></ProtectedRoute>} />
              <Route path="/transporters" element={<ProtectedRoute><Transporters /></ProtectedRoute>} />
              <Route path="/transporter-reports" element={<ProtectedRoute><TransporterReports /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
              <Route path="/stock-management" element={<ProtectedRoute><StockManagement /></ProtectedRoute>} />
              <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
              <Route path="/recycle-bin" element={<ProtectedRoute><RecycleBin /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin']}><Settings /></ProtectedRoute>} />
            </Routes>
          </Router>
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
