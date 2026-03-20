import React from 'react';

const LoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black p-8 space-y-8 animate-pulse">
      <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-[40px]"></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-[40px]"></div>
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-[40px]"></div>
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-[40px]"></div>
      </div>
      <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-[40px]"></div>
    </div>
  );
};

export default LoadingScreen;
