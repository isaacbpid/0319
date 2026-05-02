import React, { useEffect, useMemo, useRef, useState } from 'react';

interface CustomerOption {
  id: string;
  name: string;
}

export interface CustomerStats {
  visitCount: number;
  totalSpent: number;
  lastVisitDate?: string;
  lastServiceName?: string;
  vehicleSummary?: string;
}

interface CustomerPromptSelectProps {
  value: string;
  options: CustomerOption[];
  language: 'zh' | 'en';
  promptText?: string;
  emptyOptionText?: string;
  onChange: (value: string) => void;
  className?: string;
  onViewProfile?: (customerId: string) => void;
  onAddCustomer?: () => void;
  customerStats?: Record<string, CustomerStats>;
}

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const CustomerPromptSelect: React.FC<CustomerPromptSelectProps> = ({
  value,
  options,
  language,
  promptText,
  emptyOptionText,
  onChange,
  onViewProfile,
  onAddCustomer,
  customerStats,
}) => {
  // 'idle' = default row, 'picker' = customer list popup, 'card' = selected profile card
  const [mode, setMode] = useState<'idle' | 'picker' | 'card'>('idle');
  const [search, setSearch] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  // Dismiss card on outside click
  useEffect(() => {
    if (mode !== 'card') return;
    const handler = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setMode('idle');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mode, value]);

  // Reset to idle when value is cleared externally
  useEffect(() => {
    if (!value) setMode('idle');
  }, [value]);

  const selectedOption = options.find(o => o.id === value);
  const stats = value ? customerStats?.[value] : undefined;
  const hasStatsSummary = Boolean(stats && (stats.visitCount > 0 || stats.totalSpent > 0));
  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter(option => option.name.toLowerCase().includes(term));
  }, [options, search]);

  // ── State 1: No customer selected ───────────────────────────────────────────
  if (!value && mode !== 'picker') {
    return (
      <button
        type="button"
        onClick={() => setMode('picker')}
        className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm flex-shrink-0">
          <i className="fas fa-user-plus text-2xl text-slate-500 dark:text-slate-300"></i>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-slate-700 dark:text-white">
            {promptText || (language === 'zh' ? '新增客戶' : 'Add a customer')}
          </p>
        </div>
        <i className="fas fa-chevron-right text-slate-400 dark:text-slate-500"></i>
      </button>
    );
  }

  // ── State 2: Picker popup (search + list) ───────────────────────────────────
  if (mode === 'picker') {
    return (
      <div className="fixed inset-0 z-[650] bg-slate-900/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="w-full md:max-w-3xl bg-slate-100 dark:bg-slate-900 rounded-t-[32px] md:rounded-[32px] border border-slate-200 dark:border-white/10 max-h-[90vh] overflow-hidden flex flex-col">
          <div className="px-6 py-5 flex items-center justify-between border-b border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => { setMode('idle'); setSearch(''); }}
              className="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200"
            >
              <i className="fas fa-arrow-left text-xl"></i>
            </button>
            <h3 className="text-4xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {language === 'zh' ? '客戶' : 'Customers'}
            </h3>
            <button
              type="button"
              onClick={() => {
                onAddCustomer?.();
                setMode('idle');
                setSearch('');
              }}
              className="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200"
              title={language === 'zh' ? '新增客戶' : 'Add customer'}
            >
              <i className="fas fa-plus text-xl"></i>
            </button>
          </div>

          <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10">
            <div className="relative">
              <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-500"></i>
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                autoFocus
                placeholder={language === 'zh' ? '搜尋' : 'Search'}
                className="w-full pl-14 pr-4 h-16 rounded-full bg-white dark:bg-slate-800 border-[3px] border-slate-900/95 dark:border-white/30 text-xl font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <p className="text-[40px] md:text-2xl font-black text-slate-900 dark:text-white mb-4">
              {language === 'zh' ? '最近建立' : 'Recently created'}
            </p>

            {filteredOptions.length === 0 ? (
              <div className="py-8 text-center text-slate-500 font-semibold">
                {language === 'zh' ? '沒有符合的客戶' : 'No customers found'}
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {filteredOptions.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      setMode('idle');
                      setSearch('');
                    }}
                    className="w-full py-5 flex items-center gap-4 text-left"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-slate-200 dark:bg-white/10 flex items-center justify-center shrink-0">
                      <span className="text-2xl font-black text-slate-500 dark:text-slate-300">{getInitials(option.name)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-2xl md:text-xl font-black text-slate-900 dark:text-white truncate">{option.name}</p>
                      {customerStats?.[option.id]?.vehicleSummary && (
                        <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
                          {customerStats[option.id].vehicleSummary}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── State 3: Customer selected — show row, tap opens card ───────────────────
  const initials = selectedOption ? getInitials(selectedOption.name) : '?';

  if (mode === 'card') {
    return (
      <div ref={cardRef} className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-100 dark:border-slate-700">
          <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
            <span className="text-base font-black text-slate-700 dark:text-white">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-slate-900 dark:text-white truncate">{selectedOption?.name}</p>
            {hasStatsSummary && stats && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {stats.visitCount} {language === 'zh' ? '次消費' : stats.visitCount === 1 ? 'visit' : 'visits'}
                {stats.totalSpent > 0 && (
                  <span className="ml-2 font-semibold text-slate-700 dark:text-slate-200">
                    ¥{stats.totalSpent.toFixed(0)} {language === 'zh' ? '已消費' : 'spent'}
                  </span>
                )}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setMode('idle')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
            <i className="fas fa-xmark text-lg"></i>
          </button>
        </div>
        {/* Stats */}
        {stats?.lastVisitDate && (
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex gap-4">
            <span>{language === 'zh' ? '上次到訪' : 'Last visit'}: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatDate(stats.lastVisitDate)}</span></span>
            {stats.lastServiceName && (
              <span className="truncate">{stats.lastServiceName}</span>
            )}
          </div>
        )}
        {/* Actions */}
        <div className="flex flex-col gap-1 p-2">
          {onViewProfile && (
            <button
              type="button"
              onClick={() => { onViewProfile(value); setMode('idle'); }}
              className="w-full px-4 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-black text-center"
            >
              {language === 'zh' ? '查看完整資料' : 'View full profile'}
            </button>
          )}
          <button
            type="button"
            onClick={() => { onChange(''); setMode('idle'); }}
            className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-sm font-bold text-center"
          >
            {language === 'zh' ? '取消客戶' : 'Remove from sale'}
          </button>
        </div>
      </div>
    );
  }

  // Default: selected, show row
  return (
    <button
      type="button"
      onClick={() => setMode('card')}
      className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
    >
      <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
        <span className="text-base font-black text-slate-700 dark:text-white">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-slate-900 dark:text-white truncate">{selectedOption?.name}</p>
      </div>
      <i className="fas fa-chevron-right text-slate-400 dark:text-slate-500"></i>
    </button>
  );
};

export default CustomerPromptSelect;