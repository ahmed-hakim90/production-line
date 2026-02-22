
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
import { Employees } from './pages/Employees';
import { EmployeeProfile } from './pages/EmployeeProfile';
import { Reports } from './pages/Reports';
import { RolesManagement } from './pages/RolesManagement';
import { Settings } from './pages/Settings';
import { QuickAction } from './pages/QuickAction';
import { ActivityLogPage } from './pages/ActivityLog';
import { CostCenters } from './pages/CostCenters';
import { CostCenterDistribution } from './pages/CostCenterDistribution';
import { CostSettings } from './pages/CostSettings';
import { ProductionPlans } from './pages/ProductionPlans';
import { EmployeeDashboard } from './pages/EmployeeDashboard';
import { EmployeeSelfService } from './pages/EmployeeSelfService';
import { FactoryManagerDashboard } from './pages/FactoryManagerDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { PendingApproval } from './pages/PendingApproval';
import { AttendanceImport } from './modules/hr/pages/AttendanceImport';
import { AttendanceList } from './modules/hr/pages/AttendanceList';
import { LeaveRequests } from './modules/hr/pages/LeaveRequests';
import { LoanRequests } from './modules/hr/pages/LoanRequests';
import { ApprovalCenter } from './modules/hr/pages/ApprovalCenter';
import { Payroll } from './modules/hr/pages/Payroll';
import { HRSettings } from './modules/hr/pages/HRSettings';
import { Organization } from './modules/hr/pages/Organization';
import { HRImport } from './modules/hr/pages/HRImport';
import { DelegationManagement } from './modules/hr/pages/DelegationManagement';
import { HRDashboard } from './modules/hr/pages/HRDashboard';
import { Vehicles } from './modules/hr/pages/Vehicles';
import { EmployeeFinancials } from './modules/hr/pages/EmployeeFinancials';
import { HRTransactions } from './modules/hr/pages/HRTransactions';
import { Supervisors } from './pages/Supervisors';
import { SupervisorDetails } from './pages/SupervisorDetails';
import { ProductionWorkers } from './pages/ProductionWorkers';
import { ProductionWorkerDetails } from './pages/ProductionWorkerDetails';
import { LineWorkerAssignment } from './pages/LineWorkerAssignment';
import { useAppStore } from './store/useAppStore';
import { onAuthChange } from './services/firebase';
import { getHomeRoute } from './utils/permissions';

/** Redirects to the role-appropriate dashboard after login */
const LoginRedirect: React.FC = () => {
  const permissions = useAppStore((s) => s.userPermissions);
  const home = getHomeRoute(permissions);
  return <Navigate to={home} replace />;
};

/** Shows the main Dashboard or redirects to the role-specific one on `/` */
const HomeRedirect: React.FC = () => {
  const permissions = useAppStore((s) => s.userPermissions);
  const home = getHomeRoute(permissions);
  if (home === '/') return <Dashboard />;
  return <Navigate to={home} replace />;
};

