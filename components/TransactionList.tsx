
import React, { useState, useRef, useMemo, useEffect } from 'react';
import QRCode from 'qrcode';
// Sort directions
const SORTS = {
  ASC: 'asc',
  DESC: 'desc',
};

import { Transaction, TransactionType, Owner, Account, CategoryItem, Customer } from '../types';
import { translations } from '../translations';
import { getPrimaryCategoryId, getTransactionAmount, getTransactionDescription, getTransactionItemSummary, normalizeTransactionItems } from '../utils/transactionItems';
import { getSplitDisplayLabel, isSplitTransaction } from '../utils/transactionSplit';

interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: CategoryItem[];
  customers?: Customer[];
  onDelete: (id: string) => void;
  onUpdate: (tr: Transaction, noteText?: string) => void;
  onBulkUpdate: (items: Transaction[]) => void;
  onExportExcel: () => void;
  onExportJSON: () => void;
  language: 'zh' | 'en';
  isSyncing?: boolean;
  isReadOnly?: boolean;
  isConnectionError?: boolean;
  hideFinancialData?: boolean;
  filter?: (tr: Transaction) => boolean;
  openTransactionId?: string | null;
  initialSearchTerm?: string;
  onOpenTransactionHandled?: () => void;
  onRetryConnection?: () => void;
}

type SizeFilter = 'ALL' | 'SMALL' | 'MEDIUM' | 'LARGE';
type DateFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

