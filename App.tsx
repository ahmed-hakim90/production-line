
import React, { useEffect, useRef } from 'react';
import './App.css';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { ProductDetails } from './pages/ProductDetails';
import { Lines } from './pages/Lines';
import { LineDetails } from './pages/LineDetails';
import { Supervisors } from './pages/Supervisors';
import { SupervisorDetails } from './pages/SupervisorDetails';
import { Reports } from './pages/Reports';
import { RolesManagement } from './pages/RolesManagement';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';
import { QuickAction } from './pages/QuickAction';
import { ActivityLogPage } from './pages/ActivityLog';
import { useAppStore } from './store/useAppStore';
import { onAuthChange } from './services/firebase';

const App: React.FC = () => {
  const initializeApp = useAppStore((s) => s.initializeApp);
  const subscribeToDashboard = useAppStore((s) => s.subscribeToDashboard);
  const subscribeToLineStatuses = useAppStore((s) => s.subscribeToLineStatuses);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const loading = useAppStore((s) => s.loading);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const unsub = onAuthChange((user) => {
      if (user) {
        initializeApp().then(() => {
          const state = useAppStore.getState();
          if (state.isAuthenticated) {
            const unsubReports = subscribeToDashboard();
            const unsubStatuses = subscribeToLineStatuses();
            (window as any).__cleanupSubs = () => {
              unsubReports();
              unsubStatuses();
            };
          }
        });
      }
    });

    return () => {
      unsub();
      (window as any).__cleanupSubs?.();
    };
  }, []);

  if (loading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/30 mx-auto mb-4 animate-pulse">
            <span className="material-icons-round text-4xl">factory</span>
          </div>
          <p className="text-sm text-slate-400 font-bold">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        {/* Public: Setup (first-time only) */}
        <Route path="/setup" element={<Setup />} />

        {/* Public: Login */}
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" replace /> : <Login />
        } />

        {/* Protected: All app routes inside Layout */}
        <Route path="/*" element={
          !isAuthenticated ? <Navigate to="/login" replace /> : (
            <Layout>
              <Routes>
                <Route path="/" element={<ProtectedRoute permission="dashboard.view"><Dashboard /></ProtectedRoute>} />
                <Route path="/products" element={<ProtectedRoute permission="products.view"><Products /></ProtectedRoute>} />
                <Route path="/products/:id" element={<ProtectedRoute permission="products.view"><ProductDetails /></ProtectedRoute>} />
                <Route path="/lines" element={<ProtectedRoute permission="lines.view"><Lines /></ProtectedRoute>} />
                <Route path="/lines/:id" element={<ProtectedRoute permission="lines.view"><LineDetails /></ProtectedRoute>} />
                <Route path="/supervisors" element={<ProtectedRoute permission="supervisors.view"><Supervisors /></ProtectedRoute>} />
                <Route path="/supervisors/:id" element={<ProtectedRoute permission="supervisors.view"><SupervisorDetails /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                <Route path="/quick-action" element={<ProtectedRoute permission="quickAction.view"><QuickAction /></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute permission="users.view"><Users /></ProtectedRoute>} />
                <Route path="/activity-log" element={<ProtectedRoute permission="activityLog.view"><ActivityLogPage /></ProtectedRoute>} />
                <Route path="/roles" element={<ProtectedRoute permission="roles.manage"><RolesManagement /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute permission="settings.view"><Settings /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          )
        } />
      </Routes>
    </HashRouter>
  );
};

export default App;
