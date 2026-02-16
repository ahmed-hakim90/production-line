
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title }) => (
  <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden ${className}`}>
    {title && (
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

interface KPIBoxProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: string;
  trendUp?: boolean;
  colorClass?: string;
  unit?: string;
}

export const KPIBox: React.FC<KPIBoxProps> = ({ label, value, icon, trend, trendUp, colorClass = 'bg-primary/10 text-primary', unit }) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-5 shadow-sm transition-transform hover:scale-[1.02]">
    <div className={`w-14 h-14 ${colorClass} rounded-lg flex items-center justify-center`}>
      <span className="material-icons-round text-3xl">{icon}</span>
    </div>
    <div>
      <p className="text-slate-500 text-sm mb-1 font-medium">{label}</p>
      <h3 className="text-2xl font-bold flex items-baseline gap-1">
        {value} {unit && <span className="text-xs font-normal text-slate-400">{unit}</span>}
      </h3>
      {trend && (
        <div className={`flex items-center gap-1 text-xs mt-1 font-bold ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
          <span className="material-icons-round text-xs">{trendUp ? 'trending_up' : 'trending_down'}</span>
          <span>{trend}</span>
        </div>
      )}
    </div>
  </div>
);

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', pulse }) => {
  const styles = {
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    danger: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };

  const dotStyles = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-blue-500',
    neutral: 'bg-slate-400',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${styles[variant]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]} ${pulse ? 'animate-pulse' : ''}`}></span>
      {children}
    </span>
  );
};

export const LoadingSkeleton: React.FC<{ rows?: number; type?: 'card' | 'table' | 'detail' }> = ({ rows = 4, type = 'card' }) => {
  if (type === 'detail') {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
          <div className="flex-1 space-y-2">
            <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded-lg w-1/3"></div>
            <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-1/4"></div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3 mb-3"></div>
              <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-1/2"></div>
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 h-64">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4"></div>
          <div className="h-full bg-slate-50 dark:bg-slate-800 rounded-lg"></div>
        </div>
      </div>
    );
  }
  if (type === 'table') {
    return (
      <div className="animate-pulse space-y-3 p-6">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded flex-1"></div>
            <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-20"></div>
            <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-2/3 mb-4"></div>
          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/2 mb-3"></div>
          <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full mb-2"></div>
          <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-4/5"></div>
        </div>
      ))}
    </div>
  );
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' }> = ({ children, variant = 'primary', className = '', ...props }) => {
  const baseClasses = "px-4 py-2.5 rounded-lg font-bold transition-all flex items-center justify-center gap-2 text-sm";
  const variants = {
    primary: "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20",
    secondary: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20",
    outline: "border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
  };

  return (
    <button className={`${baseClasses} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};
