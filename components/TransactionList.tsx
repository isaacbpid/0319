
import React, { useState, useRef, useMemo } from 'react';
import { Transaction, TransactionType, Owner, Category, Account } from '../types';
import { translations } from '../translations';

interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  onDelete: (id: string) => void;
  onUpdate: (tr: Transaction) => void;
  onBulkUpdate: (items: Transaction[]) => void;
  onExportExcel: () => void;
  onExportJSON: () => void;
  language: 'zh' | 'en';
  isSyncing?: boolean;
  isReadOnly?: boolean;
  filter?: (tr: Transaction) => boolean;
}

type SizeFilter = 'ALL' | 'SMALL' | 'MEDIUM' | 'LARGE';
type DateFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

const TransactionList: React.FC<TransactionListProps> = ({ transactions, accounts, onDelete, onUpdate, onBulkUpdate, onExportExcel, onExportJSON, language, isSyncing, isReadOnly, filter }) => {
  const t = translations[language];
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTr, setEditingTr] = useState<Transaction | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
      if (newSelected.size === 0) setSelectionMode(false);
    } else {
      newSelected.add(id);
      setSelectionMode(true);
    }
    setSelectedIds(newSelected);
  };

  const handleTouchStart = (id: string) => {
    longPressTimer.current = setTimeout(() => {
      setSelectionMode(true);
      toggleSelection(id);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleBulkDelete = async () => {
    for (const id of Array.from(selectedIds)) {
      await onDelete(id);
    }
    setSelectedIds(new Set());
    setSelectionMode(false);
    setShowBulkDeleteConfirm(false);
  };

  const handleBulkToggleInvestment = async () => {
    const itemsToUpdate: Transaction[] = [];
    const selectedTransactions = transactions.filter(t => selectedIds.has(t.id));
    
    // Determine the new state based on the first item (toggle all to the opposite of the first)
    const newState = !selectedTransactions[0]?.isInitialInvestment;
    
    selectedTransactions.forEach(t => {
      itemsToUpdate.push({ ...t, isInitialInvestment: newState });
    });
    
    await onBulkUpdate(itemsToUpdate);
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const handleToggleInvestment = async (tr: Transaction) => {
    const groupedTr = tr as any;
    if (groupedTr.isGrouped && groupedTr.originalIds) {
      // Update all parts of the grouped transaction
      const updatedItems = groupedTr.originalIds.map((id: string) => {
        const originalTr = transactions.find(t => t.id === id);
        return { ...originalTr, isInitialInvestment: !tr.isInitialInvestment };
      });
      await onBulkUpdate(updatedItems);
    } else {
      await onUpdate({ ...tr, isInitialInvestment: !tr.isInitialInvestment });
    }
  };

  const getAmountUnit = (amount: string | number) => {
    const val = Math.floor(Math.abs(Number(amount)));
    if (!val || val < 10) return '';
    
    const units = [
      { threshold: 1000000000, label: '十億' },
      { threshold: 100000000, label: '億' },
      { threshold: 10000000, label: '千萬' },
      { threshold: 1000000, label: '百萬' },
      { threshold: 100000, label: '十萬' },
      { threshold: 10000, label: '萬' },
      { threshold: 1000, label: '千' },
      { threshold: 100, label: '百' },
      { threshold: 10, label: '十' }
    ];

    for (const unit of units) {
      if (val >= unit.threshold) return unit.label;
    }
    return '';
  };

  const filtered = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return transactions.filter(tr => {
      if (filter && !filter(tr)) return false;
      
      const matchesSearch = tr.description.toLowerCase().includes(search.toLowerCase()) || 
                           tr.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
                           tr.categoryId.toLowerCase().includes(search.toLowerCase());
      
      const matchesType = typeFilter === 'ALL' || tr.type === typeFilter;

      let matchesSize = true;
      if (sizeFilter === 'SMALL') matchesSize = tr.amount < 500;
      else if (sizeFilter === 'MEDIUM') matchesSize = tr.amount >= 500 && tr.amount <= 2000;
      else if (sizeFilter === 'LARGE') matchesSize = tr.amount > 2000;

      let matchesDate = true;
      const trDate = new Date(tr.date);
      trDate.setHours(0, 0, 0, 0);

      if (dateFilter === 'TODAY') {
        matchesDate = trDate.getTime() === now.getTime();
      } else if (dateFilter === 'WEEK') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        matchesDate = trDate >= weekAgo;
      } else if (dateFilter === 'MONTH') {
        const monthAgo = new Date();
        monthAgo.setDate(now.getDate() - 30);
        matchesDate = trDate >= monthAgo;
      } else if (dateFilter === 'CUSTOM') {
        if (startDate && endDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          matchesDate = trDate >= start && trDate <= end;
        } else if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          matchesDate = trDate >= start;
        } else if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          matchesDate = trDate <= end;
        }
      }

      return matchesSearch && matchesType && matchesSize && matchesDate;
    });
  }, [transactions, search, typeFilter, sizeFilter, dateFilter, startDate, endDate]);

  // Grouping logic to show full transaction amounts in the list
  const displayTransactions = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    filtered.forEach(tr => {
      // Use receiptNumber + date + categoryId as a grouping key to ensure accuracy
      const key = `${tr.receiptNumber}_${tr.date}_${tr.categoryId}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(tr);
    });

    return Object.values(groups).map(group => {
      if (group.length === 1) return group[0];
      
      const first = group[0];
      const totalAmount = group.reduce((sum, item) => sum + item.amount, 0);
      
      // Determine display owner
      let displayOwner = first.contributedBy as string;
      const owners = new Set(group.map(g => g.contributedBy));
      if (owners.size > 1) {
        displayOwner = "User 1 & User 2";
      }

      return {
        ...first,
        amount: totalAmount,
        contributedBy: displayOwner as Owner,
        isGrouped: true,
        originalIds: group.map(g => g.id)
      };
    });
  }, [filtered]);

  const confirmDelete = async () => {
    if (deletingId) {
      // If it's a grouped transaction, we might want to delete all parts
      const groupedTr = displayTransactions.find(t => (t as any).id === deletingId) as any;
      if (groupedTr && groupedTr.originalIds) {
        for (const id of groupedTr.originalIds) {
          await onDelete(id);
        }
      } else {
        await onDelete(deletingId);
      }
      setDeletingId(null);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTr) {
      const tr = editingTr as any;
      if (tr.isGrouped && tr.originalIds) {
        // Update all parts of the grouped transaction
        const amountPerPart = tr.amount / tr.originalIds.length;
        const updatedItems = tr.originalIds.map((id: string) => ({
          ...editingTr,
          id,
          amount: amountPerPart,
          isGrouped: undefined,
          originalIds: undefined
        }));
        await onBulkUpdate(updatedItems);
      } else {
        await onUpdate(editingTr);
      }
      setEditingTr(null);
    }
  };

  const editPhotoRef = useRef<HTMLInputElement>(null);
  const handleEditPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingTr) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditingTr({ ...editingTr, imageUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {isReadOnly && (
        <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/20 rounded-2xl p-4 flex items-center gap-3 text-rose-600 dark:text-rose-400">
          <i className="fas fa-lock text-sm"></i>
          <span className="text-xs font-bold uppercase tracking-widest">
            {language === 'zh' ? '連接不穩定，目前處於唯讀模式。' : 'Connection unstable. Currently in Read-Only mode.'}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-6">
        {/* Header Row: Title & Export */}
        <div className="flex items-center justify-between">
          {selectionMode ? (
            <div className="flex items-center gap-4 animate-in slide-in-from-top-2">
              <button 
                onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }}
                className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 dark:bg-white/5"
              >
                <i className="fas fa-times"></i>
              </button>
              <div>
                <h2 className="text-xl font-black text-blue-600 dark:text-blue-400">{selectedIds.size} {language === 'zh' ? '已選擇' : 'Selected'}</h2>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setShowBulkDeleteConfirm(true)} className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600">
                    <i className="fas fa-trash-alt mr-1"></i> {t.delete}
                  </button>
                  <button onClick={handleBulkToggleInvestment} className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-600">
                    <i className="fas fa-rocket mr-1"></i> {language === 'zh' ? '切換投資' : 'Toggle Invest'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight dark:text-white">{t.history}</h2>
              <p className="text-slate-400 dark:text-slate-300 font-bold text-xs uppercase tracking-widest mt-1">{displayTransactions.length} {t.items}</p>
            </div>
          )}

          <div className="relative">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="h-10 px-4 rounded-2xl bg-white text-slate-600 flex items-center justify-center gap-2 active:scale-95 transition-all dark:bg-slate-800 dark:text-slate-300 border border-slate-100 dark:border-white/10 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <i className="fas fa-file-export text-xs"></i>
              <span className="text-[10px] font-black uppercase tracking-widest">{(t as any).export}</span>
              <i className={`fas fa-chevron-down text-[8px] transition-transform ${showExportMenu ? 'rotate-180' : ''}`}></i>
            </button>
            
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 dark:bg-slate-800 dark:border-white/10">
                <button 
                  onClick={() => { onExportExcel(); setShowExportMenu(false); }}
                  className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-3 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  <i className="fas fa-file-excel text-emerald-500"></i>
                  Excel (CSV)
                </button>
                <button 
                  onClick={() => { onExportJSON(); setShowExportMenu(false); }}
                  className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-3 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  <i className="fas fa-file-code text-amber-500"></i>
                  JSON Backup
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters Section */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <i className="fas fa-search absolute left-4 top-3.5 text-slate-400 text-xs"></i>
              <input 
                type="text"
                placeholder={t.searchPlaceholder}
                className="pl-10 pr-10 py-2.5 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full shadow-sm dark:bg-slate-900 dark:border-white/10 dark:text-white"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-300 hover:text-slate-500"><i className="fas fa-times-circle"></i></button>
              )}
            </div>

            {/* Type Filter */}
            <div className="relative flex items-center group">
              <i className={`fas fa-tag absolute left-4 text-xs z-10 transition-colors duration-300 ${typeFilter !== 'ALL' ? 'text-blue-600' : 'text-slate-400'}`}></i>
              <select 
                className={`pl-10 pr-10 py-2.5 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm appearance-none w-full transition-all duration-300 border ${
                  typeFilter !== 'ALL' ? 'bg-blue-50 border-blue-200 shadow-md shadow-blue-500/10 dark:bg-blue-900/20 dark:border-blue-900/40 dark:text-blue-400' : 'bg-white border-slate-100 dark:bg-slate-900 dark:border-white/10 dark:text-slate-400'
                }`}
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as any)}
              >
                <option value="ALL">{t.all}</option>
                <option value={TransactionType.REVENUE}>{t.revenue}</option>
                <option value={TransactionType.EXPENSE}>{t.expense}</option>
                <option value={TransactionType.STARTUP}>{t.startupCosts}</option>
                <option value={TransactionType.WITHDRAWAL}>{t.withdraw}</option>
              </select>
            </div>

            {/* Size Filter */}
            <div className="relative flex items-center group">
              <i className={`fas fa-expand-arrows-alt absolute left-4 text-xs z-10 transition-colors duration-300 ${sizeFilter !== 'ALL' ? 'text-indigo-600' : 'text-slate-400'}`}></i>
              <select 
                className={`pl-10 pr-10 py-2.5 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm appearance-none w-full transition-all duration-300 border ${
                  sizeFilter !== 'ALL' ? 'bg-indigo-50 border-indigo-200 shadow-md shadow-indigo-500/10 dark:bg-indigo-900/20 dark:border-indigo-900/40 dark:text-indigo-400' : 'bg-white border-slate-100 dark:bg-slate-900 dark:border-white/10 dark:text-slate-400'
                }`}
                value={sizeFilter}
                onChange={e => setSizeFilter(e.target.value as any)}
              >
                <option value="ALL">{t.amountSize}</option>
                <option value="SMALL">{t.sizeSmall}</option>
                <option value="MEDIUM">{t.sizeMedium}</option>
                <option value="LARGE">{t.sizeLarge}</option>
              </select>
            </div>

            {/* Date Filter */}
            <div className="relative flex items-center group">
              <i className={`fas fa-calendar-alt absolute left-4 text-xs z-10 transition-colors duration-300 ${dateFilter !== 'ALL' ? 'text-emerald-600' : 'text-slate-400'}`}></i>
              <select 
                className={`pl-10 pr-10 py-2.5 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm appearance-none w-full transition-all duration-300 border ${
                  dateFilter !== 'ALL' ? 'bg-emerald-50 border-emerald-200 shadow-md shadow-emerald-500/10 dark:bg-emerald-900/20 dark:border-emerald-900/40 dark:text-emerald-400' : 'bg-white border-slate-100 dark:bg-slate-900 dark:border-white/10 dark:text-slate-400'
                }`}
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value as any)}
              >
                <option value="ALL">{t.timeRange}</option>
                <option value="TODAY">{t.today}</option>
                <option value="WEEK">{t.last7Days}</option>
                <option value="MONTH">{t.last30Days}</option>
                <option value="CUSTOM">{(t as any).customRange}</option>
              </select>
            </div>
          </div>

          {/* Custom Date Range Row - Separate Level */}
          {dateFilter === 'CUSTOM' && (
            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10 animate-in slide-in-from-top-2 duration-300">
              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-slate-50 dark:bg-slate-900 text-[8px] font-black text-slate-400 uppercase tracking-widest z-10">{(t as any).startDate}</label>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full pl-4 pr-4 py-2.5 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm dark:bg-slate-900 dark:border-white/10 dark:text-white"
                  />
                </div>
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-slate-50 dark:bg-slate-900 text-[8px] font-black text-slate-400 uppercase tracking-widest z-10">{(t as any).endDate}</label>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full pl-4 pr-4 py-2.5 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm dark:bg-slate-900 dark:border-white/10 dark:text-white"
                  />
                </div>
              </div>
              <button 
                onClick={() => { setDateFilter('ALL'); setStartDate(''); setEndDate(''); }}
                className="h-10 px-4 rounded-xl bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/20 transition-colors flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
              >
                <i className="fas fa-times"></i>
                {(t as any).clear || 'Clear'}
              </button>
            </div>
          )}

          {/* Clear All Filters Button */}
          {(search || typeFilter !== 'ALL' || sizeFilter !== 'ALL' || dateFilter !== 'ALL') && (
            <div className="flex justify-end">
              <button 
                onClick={() => {
                  setSearch('');
                  setTypeFilter('ALL');
                  setSizeFilter('ALL');
                  setDateFilter('ALL');
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-500 transition-colors flex items-center gap-2"
              >
                <i className="fas fa-undo-alt"></i>
                {(t as any).clearFilters}
              </button>
            </div>
          )}
        </div>
      </div>


      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden dark:bg-slate-900 dark:border-white/10">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-50 dark:bg-white/5 dark:border-white/5">
              <tr>
                <th className="px-6 py-5">{t.date}</th>
                <th className="px-6 py-5">{t.receiptNumber}</th>
                <th className="px-6 py-5">{t.catDesc}</th>
                <th className="px-6 py-5">{language === 'zh' ? '賬戶' : 'Account'}</th>
                <th className="px-6 py-5">{t.contributor}</th>
                <th className="px-6 py-5 text-right">{t.amount}</th>
                <th className="px-6 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
              {displayTransactions.length > 0 ? displayTransactions.map(tr => (
                <tr 
                  key={tr.id} 
                  className={`hover:bg-slate-50/50 transition-colors group dark:hover:bg-white/5 ${selectedIds.has(tr.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                  onMouseDown={() => handleTouchStart(tr.id)}
                  onMouseUp={handleTouchEnd}
                  onMouseLeave={handleTouchEnd}
                  onTouchStart={() => handleTouchStart(tr.id)}
                  onTouchEnd={handleTouchEnd}
                  onClick={() => selectionMode && toggleSelection(tr.id)}
                >
                  <td className="px-6 py-5 whitespace-nowrap text-xs font-bold text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-3">
                      {selectionMode && (
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selectedIds.has(tr.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-white/20'}`}>
                          {selectedIds.has(tr.id) && <i className="fas fa-check text-[8px] text-white"></i>}
                        </div>
                      )}
                      {tr.date}
                    </div>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black tracking-tight dark:bg-white/10 dark:text-slate-300">{tr.receiptNumber}</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleToggleInvestment(tr); }}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${tr.isInitialInvestment ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-slate-100 text-slate-300 dark:bg-white/5 dark:text-slate-700'}`}
                        title={language === 'zh' ? '初始投資' : 'Initial Investment'}
                      >
                        <i className="fas fa-rocket text-[10px]"></i>
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                       {tr.imageUrl && (
                         <button onClick={() => setViewingPhoto(tr.imageUrl!)} className="w-10 h-10 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 hover:scale-105 transition-transform shadow-sm dark:border-white/10">
                           <img src={tr.imageUrl} className="w-full h-full object-cover" />
                         </button>
                       )}
                       <div>
                         <div className="text-sm font-black text-slate-800 tracking-tight dark:text-white">{tr.categoryId}</div>
                         <div className="text-[10px] font-bold text-slate-400 dark:text-slate-300 truncate max-w-[200px] mt-0.5">{tr.description}</div>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      {tr.fromAccountId && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest">{language === 'zh' ? '出' : 'From'}:</span>
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            {accounts?.find(a => a.id === tr.fromAccountId)?.name || 'Unknown'}
                          </span>
                        </div>
                      )}
                      {tr.toAccountId && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">{language === 'zh' ? '入' : 'To'}:</span>
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            {accounts?.find(a => a.id === tr.toAccountId)?.name || 'Unknown'}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm"><span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${tr.contributedBy === Owner.OWNER_A ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : tr.contributedBy === Owner.OWNER_B ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'}`}>{tr.contributedBy}</span></td>
                  <td className={`px-6 py-5 whitespace-nowrap text-right font-black text-sm tracking-tight ${tr.type === TransactionType.REVENUE ? 'text-emerald-600 dark:text-emerald-400' : tr.type === TransactionType.STARTUP ? 'text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-white'}`}>
                    {(tr.type === TransactionType.REVENUE || tr.type === TransactionType.STARTUP) ? '+' : '-'} ¥{tr.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!isReadOnly && (
                        <>
                          <button onClick={() => setEditingTr(tr)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-200 hover:text-blue-500 hover:bg-blue-50 transition-all active:scale-90 dark:text-slate-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"><i className="fas fa-edit text-xs"></i></button>
                          <button onClick={() => setDeletingId(tr.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-200 hover:text-rose-500 hover:bg-rose-50 transition-all active:scale-90 dark:text-slate-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"><i className="fas fa-trash-alt text-xs"></i></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 dark:bg-white/5"><i className="fas fa-search text-slate-200 text-xl dark:text-slate-700"></i></div>
                      <p className="text-sm font-black text-slate-300 uppercase tracking-widest dark:text-slate-600">{language === 'zh' ? '沒有符合條件的交易記錄' : 'No records found'}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-50 dark:divide-white/5">
          {displayTransactions.length > 0 ? displayTransactions.map(tr => (
            <div 
              key={tr.id} 
              className={`p-5 active:bg-slate-50 transition-colors dark:active:bg-white/5 ${selectedIds.has(tr.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
              onMouseDown={() => handleTouchStart(tr.id)}
              onMouseUp={handleTouchEnd}
              onMouseLeave={handleTouchEnd}
              onTouchStart={() => handleTouchStart(tr.id)}
              onTouchEnd={handleTouchEnd}
              onClick={() => selectionMode && toggleSelection(tr.id)}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  {selectionMode && (
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${selectedIds.has(tr.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-white/20'}`}>
                      {selectedIds.has(tr.id) && <i className="fas fa-check text-[10px] text-white"></i>}
                    </div>
                  )}
                  {tr.imageUrl && (
                    <button onClick={(e) => { e.stopPropagation(); setViewingPhoto(tr.imageUrl!); }} className="w-12 h-12 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 dark:border-white/10">
                      <img src={tr.imageUrl} className="w-full h-full object-cover" />
                    </button>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-black text-slate-900 dark:text-white">{tr.categoryId}</div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleToggleInvestment(tr); }}
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${tr.isInitialInvestment ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-slate-100 text-slate-300 dark:bg-white/5 dark:text-slate-700'}`}
                      >
                        <i className="fas fa-rocket text-[8px]"></i>
                      </button>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-300 mt-0.5">{tr.date} • {tr.receiptNumber}</div>
                    <div className="flex flex-col gap-0.5 mt-1">
                      {tr.fromAccountId && (
                        <div className="flex items-center gap-1">
                          <span className="text-[7px] font-black text-rose-500 uppercase tracking-widest">{language === 'zh' ? '出' : 'From'}:</span>
                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                            {accounts?.find(a => a.id === tr.fromAccountId)?.name || 'Unknown'}
                          </span>
                        </div>
                      )}
                      {tr.toAccountId && (
                        <div className="flex items-center gap-1">
                          <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">{language === 'zh' ? '入' : 'To'}:</span>
                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                            {accounts?.find(a => a.id === tr.toAccountId)?.name || 'Unknown'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-black tracking-tight ${tr.type === TransactionType.REVENUE ? 'text-emerald-600 dark:text-emerald-400' : tr.type === TransactionType.STARTUP ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                  {(tr.type === TransactionType.REVENUE || tr.type === TransactionType.STARTUP) ? '+' : '-'} ¥{tr.amount.toLocaleString()}
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${tr.contributedBy === Owner.OWNER_A ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : tr.contributedBy === Owner.OWNER_B ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'}`}>
                    {tr.contributedBy}
                  </span>
                  {tr.description && <span className="text-[10px] font-medium text-slate-400 dark:text-slate-300 truncate max-w-[150px]">{tr.description}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {!isReadOnly && (
                    <>
                      <button onClick={() => setEditingTr(tr)} className="w-9 h-9 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 dark:bg-white/5 dark:text-slate-500"><i className="fas fa-edit text-xs"></i></button>
                      <button onClick={() => setDeletingId(tr.id)} className="w-9 h-9 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 dark:bg-white/5 dark:text-slate-500"><i className="fas fa-trash-alt text-xs"></i></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )) : (
            <div className="p-20 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-white/5"><i className="fas fa-search text-slate-200 text-xl dark:text-slate-700"></i></div>
              <p className="text-sm font-black text-slate-300 uppercase tracking-widest dark:text-slate-600">{language === 'zh' ? '沒有符合條件的記錄' : 'No records found'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-8 space-y-6 animate-in zoom-in-95 dark:bg-slate-900">
            <div className="text-center">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500 dark:bg-rose-900/20"><i className="fas fa-exclamation-triangle text-2xl"></i></div>
              <h3 className="text-lg font-black text-slate-900 mb-2 dark:text-white">{t.deleteConfirmTitle}</h3>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-300">{t.deleteConfirmMessage}</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingId(null)} 
                disabled={isSyncing}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
              >
                {t.cancel}
              </button>
              <button 
                onClick={confirmDelete} 
                disabled={isSyncing}
                className={`flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-600/20 active:scale-95 flex items-center justify-center gap-2 ${isSyncing ? 'opacity-70' : ''}`}
              >
                {isSyncing && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {t.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal with Unit Indicator */}
      {editingTr && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl p-8 space-y-6 animate-in zoom-in-95 overflow-y-auto max-h-[90vh] dark:bg-slate-900">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{t.editEntry}</h3>
              <button onClick={() => setEditingTr(null)} className="text-slate-400 p-2"><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.type}</label>
                    <select value={editingTr.type} onChange={e => setEditingTr({...editingTr, type: e.target.value as TransactionType})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white">
                      <option value={TransactionType.REVENUE}>{t.revenue}</option>
                      <option value={TransactionType.EXPENSE}>{t.expense}</option>
                      <option value={TransactionType.STARTUP}>{t.startupCosts}</option>
                      <option value={TransactionType.WITHDRAWAL}>{t.withdraw}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.category}</label>
                    <select value={editingTr.categoryId} onChange={e => setEditingTr({...editingTr, categoryId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white">
                      {Object.values(Category).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
               </div>

               <div>
                 <div className="flex justify-between items-center mb-1">
                   <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase">{t.amount} (RMB)</label>
                   <span className="text-[10px] font-black text-blue-600 animate-pulse dark:text-blue-400">{getAmountUnit(editingTr.amount)}</span>
                 </div>
                 <div className="relative">
                   <input 
                     type="number" value={editingTr.amount} 
                     onChange={e => setEditingTr({...editingTr, amount: Number(e.target.value)})}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                   />
                 </div>
               </div>

               <div>
                 <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.date}</label>
                 <input type="date" value={editingTr.date} onChange={e => setEditingTr({...editingTr, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white" />
               </div>

               <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.uploadPhoto}</label>
                  <div className="flex items-center gap-4">
                    <button type="button" onClick={() => editPhotoRef.current?.click()} className="flex-1 py-3 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase text-slate-600 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400">
                      {editingTr.imageUrl ? t.changePhoto : t.uploadPhoto}
                    </button>
                    {editingTr.imageUrl && (
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 group dark:border-white/10">
                        <img src={editingTr.imageUrl} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setEditingTr({...editingTr, imageUrl: undefined})} className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-times"></i></button>
                      </div>
                    )}
                  </div>
                  <input type="file" ref={editPhotoRef} onChange={handleEditPhoto} accept="image/*" className="hidden" />
               </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.description}</label>
                  <div className="relative">
                    <textarea value={editingTr.description} onChange={e => setEditingTr({...editingTr, description: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white" rows={2}></textarea>
                  </div>
               </div>

               <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.transactionNotes}</label>
                  <div className="relative">
                    <textarea value={editingTr.notes || ''} onChange={e => setEditingTr({...editingTr, notes: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white" rows={3} placeholder={language === 'zh' ? '輸入交易備註 (Notepad)...' : 'Enter transaction notes (Notepad)...'}></textarea>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{language === 'zh' ? '出賬賬戶' : 'From Account'}</label>
                    <select 
                      value={editingTr.fromAccountId || ''} 
                      onChange={e => setEditingTr({...editingTr, fromAccountId: e.target.value || undefined})} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                    >
                      <option value="">None</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{language === 'zh' ? '入賬賬戶' : 'To Account'}</label>
                    <select 
                      value={editingTr.toAccountId || ''} 
                      onChange={e => setEditingTr({...editingTr, toAccountId: e.target.value || undefined})} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                    >
                      <option value="">None</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
               </div>

               <button 
                 type="submit" 
                 disabled={isSyncing}
                 className={`w-full bg-blue-600 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all dark:shadow-none flex items-center justify-center gap-2 ${isSyncing ? 'opacity-70' : ''}`}
               >
                 {isSyncing && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                 {t.update}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* Single Delete Confirmation */}
      {deletingId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 max-w-sm w-full shadow-2xl border border-slate-100 dark:border-white/10 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-exclamation-triangle text-2xl text-rose-500"></i>
            </div>
            <h3 className="text-xl font-black text-center dark:text-white mb-2 uppercase tracking-tight">
              {language === 'zh' ? '確認刪除' : 'Confirm Delete'}
            </h3>
            <p className="text-sm font-bold text-slate-400 text-center mb-8 uppercase tracking-widest leading-relaxed">
              {language === 'zh' ? '此操作無法撤銷，確定要刪除此記錄嗎？' : 'This action cannot be undone. Are you sure you want to delete this record?'}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={async () => { await onDelete(deletingId); setDeletingId(null); }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-rose-600/20 transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                {t.delete}
              </button>
              <button 
                onClick={() => setDeletingId(null)}
                className="flex-1 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-black py-4 rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 max-w-sm w-full shadow-2xl border border-slate-100 dark:border-white/10 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-trash-alt text-2xl text-rose-500"></i>
            </div>
            <h3 className="text-xl font-black text-center dark:text-white mb-2 uppercase tracking-tight">
              {language === 'zh' ? '批量刪除' : 'Bulk Delete'}
            </h3>
            <p className="text-sm font-bold text-slate-400 text-center mb-8 uppercase tracking-widest leading-relaxed">
              {language === 'zh' ? `確定要刪除 ${selectedIds.size} 條記錄嗎？此操作無法撤銷。` : `Are you sure you want to delete ${selectedIds.size} records? This action cannot be undone.`}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={handleBulkDelete}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-rose-600/20 transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                {t.delete}
              </button>
              <button 
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-black py-4 rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingPhoto && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 p-4 animate-in fade-in duration-300" onClick={() => setViewingPhoto(null)}>
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            <img src={viewingPhoto} className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl" />
            <div className="mt-6 flex gap-4">
              <button 
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = viewingPhoto;
                  link.download = `receipt_${Date.now()}.png`;
                  link.click();
                }}
                className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-2xl active:scale-95 transition-all"
              >
                <i className="fas fa-download"></i>
                {language === 'zh' ? '下載圖片' : 'Download Image'}
              </button>
              <button 
                onClick={() => setViewingPhoto(null)} 
                className="bg-slate-800 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-2xl active:scale-95 transition-all border border-white/10"
              >
                <i className="fas fa-times"></i>
                {t.close || (language === 'zh' ? '關閉' : 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionList;
