
import React, { useState, useEffect, useMemo, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Note, Transaction, TransactionType, Category, Owner, FinancialSummary, CloudConfig, AuditAction, AuditLog, CategoryItem, Customer, Account } from './types';
import Dashboard from './components/Dashboard';
import TransactionList from './components/TransactionList';
import TransactionForm from './components/TransactionForm';
import StartupList from './components/StartupList';
import CashForecast from './components/CashForecast';
import SettingsPage from './components/SettingsPage';
import AuditLogList from './components/AuditLogList';
import NotesPage from './components/NotesPage';
import CustomerPage from './components/CustomerPage';
import AccountsPage from './components/AccountsPage';
import LoadingScreen from './components/LoadingScreen';
import { initSupabase, fetchRemoteTransactions, syncRemoteTransactions, deleteRemoteTransaction, subscribeToTransactions, logAuditEvent, fetchAuditLogs, fetchRemoteNotes, syncRemoteNotes, deleteRemoteNote, subscribeToNotes, clearAllRemoteData, fetchRemoteCategories, syncRemoteCategories, deleteRemoteCategory, subscribeToCategories, fetchRemoteCustomers, syncRemoteCustomers, deleteRemoteCustomer, subscribeToCustomers, updateAdminSession, clearAdminSession, getServerTime, fetchRemoteAccounts, syncRemoteAccounts, deleteRemoteAccount, subscribeToAccounts } from './services/database';
import { translations } from './translations';
import { LoginPage } from './components/LoginPage';

const QUICK_CONNECT_CONFIG: CloudConfig = {
  url: process.env.SUPABASE_URL || "",
  key: process.env.SUPABASE_ANON_KEY || ""
};

const buildTransactionNotes = (transactions: Transaction[]): Note[] => {
  return transactions
    .filter(transaction => transaction.notes && transaction.notes.trim().length > 0)
    .map(transaction => {
      const timestamp = new Date().toISOString();
      return {
      id: crypto.randomUUID(),
      content: [
        `[${timestamp}] Transaction Note`,
        `Transaction ID: ${transaction.id}`,
        `Receipt: ${transaction.receiptNumber || 'N/A'}`,
        `Date: ${transaction.date}`,
        '',
        transaction.notes!.trim()
      ].join('\n'),
      createdBy: 'system',
      createdAt: timestamp,
      updatedAt: timestamp
      };
    });
};

const shouldCreateTransactionNote = (previous: Transaction | undefined, next: Transaction): boolean => {
  const nextText = (next.notes || '').trim();
  if (!nextText) return false;

  const previousText = (previous?.notes || '').trim();
  return previousText !== nextText;
};

