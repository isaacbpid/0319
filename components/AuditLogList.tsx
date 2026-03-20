
import React from 'react';
import { AuditLog, AuditAction } from '../types';
import { translations } from '../translations';

interface AuditLogListProps {
  logs: AuditLog[];
  language: 'zh' | 'en';
}

const AuditLogList: React.FC<AuditLogListProps> = ({ logs, language }) => {
  const t = translations[language];

  const getActionColor = (action: AuditAction) => {
    switch (action) {
      case AuditAction.CREATE: return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case AuditAction.UPDATE: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case AuditAction.DELETE: return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  const getActionIcon = (action: AuditAction) => {
    switch (action) {
      case AuditAction.CREATE: return 'fa-plus-circle';
      case AuditAction.UPDATE: return 'fa-edit';
      case AuditAction.DELETE: return 'fa-trash-alt';
      default: return 'fa-info-circle';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-black tracking-tight dark:text-white">
          {language === 'zh' ? '審計日誌' : 'Audit Logs'}
        </h2>
        <span className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-widest">
          {logs.length} {language === 'zh' ? '條記錄' : 'Records'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {logs.map((log) => (
          <div 
            key={log.id} 
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${getActionColor(log.action)}`}>
                <i className={`fas ${getActionIcon(log.action)}`}></i>
                {log.action}
              </span>
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-300">
                {log.timestamp}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {language === 'zh' ? '交易 ID' : 'Transaction ID'}
                </span>
                <span className="text-xs font-mono text-slate-900 dark:text-white truncate max-w-[120px]">
                  {log.transactionId}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">
                    {language === 'zh' ? '類別' : 'Category'}
                  </span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {log.data.categoryId}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">
                    {language === 'zh' ? '金額' : 'Amount'}
                  </span>
                  <span className={`text-xs font-black ${log.data.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    ${Math.abs(log.data.amount).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">
                    {language === 'zh' ? '經手人' : 'By'}
                  </span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {log.data.contributedBy}
                  </span>
                </div>
              </div>

              {log.data.description && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic line-clamp-2">
                  "{log.data.description}"
                </p>
              )}
            </div>
          </div>
        ))}

        {logs.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-history text-slate-300 dark:text-slate-700 text-2xl"></i>
            </div>
            <p className="text-slate-400 font-bold">
              {language === 'zh' ? '暫無審計記錄' : 'No audit logs found'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogList;
