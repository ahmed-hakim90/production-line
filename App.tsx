
import React, { useEffect, useRef } from 'react';
import './App.css';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
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
import { useAppStore } from './store/useAppStore';

const App: React.FC = () => {
  const initializeApp = useAppStore((s) => s.initializeApp);
  const subscribeToDashboard = useAppStore((s) => s.subscribeToDashboard);
  const subscribeToLineStatuses = useAppStore((s) => s.subscribeToLineStatuses);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    initializeApp().then(() => {
      const unsubReports = subscribeToDashboard();
      const unsubStatuses = subscribeToLineStatuses();

      return () => {
        unsubReports();
        unsubStatuses();
      };
    });
  }, []);

  return (
    <HashRouter>
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
          <Route path="/roles" element={<ProtectedRoute permission="roles.manage"><RolesManagement /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute permission="settings.view"><Settings /></ProtectedRoute>} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;