const App: React.FC = () => {
  const initializeApp = useAppStore((s) => s.initializeApp);
  const subscribeToDashboard = useAppStore((s) => s.subscribeToDashboard);
  const subscribeToLineStatuses = useAppStore((s) => s.subscribeToLineStatuses);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const isPendingApproval = useAppStore((s) => s.isPendingApproval);
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
          isAuthenticated
            ? (isPendingApproval ? <Navigate to="/pending" replace /> : <LoginRedirect />)
            : <Login />
        } />

        {/* Pending Approval */}
        <Route path="/pending" element={
          !isAuthenticated ? <Navigate to="/login" replace />
            : isPendingApproval ? <PendingApproval />
            : <LoginRedirect />
        } />

        {/* Protected: All app routes inside Layout */}
        <Route path="/*" element={
          !isAuthenticated ? <Navigate to="/login" replace />
            : isPendingApproval ? <Navigate to="/pending" replace />
            : (
            <Layout>
              <Routes>
                <Route path="/" element={<ProtectedRoute permission="dashboard.view"><HomeRedirect /></ProtectedRoute>} />
                <Route path="/products" element={<ProtectedRoute permission="products.view"><Products /></ProtectedRoute>} />
                <Route path="/products/:id" element={<ProtectedRoute permission="products.view"><ProductDetails /></ProtectedRoute>} />
                <Route path="/lines" element={<ProtectedRoute permission="lines.view"><Lines /></ProtectedRoute>} />
                <Route path="/lines/:id" element={<ProtectedRoute permission="lines.view"><LineDetails /></ProtectedRoute>} />
                <Route path="/employees" element={<ProtectedRoute permission="employees.view"><Employees /></ProtectedRoute>} />
                <Route path="/employees/import" element={<ProtectedRoute permission="employees.create"><HRImport /></ProtectedRoute>} />
                <Route path="/employees/:id" element={<ProtectedRoute permission="employees.view"><EmployeeProfile /></ProtectedRoute>} />
                <Route path="/line-workers" element={<ProtectedRoute permission="lines.edit"><LineWorkerAssignment /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                <Route path="/quick-action" element={<ProtectedRoute permission="quickAction.view"><QuickAction /></ProtectedRoute>} />
                <Route path="/users" element={<Navigate to="/employees" replace />} />
                <Route path="/supervisors" element={<ProtectedRoute permission="supervisors.view"><Supervisors /></ProtectedRoute>} />
                <Route path="/supervisors/:id" element={<ProtectedRoute permission="supervisors.view"><SupervisorDetails /></ProtectedRoute>} />
                <Route path="/production-workers" element={<ProtectedRoute permission="productionWorkers.view"><ProductionWorkers /></ProtectedRoute>} />
                <Route path="/production-workers/:id" element={<ProtectedRoute permission="productionWorkers.view"><ProductionWorkerDetails /></ProtectedRoute>} />
                <Route path="/activity-log" element={<ProtectedRoute permission="activityLog.view"><ActivityLogPage /></ProtectedRoute>} />
                <Route path="/employee-dashboard" element={<ProtectedRoute permission="employeeDashboard.view"><EmployeeDashboard /></ProtectedRoute>} />
                <Route path="/supervisor-dashboard" element={<Navigate to="/employee-dashboard" replace />} />
                <Route path="/self-service" element={<ProtectedRoute permission="selfService.view"><EmployeeSelfService /></ProtectedRoute>} />
                <Route path="/factory-dashboard" element={<ProtectedRoute permission="factoryDashboard.view"><FactoryManagerDashboard /></ProtectedRoute>} />
                <Route path="/admin-dashboard" element={<ProtectedRoute permission="adminDashboard.view"><AdminDashboard /></ProtectedRoute>} />
                <Route path="/production-plans" element={<ProtectedRoute permission="plans.view"><ProductionPlans /></ProtectedRoute>} />
                <Route path="/cost-centers" element={<ProtectedRoute permission="costs.view"><CostCenters /></ProtectedRoute>} />
                <Route path="/cost-centers/:id" element={<ProtectedRoute permission="costs.view"><CostCenterDistribution /></ProtectedRoute>} />
                <Route path="/cost-settings" element={<ProtectedRoute permission="costs.manage"><CostSettings /></ProtectedRoute>} />
                <Route path="/roles" element={<ProtectedRoute permission="roles.manage"><RolesManagement /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute permission="settings.view"><Settings /></ProtectedRoute>} />
                <Route path="/attendance" element={<ProtectedRoute permission="attendance.view"><AttendanceList /></ProtectedRoute>} />
                <Route path="/attendance/import" element={<ProtectedRoute permission="attendance.import"><AttendanceImport /></ProtectedRoute>} />
                <Route path="/leave-requests" element={<ProtectedRoute permission="leave.view"><LeaveRequests /></ProtectedRoute>} />
                <Route path="/loan-requests" element={<ProtectedRoute permission="loan.view"><LoanRequests /></ProtectedRoute>} />
                <Route path="/approval-center" element={<ProtectedRoute permission="approval.view"><ApprovalCenter /></ProtectedRoute>} />
                <Route path="/payroll" element={<ProtectedRoute permission="payroll.view"><Payroll /></ProtectedRoute>} />
                <Route path="/organization" element={<ProtectedRoute permission="hrSettings.view"><Organization /></ProtectedRoute>} />
                <Route path="/hr-dashboard" element={<ProtectedRoute permission="hrDashboard.view"><HRDashboard /></ProtectedRoute>} />
                <Route path="/vehicles" element={<ProtectedRoute permission="vehicles.view"><Vehicles /></ProtectedRoute>} />
                <Route path="/employee-financials" element={<ProtectedRoute permission="hrSettings.view"><EmployeeFinancials /></ProtectedRoute>} />
                <Route path="/hr-transactions" element={<ProtectedRoute permission="hrDashboard.view"><HRTransactions /></ProtectedRoute>} />
                <Route path="/hr-settings" element={<ProtectedRoute permission="hrSettings.view"><HRSettings /></ProtectedRoute>} />
                <Route path="/delegations" element={<ProtectedRoute permission="approval.delegate"><DelegationManagement /></ProtectedRoute>} />
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