const TransactionList: React.FC<TransactionListProps> = ({ transactions = [], accounts = [], categories = [], customers = [], onDelete, onUpdate, onBulkUpdate, onExportExcel, onExportJSON, language, isSyncing, isReadOnly, isConnectionError, hideFinancialData, filter, openTransactionId, initialSearchTerm, onOpenTransactionHandled, onRetryConnection }) => {
  const t = translations[language];
  const normalizedAccounts = useMemo(() => {
    const cleaned = (accounts || [])
      .filter(account => account && typeof account.id === 'string' && account.id.trim())
      .map(account => ({
        ...account,
        id: account.id.trim(),
        name: typeof account.name === 'string' && account.name.trim() ? account.name.trim() : account.id.trim(),
        type: typeof account.type === 'string' ? account.type : ''
      }));

    if (cleaned.length > 0) return cleaned;

    return [
      { id: 'Bank', name: 'Bank', type: 'company_bank', createdAt: '' },
      { id: 'Cash', name: 'Cash', type: 'cash', createdAt: '' },
      { id: 'User 1', name: 'User 1', type: 'partner_personal', createdAt: '' },
      { id: 'User 2', name: 'User 2', type: 'partner_personal', createdAt: '' }
    ];
  }, [accounts]);

  const getAccountName = (accountId?: string) => {
    if (!accountId) return 'Unknown';
    return normalizedAccounts.find(a => a.id === accountId)?.name || accountId;
  };

  const getContributorLabel = (transaction: Transaction) => {
    return getSplitDisplayLabel(transaction, language) || transaction.contributedBy;
  };

  const formatMoney = (value: number) => {
    if (hideFinancialData) return '***';
    return `¥${value.toLocaleString()}`;
  };

  const [search, setSearch] = useState('');
  // sort: { column: string, direction: 'asc' | 'desc' }
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'date', direction: SORTS.DESC });
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);
  const [isViewEditMode, setIsViewEditMode] = useState(false);
  const [detailDraft, setDetailDraft] = useState<Transaction | null>(null);
  const [transactionQrDataUrl, setTransactionQrDataUrl] = useState<string>('');
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const customer of customers) {
      map.set(customer.id, customer);
    }
    return map;
  }, [customers]);

  const editCategories = useMemo(() => {
    if (!detailDraft) return categories;
    if (detailDraft.type === TransactionType.EXPENSE) {
      return categories.filter(category => category.type === TransactionType.EXPENSE);
    }
    if (detailDraft.type === TransactionType.REVENUE) {
      return categories.filter(category => category.type === TransactionType.REVENUE);
    }
    return categories;
  }, [categories, detailDraft]);

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

  useEffect(() => {
    if (!initialSearchTerm) return;
    setSearch(initialSearchTerm);
    if (onOpenTransactionHandled) onOpenTransactionHandled();
  }, [initialSearchTerm, onOpenTransactionHandled]);

  useEffect(() => {
    if (!openTransactionId) return;
    const matched = transactions.find(transaction => transaction.id === openTransactionId || transaction.receiptNumber === openTransactionId);
    if (matched) {
      setViewingTransaction(matched);
      setDetailDraft(matched);
      setIsViewEditMode(false);
    } else {
      setSearch(openTransactionId);
    }
    if (onOpenTransactionHandled) onOpenTransactionHandled();
  }, [openTransactionId, transactions, onOpenTransactionHandled]);

  useEffect(() => {
    if (!viewingTransaction) {
      setTransactionQrDataUrl('');
      return;
    }

    const payload = `app://transaction/${encodeURIComponent(viewingTransaction.receiptNumber)}`;
    QRCode.toDataURL(payload, { width: 280, margin: 1 })
      .then(setTransactionQrDataUrl)
      .catch(() => setTransactionQrDataUrl(''));
  }, [viewingTransaction]);

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

    let grouped = Object.values(groups).map(group => {
      if (group.length === 1) return group[0];
      const first = group[0];
      const totalAmount = group.reduce((sum, item) => sum + item.amount, 0);
      // Determine display owner
      let displayOwner = first.contributedBy as string;
      const owners = new Set(group.map(g => g.contributedBy));
      if (owners.size > 1) {
        displayOwner = language === 'zh' ? "公數攤分" : "User 1 & User 2";
      }
      return {
        ...first,
        amount: totalAmount,
        contributedBy: displayOwner as Owner,
        isGrouped: true,
        originalIds: group.map(g => g.id)
      };
    });

    // Sorting logic
    if (sort.column) {
      grouped = grouped.slice().sort((a, b) => {
        let aVal = a[sort.column];
        let bVal = b[sort.column];
        // Special handling for date and amount
        if (sort.column === 'date') {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
        }
        if (sort.column === 'amount') {
          aVal = Number(aVal);
          bVal = Number(bVal);
        }
        if (aVal < bVal) return sort.direction === SORTS.ASC ? -1 : 1;
        if (aVal > bVal) return sort.direction === SORTS.ASC ? 1 : -1;
        return 0;
      });
    }
    return grouped;
  }, [filtered, sort]);

  const confirmDelete = async () => {
    if (deletingId) {
      const deletingNow = deletingId;
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
      if (viewingTransaction && (viewingTransaction as any).id === deletingNow) {
        setViewingTransaction(null);
        setDetailDraft(null);
        setIsViewEditMode(false);
      }
    }
  };

  const editPhotoRef = useRef<HTMLInputElement>(null);
  const handleEditPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !detailDraft) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDetailDraft({ ...detailDraft, imageUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const saveDetailEdit = async () => {
    if (!detailDraft || !viewingTransaction) return;

    const isExpenseEdit = detailDraft.type === TransactionType.EXPENSE;
    const selectedCategory = categories.find(category => category.id === detailDraft.categoryId);
    const currentItems = normalizeTransactionItems(detailDraft);
    const nextItems = currentItems.length <= 1
      ? [{
          id: currentItems[0]?.id || `${detailDraft.id}_item_1`,
          transactionId: detailDraft.id,
          categoryId: detailDraft.categoryId,
          name: selectedCategory?.name || detailDraft.description || detailDraft.categoryId,
          price: Number(detailDraft.amount),
          notes: currentItems[0]?.notes,
        }]
      : currentItems.map((item, index) => ({
          ...item,
          id: item.id || `${detailDraft.id}_item_${index + 1}`,
          transactionId: detailDraft.id,
        }));
    const normalizedEditedTransaction: Transaction = {
      ...detailDraft,
      items: nextItems,
      categoryId: getPrimaryCategoryId({ ...detailDraft, items: nextItems }),
      amount: getTransactionAmount({ ...detailDraft, items: nextItems }),
      toAccountId: isExpenseEdit ? undefined : detailDraft.toAccountId,
      description: currentItems.length <= 1
        ? (isExpenseEdit ? (selectedCategory?.name || detailDraft.description) : detailDraft.description)
        : getTransactionDescription({ ...detailDraft, items: nextItems }),
    };

    const tr = viewingTransaction as any;
    if (tr.isGrouped && tr.originalIds) {
      const amountPerPart = normalizedEditedTransaction.amount / tr.originalIds.length;
      const updatedItems = tr.originalIds.map((id: string) => ({
        ...normalizedEditedTransaction,
        id,
        amount: amountPerPart,
        items: normalizeTransactionItems(normalizedEditedTransaction).map(item => ({
          ...item,
          price: Number((item.price / tr.originalIds.length).toFixed(2))
        })),
        isGrouped: undefined,
        originalIds: undefined,
      }));
      await onBulkUpdate(updatedItems);
    } else {
      await onUpdate(normalizedEditedTransaction);
    }

    setViewingTransaction(normalizedEditedTransaction);
    setDetailDraft(normalizedEditedTransaction);
    setIsViewEditMode(false);
  };

  const openTransactionDetail = (transaction: Transaction) => {
    if (selectionMode) {
      toggleSelection(transaction.id);
      return;
    }
    setViewingTransaction(transaction);
    setDetailDraft(transaction);
    setIsViewEditMode(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {isConnectionError && (
        <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/20 rounded-2xl p-4 flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400">
          <div className="flex items-center gap-3">
            <i className="fas fa-lock text-sm"></i>
            <span className="text-xs font-bold uppercase tracking-widest">
              {language === 'zh' ? '連接不穩定，目前處於唯讀模式。' : 'Network unstable. Read-only mode.'}
            </span>
          </div>
          {onRetryConnection && (
            <button
              onClick={onRetryConnection}
              className="text-xs font-black uppercase tracking-widest text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-1 shrink-0"
            >
              <i className="fas fa-rotate-right text-xs"></i>
              {language === 'zh' ? '重試' : 'Retry'}
            </button>
          )}
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
                <th className="px-6 py-5 cursor-pointer select-none" onClick={() => setSort(s => ({ column: 'date', direction: s.column === 'date' && s.direction === SORTS.DESC ? SORTS.ASC : SORTS.DESC }))}>
                  {t.date}
                  <span className="ml-1">{sort.column === 'date' ? (sort.direction === SORTS.ASC ? '▲' : '▼') : ''}</span>
                </th>
                <th className="px-6 py-5 cursor-pointer select-none" onClick={() => setSort(s => ({ column: 'receiptNumber', direction: s.column === 'receiptNumber' && s.direction === SORTS.DESC ? SORTS.ASC : SORTS.DESC }))}>
                  {t.receiptNumber}
                  <span className="ml-1">{sort.column === 'receiptNumber' ? (sort.direction === SORTS.ASC ? '▲' : '▼') : ''}</span>
                </th>
                <th className="px-6 py-5 cursor-pointer select-none" onClick={() => setSort(s => ({ column: 'categoryId', direction: s.column === 'categoryId' && s.direction === SORTS.DESC ? SORTS.ASC : SORTS.DESC }))}>
                  {t.catDesc}
                  <span className="ml-1">{sort.column === 'categoryId' ? (sort.direction === SORTS.ASC ? '▲' : '▼') : ''}</span>
                </th>
                <th className="px-6 py-5 cursor-pointer select-none" onClick={() => setSort(s => ({ column: 'fromAccountId', direction: s.column === 'fromAccountId' && s.direction === SORTS.DESC ? SORTS.ASC : SORTS.DESC }))}>
                  {language === 'zh' ? '賬戶' : 'Account'}
                  <span className="ml-1">{sort.column === 'fromAccountId' ? (sort.direction === SORTS.ASC ? '▲' : '▼') : ''}</span>
                </th>
                <th className="px-6 py-5 cursor-pointer select-none" onClick={() => setSort(s => ({ column: 'contributedBy', direction: s.column === 'contributedBy' && s.direction === SORTS.DESC ? SORTS.ASC : SORTS.DESC }))}>
                  {t.contributor}
                  <span className="ml-1">{sort.column === 'contributedBy' ? (sort.direction === SORTS.ASC ? '▲' : '▼') : ''}</span>
                </th>
                <th className="px-6 py-5 text-right cursor-pointer select-none" onClick={() => setSort(s => ({ column: 'amount', direction: s.column === 'amount' && s.direction === SORTS.DESC ? SORTS.ASC : SORTS.DESC }))}>
                  {t.amount}
                  <span className="ml-1">{sort.column === 'amount' ? (sort.direction === SORTS.ASC ? '▲' : '▼') : ''}</span>
                </th>
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
                  onClick={() => openTransactionDetail(tr)}
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
                    <div className="flex flex-col gap-1">
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
                      <div className="text-xs text-slate-700 dark:text-slate-200 font-bold truncate max-w-[180px] ml-1">{tr.description}</div>
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
                         <div className="text-sm font-black text-slate-800 tracking-tight dark:text-white">
                           {tr.categoryId}
                           {(() => {
                             const cat = categories.find(c => c.id === tr.categoryId);
                             return `, ${cat ? cat.name : 'Unknown'}`;
                           })()}
                         </div>
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
                            {getAccountName(tr.fromAccountId)}
                          </span>
                        </div>
                      )}
                      {tr.toAccountId && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">{language === 'zh' ? '入' : 'To'}:</span>
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            {getAccountName(tr.toAccountId)}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm"><span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${isSplitTransaction(tr) ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' : tr.contributedBy === Owner.OWNER_A ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : tr.contributedBy === Owner.OWNER_B ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'}`}>{getContributorLabel(tr)}</span></td>
                  <td className={`px-6 py-5 whitespace-nowrap text-right font-black text-sm tracking-tight ${tr.type === TransactionType.REVENUE ? 'text-emerald-600 dark:text-emerald-400' : (tr.type === TransactionType.STARTUP || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment')) ? 'text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-white'}`}>
                    {hideFinancialData
                      ? '***'
                      : `${(tr.type === TransactionType.REVENUE || tr.type === TransactionType.STARTUP || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment')) ? '+' : '-'} ${formatMoney(tr.amount)}`}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">
                      {language === 'zh' ? '點擊查看' : 'Tap to view'}
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
              onClick={() => openTransactionDetail(tr)}
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
                            {getAccountName(tr.fromAccountId)}
                          </span>
                        </div>
                      )}
                      {tr.toAccountId && (
                        <div className="flex items-center gap-1">
                          <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">{language === 'zh' ? '入' : 'To'}:</span>
                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                            {getAccountName(tr.toAccountId)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-black tracking-tight ${tr.type === TransactionType.REVENUE ? 'text-emerald-600 dark:text-emerald-400' : (tr.type === TransactionType.STARTUP || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment')) ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                  {hideFinancialData
                    ? '***'
                    : `${(tr.type === TransactionType.REVENUE || tr.type === TransactionType.STARTUP || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment')) ? '+' : '-'} ${formatMoney(tr.amount)}`}
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${isSplitTransaction(tr) ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' : tr.contributedBy === Owner.OWNER_A ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : tr.contributedBy === Owner.OWNER_B ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'}`}>
                    {getContributorLabel(tr)}
                  </span>
                  {tr.items && tr.items.length > 1 ? (
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-300 truncate max-w-[170px]">{getTransactionItemSummary(tr)}</span>
                  ) : tr.description ? (
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-300 truncate max-w-[150px]">{tr.description}</span>
                  ) : null}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">
                  {language === 'zh' ? '點擊查看' : 'Tap to view'}
                </span>
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

      {/* Single Delete Confirmation */}
      {deletingId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[260] flex items-center justify-center p-4 animate-in fade-in duration-200">
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
                onClick={confirmDelete}
                className="flex-1 bg-rose-700 hover:bg-rose-800 text-white dark:text-white border border-rose-800 font-black py-4 rounded-2xl shadow-xl shadow-rose-700/30 transition-all active:scale-95 text-xs uppercase tracking-widest"
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[260] flex items-center justify-center p-4 animate-in fade-in duration-200">
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
                className="flex-1 bg-rose-700 hover:bg-rose-800 text-white dark:text-white border border-rose-800 font-black py-4 rounded-2xl shadow-xl shadow-rose-700/30 transition-all active:scale-95 text-xs uppercase tracking-widest"
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

      {viewingTransaction && (
        <div className="fixed inset-0 z-[220] bg-slate-100 dark:bg-slate-950 overflow-y-auto">
          <div className="max-w-2xl mx-auto min-h-screen px-4 py-5 pb-10">
            <div className="flex items-center justify-between mb-8">
              <button
                onClick={() => {
                  setViewingTransaction(null);
                  setDetailDraft(null);
                  setIsViewEditMode(false);
                }}
                className="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-100"
              >
                <i className="fas fa-arrow-left text-xl"></i>
              </button>
              <div className="text-sm font-black text-slate-500 uppercase tracking-widest">
                {language === 'zh' ? '交易詳情' : 'Transaction Detail'}
              </div>
              {!isReadOnly ? (
                <div className="flex items-center gap-2">
                  {isViewEditMode ? (
                    <>
                      <button
                        onClick={() => {
                          setIsViewEditMode(false);
                          setDetailDraft(viewingTransaction);
                        }}
                        className="px-3 h-10 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest"
                      >
                        {t.cancel}
                      </button>
                      <button
                        onClick={saveDetailEdit}
                        disabled={isSyncing}
                        className="px-4 h-10 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        {isSyncing ? t.syncing : t.update}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setIsViewEditMode(true);
                          setDetailDraft(viewingTransaction);
                        }}
                        className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200 flex items-center justify-center"
                      >
                        <i className="fas fa-pen text-sm"></i>
                      </button>
                      <button
                        onClick={() => setDeletingId(viewingTransaction.id)}
                        className="w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 flex items-center justify-center"
                      >
                        <i className="fas fa-trash text-sm"></i>
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="w-12" />
              )}
            </div>

            <div className="text-center mb-8">
              {(() => {
                const detailItems = normalizeTransactionItems(isViewEditMode && detailDraft ? detailDraft : viewingTransaction);
                const isMultiItem = detailItems.length > 1;
                return (
                  <>
              <div className="w-20 h-20 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-receipt text-3xl"></i>
              </div>
              {isViewEditMode && detailDraft ? (
                <input
                  value={detailDraft.description || ''}
                  onChange={e => setDetailDraft({ ...detailDraft, description: e.target.value })}
                  className="w-full max-w-md mx-auto text-center text-xl font-black text-slate-800 dark:text-slate-100 mb-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-2"
                  disabled={isMultiItem}
                />
              ) : (
                <p className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">
                  {viewingTransaction.description || viewingTransaction.categoryId}
                </p>
              )}
              {isViewEditMode && detailDraft && !isMultiItem ? (
                <input
                  type="number"
                  value={detailDraft.amount}
                  onChange={e => setDetailDraft({ ...detailDraft, amount: Number(e.target.value || 0) })}
                  className="w-56 text-center text-4xl font-black tracking-tight text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2"
                />
              ) : (
                <p className={`text-5xl font-black tracking-tight ${viewingTransaction.type === TransactionType.REVENUE ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>
                  {hideFinancialData
                    ? '***'
                    : `${viewingTransaction.type === TransactionType.REVENUE ? '+' : '-'}${formatMoney(viewingTransaction.amount)}`}
                </p>
              )}
              {isMultiItem && (
                <p className="mt-3 text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {language === 'zh' ? `${detailItems.length} 個服務項目` : `${detailItems.length} service items`}
                </p>
              )}
              <p className="mt-4 text-base font-black text-blue-600 dark:text-blue-400">
                <i className="fas fa-check-circle mr-2"></i>
                {language === 'zh' ? '成功' : 'Success'}
              </p>
                  </>
                );
              })()}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 border border-slate-200 dark:border-white/10 space-y-4">
              {(() => {
                const draftOrView = isViewEditMode && detailDraft ? detailDraft : viewingTransaction;
                const detailItems = normalizeTransactionItems(draftOrView);
                const isMultiItem = detailItems.length > 1;
                return (
                  <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <p className="font-black text-slate-700 dark:text-slate-300">{language === 'zh' ? '交易類型' : 'Type'}</p>
                {isViewEditMode && detailDraft ? (
                  <select
                    value={detailDraft.type}
                    onChange={e => setDetailDraft({ ...detailDraft, type: e.target.value as TransactionType })}
                    className="text-right font-semibold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1"
                  >
                    <option value={TransactionType.REVENUE}>{t.revenue}</option>
                    <option value={TransactionType.EXPENSE}>{t.expense}</option>
                    <option value={TransactionType.STARTUP}>{t.startupCosts}</option>
                    <option value={TransactionType.WITHDRAWAL}>{t.withdraw}</option>
                  </select>
                ) : (
                  <p className="text-right font-semibold text-slate-500 dark:text-slate-400">{viewingTransaction.type}</p>
                )}

                <p className="font-black text-slate-700 dark:text-slate-300">{language === 'zh' ? '交易號碼' : 'Transaction Number'}</p>
                {isViewEditMode && detailDraft ? (
                  <input
                    value={detailDraft.receiptNumber}
                    onChange={e => setDetailDraft({ ...detailDraft, receiptNumber: e.target.value })}
                    className="text-right font-semibold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1"
                  />
                ) : (
                  <p className="text-right font-semibold text-slate-500 dark:text-slate-400 break-all">{viewingTransaction.receiptNumber}</p>
                )}

                <p className="font-black text-slate-700 dark:text-slate-300">{language === 'zh' ? '日期' : 'Date'}</p>
                {isViewEditMode && detailDraft ? (
                  <input
                    type="date"
                    value={detailDraft.date.slice(0, 10)}
                    onChange={e => setDetailDraft({ ...detailDraft, date: e.target.value })}
                    className="text-right font-semibold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1"
                  />
                ) : (
                  <p className="text-right font-semibold text-slate-500 dark:text-slate-400">{viewingTransaction.date}</p>
                )}

                <p className="font-black text-slate-700 dark:text-slate-300">{language === 'zh' ? '分類' : 'Category'}</p>
                {isViewEditMode && detailDraft && !isMultiItem ? (
                  <select
                    value={detailDraft.categoryId}
                    onChange={e => setDetailDraft({ ...detailDraft, categoryId: e.target.value })}
                    className="text-right font-semibold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1"
                  >
                    {editCategories.map(category => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-right font-semibold text-slate-500 dark:text-slate-400">{isMultiItem ? (language === 'zh' ? '多服務' : 'Multiple Services') : (categories.find(c => c.id === viewingTransaction.categoryId)?.name || viewingTransaction.categoryId)}</p>
                )}

                <p className="font-black text-slate-700 dark:text-slate-300">{language === 'zh' ? '客戶' : 'Customer'}</p>
                {isViewEditMode && detailDraft ? (
                  <select
                    value={detailDraft.customerId || ''}
                    onChange={e => setDetailDraft({ ...detailDraft, customerId: e.target.value || undefined })}
                    className="text-right font-semibold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1"
                  >
                    <option value="">{language === 'zh' ? '未綁定' : 'None'}</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-right font-semibold text-slate-500 dark:text-slate-400">{viewingTransaction.customerId ? (customerById.get(viewingTransaction.customerId)?.name || viewingTransaction.customerId) : (language === 'zh' ? '未綁定' : 'None')}</p>
                )}

                <p className="font-black text-slate-700 dark:text-slate-300">{language === 'zh' ? '取錢帳戶' : 'From Account'}</p>
                {isViewEditMode && detailDraft ? (
                  <select
                    value={detailDraft.fromAccountId || ''}
                    onChange={e => setDetailDraft({ ...detailDraft, fromAccountId: e.target.value || undefined })}
                    className="text-right font-semibold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1"
                  >
                    <option value="">{language === 'zh' ? '無' : 'None'}</option>
                    {normalizedAccounts.map(account => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-right font-semibold text-slate-500 dark:text-slate-400">{viewingTransaction.fromAccountId ? getAccountName(viewingTransaction.fromAccountId) : (language === 'zh' ? '無' : 'None')}</p>
                )}

                <p className="font-black text-slate-700 dark:text-slate-300">{language === 'zh' ? '入錢帳戶' : 'To Account'}</p>
                {isViewEditMode && detailDraft ? (
                  <select
                    value={detailDraft.toAccountId || ''}
                    onChange={e => setDetailDraft({ ...detailDraft, toAccountId: e.target.value || undefined })}
                    className="text-right font-semibold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1"
                  >
                    <option value="">{language === 'zh' ? '無' : 'None'}</option>
                    {normalizedAccounts.map(account => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-right font-semibold text-slate-500 dark:text-slate-400">{viewingTransaction.toAccountId ? getAccountName(viewingTransaction.toAccountId) : (language === 'zh' ? '無' : 'None')}</p>
                )}

                <p className="font-black text-slate-700 dark:text-slate-300">{language === 'zh' ? '歸屬' : 'Contributed By'}</p>
                {isViewEditMode && detailDraft && !isSplitTransaction(detailDraft) ? (
                  <select
                    value={detailDraft.contributedBy || ''}
                    onChange={e => setDetailDraft({ ...detailDraft, contributedBy: e.target.value })}
                    className="text-right font-semibold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1"
                  >
                    {normalizedAccounts.map(account => (
                      <option key={account.id} value={account.id}>{account.id}</option>
                    ))}
                  </select>
                ) : isViewEditMode && detailDraft ? (
                  <p className="text-right font-semibold text-indigo-600 dark:text-indigo-400">{getContributorLabel(detailDraft)}</p>
                ) : (
                  <p className="text-right font-semibold text-slate-500 dark:text-slate-400">{getContributorLabel(viewingTransaction)}</p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{language === 'zh' ? '服務明細' : 'Service Breakdown'}</p>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{detailItems.length}</p>
                </div>
                {detailItems.map((item, index) => (
                  <div key={`${item.categoryId}-${index}`} className="rounded-2xl bg-slate-50 dark:bg-white/5 px-4 py-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-slate-700 dark:text-slate-200">{item.name}</p>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">{categories.find(c => c.id === item.categoryId)?.name || item.categoryId}</p>
                      {item.notes && <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2">{item.notes}</p>}
                    </div>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-100">{hideFinancialData ? '***' : formatMoney(item.price)}</p>
                  </div>
                ))}
              </div>

              {(viewingTransaction.notes || viewingTransaction.description || isViewEditMode) && (
                <div className="pt-3 border-t border-slate-100 dark:border-white/10">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{language === 'zh' ? '備註 / 說明' : 'Notes / Description'}</p>
                  {isViewEditMode && detailDraft ? (
                    <textarea
                      rows={3}
                      value={detailDraft.notes || ''}
                      onChange={e => setDetailDraft({ ...detailDraft, notes: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 dark:bg-slate-800 dark:border-white/10"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{viewingTransaction.notes || viewingTransaction.description}</p>
                  )}
                </div>
              )}

              {(viewingTransaction.imageUrl || isViewEditMode) && (
                <div className="pt-3 border-t border-slate-100 dark:border-white/10">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{language === 'zh' ? '收據照片' : 'Receipt Photo'}</p>
                  {isViewEditMode && detailDraft ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => editPhotoRef.current?.click()}
                        className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase text-slate-700 dark:text-slate-300 dark:bg-slate-800 dark:border-white/10"
                      >
                        {detailDraft.imageUrl ? t.changePhoto : t.uploadPhoto}
                      </button>
                      <input type="file" ref={editPhotoRef} onChange={handleEditPhoto} accept="image/*" className="hidden" />
                      {detailDraft.imageUrl && (
                        <img src={detailDraft.imageUrl} className="w-full max-h-72 object-cover rounded-2xl border border-slate-200 dark:border-white/10" />
                      )}
                    </div>
                  ) : (
                    viewingTransaction.imageUrl && <img src={viewingTransaction.imageUrl} className="w-full max-h-72 object-cover rounded-2xl border border-slate-200 dark:border-white/10" />
                  )}
                </div>
              )}
                  </>
                );
              })()}
            </div>

            <div className="mt-6 bg-white dark:bg-slate-900 rounded-[28px] p-5 border border-slate-200 dark:border-white/10 text-center">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">{language === 'zh' ? '掃描以打開交易' : 'Scan to open transaction'}</p>
              {transactionQrDataUrl ? (
                <img src={transactionQrDataUrl} alt="transaction-qr" className="w-56 h-56 mx-auto" />
              ) : (
                <div className="w-56 h-56 mx-auto rounded-2xl bg-slate-100 dark:bg-white/5 animate-pulse" />
              )}
              <p className="mt-3 text-xs font-bold text-slate-500 break-all">app://transaction/{viewingTransaction.receiptNumber}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionList;