class ErrorBoundary extends React.Component<any, any> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-2xl">
            <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-exclamation-triangle text-2xl text-rose-500"></i>
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-4 uppercase tracking-tight">Something went wrong</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm font-bold leading-relaxed">
              The application encountered an unexpected error.
            </p>
            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl mb-6 text-left overflow-auto max-h-40">
              <p className="text-[10px] font-mono text-rose-500 break-all">{this.state.error?.message}</p>
              <pre className="text-[8px] text-slate-400 mt-2">{this.state.error?.stack}</pre>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const App: React.FC = () => {
  console.log("App component rendering...");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'input' | 'startup' | 'balance' | 'settings' | 'audit' | 'notes' | 'customers'>('overview');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [syncStatus, setSyncStatus] = useState<'local' | 'syncing' | 'cloud' | 'error'>('local');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [cloudConfig, setCloudConfig] = useState<CloudConfig | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [lastAction, setLastAction] = useState<{ type: 'add' | 'delete', data: Transaction[] } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isForcedReadOnly, setIsForcedReadOnly] = useState(false);
  const [serverTime, setServerTime] = useState<string>('');

  const isReadOnly = syncStatus === 'error' || isForcedReadOnly;

  const formatTransactionSyncError = (
    result: {
      error?: string;
      details?: string;
      failedChunkIndex?: number;
      failedTransactionIds?: string[];
    },
    fallback: string
  ): string => {
    const base = result.error || fallback;
    const parts: string[] = [];

    if (typeof result.failedChunkIndex === 'number') {
      parts.push(`chunk ${result.failedChunkIndex + 1}`);
    }

    if (result.failedTransactionIds && result.failedTransactionIds.length > 0) {
      parts.push(`ids: ${result.failedTransactionIds.slice(0, 5).join(', ')}`);
    }

    if (result.details) {
      parts.push(result.details);
    }

    if (parts.length === 0) return base;
    return `${base} | ${parts.join(' | ')}`;
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [currentBranch, setCurrentBranch] = useState("Zhuhai");
  const [showBranchSelector, setShowBranchSelector] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const touchStartRef = useRef<number | null>(null);
  
  const mainRef = useRef<HTMLDivElement>(null);
  const t = translations[language];

  const BRANCHES = ["Zhuhai", "Macau", "Hong Kong", "Shenzhen"];

  useEffect(() => {
    const savedLang = localStorage.getItem('gardiner_lang') as 'zh' | 'en';
    if (savedLang) setLanguage(savedLang);

    const savedTheme = localStorage.getItem('gardiner_theme') as 'light' | 'dark' | 'system';
    if (savedTheme) {
      setTheme(savedTheme);
    }

    const savedConfigStr = localStorage.getItem('gardiner_cloud_config');
    let configToUse: CloudConfig;

    // Prioritize environment variables if they are set
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      configToUse = QUICK_CONNECT_CONFIG;
      localStorage.setItem('gardiner_cloud_config', JSON.stringify(configToUse));
    } else if (savedConfigStr) {
      configToUse = JSON.parse(savedConfigStr);
    } else {
      configToUse = QUICK_CONNECT_CONFIG;
      localStorage.setItem('gardiner_cloud_config', JSON.stringify(configToUse));
    }

    setCloudConfig(configToUse);
    initSupabase(configToUse);
    
    // Check local session
    const savedSessionId = localStorage.getItem('gardiner_session_id');
    const savedIsReadOnly = localStorage.getItem('gardiner_readonly') === 'true';
    if (savedSessionId) {
      setSessionId(savedSessionId);
      setIsLoggedIn(true);
      setIsForcedReadOnly(savedIsReadOnly);
      loadData(true, configToUse);
    }

    // Auto-sync every 2 minutes
    const autoSaveInterval = setInterval(() => {
      loadData(false);
    }, 2 * 60 * 1000);

    return () => clearInterval(autoSaveInterval);
  }, []);

  // Background reconnection polling
  useEffect(() => {
    let interval: any;
    if (syncStatus === 'error' && isOnline && cloudConfig) {
      console.log('Connection unstable. Starting background reconnection polling...');
      interval = setInterval(async () => {
        try {
          const { data, error } = await fetchRemoteTransactions();
          if (data && !error) {
            console.log('Connection re-established!');
            clearInterval(interval);
            setShowReconnectPrompt(true);
          }
        } catch (e) {
          // Still failing, keep polling
        }
      }, 15000); // Poll every 15s to be gentle
    }
    return () => clearInterval(interval);
  }, [syncStatus, isOnline, cloudConfig]);

  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = 
      theme === 'dark' || 
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    if (theme !== 'system') {
      localStorage.setItem('gardiner_theme', theme);
      localStorage.theme = theme;
    } else {
      localStorage.setItem('gardiner_theme', 'system');
      localStorage.removeItem('theme');
    }
  }, [theme]);

  useEffect(() => {
    let subTr: any = null;
    let subNotes: any = null;
    let subCats: any = null;
    let subCust: any = null;
    let subAcc: any = null;
    if (cloudConfig) {
      subTr = subscribeToTransactions(() => loadData(false));
      subNotes = subscribeToNotes(() => loadData(false));
      subCats = subscribeToCategories(() => loadData(false));
      subCust = subscribeToCustomers(() => loadData(false));
      subAcc = subscribeToAccounts(() => loadData(false));
    }
    return () => {
      if (subTr && subTr.unsubscribe) subTr.unsubscribe();
      if (subNotes && subNotes.unsubscribe) subNotes.unsubscribe();
      if (subCats && subCats.unsubscribe) subCats.unsubscribe();
      if (subCust && subCust.unsubscribe) subCust.unsubscribe();
      if (subAcc && subAcc.unsubscribe) subAcc.unsubscribe();
    };
  }, [cloudConfig]);

  // Session Heartbeat and Server Time
  useEffect(() => {
    if (!isLoggedIn || !sessionId || isForcedReadOnly) return;

    const heartbeat = setInterval(() => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      updateAdminSession(sessionId, expiresAt);
    }, 60 * 1000);

    return () => clearInterval(heartbeat);
  }, [isLoggedIn, sessionId, isForcedReadOnly]);

  useEffect(() => {
    const updateTime = async () => {
      const time = await getServerTime();
      if (time) {
        const date = new Date(time);
        // Adjust to Zhuhai (UTC+8)
        const zhuhaiTime = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Hong_Kong',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(date);
        setServerTime(zhuhaiTime);
      }
    };

    updateTime();
    const timeInterval = setInterval(updateTime, 1000);
    return () => clearInterval(timeInterval);
  }, []);

  const handleLogin = (sid: string, readOnly: boolean) => {
    setSessionId(sid);
    setIsLoggedIn(true);
    setIsForcedReadOnly(readOnly);
    localStorage.setItem('gardiner_session_id', sid);
    localStorage.setItem('gardiner_readonly', readOnly.toString());
    loadData(true);
  };

  const handleLogout = async () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    if (sessionId && !isForcedReadOnly) {
      await clearAdminSession(sessionId);
    }
    setIsLoggedIn(false);
    setSessionId(null);
    setIsForcedReadOnly(false);
    localStorage.removeItem('gardiner_session_id');
    localStorage.removeItem('gardiner_readonly');
  };

  const loadData = async (forceLoading = true, overrideConfig?: CloudConfig) => {
    const config = overrideConfig || cloudConfig;
    if (!config) {
      console.log('No cloud config found, skipping loadData');
      return;
    }
    
    if (forceLoading) setSyncStatus('syncing');
    setLastError(null);

    // Check online status
    if (!navigator.onLine) {
      console.log('Device is offline, skipping loadData');
      setSyncStatus('error');
      setLastError('Device is offline. Please check your internet connection.');
      return;
    }

    console.log('Starting loadData from Supabase...');
    
    try {
      const { data: cloudData, error: trError } = await fetchRemoteTransactions();
      const { data: cloudNotes, error: notesError } = await fetchRemoteNotes();
      const { data: cloudCategories, error: catsError } = await fetchRemoteCategories();
      const { data: cloudCustomers, error: custError } = await fetchRemoteCustomers();
      const { data: cloudAccounts, error: accError } = await fetchRemoteAccounts();
      const { data: logsData, error: logsError } = await fetchAuditLogs();
      
      if (trError || notesError || catsError || custError || accError || logsError) {
        const firstError = trError || notesError || catsError || custError || accError || logsError;
        console.error('Fetch error detected:', { trError, notesError, catsError, custError, accError, logsError });
        throw new Error(firstError || 'Database connection failed');
      }

      if (logsData) setAuditLogs(logsData);
      
      if (cloudData !== null && cloudData !== undefined) {
        console.log(`Successfully fetched ${cloudData.length} transactions.`);
        setTransactions(cloudData);
      } else {
        console.warn('cloudData was null or undefined');
      }
      
      if (cloudNotes !== null && cloudNotes !== undefined) {
        setNotes(cloudNotes);
      }

      if (cloudCustomers !== null && cloudCustomers !== undefined) {
        setCustomers(cloudCustomers);
      }

      if (cloudAccounts !== null && cloudAccounts !== undefined) {
        setAccounts(cloudAccounts);
      }
      
      if (cloudCategories !== null && cloudCategories !== undefined) {
        if (cloudCategories.length === 0) {
          console.log('No categories found, seeding defaults...');
          // Seed default categories if empty
          const defaultCats: CategoryItem[] = [
            // Revenue
            { id: 'rev-1', name: '洗車 (Wash)', type: TransactionType.REVENUE, createdAt: new Date().toISOString() },
            { id: 'rev-2', name: '美容 (Detailing)', type: TransactionType.REVENUE, createdAt: new Date().toISOString() },
            { id: 'rev-3', name: '鍍晶 (Coating)', type: TransactionType.REVENUE, createdAt: new Date().toISOString() },
            { id: 'rev-4', name: '內飾清潔 (Interior)', type: TransactionType.REVENUE, createdAt: new Date().toISOString() },
            { id: 'rev-5', name: '玻璃撥水 (Window)', type: TransactionType.REVENUE, createdAt: new Date().toISOString() },
            { id: 'rev-6', name: '其他 (Other)', type: TransactionType.REVENUE, createdAt: new Date().toISOString() },
            // Expense
            { id: 'exp-1', name: '租金 (Rent)', type: TransactionType.EXPENSE, createdAt: new Date().toISOString() },
            { id: 'exp-2', name: '水電 (Utilities)', type: TransactionType.EXPENSE, createdAt: new Date().toISOString() },
            { id: 'exp-3', name: '薪金 (Salary)', type: TransactionType.EXPENSE, createdAt: new Date().toISOString() },
            { id: 'exp-4', name: '耗材 (Supplies)', type: TransactionType.EXPENSE, createdAt: new Date().toISOString() },
            { id: 'exp-5', name: '營銷 (Marketing)', type: TransactionType.EXPENSE, createdAt: new Date().toISOString() },
            { id: 'exp-6', name: '裝修 (Renovation)', type: TransactionType.EXPENSE, createdAt: new Date().toISOString() },
            { id: 'exp-7', name: '設備 (Equipment)', type: TransactionType.EXPENSE, createdAt: new Date().toISOString() },
            { id: 'exp-8', name: '其他 (Other)', type: TransactionType.EXPENSE, createdAt: new Date().toISOString() },
          ];
          await syncRemoteCategories(defaultCats);
          setCategories(defaultCats);
        } else {
          setCategories(cloudCategories);
        }
      }

      setSyncStatus('cloud');
      setLastSync(new Date());
    } catch (e: any) {
      console.error('loadData exception:', e);
      let errorMsg = e.message || 'Unknown error';
      if (errorMsg.includes('Failed to fetch')) {
        errorMsg = 'Could not connect to Supabase. Please check your URL and internet connection.';
      }
      setLastError(errorMsg);
      setSyncStatus('error');
    }
  };

  const pushAllData = async () => {
    if (!cloudConfig) return;
    setIsSyncing(true);
    try {
      setSyncStatus('syncing');
      setLastError(null);
      const resAcc = await syncRemoteAccounts(accounts);
      const resTr = await syncRemoteTransactions(transactions);
      const resNotes = await syncRemoteNotes(notes);
      const resCats = await syncRemoteCategories(categories);
      const resCust = await syncRemoteCustomers(customers);
      if (resTr.success && resNotes.success && resCats.success && resCust.success && resAcc.success) {
        setSyncStatus('cloud');
        setLastSync(new Date());
        setShowSuccessOverlay(true);
        setTimeout(() => setShowSuccessOverlay(false), 2000);
      } else {
        setLastError(
          resTr.success
            ? (resNotes.error || resCats.error || resCust.error || resAcc.error || 'Push failed')
            : formatTransactionSyncError(resTr, 'Push failed')
        );
        setSyncStatus('error');
      }
    } catch (e: any) {
      console.error('pushAllData exception:', e);
      let errorMsg = e.message || 'Unknown error';
      if (errorMsg.includes('Failed to fetch')) {
        errorMsg = 'Could not connect to Supabase. Please check your URL and internet connection.';
      }
      setLastError(errorMsg);
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  const exportToExcel = () => {
    if (transactions.length === 0) return;
    const t = translations[language];
    const headers = [
      t.date, 
      'receiptNumber', 
      t.type, 
      'categoryId', 
      t.amount, 
      t.description, 
      t.contributor,
      language === 'zh' ? '出賬賬戶' : 'From Account',
      language === 'zh' ? '入賬賬戶' : 'To Account'
    ];
    const rows = transactions.map(tr => [
      tr.date,
      tr.receiptNumber || '',
      tr.type,
      tr.categoryId,
      tr.amount,
      `"${(tr.description || '').replace(/"/g, '""')}"`,
      tr.contributedBy,
      accounts.find(a => a.id === tr.fromAccountId)?.name || '',
      accounts.find(a => a.id === tr.toAccountId)?.name || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Gardiner_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = () => {
    if (transactions.length === 0) {
      alert(language === 'zh' ? '沒有可備份的數據' : 'No data to backup');
      return;
    }
    
    const dataToExport = {
      transactions,
      notes,
      categories,
      auditLogs,
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Gardiner_Full_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearTransactions = async () => {
    setIsSyncing(true);
    try {
      if (cloudConfig) {
        await clearAllRemoteData();
      }
      setTransactions([]);
      setAuditLogs([]);
      setNotes([]);
      setCategories([]);
      setShowSuccessOverlay(true);
      setTimeout(() => setShowSuccessOverlay(false), 2000);
      setActiveTab('overview');
    } catch (e) {
      console.error('Clear error:', e);
      alert(language === 'zh' ? '清除失敗' : 'Clear failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const saveTransactions = async (newTransactions: Transaction[]) => {
    setIsSyncing(true);
    try {
      if (cloudConfig) {
        setSyncStatus('syncing');
        setLastError(null);
        const result = await syncRemoteTransactions(newTransactions);
        if (result.success) {
          setSyncStatus('cloud');
          setLastSync(new Date());
          setTransactions(newTransactions);
        } else {
          setLastError(formatTransactionSyncError(result, 'Auto-sync failed'));
          setSyncStatus('error');
          alert(language === 'zh' ? '同步失敗，請檢查網絡' : 'Sync failed, please check network');
        }
      } else {
        setTransactions(newTransactions);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateCloudConfig = (config: CloudConfig) => {
    setCloudConfig(config);
    localStorage.setItem('gardiner_cloud_config', JSON.stringify(config));
    initSupabase(config);
    loadData(true, config);
  };

  const addTransaction = async (transaction: Transaction | Transaction[], transactionNoteText?: string) => {
    setIsSyncing(true);
    const now = new Date().toISOString();
    const newItems = Array.isArray(transaction) 
      ? transaction.map(tr => ({ ...tr, updatedAt: now }))
      : [{ ...transaction, updatedAt: now }];
    const transactionNoteContent = (transactionNoteText || '').trim();
    const manualTransactionNotes: Note[] = transactionNoteContent
      ? [{
          id: crypto.randomUUID(),
          content: [
            `[${now}] Transaction Notes`,
            `Transaction IDs: ${newItems.map(item => item.id).join(', ')}`,
            '',
            transactionNoteContent
          ].join('\n'),
          createdBy: 'system',
          createdAt: now,
          updatedAt: now
        }]
      : [];
    const generatedNotes = manualTransactionNotes;
    
    try {
      if (cloudConfig) {
        setSyncStatus('syncing');
        // Only sync the new items
        const result = await syncRemoteTransactions(newItems);
        if (result.success) {
          if (generatedNotes.length > 0) {
            const updatedNotes = [...generatedNotes, ...notes];
            const notesResult = await syncRemoteNotes(updatedNotes);
            if (!notesResult.success) {
              setLastError(notesResult.error || 'Transactions saved, but note sync failed');
              setSyncStatus('error');
              await loadData(false);
              alert(language === 'zh' ? '交易已保存，但備註同步失敗。' : 'Transactions were saved, but note sync failed.');
              return;
            }
            setNotes(updatedNotes);
          }

          setSyncStatus('cloud');
          setLastSync(new Date());
          logAuditEvent(AuditAction.CREATE, 'transactions', newItems[0].id, undefined, undefined, newItems);
          
          setLastAction({ type: 'add', data: newItems });
          setShowUndoToast(true);
          setTimeout(() => setShowUndoToast(false), 5000);

          setActiveTab('transactions');

          // Refresh from DB to ensure local state is perfectly in sync
          await loadData(false);
        } else {
          setLastError(formatTransactionSyncError(result, 'Sync failed'));
          setSyncStatus('error');
          alert(language === 'zh' ? '同步失敗，請檢查網絡' : 'Sync failed, please check network');
        }
      } else {
        setTransactions([...newItems, ...transactions]);
        if (generatedNotes.length > 0) {
          setNotes([...generatedNotes, ...notes]);
        }
        setLastAction({ type: 'add', data: newItems });
        setShowUndoToast(true);
        setTimeout(() => setShowUndoToast(false), 5000);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUndo = async () => {
    if (!lastAction) return;
    setIsSyncing(true);
    setShowUndoToast(false);

    try {
      let updatedTransactions: Transaction[];
      if (lastAction.type === 'add') {
        const idsToRemove = new Set<string>(lastAction.data.map(t => t.id));
        updatedTransactions = transactions.filter(t => !idsToRemove.has(t.id));
        
        if (cloudConfig) {
          for (const id of Array.from(idsToRemove)) {
            await deleteRemoteTransaction(id);
          }
        }
      } else {
        // Undo delete = re-add
        updatedTransactions = [...lastAction.data, ...transactions];
      }

      if (cloudConfig) {
        const result = await syncRemoteTransactions(updatedTransactions);
        if (result.success) {
          setTransactions(updatedTransactions);
          setSyncStatus('cloud');
          await loadData(false);
        }
      } else {
        setTransactions(updatedTransactions);
      }
      setLastAction(null);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateTransaction = async (updatedTr: Transaction) => {
    setIsSyncing(true);
    const now = new Date().toISOString();
    const existing = transactions.find(tr => tr.id === updatedTr.id);
    const updatedItem = { ...updatedTr, updatedAt: now };
    const generatedNotes = shouldCreateTransactionNote(existing, updatedItem)
      ? buildTransactionNotes([updatedItem])
      : [];
    
    try {
      if (cloudConfig) {
        setSyncStatus('syncing');
        const result = await syncRemoteTransactions([updatedItem]);
        if (result.success) {
          if (generatedNotes.length > 0) {
            const updatedNotes = [...generatedNotes, ...notes];
            const notesResult = await syncRemoteNotes(updatedNotes);
            if (!notesResult.success) {
              setLastError(notesResult.error || 'Transaction updated, but note sync failed');
              setSyncStatus('error');
              await loadData(false);
              alert(language === 'zh' ? '交易已更新，但備註同步失敗。' : 'Transaction updated, but note sync failed.');
              return;
            }
            setNotes(updatedNotes);
          }

          setSyncStatus('cloud');
          setLastSync(new Date());
          logAuditEvent(AuditAction.UPDATE, 'transactions', updatedTr.id, undefined, undefined, updatedTr);
          await loadData(false);
        } else {
          setLastError(formatTransactionSyncError(result, 'Update failed'));
          setSyncStatus('error');
          alert(language === 'zh' ? '更新失敗' : 'Update failed');
        }
      } else {
        setTransactions(transactions.map(tr => tr.id === updatedTr.id ? updatedItem : tr));
        if (generatedNotes.length > 0) {
          setNotes([...generatedNotes, ...notes]);
        }
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const bulkUpdateTransactions = async (updatedItems: Transaction[]) => {
    setIsSyncing(true);
    const now = new Date().toISOString();
    const updatedWithTime = updatedItems.map(item => ({ ...item, updatedAt: now }));
    
    try {
      if (cloudConfig) {
        setSyncStatus('syncing');
        const result = await syncRemoteTransactions(updatedWithTime);
        if (result.success) {
          setSyncStatus('cloud');
          setLastSync(new Date());
          logAuditEvent(AuditAction.UPDATE, 'transactions', updatedItems[0].id, undefined, undefined, updatedItems);
          await loadData(false);
        } else {
          setLastError(formatTransactionSyncError(result, 'Bulk update failed'));
          setSyncStatus('error');
          alert(language === 'zh' ? '批量更新失敗' : 'Bulk update failed');
        }
      } else {
        setTransactions(transactions.map(tr => {
          const found = updatedWithTime.find(i => i.id === tr.id);
          return found || tr;
        }));
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    setIsSyncing(true);
    const trToDelete = transactions.find(t => t.id === id);
    if (!trToDelete) {
      setIsSyncing(false);
      return;
    }

    // Find all transactions with the same receiptNumber if it's a split record
    const isSplit = trToDelete.description.includes('[SPLIT]');
    const itemsToDelete = isSplit 
      ? transactions.filter(t => t.receiptNumber === trToDelete.receiptNumber && t.date === trToDelete.date)
      : [trToDelete];

    const idsToDelete = new Set(itemsToDelete.map(t => t.id));
    const updated = transactions.filter(tr => !idsToDelete.has(tr.id));
    
    try {
      if (cloudConfig) {
        let allSuccess = true;
        for (const item of itemsToDelete) {
          const success = await deleteRemoteTransaction(item.id);
          if (!success) allSuccess = false;
        }

        if (allSuccess) {
          setTransactions(updated);
          logAuditEvent(AuditAction.DELETE, 'transactions', itemsToDelete[0].id, undefined, itemsToDelete, undefined);
          
          setLastAction({ type: 'delete', data: itemsToDelete });
          setShowUndoToast(true);
          setTimeout(() => setShowUndoToast(false), 5000);

          await loadData(false);
        } else {
          alert(language === 'zh' ? '刪除失敗' : 'Delete failed');
        }
      } else {
        setTransactions(updated);
        setLastAction({ type: 'delete', data: itemsToDelete });
        setShowUndoToast(true);
        setTimeout(() => setShowUndoToast(false), 5000);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const addNote = async (note: Omit<Note, 'id' | 'createdAt'>) => {
    setIsSyncing(true);
    const newNote: Note = {
      ...note,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    const updated = [newNote, ...notes];
    
    try {
      if (cloudConfig) {
        const result = await syncRemoteNotes(updated);
        if (result.success) {
          setNotes(updated);
          await loadData(false);
        }
      } else {
        setNotes(updated);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const updateNote = async (updatedNote: Note) => {
    setIsSyncing(true);
    const updated = notes.map(n => n.id === updatedNote.id ? updatedNote : n);
    try {
      if (cloudConfig) {
        const result = await syncRemoteNotes(updated);
        if (result.success) {
          setNotes(updated);
          await loadData(false);
        }
      } else {
        setNotes(updated);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteNote = async (id: string) => {
    setIsSyncing(true);
    const updated = notes.filter(n => n.id !== id);
    try {
      if (cloudConfig) {
        const success = await deleteRemoteNote(id);
        if (success) {
          setNotes(updated);
          await loadData(false);
        }
      } else {
        setNotes(updated);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateAccount = async (account: Account) => {
    setIsSyncing(true);
    const updated = accounts.some(a => a.id === account.id)
      ? accounts.map(a => a.id === account.id ? account : a)
      : [account, ...accounts];
    try {
      if (cloudConfig) {
        setSyncStatus('syncing');
        const result = await syncRemoteAccounts(updated);
        if (result.success) {
          setAccounts(updated);
          setSyncStatus('cloud');
          await loadData(false);
        } else {
          setLastError(result.error || 'Account sync failed');
          setSyncStatus('error');
        }
      } else {
        setAccounts(updated);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    setIsSyncing(true);
    const updated = accounts.filter(a => a.id !== id);
    try {
      if (cloudConfig) {
        const success = await deleteRemoteAccount(id);
        if (success) {
          setAccounts(updated);
          await loadData(false);
        }
      } else {
        setAccounts(updated);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateCustomer = async (customer: Customer) => {
    setIsSyncing(true);
    const updated = customers.some(c => c.id === customer.id)
      ? customers.map(c => c.id === customer.id ? customer : c)
      : [customer, ...customers];
    try {
      if (cloudConfig) {
        setSyncStatus('syncing');
        const result = await syncRemoteCustomers(updated);
        if (result.success) {
          setCustomers(updated);
          setSyncStatus('cloud');
          await loadData(false);
        } else {
          setLastError(result.error || 'Customer sync failed');
          setSyncStatus('error');
        }
      } else {
        setCustomers(updated);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    setIsSyncing(true);
    const updated = customers.filter(c => c.id !== id);
    try {
      if (cloudConfig) {
        const success = await deleteRemoteCustomer(id);
        if (success) {
          setCustomers(updated);
          await loadData(false);
        }
      } else {
        setCustomers(updated);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const saveCategories = async (updatedCats: CategoryItem[]) => {
    setIsSyncing(true);
    try {
      if (cloudConfig) {
        const result = await syncRemoteCategories(updatedCats);
        if (result.success) {
          setCategories(updatedCats);
          await loadData(false);
        }
      } else {
        setCategories(updatedCats);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteCategory = async (id: string) => {
    setIsSyncing(true);
    const updated = categories.filter(c => c.id !== id);
    try {
      if (cloudConfig) {
        const success = await deleteRemoteCategory(id);
        if (success) {
          setCategories(updated);
          await loadData(false);
        }
      } else {
        setCategories(updated);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const dueRemindersCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return notes.filter(n => n.reminderDate && n.reminderDate <= today).length;
  }, [notes]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (mainRef.current && mainRef.current.scrollTop === 0) {
      touchStartRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current !== null && mainRef.current && mainRef.current.scrollTop === 0) {
      const currentY = e.touches[0].clientY;
      const distance = currentY - touchStartRef.current;
      if (distance > 0) {
        setPullDistance(Math.min(distance, 100));
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 80) {
      setIsRefreshing(true);
      loadData(true).finally(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      });
    } else {
      setPullDistance(0);
    }
    touchStartRef.current = null;
  };

  const summary: FinancialSummary = useMemo(() => {
    // Helper to get startup cost for a partner - strict matching on contributedBy
    const getStartupCost = (ownerName: string) => {
      // Only match transactions where contributedBy exactly equals ownerName
      const investments = transactions.filter(tr => {
        const isStartupInvestment = (tr.type === TransactionType.OWNER_INVESTMENT || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment')) && tr.isInitialInvestment === true;
        const isOwnersTransaction = tr.contributedBy === ownerName;
        return isStartupInvestment && isOwnersTransaction;
      });
      const withdrawals = transactions.filter(tr => {
        const isStartupWithdrawal = (tr.type === TransactionType.OWNER_WITHDRAWAL || tr.type === TransactionType.WITHDRAWAL || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_withdrawal')) && tr.isInitialInvestment === true;
        const isOwnersTransaction = tr.contributedBy === ownerName;
        return isStartupWithdrawal && isOwnersTransaction;
      });
      const investmentTotal = investments.reduce((sum, tr) => sum + tr.amount, 0);
      const withdrawalTotal = withdrawals.reduce((sum, tr) => sum + tr.amount, 0);
      const result = investmentTotal - withdrawalTotal;
      return result;
    };

    // Startup cost: only sum owner_investment - owner_withdrawal where isInitialInvestment is true, for each partner
    const startupInvestments = transactions.filter(tr => (tr.type === TransactionType.OWNER_INVESTMENT || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment')) && tr.isInitialInvestment === true);
    const startupWithdrawals = transactions.filter(tr => (tr.type === TransactionType.OWNER_WITHDRAWAL || tr.type === TransactionType.WITHDRAWAL || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_withdrawal')) && tr.isInitialInvestment === true);
    const totalStartup = startupInvestments.reduce((sum, tr) => sum + tr.amount, 0) - startupWithdrawals.reduce((sum, tr) => sum + tr.amount, 0);

    // All money injected by owners into the business
    const addRmb = transactions
      .filter(tr => (tr.type === TransactionType.OWNER_INVESTMENT) || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment'))
      .reduce((sum, tr) => sum + tr.amount, 0);

    // All money taken out by owners from the business
    const cashOut = transactions
      .filter(tr => (tr.type === TransactionType.OWNER_WITHDRAWAL) || (tr.type === TransactionType.WITHDRAWAL) || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_withdrawal'))
      .reduce((sum, tr) => sum + tr.amount, 0);

    const revenue = transactions.filter(tr => tr.type === TransactionType.REVENUE).reduce((sum, tr) => sum + tr.amount, 0);
    const expenses = transactions.filter(tr => tr.type === TransactionType.EXPENSE).reduce((sum, tr) => sum + tr.amount, 0);

    // Total withdrawals (same as cashOut but used in balance calculation)
    const withdrawals = cashOut;

    // Actual cash balance: (Total Money In) - (Total Money Out)
    const currentBalance = (addRmb + revenue) - (expenses + withdrawals);
    const netProfit = revenue - expenses;

    // Bank balance and personal balance are often used interchangeably in this app's context
    // but here we align bankBalance with the actual cash on hand
    const bankBalance = currentBalance;
    const personalBalance = bankBalance;

    const getPartnerStats = (ownerName: string) => {
      // Find account ID for this owner if it exists, otherwise use the name
      const ownerAccount = accounts.find(a => a.name.includes(ownerName));
      const ownerId = ownerAccount ? ownerAccount.id : ownerName;

      const ownerTransactions = transactions.filter(tr => tr.contributedBy === ownerId || tr.contributedBy === ownerName);
      
      const deposits = ownerTransactions
        .filter(tr => tr.type === TransactionType.OWNER_INVESTMENT || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment'))
        .reduce((sum, tr) => sum + tr.amount, 0);
      
      const revenueHandled = ownerTransactions
        .filter(tr => tr.type === TransactionType.REVENUE)
        .reduce((sum, tr) => sum + tr.amount, 0);
      
      const expensesHandled = ownerTransactions
        .filter(tr => tr.type === TransactionType.EXPENSE)
        .reduce((sum, tr) => sum + tr.amount, 0);
      
      const ownerWithdrawals = ownerTransactions
        .filter(tr => tr.type === TransactionType.WITHDRAWAL || tr.type === TransactionType.OWNER_WITHDRAWAL || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_withdrawal'))
        .reduce((sum, tr) => sum + tr.amount, 0);
      
      // Equity calculation per partner: investment - withdrawals + own net profit.
      const individualNetProfit = revenueHandled - expensesHandled;
      const currentEquity = deposits - ownerWithdrawals + individualNetProfit;
      
      return { 
        invested: deposits, 
        revenueHandled: revenueHandled, 
        expensesHandled: expensesHandled,
        withdrawals: ownerWithdrawals,
        settlement: currentEquity
      };
    };

    return {
      totalRevenue: revenue, 
      totalExpenses: expenses, 
      startupCosts: totalStartup,
      currentBalance, 
      bankBalance,
      personalBalance,
      netProfit,
      // ROI is calculated against startup costs
      roiPercentage: totalStartup > 0 ? (revenue / totalStartup) * 100 : 0,
      ownerA: { ...getPartnerStats('User 1'), startupCosts: getStartupCost('User 1') },
      ownerB: { ...getPartnerStats('User 2'), startupCosts: getStartupCost('User 2') }
    };
  }, [transactions, accounts]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(language === 'zh' ? 'zh-HK' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ErrorBoundary>
      <div id="app-root-check" style={{ display: 'none' }}>App Mounted</div>
      {!isLoggedIn ? (
        <LoginPage onLogin={handleLogin} language={language} />
      ) : (
        <div className={`min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-black font-sans selection:bg-blue-900/30 transition-colors duration-500`}>
            {showSuccessOverlay && (
        <div className="fixed top-6 right-6 z-[200] bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl animate-bounce font-black text-xs uppercase tracking-widest flex items-center gap-2">
          <i className="fas fa-check-circle"></i> {t.syncReady}
        </div>
      )}

      {isSyncing && (
        <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] shadow-2xl flex flex-col items-center max-w-xs w-full text-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h3 className="text-lg font-black dark:text-white mb-2">{t.syncing}</h3>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-relaxed mb-6">
              {language === 'zh' ? '正在同步數據到雲端，請稍候...' : 'Syncing data to cloud, please wait...'}
            </p>
            <button 
              onClick={() => setIsSyncing(false)}
              className="px-6 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      <AnimatePresence>
        {showUndoToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[250] bg-slate-900 text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-6 border border-white/10 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${lastAction?.type === 'add' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                <i className={`fas ${lastAction?.type === 'add' ? 'fa-check' : 'fa-trash'}`}></i>
              </div>
              <span className="text-xs font-black uppercase tracking-widest">
                {lastAction?.type === 'add' ? t.savedSuccessfully : (language === 'zh' ? '已刪除記錄' : 'Record deleted')}
              </span>
            </div>
            <button 
              onClick={handleUndo}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
            >
              <i className="fas fa-undo"></i>
              {language === 'zh' ? '撤銷' : 'Undo'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Branch Selector Modal */}
      <AnimatePresence>
        {showBranchSelector && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setShowBranchSelector(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 dark:border-white/10"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 border-b border-slate-50 dark:border-white/5">
                <h3 className="text-lg font-black dark:text-white uppercase tracking-tight">Select Store Branch</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Choose the location you want to manage</p>
              </div>
              <div className="p-4 space-y-2">
                {["Zhuhai"].map(branch => (
                  <button 
                    key={branch}
                    onClick={() => {
                      setCurrentBranch(branch);
                      setShowBranchSelector(false);
                    }}
                    className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl transition-all ${currentBranch === branch ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300'}`}
                  >
                    <span className="text-xs font-black uppercase tracking-widest">{branch}</span>
                    {currentBranch === branch && <i className="fas fa-check-circle"></i>}
                  </button>
                ))}
              </div>
              <div className="p-4 bg-slate-50 dark:bg-white/5">
                <button 
                  onClick={() => setShowBranchSelector(false)}
                  className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-white/5 flex-col p-6 sticky top-0 h-screen z-30">
        <div className="flex items-center space-x-3 mb-10 px-2">
          <div className="relative">
            <div className="w-24 h-12 bg-white rounded-sm flex items-center justify-center shadow-lg shadow-black/5 overflow-hidden border border-slate-100 dark:bg-white">
              <div className="flex flex-col items-center justify-center leading-none">
                <span className="text-[12px] font-serif font-black text-black tracking-tighter">GARDINER</span>
                <span className="text-[10px] font-black text-black mt-1">尚洗</span>
              </div>
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-4 border-white dark:border-slate-900 rounded-full ${syncStatus === 'cloud' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-serif font-black tracking-tight dark:text-white uppercase leading-none">{currentBranch}</h1>
            <button 
              onClick={() => setShowBranchSelector(true)}
              className="text-[10px] font-bold text-slate-400 dark:text-slate-500 hover:text-blue-500 transition-colors text-left mt-1 uppercase tracking-widest"
            >
              Change Branch
            </button>
          </div>
        </div>
        
        <nav className="flex-1 space-y-1.5">
          <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'overview' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-chart-pie w-5"></i>
            <span>{t.overview}</span>
          </button>
          <button onClick={() => setActiveTab('balance')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'balance' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-wallet w-5"></i>
            <span>{t.accountBalance}</span>
          </button>
          <button onClick={() => setActiveTab('transactions')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'transactions' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-list-ul w-5"></i>
            <span>{t.transactions}</span>
          </button>
          <button onClick={() => setActiveTab('startup')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'startup' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-rocket w-5"></i>
            <span>{t.investmentOverview}</span>
          </button>
          <button onClick={() => setActiveTab('notes')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'notes' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-sticky-note w-5"></i>
            <span>{t.notes}</span>
          </button>
          <button onClick={() => setActiveTab('customers')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'customers' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-users w-5"></i>
            <span>{language === 'zh' ? '客戶追蹤' : 'Customers'}</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'settings' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-cog w-5"></i>
            <span>{t.settings}</span>
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-100 dark:border-white/5 space-y-4">
          <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">
                <div className={`w-1.5 h-1.5 rounded-full mr-2 ${syncStatus === 'syncing' ? 'bg-blue-400 animate-pulse' : syncStatus === 'cloud' ? 'bg-emerald-400' : syncStatus === 'error' ? 'bg-rose-400' : 'bg-slate-300'}`}></div>
                {syncStatus === 'syncing' ? t.syncing : syncStatus === 'cloud' ? t.cloudConnected : syncStatus === 'error' ? (language === 'zh' ? '連接不穩定 (唯讀)' : 'Unstable (Read-Only)') : t.localOnly}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold flex flex-col gap-1">
              <span>{lastSync ? `${t.lastSynced}: ${formatTime(lastSync)}` : t.neverSynced}</span>
              {serverTime && (
                <span className="text-[9px] text-emerald-500 font-black uppercase tracking-tighter">
                  {language === 'zh' ? `已登錄珠海當地時間 ${serverTime}` : `Logged in to Zhuhai local time ${serverTime}`}
                </span>
              )}
              {syncStatus === 'error' && (
                <span className="text-[8px] text-rose-500 animate-pulse uppercase tracking-tighter">
                  {language === 'zh' ? '正在嘗試重新連接...' : 'Attempting to reconnect...'}
                </span>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button 
                onClick={pushAllData} 
                disabled={syncStatus === 'syncing' || !cloudConfig || isReadOnly} 
                className={`w-full h-9 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-blue-600 hover:text-white border border-slate-200 dark:border-white/10 rounded-xl flex items-center justify-center transition-all group shadow-sm active:scale-95 relative ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <i className="fas fa-sync-alt text-xs mr-2"></i>
                <span className="text-[10px] font-black uppercase tracking-widest">{t.syncNow}</span>
                {syncStatus === 'cloud' && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900"></div>
                )}
              </button>
              <button 
                onClick={handleLogout}
                className="w-12 h-9 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 rounded-xl flex items-center justify-center hover:bg-rose-600 hover:text-white transition-all shadow-sm active:scale-95"
                title={language === 'zh' ? '登出' : 'Logout'}
              >
                <i className="fas fa-sign-out-alt text-xs"></i>
              </button>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <div className={`w-1 h-1 rounded-full ${syncStatus === 'cloud' ? 'bg-emerald-500' : syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'}`}></div>
              <span className="text-[7px] font-black uppercase tracking-widest text-slate-400">
                {syncStatus === 'cloud' ? `${transactions.length} ITEMS SYNCED` : syncStatus === 'syncing' ? 'SYNCING...' : isReadOnly ? 'READ-ONLY MODE' : 'LOCAL MODE'}
              </span>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('input')} 
            disabled={isReadOnly}
            className={`w-full flex items-center space-x-3 px-4 py-4 rounded-2xl transition-all shadow-lg active:scale-95 ${isReadOnly ? 'opacity-50 grayscale cursor-not-allowed' : ''} ${activeTab === 'input' ? 'bg-blue-600 text-white shadow-blue-600/20' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-slate-900/20 dark:shadow-white/10'}`}
          >
            <i className="fas fa-plus-circle text-lg"></i>
            <span className="text-xs uppercase tracking-widest font-black">{t.addEntry}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header - iOS Style */}
      <header className="md:hidden sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 dark:bg-slate-900/80 dark:border-white/5">
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {activeTab === 'overview' ? (
              <div className="w-8 h-8 bg-white rounded-sm flex items-center justify-center shadow-sm border border-slate-100">
                <div className="flex flex-col items-center justify-center leading-none scale-[0.5]">
                  <span className="text-[8px] font-serif font-black text-black tracking-tighter">GARDINER</span>
                  <span className="text-[6px] font-black text-black mt-0.5">尚洗</span>
                </div>
              </div>
            ) : (
              <button onClick={() => setActiveTab('overview')} className="text-slate-500 dark:text-slate-400">
                <i className="fas fa-home text-lg"></i>
              </button>
            )}
            <div className="flex flex-col">
              <h1 className="text-lg font-serif font-black bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-transparent dark:from-white dark:to-slate-400 uppercase leading-none">
                {activeTab === 'overview' ? currentBranch : (
                  activeTab === 'customers' ? (language === 'zh' ? '客戶追蹤' : 'Customers') : 
                  (t[activeTab as keyof typeof t] || activeTab)
                )}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={pushAllData}
              disabled={isReadOnly || syncStatus === 'syncing'}
              className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all ${isReadOnly ? 'opacity-50 grayscale cursor-not-allowed' : ''} ${syncStatus === 'syncing' ? 'bg-blue-100 text-blue-600 animate-spin' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}
            >
              <i className="fas fa-sync-alt text-sm"></i>
            </button>
            <button 
              onClick={handleLogout}
              className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 flex items-center justify-center active:scale-90 transition-all"
            >
              <i className="fas fa-sign-out-alt text-sm"></i>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Button */}
      <div className="md:hidden fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-16 h-16 bg-white text-blue-600 rounded-full shadow-2xl shadow-slate-900/20 flex items-center justify-center active:scale-90 transition-all pointer-events-auto border border-slate-100"
        >
          <i className={`fas fa-plus text-2xl transition-transform ${isMenuOpen ? 'rotate-45' : ''}`}></i>
        </button>
      </div>

      {/* Mobile Popup Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="md:hidden fixed inset-0 z-[45] bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-[50] bg-white dark:bg-slate-900 rounded-t-[32px] p-6 pb-10 shadow-2xl"
            >
              <div className="grid grid-cols-3 gap-4">
                {[
                  { id: 'overview', icon: 'fa-chart-pie', label: t.overview },
                  { id: 'balance', icon: 'fa-wallet', label: t.accountBalance },
                  { id: 'transactions', icon: 'fa-list-ul', label: t.transactions },
                  { id: 'startup', icon: 'fa-rocket', label: t.investmentOverview },
                  { id: 'notes', icon: 'fa-sticky-note', label: t.notes },
                  { id: 'accounts', icon: 'fa-university', label: language === 'zh' ? '賬戶' : 'Accounts' },
                  { id: 'customers', icon: 'fa-users', label: language === 'zh' ? '客戶' : 'Customers' },
                  { id: 'settings', icon: 'fa-cog', label: t.settings },
                ].map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => { setActiveTab(item.id as any); setIsMenuOpen(false); }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${activeTab === item.id ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-500' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${activeTab === item.id ? 'bg-blue-600 text-white' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'}`}>
                      <i className={`fas ${item.icon} text-sm`}></i>
                    </div>
                    <span className={`text-[9px] font-bold text-center ${activeTab === item.id ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}`}>{item.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

        <AnimatePresence>
          {showReconnectPrompt && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1001] bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-emerald-500/50 backdrop-blur-md"
            >
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-widest">{language === 'zh' ? '連接已恢復' : 'Connection Restored'}</span>
                <span className="text-[10px] opacity-90">{language === 'zh' ? '是否刷新以同步最新數據？' : 'Refresh to sync latest data?'}</span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.location.reload()}
                  className="bg-white text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  {t.refresh}
                </button>
                <button 
                  onClick={() => setShowReconnectPrompt(false)}
                  className="bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  {language === 'zh' ? '稍後' : 'Later'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(!isOnline || (syncStatus === 'error' && lastError)) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-6 text-center"
            >
            <div className="max-w-xs space-y-6">
              <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className={`fas ${!isOnline ? 'fa-wifi-slash' : 'fa-database'} text-3xl text-rose-500 animate-pulse`}></i>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                {!isOnline ? (language === 'zh' ? '網絡已斷開' : 'Offline') : (language === 'zh' ? '數據庫連接失敗' : 'Database Error')}
              </h2>
              <p className="text-slate-400 font-bold text-sm leading-relaxed">
                {!isOnline ? t.offlineMessage : (language === 'zh' ? '無法連接到雲端數據庫。您可以繼續在本地使用，但數據將不會同步。' : 'Could not connect to the cloud database. You can continue using the app locally, but data will not be synced.')}
              </p>
              {lastError && (
                <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-[10px] font-mono text-rose-400 break-all">{lastError}</p>
                </div>
              )}
              <div className="space-y-3">
                <button 
                  onClick={() => window.location.reload()}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
                >
                  <i className="fas fa-sync-alt mr-2"></i>
                  {t.refresh}
                </button>
                {syncStatus === 'error' && (
                  <button 
                    onClick={() => {
                      setSyncStatus('local');
                      setLastError(null);
                    }}
                    className="w-full bg-white/5 text-slate-300 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    {language === 'zh' ? '本地模式繼續' : 'Continue Locally'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content with Transitions */}
      <main 
        ref={mainRef} 
        className="flex-1 overflow-y-auto pb-32 md:pb-0 relative z-10"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull to refresh indicator */}
        <div 
          className="absolute top-0 left-0 right-0 flex items-center justify-center overflow-hidden transition-all pointer-events-none"
          style={{ height: pullDistance }}
        >
          <div className={`flex items-center gap-2 ${pullDistance > 80 ? 'text-blue-600' : 'text-slate-300'}`}>
            <i className={`fas fa-sync-alt ${isRefreshing ? 'animate-spin' : ''} ${pullDistance > 80 ? 'rotate-180' : ''} transition-transform`}></i>
            <span className="text-[10px] font-black uppercase tracking-widest">{isRefreshing ? t.syncing : t.pullToRefresh}</span>
          </div>
        </div>
        <AnimatePresence mode="wait">
          {syncStatus === 'syncing' ? (
            <LoadingScreen />
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="p-4 md:p-10"
            >
              {activeTab === 'overview' && (
                <Dashboard 
                  summary={summary} 
                  transactions={transactions} 
                  categories={categories}
                  language={language} 
                  onNavigateStartup={() => setActiveTab('startup')} 
                  onNavigateForecast={() => setActiveTab('balance')}
                  onNavigateNotes={() => setActiveTab('notes')}
                  dueRemindersCount={dueRemindersCount}
                />
              )}
              {activeTab === 'startup' && <StartupList transactions={transactions} summary={summary} onDelete={deleteTransaction} language={language} totalInvested={summary.startupCosts} isSyncing={isSyncing} isReadOnly={isReadOnly} />}
              {activeTab === 'balance' && (
                <CashForecast 
                  summary={summary} 
                  transactions={transactions} 
                  accounts={accounts}
                  language={language} 
                  onAdd={addTransaction}
                  onUpdate={updateTransaction}
                  onDelete={deleteTransaction}
                  isSyncing={isSyncing}
                  isReadOnly={isReadOnly}
                  totalInvested={summary.startupCosts}
                />
              )}
              {activeTab === 'transactions' && (
                <TransactionList 
                  transactions={transactions} 
                  accounts={accounts}
                  categories={categories}
                  onDelete={deleteTransaction} 
                  onUpdate={updateTransaction} 
                  onBulkUpdate={bulkUpdateTransactions} 
                  onExportExcel={exportToExcel} 
                  onExportJSON={exportToJSON} 
                  language={language} 
                  isSyncing={isSyncing} 
                  isReadOnly={isReadOnly} 
                />
              )}
              {activeTab === 'audit' && <AuditLogList logs={auditLogs} language={language} />}
              {activeTab === 'notes' && <NotesPage notes={notes} onAdd={addNote} onUpdate={updateNote} onDelete={deleteNote} language={language} isReadOnly={isReadOnly} />}
              {activeTab === 'accounts' && (
                <AccountsPage 
                  accounts={accounts}
                  onUpdateAccount={handleUpdateAccount}
                  onDeleteAccount={handleDeleteAccount}
                  language={language}
                  isReadOnly={isReadOnly}
                />
              )}
              {activeTab === 'customers' && (
                <CustomerPage 
                  customers={customers}
                  transactions={transactions}
                  categories={categories}
                  onUpdateCustomer={handleUpdateCustomer}
                  onDeleteCustomer={handleDeleteCustomer}
                  language={language}
                  isReadOnly={isReadOnly}
                />
              )}
              {activeTab === 'input' && (
                <TransactionForm 
                  onAdd={addTransaction} 
                  language={language} 
                  transactions={transactions}
                  categories={categories}
                  customers={customers}
                  accounts={accounts}
                  isSyncing={isSyncing}
                  isReadOnly={isReadOnly}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsPage 
                  language={language} 
                  setLanguage={setLanguage} 
                  cloudConfig={cloudConfig} 
                  onSaveConfig={handleUpdateCloudConfig}
                  syncStatus={syncStatus}
                  lastError={lastError}
                  theme={theme}
                  setTheme={setTheme}
                  onSync={pushAllData}
                  onNavigateToAudit={() => setActiveTab('audit')}
                  onNavigateToOverview={() => setActiveTab('overview')}
                  onClearTransactions={clearTransactions}
                  categories={categories}
                  onSaveCategories={saveCategories}
                  onDeleteCategory={deleteCategory}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>


      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 dark:border-white/10">
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-4 uppercase tracking-tight">Logout</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm font-bold">Are you sure you want to logout?</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase tracking-widest text-xs"
              >
                Cancel
              </button>
              <button 
                onClick={confirmLogout}
                className="flex-1 py-4 rounded-2xl bg-rose-600 text-white font-black uppercase tracking-widest text-xs"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
          </div>
        )}
    </ErrorBoundary>
  );
};

export default App;
