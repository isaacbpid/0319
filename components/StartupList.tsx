
import React from 'react';
import { Transaction, TransactionType, Owner, FinancialSummary } from '../types';
import { translations } from '../translations';
import TransactionList from './TransactionList';

interface StartupListProps {
  transactions: Transaction[];
  summary: FinancialSummary;
  onDelete: (id: string) => void;
  language: 'zh' | 'en';
  totalInvested: number;
  isSyncing?: boolean;
  isReadOnly?: boolean;
}

const StartupList: React.FC<StartupListProps> = ({ transactions, summary, onDelete, language, totalInvested, isSyncing, isReadOnly }) => {
  const t = translations[language];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">ROI</h2>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.totalInvested}</p>
          <p className="text-xl font-black text-blue-600 dark:text-blue-400 tracking-tight">¥{totalInvested.toLocaleString()}</p>
        </div>
      </div>

      {/* ROI Tracker Bar */}
      <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-white/10">
        <div className="flex justify-between items-center mb-2">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{language === 'zh' ? 'ROI 進度' : 'ROI Progress'}</p>
          <p className="text-sm font-black text-blue-600 dark:text-blue-400">{summary.roiPercentage.toFixed(1)}%</p>
        </div>
        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(summary.roiPercentage, 100)}%` }}></div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-white/10">
        <h3 className="text-xs font-black uppercase tracking-[0.15em] mb-6 text-slate-800 dark:text-white flex items-center">
          <i className="fas fa-history text-blue-500 mr-2"></i>
          {language === 'zh' ? '初始投資記錄' : 'Initial Investment Records'}
        </h3>
        <TransactionList 
          transactions={transactions} 
          onDelete={onDelete} 
          onUpdate={() => {}} // Placeholder
          onBulkUpdate={() => {}} // Placeholder
          onExportExcel={() => {}} // Placeholder
          onExportJSON={() => {}} // Placeholder
          language={language} 
          isSyncing={isSyncing} 
          isReadOnly={isReadOnly}
          filter={(tr) => tr.isInitialInvestment === true || tr.type === TransactionType.STARTUP}
        />
      </div>
    </div>
  );
};

export default StartupList;
