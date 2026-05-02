 
import React, { useState, useEffect, useMemo, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode } from 'html5-qrcode';
import { Note, Transaction, TransactionType, Category, Owner, FinancialSummary, CloudConfig, AuditAction, AuditLog, CategoryItem, Customer, CustomerGroup, Vehicle, Account, CurrencyExchangeRate, DiscountItem, TransactionItem, CheckoutOrder, MembershipTier, CustomerMembership, PaymentCurrency, PaymentMethod, EmployeePageKey, EmployeePagePermission, EmployeeUser, UserRole, ChargingRateConfig, ChargingSession, Appointment, CheckoutOrderStatus, CheckoutOrderLine } from './types';
import Dashboard from './components/Dashboard';
import TransactionList from './components/TransactionList';
import TransactionForm from './components/TransactionForm';
import StartupList from './components/StartupList';
import CashForecast from './components/CashForecast';
import SettingsPage from './components/SettingsPage';
import AuditLogList from './components/AuditLogList';
import NotesPage from './components/NotesPage';
import CustomerPage from './components/CustomerPage';
import VehiclesPage from './components/VehiclesPage';
import AccountsPage from './components/AccountsPage';
import CheckoutPage from './components/CheckoutPage';
import CompletedCheckoutPage from './components/CompletedCheckoutPage';
import ServiceLifeCyclePage from './components/ServiceLifeCyclePage';
import CategoriesPage from './components/CategoriesPage';
import MembershipsPage from './components/MembershipsPage';
import ChargingPage from './components/ChargingPage';
import AppointmentsPage from './components/AppointmentsPage';
import LoadingScreen from './components/LoadingScreen';
import { initSupabase, syncRemoteTransactions, deleteRemoteTransaction, subscribeToTransactions, logAuditEvent, fetchAuditLogs, fetchTransactions, fetchRemoteNotes, syncRemoteNotes, deleteRemoteNote, subscribeToNotes, clearAllRemoteData, fetchRemoteCategories, syncRemoteCategories, deleteRemoteCategory, subscribeToCategories, fetchRemoteCustomers, syncRemoteCustomers, deleteRemoteCustomer, subscribeToCustomers, fetchRemoteCustomerGroups, syncRemoteCustomerGroups, deleteRemoteCustomerGroup, subscribeToCustomerGroups, fetchRemoteVehicles, syncRemoteVehicles, deleteRemoteVehicle, subscribeToVehicles, updateAdminSession, clearAdminSession, getServerTime, fetchRemoteAccounts, syncRemoteAccounts, deleteRemoteAccount, subscribeToAccounts, fetchRemoteDiscounts, syncRemoteDiscounts, subscribeToDiscounts, fetchRemoteCheckoutOrders, syncRemoteCheckoutOrders, deleteRemoteCheckoutOrder, subscribeToCheckoutOrders, fetchRemoteExchangeRates, fetchRemoteMembershipTiers, syncRemoteMembershipTiers, fetchRemoteCustomerMemberships, syncRemoteCustomerMemberships, subscribeToMembershipTiers, subscribeToCustomerMemberships, fetchEmployeeUsers, fetchEmployeePagePermissions, saveEmployeeUser, saveEmployeePagePermissions, DEFAULT_EMPLOYEE_PAGE_KEYS, fetchRemoteChargingRates, syncRemoteChargingRates, subscribeToChargingRates, fetchRemoteChargingSessions, syncRemoteChargingSessions, subscribeToChargingSessions, fetchRemoteAppointments, syncRemoteAppointments, subscribeToAppointments } from './services/database';
import { translations } from './translations';
import { LoginPage } from './components/LoginPage';
import { convertCurrencyAmount, getApplicableExchangeRate } from './utils/currencyConversion';
import { getOwnerShareRatio } from './utils/transactionSplit';
import { normalizeLicensePlate } from './utils/licensePlate';


const QUICK_CONNECT_CONFIG: CloudConfig = {
  url: process.env.SUPABASE_URL || "",
  key: process.env.SUPABASE_ANON_KEY || ""
};

type AppTab = EmployeePageKey;

const ALL_APP_TABS: AppTab[] = [
  'overview',
  'transactions',
  'input',
  'startup',
  'balance',
  'settings',
  'audit',
  'notes',
  'customers',
  'vehicles',
  'checkout',
  'completed_checkout',
  'service_lifecycle',
  'categories',
  'accounts',
  'memberships',
  'charging',
  'appointments',
];

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

const roundCurrency = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const getForcedCurrencyForPaymentMethod = (method: PaymentMethod): PaymentCurrency | null => {
  if (method === PaymentMethod.FPS) return PaymentCurrency.HKD;
  if (method === PaymentMethod.PAYME) return PaymentCurrency.HKD;
  if (method === PaymentMethod.HKD_CASH) return PaymentCurrency.HKD;
  if (method === PaymentMethod.RMB_CASH) return PaymentCurrency.RMB;
  if (method === PaymentMethod.MOP_CASH) return PaymentCurrency.MOP;
  if (method === PaymentMethod.MPAY) return PaymentCurrency.MOP;
  return null;
};

const buildTransactionItemsFromCheckoutOrder = (order: CheckoutOrder): TransactionItem[] => {
  const serviceLines = (order.lines || []).filter(line => !line.isDiscount && Number(line.lineSubtotal) > 0);
  const grossServiceTotal = serviceLines.reduce((sum, line) => sum + Number(line.lineSubtotal || 0), 0);
  const targetNet = roundCurrency(Math.max(0, Number(order.netAmount || 0)));

  if (serviceLines.length === 0) {
    return [{
      id: `${order.id}_item_1_checkout`,
      transactionId: '',
      categoryId: 'OTHER_ID',
      name: 'Checkout Revenue',
      price: targetNet,
      notes: order.notes,
    }];
  }

  if (grossServiceTotal <= 0) {
    return serviceLines.map((line, index) => ({
      id: `${order.id}_item_${index + 1}`,
      transactionId: '',
      categoryId: line.categoryId || 'OTHER_ID',
      name: line.serviceNameSnapshot || line.name,
      price: index === serviceLines.length - 1 ? targetNet : 0,
      notes: undefined,
    }));
  }

  const factor = targetNet / grossServiceTotal;
  let allocatedTotal = 0;

  return serviceLines.map((line, index) => {
    const isLast = index === serviceLines.length - 1;
    const base = Number(line.lineSubtotal || 0);
    const allocated = isLast
      ? roundCurrency(targetNet - allocatedTotal)
      : roundCurrency(base * factor);

    allocatedTotal = roundCurrency(allocatedTotal + allocated);

    return {
      id: `${order.id}_item_${index + 1}`,
      transactionId: '',
      categoryId: line.categoryId || 'OTHER_ID',
      name: line.serviceNameSnapshot || line.name,
      price: allocated,
      notes: undefined,
    };
  });
};

const buildTransactionFromPaidCheckoutOrder = (
  order: CheckoutOrder,
  paymentMethod: PaymentMethod,
  paymentCurrency: PaymentCurrency
): Transaction => {
  const transactionId = `co_${order.id}`;
  const items = buildTransactionItemsFromCheckoutOrder(order).map(item => ({
    ...item,
    transactionId,
  }));
  const amount = roundCurrency(items.reduce((sum, item) => sum + Number(item.price || 0), 0));
  const occurredAt = order.paidAt || order.checkedOutAt || order.checkInAt || order.createdAt || new Date().toISOString();

  return {
    id: transactionId,
    receiptNumber: order.invoiceNumber ? `CO-${order.invoiceNumber}` : `CO-${order.id.slice(0, 8).toUpperCase()}`,
    date: occurredAt.slice(0, 10),
    type: TransactionType.REVENUE,
    items,
    categoryId: items[0]?.categoryId || 'OTHER_ID',
    amount,
    description: `Checkout ${order.invoiceNumber || order.id.slice(0, 8)} (${paymentMethod} ${paymentCurrency})`,
    contributedBy: Owner.OWNER_A,
    customerId: order.customerId,
    notes: order.notes,
    checkoutOrderId: order.id,
    paymentStatus: 'paid',
    paymentMethod,
    paymentCurrency,
    currency: PaymentCurrency.RMB,
    paymentAmount: order.paymentAmount,
    splitMode: 'NONE',
    updatedAt: new Date().toISOString(),
  };
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
  const [discounts, setDiscounts] = useState<DiscountItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [checkoutOrders, setCheckoutOrders] = useState<CheckoutOrder[]>([]);
  const [exchangeRates, setExchangeRates] = useState<CurrencyExchangeRate[]>([]);
  const [membershipTiers, setMembershipTiers] = useState<MembershipTier[]>([]);
  const [customerMemberships, setCustomerMemberships] = useState<CustomerMembership[]>([]);
  const [chargingRates, setChargingRates] = useState<ChargingRateConfig[]>([]);
  const [chargingSessions, setChargingSessions] = useState<ChargingSession[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('overview');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [syncStatus, setSyncStatus] = useState<'local' | 'syncing' | 'cloud' | 'error'>('local');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [cloudConfig, setCloudConfig] = useState<CloudConfig | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastAction, setLastAction] = useState<{ type: 'add' | 'delete', data: Transaction[] } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isForcedReadOnly, setIsForcedReadOnly] = useState(false);
  const [authRole, setAuthRole] = useState<UserRole>('admin');
  const [authUsername, setAuthUsername] = useState<string>('admin');
  const [allowedTabs, setAllowedTabs] = useState<AppTab[]>(ALL_APP_TABS);
  const [hideFinancialData, setHideFinancialData] = useState(false);
  const [employeeUsers, setEmployeeUsers] = useState<EmployeeUser[]>([]);
  const [employeePermissions, setEmployeePermissions] = useState<EmployeePagePermission[]>([]);
  const [serverTime, setServerTime] = useState<string>('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [pendingVehiclePlatePrefill, setPendingVehiclePlatePrefill] = useState('');
  const [pendingVehicleReturnToCheckout, setPendingVehicleReturnToCheckout] = useState(false);
  const [pendingVehicleReturnDraftId, setPendingVehicleReturnDraftId] = useState<string | null>(null);
  const [pendingOpenAddCustomer, setPendingOpenAddCustomer] = useState(false);
  const [pendingAddCustomerPlatePrefill, setPendingAddCustomerPlatePrefill] = useState('');
  const [pendingCheckoutAutofillCustomerId, setPendingCheckoutAutofillCustomerId] = useState('');
  const [pendingCheckoutAutofillPlate, setPendingCheckoutAutofillPlate] = useState('');
  const [pendingCheckoutOpenId, setPendingCheckoutOpenId] = useState<string | null>(null);
  const [pendingServiceLifecycleOpenId, setPendingServiceLifecycleOpenId] = useState<string | null>(null);
  const [pendingCompletedCheckoutOpenId, setPendingCompletedCheckoutOpenId] = useState<string | null>(null);
  const [pendingTransactionOpenId, setPendingTransactionOpenId] = useState<string | null>(null);
  const [pendingTransactionSearch, setPendingTransactionSearch] = useState<string>('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const isReadOnly = syncStatus === 'error' || isForcedReadOnly;
  const isEmployee = authRole === 'employee';

  const canAccessTab = (tab: AppTab): boolean => {
    if (!isEmployee) return true;
    if (tab === 'input' || tab === 'memberships') return false;
    return allowedTabs.includes(tab);
  };

  const canManageEmployeeUsers = authRole === 'admin';
  const visibleTabs = useMemo(() => {
    if (!isEmployee) return ALL_APP_TABS;
    return ALL_APP_TABS.filter((tab) => canAccessTab(tab));
  }, [isEmployee, allowedTabs]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (canAccessTab(activeTab)) return;
    setActiveTab(visibleTabs[0] || 'settings');
  }, [isLoggedIn, activeTab, visibleTabs]);

  useEffect(() => {
    if (!isLoggedIn || !isEmployee || !authUsername) return;

    const normalized = authUsername.toLowerCase();
    const user = employeeUsers.find((item) => item.username.toLowerCase() === normalized);
    const tabs = employeePermissions
      .filter((item) => item.username.toLowerCase() === normalized && item.canView)
      .map((item) => item.pageKey as AppTab);

    if (tabs.length > 0) {
      setAllowedTabs(tabs);
    }

    if (user) {
      setHideFinancialData(user.hideFinancialData);
    }
  }, [isLoggedIn, isEmployee, authUsername, employeeUsers, employeePermissions]);

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

  const showTransactionSyncAlert = (message: string, fallbackZh: string, fallbackEn: string) => {
    const detail = message.trim();
    if (detail) {
      alert(detail);
      return;
    }
    alert(language === 'zh' ? fallbackZh : fallbackEn);
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

  useEffect(() => {
    const body = document.body;
    const modalSelector = '.fixed.inset-0:not(.pointer-events-none):not([data-modal-ignore="true"])';

    const updateModalLock = () => {
      const overlays = Array.from(document.querySelectorAll<HTMLElement>(modalSelector));
      const hasBlockingOverlay = overlays.some((overlay) => {
        const style = window.getComputedStyle(overlay);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      body.classList.toggle('modal-lock', hasBlockingOverlay);
    };

    updateModalLock();

    const observer = new MutationObserver(() => updateModalLock());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    window.addEventListener('resize', updateModalLock);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateModalLock);
      body.classList.remove('modal-lock');
    };
  }, [isLoggedIn]);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [currentBranch, setCurrentBranch] = useState("Zhuhai");
  const [showBranchSelector, setShowBranchSelector] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const mainRef = useRef<HTMLDivElement>(null);

  const handleScannerResult = (decodedText: string) => {
    const scanned = decodedText.trim();
    if (!scanned) return;

    const deepLinkMatch = scanned.match(/^app:\/\/transaction\/(.+)$/i);
    const scannedId = deepLinkMatch ? decodeURIComponent(deepLinkMatch[1]) : scanned;
    const found = transactions.find(tr => tr.id === scannedId || tr.receiptNumber === scannedId);

    setActiveTab('transactions');
    if (found) {
      setPendingTransactionOpenId(found.id);
      setPendingTransactionSearch('');
    } else {
      setPendingTransactionOpenId(null);
      setPendingTransactionSearch(scannedId);
    }

    setIsScannerOpen(false);
  };

  useEffect(() => {
    if (!isScannerOpen) return;

    let cancelled = false;
    const scanner = new Html5Qrcode('transaction-qr-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          if (cancelled) return;
          handleScannerResult(decodedText);
        },
        () => {}
      )
      .catch(() => {
        if (!cancelled) {
          alert(language === 'zh' ? '無法啟動相機掃描器' : 'Unable to start camera scanner');
          setIsScannerOpen(false);
        }
      });

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => scannerRef.current?.clear())
          .catch(() => {})
          .finally(() => {
            scannerRef.current = null;
          });
      }
    };
  }, [isScannerOpen, language, transactions]);
  const t = translations[language];

  const ensureCloudWritable = (): boolean => {
    if (cloudConfig) return true;
    const msg = language === 'zh'
      ? '未設定雲端連線，資料只能直接寫入資料庫。請先設定 Supabase。'
      : 'Cloud is not configured. Records must be written directly to the database. Please configure Supabase first.';
    setLastError(msg);
    setSyncStatus('error');
    return false;
  };

  const ensureRoleCanMutate = (scope: 'transactions' | 'general'): boolean => {
    if (!isEmployee) return true;

    if (scope === 'transactions') return true;

    alert(language === 'zh' ? '員工帳號無此修改權限' : 'Employee account cannot perform this action');
    return false;
  };

  const isIncomeOnlyPayload = (payload: Transaction | Transaction[]): boolean => {
    const list = Array.isArray(payload) ? payload : [payload];
    return list.every((item) => item.type === TransactionType.REVENUE);
  };

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
      interval = setInterval(() => {
        loadData(false);
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
    if (activeTab !== 'customers' || !mainRef.current) return;
    mainRef.current.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  useEffect(() => {
    let subTr: any = null;
    let subNotes: any = null;
    let subCats: any = null;
    let subCust: any = null;
    let subCustGroups: any = null;
    let subVehicles: any = null;
    let subAcc: any = null;
    let subDiscounts: any = null;
    let subCheckoutOrders: any = null;
    let subMembershipTiers: any = null;
    let subCustomerMemberships: any = null;
    let subChargingRates: any = null;
    let subChargingSessions: any = null;
    let subAppointments: any = null;
    if (cloudConfig) {
      subTr = subscribeToTransactions(() => loadData(false));
      subNotes = subscribeToNotes(() => loadData(false));
      subCats = subscribeToCategories(() => loadData(false));
      subCust = subscribeToCustomers(() => loadData(false));
      subCustGroups = subscribeToCustomerGroups(() => loadData(false));
      subVehicles = subscribeToVehicles(() => loadData(false));
      subAcc = subscribeToAccounts(() => loadData(false));
      subDiscounts = subscribeToDiscounts(() => loadData(false));
      subCheckoutOrders = subscribeToCheckoutOrders(() => loadData(false));
      subMembershipTiers = subscribeToMembershipTiers(() => loadData(false));
      subCustomerMemberships = subscribeToCustomerMemberships(() => loadData(false));
      subChargingRates = subscribeToChargingRates(() => loadData(false));
      subChargingSessions = subscribeToChargingSessions(() => loadData(false));
      subAppointments = subscribeToAppointments(() => loadData(false));
    }
    return () => {
      if (subTr && subTr.unsubscribe) subTr.unsubscribe();
      if (subNotes && subNotes.unsubscribe) subNotes.unsubscribe();
      if (subCats && subCats.unsubscribe) subCats.unsubscribe();
      if (subCust && subCust.unsubscribe) subCust.unsubscribe();
      if (subCustGroups && subCustGroups.unsubscribe) subCustGroups.unsubscribe();
      if (subVehicles && subVehicles.unsubscribe) subVehicles.unsubscribe();
      if (subAcc && subAcc.unsubscribe) subAcc.unsubscribe();
      if (subDiscounts && subDiscounts.unsubscribe) subDiscounts.unsubscribe();
      if (subCheckoutOrders && subCheckoutOrders.unsubscribe) subCheckoutOrders.unsubscribe();
      if (subMembershipTiers && subMembershipTiers.unsubscribe) subMembershipTiers.unsubscribe();
      if (subCustomerMemberships && subCustomerMemberships.unsubscribe) subCustomerMemberships.unsubscribe();
      if (subChargingRates && subChargingRates.unsubscribe) subChargingRates.unsubscribe();
      if (subChargingSessions && subChargingSessions.unsubscribe) subChargingSessions.unsubscribe();
      if (subAppointments && subAppointments.unsubscribe) subAppointments.unsubscribe();
    };
  }, [cloudConfig]);

  // Session Heartbeat and Server Time
  useEffect(() => {
    if (!isLoggedIn || authRole !== 'admin' || !sessionId || isForcedReadOnly) return;

    const heartbeat = setInterval(() => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      updateAdminSession(sessionId, expiresAt);
    }, 60 * 1000);

    return () => clearInterval(heartbeat);
  }, [isLoggedIn, authRole, sessionId, isForcedReadOnly]);

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

  const handleAdminLogin = (sid: string, readOnly: boolean) => {
    setAuthRole('admin');
    setAuthUsername('admin');
    setAllowedTabs([...ALL_APP_TABS]);
    setHideFinancialData(false);
    setSessionId(sid);
    setIsLoggedIn(true);
    setIsForcedReadOnly(readOnly);
    loadData(true);
  };

  const handleEmployeeLogin = (username: string, tabs: AppTab[], hideNumbers: boolean) => {
    const resolvedTabs = tabs.length > 0 ? tabs : [...DEFAULT_EMPLOYEE_PAGE_KEYS];

    setAuthRole('employee');
    setAuthUsername(username);
    setAllowedTabs(resolvedTabs);
    setHideFinancialData(hideNumbers);
    setSessionId(null);
    setIsForcedReadOnly(false);
    setIsLoggedIn(true);
    setActiveTab(resolvedTabs[0] || 'transactions');
    loadData(true);
  };

  const handleLogout = async () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    if (authRole === 'admin' && sessionId && !isForcedReadOnly) {
      await clearAdminSession(sessionId);
    }
    setIsLoggedIn(false);
    setAuthRole('admin');
    setAuthUsername('admin');
    setAllowedTabs([...ALL_APP_TABS]);
    setHideFinancialData(false);
    setSessionId(null);
    setIsForcedReadOnly(false);
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
      const { data: cloudTransactions, error: transactionsError } = await fetchTransactions();
      const { data: cloudNotes, error: notesError } = await fetchRemoteNotes();
      const { data: cloudCategories, error: catsError } = await fetchRemoteCategories();
      const { data: cloudCustomers, error: custError } = await fetchRemoteCustomers();
      const { data: cloudCustomerGroups, error: groupError } = await fetchRemoteCustomerGroups();
      const { data: cloudVehicles, error: vehicleError } = await fetchRemoteVehicles();
      const { data: cloudAccounts, error: accError } = await fetchRemoteAccounts();
      const { data: cloudDiscounts, error: discountError } = await fetchRemoteDiscounts();
      const { data: cloudCheckoutOrders, error: checkoutOrderError } = await fetchRemoteCheckoutOrders();
      const { data: cloudExchangeRates, error: exchangeRatesError } = await fetchRemoteExchangeRates();
      const { data: cloudMembershipTiers, error: membershipTierError } = await fetchRemoteMembershipTiers();
      const { data: cloudCustomerMemberships, error: customerMembershipError } = await fetchRemoteCustomerMemberships();
      const { data: cloudChargingRates, error: chargingRatesError } = await fetchRemoteChargingRates();
      const { data: cloudChargingSessions, error: chargingSessionsError } = await fetchRemoteChargingSessions();
      const { data: cloudAppointments, error: appointmentsError } = await fetchRemoteAppointments();
      const { data: cloudEmployeeUsers, error: employeeUsersError } = await fetchEmployeeUsers();
      const { data: cloudEmployeePermissions, error: employeePermissionsError } = await fetchEmployeePagePermissions();
      const { data: logsData, error: logsError } = await fetchAuditLogs();
      
      // Transaction error handling removed: handled by new backend logic
      if (vehicleError) {
        console.warn('Vehicles fetch skipped:', vehicleError);
      }

      if (logsData) setAuditLogs(logsData);

      if (transactionsError) {
        console.warn('Transactions fetch failed:', transactionsError);
      }

      if (cloudTransactions !== null && cloudTransactions !== undefined) {
        setTransactions(cloudTransactions);
      }

      if (cloudNotes !== null && cloudNotes !== undefined) {
        setNotes(cloudNotes);
      }

      if (cloudCustomers !== null && cloudCustomers !== undefined) {
        setCustomers(cloudCustomers);
      }

      if (cloudCustomerGroups !== null && cloudCustomerGroups !== undefined) {
        setCustomerGroups(cloudCustomerGroups);
      }

      if (!vehicleError && cloudVehicles !== null && cloudVehicles !== undefined) {
        setVehicles(cloudVehicles);
      }

      if (cloudAccounts !== null && cloudAccounts !== undefined) {
        setAccounts(cloudAccounts);
      }

      if (cloudDiscounts !== null && cloudDiscounts !== undefined) {
        setDiscounts(cloudDiscounts);
      }

      if (checkoutOrderError) {
        console.warn('Checkout orders fetch skipped:', checkoutOrderError);
      }

      if (!checkoutOrderError && cloudCheckoutOrders !== null && cloudCheckoutOrders !== undefined) {
        setCheckoutOrders(cloudCheckoutOrders);
      }

      if (exchangeRatesError) {
        console.warn('Exchange rates fetch skipped:', exchangeRatesError);
      }

      if (!exchangeRatesError && cloudExchangeRates !== null && cloudExchangeRates !== undefined) {
        setExchangeRates(cloudExchangeRates);
      }

      if (membershipTierError) {
        console.warn('Membership tiers fetch skipped:', membershipTierError);
      }

      if (!membershipTierError && cloudMembershipTiers !== null && cloudMembershipTiers !== undefined) {
        setMembershipTiers(cloudMembershipTiers);
      }

      if (customerMembershipError) {
        console.warn('Customer memberships fetch skipped:', customerMembershipError);
      }

      if (!customerMembershipError && cloudCustomerMemberships !== null && cloudCustomerMemberships !== undefined) {
        setCustomerMemberships(cloudCustomerMemberships);
      }

      if (chargingRatesError) {
        console.warn('Charging rates fetch skipped:', chargingRatesError);
      }

      if (!chargingRatesError && cloudChargingRates !== null && cloudChargingRates !== undefined) {
        setChargingRates(cloudChargingRates);
      }

      if (chargingSessionsError) {
        console.warn('Charging sessions fetch skipped:', chargingSessionsError);
      }

      if (!chargingSessionsError && cloudChargingSessions !== null && cloudChargingSessions !== undefined) {
        setChargingSessions(cloudChargingSessions);
      }

      if (appointmentsError) {
        console.warn('Appointments fetch skipped:', appointmentsError);
      }

      if (!appointmentsError && cloudAppointments !== null && cloudAppointments !== undefined) {
        setAppointments(cloudAppointments);
      }

      if (!employeeUsersError && cloudEmployeeUsers !== null && cloudEmployeeUsers !== undefined) {
        setEmployeeUsers(cloudEmployeeUsers);
      }

      if (!employeePermissionsError && cloudEmployeePermissions !== null && cloudEmployeePermissions !== undefined) {
        setEmployeePermissions(cloudEmployeePermissions);
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
      const resCustGroups = await syncRemoteCustomerGroups(customerGroups);
      const resVehicles = await syncRemoteVehicles(vehicles);
      const resDiscounts = await syncRemoteDiscounts(discounts);
      const resCheckoutOrders = await syncRemoteCheckoutOrders(checkoutOrders);
      const resMembershipTiers = await syncRemoteMembershipTiers(membershipTiers);
      const resCustomerMemberships = await syncRemoteCustomerMemberships(customerMemberships);
      const resChargingRates = await syncRemoteChargingRates(chargingRates);
      const resChargingSessions = await syncRemoteChargingSessions(chargingSessions);
      if (resTr.success && resNotes.success && resCats.success && resCust.success && resCustGroups.success && resVehicles.success && resAcc.success && resDiscounts.success && resCheckoutOrders.success && resMembershipTiers.success && resCustomerMemberships.success && resChargingRates.success && resChargingSessions.success) {
        setSyncStatus('cloud');
        setLastSync(new Date());
        setShowSuccessOverlay(true);
        setTimeout(() => setShowSuccessOverlay(false), 2000);
      } else {
        setLastError(
          resTr.success
            ? (resNotes.error || resCats.error || resCust.error || resCustGroups.error || resVehicles.error || resAcc.error || resDiscounts.error || resCheckoutOrders.error || resMembershipTiers.error || resCustomerMemberships.error || resChargingRates.error || resChargingSessions.error || 'Push failed')
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
      'serviceItems',
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
      `"${(tr.items && tr.items.length > 0
        ? tr.items.map(item => `${item.name} (¥${item.price})`).join(' + ')
        : '').replace(/"/g, '""')}"`,
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
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      setSyncStatus('syncing');
      setLastError(null);
      const result = await syncRemoteTransactions(newTransactions);
      if (result.success) {
        setSyncStatus('cloud');
        setLastSync(new Date());
        setTransactions(newTransactions);
      } else {
        const errorMessage = formatTransactionSyncError(result, 'Auto-sync failed');
        setLastError(errorMessage);
        setSyncStatus('error');
        showTransactionSyncAlert(errorMessage, '同步失敗，請檢查網絡', 'Sync failed, please check network');
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

  const handleSaveEmployeeUser = async (params: {
    username: string;
    password?: string;
    isActive: boolean;
    hideFinancialData: boolean;
  }) => {
    if (!canManageEmployeeUsers) return;
    if (!ensureCloudWritable()) return;

    const result = await saveEmployeeUser(params);
    if (!result.success) {
      const isSetupError = result.error?.includes('not set up');
      alert(isSetupError
        ? (language === 'zh'
          ? '員工資料表尚未建立。\n請前往「設定」頁面，複製 SQL 腳本並在 Supabase SQL Editor 執行。'
          : 'Employee tables are not set up yet.\nGo to Settings → copy the SQL script → run it in Supabase SQL Editor.')
        : (result.error || (language === 'zh' ? '儲存員工失敗' : 'Failed to save employee')));
      return;
    }

    logAuditEvent(AuditAction.UPDATE, 'employee_users', params.username, authUsername, undefined, params);
    await loadData(false);
  };

  const handleSaveEmployeePermissions = async (username: string, pageKeys: AppTab[]) => {
    if (!canManageEmployeeUsers) return;
    if (!ensureCloudWritable()) return;

    const result = await saveEmployeePagePermissions(username, pageKeys);
    if (!result.success) {
      const isSetupError = result.error?.includes('not set up');
      alert(isSetupError
        ? (language === 'zh'
          ? '員工資料表尚未建立。\n請前往「設定」頁面，複製 SQL 腳本並在 Supabase SQL Editor 執行。'
          : 'Employee tables are not set up yet.\nGo to Settings → copy the SQL script → run it in Supabase SQL Editor.')
        : (result.error || (language === 'zh' ? '儲存權限失敗' : 'Failed to save permissions')));
      return;
    }

    const normalizedUsername = username.trim().toLowerCase();
    const now = new Date().toISOString();
    const uniquePageKeys = Array.from(new Set(pageKeys));

    // Keep Settings UI in sync even when full loadData refresh is delayed or partially fails.
    setEmployeePermissions((current) => {
      const preserved = current.filter((item) => item.username.toLowerCase() !== normalizedUsername);
      const next = uniquePageKeys.map((pageKey) => ({
        id: `epp_local_${normalizedUsername}_${pageKey}`,
        username: normalizedUsername,
        pageKey: pageKey as EmployeePageKey,
        canView: true,
        createdAt: now,
        updatedAt: now,
      }));
      return [...preserved, ...next];
    });

    logAuditEvent(AuditAction.UPDATE, 'employee_page_permissions', username, authUsername, undefined, { pageKeys });

    const { data: refreshedPermissions } = await fetchEmployeePagePermissions();
    if (refreshedPermissions) {
      setEmployeePermissions(refreshedPermissions);
    } else {
      await loadData(false);
    }
  };

  const addTransaction = async (transaction: Transaction | Transaction[], transactionNoteText?: string) => {
    if (!ensureRoleCanMutate('transactions')) return;
    if (isEmployee && !isIncomeOnlyPayload(transaction)) {
      alert(language === 'zh' ? '員工只能新增收入交易' : 'Employees can only add income transactions');
      return;
    }
    if (!ensureCloudWritable()) return;
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
        const errorMessage = formatTransactionSyncError(result, 'Sync failed');
        setLastError(errorMessage);
        setSyncStatus('error');
        showTransactionSyncAlert(errorMessage, '同步失敗，請檢查網絡', 'Sync failed, please check network');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUndo = async () => {
    if (!lastAction) return;
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    setShowUndoToast(false);

    try {
      let updatedTransactions: Transaction[];
      if (lastAction.type === 'add') {
        const idsToRemove = new Set<string>(lastAction.data.map(t => t.id));
        updatedTransactions = transactions.filter(t => !idsToRemove.has(t.id));

        for (const id of Array.from(idsToRemove)) {
          await deleteRemoteTransaction(id);
        }
      } else {
        // Undo delete = re-add
        updatedTransactions = [...lastAction.data, ...transactions];
      }

      const result = await syncRemoteTransactions(updatedTransactions);
      if (result.success) {
        setTransactions(updatedTransactions);
        setSyncStatus('cloud');
        await loadData(false);
      }
      setLastAction(null);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateTransaction = async (updatedTr: Transaction, noteText?: string) => {
    if (isEmployee) {
      alert(language === 'zh' ? '員工不可編輯交易' : 'Employees cannot edit transactions');
      return;
    }
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    const now = new Date().toISOString();
    const updatedItem = { ...updatedTr, updatedAt: now };
    const manualNoteText = (noteText || '').trim();
    const generatedNotes: Note[] = manualNoteText
      ? [{
          id: crypto.randomUUID(),
          content: [
            `[${now}] Transaction Note`,
            `Transaction ID: ${updatedItem.id}`,
            `Receipt: ${updatedItem.receiptNumber || 'N/A'}`,
            `Date: ${updatedItem.date}`,
            '',
            manualNoteText
          ].join('\n'),
          createdBy: 'system',
          createdAt: now,
          updatedAt: now
        }]
      : [];
    
    try {
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
        const errorMessage = formatTransactionSyncError(result, 'Update failed');
        setLastError(errorMessage);
        setSyncStatus('error');
        showTransactionSyncAlert(errorMessage, '更新失敗', 'Update failed');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const bulkUpdateTransactions = async (updatedItems: Transaction[]) => {
    if (isEmployee) {
      alert(language === 'zh' ? '員工不可批量編輯交易' : 'Employees cannot bulk edit transactions');
      return;
    }
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    const now = new Date().toISOString();
    const updatedWithTime = updatedItems.map(item => ({ ...item, updatedAt: now }));
    
    try {
      setSyncStatus('syncing');
      const result = await syncRemoteTransactions(updatedWithTime);
      if (result.success) {
        setSyncStatus('cloud');
        setLastSync(new Date());
        logAuditEvent(AuditAction.UPDATE, 'transactions', updatedItems[0].id, undefined, undefined, updatedItems);
        await loadData(false);
      } else {
        const errorMessage = formatTransactionSyncError(result, 'Bulk update failed');
        setLastError(errorMessage);
        setSyncStatus('error');
        showTransactionSyncAlert(errorMessage, '批量更新失敗', 'Bulk update failed');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (isEmployee) {
      alert(language === 'zh' ? '員工不可刪除交易' : 'Employees cannot delete transactions');
      return;
    }
    if (!ensureCloudWritable()) return;
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
    } finally {
      setIsSyncing(false);
    }
  };

  const addNote = async (note: Omit<Note, 'id' | 'createdAt'>) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    const newNote: Note = {
      ...note,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    const updated = [newNote, ...notes];
    
    try {
      const result = await syncRemoteNotes(updated);
      if (result.success) {
        setNotes(updated);
        await loadData(false);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const updateNote = async (updatedNote: Note) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    const updated = notes.map(n => n.id === updatedNote.id ? updatedNote : n);
    try {
      const result = await syncRemoteNotes(updated);
      if (result.success) {
        setNotes(updated);
        await loadData(false);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteNote = async (id: string) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    const updated = notes.filter(n => n.id !== id);
    try {
      const success = await deleteRemoteNote(id);
      if (success) {
        setNotes(updated);
        await loadData(false);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateAccount = async (account: Account) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    const updated = accounts.some(a => a.id === account.id)
      ? accounts.map(a => a.id === account.id ? account : a)
      : [account, ...accounts];
    try {
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
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    const updated = accounts.filter(a => a.id !== id);
    try {
      const success = await deleteRemoteAccount(id);
      if (success) {
        setAccounts(updated);
        await loadData(false);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveCustomer = async (
    customer: Customer,
    vehicleSelection?: {
      existingVehicleId?: string;
      newVehicle?: { licensePlate: string; make: string; model: string; color: string; vehicleType: Vehicle['vehicleType']; vehicleSize: Vehicle['vehicleSize'] };
      updatedVehicle?: { id: string; licensePlate: string; make: string; model: string; color: string; vehicleType: Vehicle['vehicleType']; vehicleSize: Vehicle['vehicleSize'] };
    }
  ) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    let updatedVehicles = [...vehicles];
    let linkedVehicleId = vehicleSelection?.existingVehicleId || customer.vehicleId || '';

    if (vehicleSelection?.newVehicle && vehicleSelection.newVehicle.licensePlate.trim()) {
      const now = new Date().toISOString();
      const newVehicle: Vehicle = {
        id: crypto.randomUUID(),
        customerId: customer.id,
        licensePlate: vehicleSelection.newVehicle.licensePlate.trim(),
        make: vehicleSelection.newVehicle.make.trim(),
        model: vehicleSelection.newVehicle.model.trim(),
        color: vehicleSelection.newVehicle.color.trim(),
        vehicleType: vehicleSelection.newVehicle.vehicleType,
        vehicleSize: vehicleSelection.newVehicle.vehicleSize,
        createdAt: now,
        updatedAt: now,
      };
      updatedVehicles = [newVehicle, ...updatedVehicles];
      linkedVehicleId = newVehicle.id;
    } else if (vehicleSelection?.updatedVehicle) {
      updatedVehicles = updatedVehicles.map(vehicle =>
        vehicle.id === vehicleSelection.updatedVehicle!.id
          ? {
              ...vehicle,
              customerId: customer.id,
              licensePlate: vehicleSelection.updatedVehicle!.licensePlate.trim(),
              make: vehicleSelection.updatedVehicle!.make.trim(),
              model: vehicleSelection.updatedVehicle!.model.trim(),
              color: vehicleSelection.updatedVehicle!.color.trim(),
              vehicleType: vehicleSelection.updatedVehicle!.vehicleType,
              vehicleSize: vehicleSelection.updatedVehicle!.vehicleSize,
              updatedAt: new Date().toISOString(),
            }
          : vehicle
      );
      linkedVehicleId = vehicleSelection.updatedVehicle.id;
    } else if (vehicleSelection?.existingVehicleId) {
      updatedVehicles = updatedVehicles.map(vehicle =>
        vehicle.id === vehicleSelection.existingVehicleId
          ? { ...vehicle, customerId: customer.id, updatedAt: new Date().toISOString() }
          : vehicle
      );
    }

    const customerToSave: Customer = {
      ...customer,
      vehicleId: linkedVehicleId || undefined,
      updatedAt: new Date().toISOString(),
    };

    const updatedCustomers = customers.some(c => c.id === customer.id)
      ? customers.map(c => c.id === customer.id ? customerToSave : c)
      : [customerToSave, ...customers];

    try {
      setSyncStatus('syncing');
      const customerResult = await syncRemoteCustomers(updatedCustomers);
      const vehicleResult = await syncRemoteVehicles(updatedVehicles);

      if (customerResult.success && vehicleResult.success) {
        setCustomers(updatedCustomers);
        setVehicles(updatedVehicles);
        setSyncStatus('cloud');
        await loadData(false);
      } else {
        setLastError(customerResult.error || vehicleResult.error || 'Customer sync failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    const updated = customers.filter(c => c.id !== id);
    const relatedVehicles = vehicles.filter(vehicle => vehicle.customerId === id);
    try {
      const success = await deleteRemoteCustomer(id);
      if (success) {
        for (const vehicle of relatedVehicles) {
          await deleteRemoteVehicle(vehicle.id);
        }
        setCustomers(updated);
        setVehicles(vehicles.filter(vehicle => vehicle.customerId !== id));
        await loadData(false);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateCustomer = async (customer: Customer) => {
    await handleSaveCustomer(customer);
  };

  const handleSaveVehicle = async (vehicle: Vehicle) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);

    const normalizedIncomingPlate = normalizeLicensePlate(vehicle.licensePlate || '');
    const duplicatePlateVehicle = vehicles.find((candidate) => {
      if (!candidate.licensePlate) return false;
      if (candidate.id === vehicle.id) return false;
      return normalizeLicensePlate(candidate.licensePlate) === normalizedIncomingPlate;
    });

    const canonicalVehicle: Vehicle = duplicatePlateVehicle
      ? {
          ...vehicle,
          id: duplicatePlateVehicle.id,
          createdAt: duplicatePlateVehicle.createdAt || vehicle.createdAt,
          customerId: vehicle.customerId || duplicatePlateVehicle.customerId,
        }
      : vehicle;

    const updatedVehicles = vehicles.some(v => v.id === canonicalVehicle.id)
      ? vehicles.map(v => (v.id === canonicalVehicle.id ? canonicalVehicle : v))
      : [canonicalVehicle, ...vehicles];

    try {
      setSyncStatus('syncing');
      const result = await syncRemoteVehicles(updatedVehicles);

      if (result.success) {
        setVehicles(updatedVehicles);
        setSyncStatus('cloud');
        setIsSyncing(false);
        loadData(false);
      } else {
        setLastError(result.error || 'Vehicle sync failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);

    const now = new Date().toISOString();
    const updatedCustomers = customers.map(customer =>
      customer.vehicleId === vehicleId
        ? { ...customer, vehicleId: undefined, updatedAt: now }
        : customer
    );

    try {
      setSyncStatus('syncing');
      const deleted = await deleteRemoteVehicle(vehicleId);
      const customerResult = await syncRemoteCustomers(updatedCustomers);

      if (deleted && customerResult.success) {
        setVehicles(prev => prev.filter(vehicle => vehicle.id !== vehicleId));
        setCustomers(updatedCustomers);
        setSyncStatus('cloud');
        await loadData(false);
      } else {
        setLastError(customerResult.error || 'Vehicle delete failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const saveCustomerGroups = async (updatedGroups: CustomerGroup[]) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      const result = await syncRemoteCustomerGroups(updatedGroups);
      if (result.success) {
        setCustomerGroups(updatedGroups);
        await loadData(false);
      } else {
        setLastError(result.error || 'Customer group sync failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteCustomerGroup = async (groupId: string) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    const targetGroup = customerGroups.find(group => group.id === groupId);
    const updatedGroups = customerGroups.filter(group => group.id !== groupId);
    const updatedCustomers = targetGroup
      ? customers.map(customer =>
          customer.group === targetGroup.name
            ? { ...customer, group: '', updatedAt: new Date().toISOString() }
            : customer
        )
      : customers;

    try {
      setSyncStatus('syncing');
      const deleted = await deleteRemoteCustomerGroup(groupId);
      const customerResult = await syncRemoteCustomers(updatedCustomers);

      if (deleted && customerResult.success) {
        setCustomerGroups(updatedGroups);
        setCustomers(updatedCustomers);
        setSyncStatus('cloud');
        await loadData(false);
      } else {
        setLastError(customerResult.error || 'Customer group delete failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const saveCategories = async (updatedCats: CategoryItem[]) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      const result = await syncRemoteCategories(updatedCats);
      if (result.success) {
        setCategories(updatedCats);
        await loadData(false);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const saveDiscounts = async (updatedDiscounts: DiscountItem[]) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      const result = await syncRemoteDiscounts(updatedDiscounts);
      if (result.success) {
        setDiscounts(updatedDiscounts);
        await loadData(false);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    const updated = categories.filter(c => c.id !== id);
    try {
      const success = await deleteRemoteCategory(id);
      if (success) {
        setCategories(updated);
        await loadData(false);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const saveCheckoutOrders = async (updatedOrders: CheckoutOrder[]) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      setSyncStatus('syncing');
      const result = await syncRemoteCheckoutOrders(updatedOrders);
      if (result.success) {
        // Only update the affected order(s) in state
        setCheckoutOrders(prev => {
          const updatedMap = new Map(updatedOrders.map(o => [o.id, o]));
          return prev.map(order => updatedMap.get(order.id) || order);
        });
        setSyncStatus('cloud');
      } else {
        setLastError(result.error || 'Order sync failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const markCheckoutOrderPaid = async (orderId: string, paymentMethod: PaymentMethod, paymentCurrency: PaymentCurrency) => {
    if (!ensureCloudWritable()) return;

    const order = checkoutOrders.find(item => item.id === orderId);
    if (!order) return;

    const forcedCurrency = getForcedCurrencyForPaymentMethod(paymentMethod);
    const resolvedPaymentCurrency = forcedCurrency || paymentCurrency;

    if (order.status !== 'checked_out') {
      setLastError('Only checked-out orders can be marked paid.');
      setSyncStatus('error');
      return;
    }

    const now = new Date().toISOString();
    let ratesForPayment = exchangeRates;
    let appliedRate = getApplicableExchangeRate(ratesForPayment, PaymentCurrency.RMB, resolvedPaymentCurrency);
    let paymentAmount = convertCurrencyAmount(Number(order.netAmount || 0), ratesForPayment, PaymentCurrency.RMB, resolvedPaymentCurrency);

    if (appliedRate == null || paymentAmount == null) {
      const { data: latestRates } = await fetchRemoteExchangeRates();
      if (latestRates && latestRates.length > 0) {
        ratesForPayment = latestRates;
        setExchangeRates(latestRates);
        appliedRate = getApplicableExchangeRate(ratesForPayment, PaymentCurrency.RMB, resolvedPaymentCurrency);
        paymentAmount = convertCurrencyAmount(Number(order.netAmount || 0), ratesForPayment, PaymentCurrency.RMB, resolvedPaymentCurrency);
      }
    }

    if (appliedRate == null || paymentAmount == null) {
      setLastError(`Missing exchange rate for RMB to ${resolvedPaymentCurrency}.`);
      setSyncStatus('error');
      return;
    }

    const paidOrder: CheckoutOrder = {
      ...order,
      paymentStatus: 'paid',
      paymentMethod,
      paymentCurrency: resolvedPaymentCurrency,
      paidAt: now,
      currency: PaymentCurrency.RMB,
      paymentAmount,
      appliedRate,
      updatedAt: now,
    };

    const paymentUpdatedOrders = checkoutOrders.map(item => item.id === orderId ? paidOrder : item);
    const transaction = buildTransactionFromPaidCheckoutOrder(paidOrder, paymentMethod, resolvedPaymentCurrency);

    setIsSyncing(true);
    try {
      setSyncStatus('syncing');
      setLastError(null);

      const paymentResult = await syncRemoteCheckoutOrders([paidOrder]);
      if (!paymentResult.success) {
        setLastError(paymentResult.error || 'Failed to save checkout payment state');
        setSyncStatus('error');
        return;
      }

      const transactionResult = await syncRemoteTransactions([transaction]);
      if (!transactionResult.success) {
        // Best effort rollback to keep paid state and accounting state aligned.
        await syncRemoteCheckoutOrders([order]);
        const errorMessage = formatTransactionSyncError(transactionResult, 'Failed to post paid checkout transaction');
        setLastError(errorMessage);
        setSyncStatus('error');
        return;
      }

      const linkedOrder: CheckoutOrder = {
        ...paidOrder,
        linkedTransactionId: transaction.id,
        updatedAt: new Date().toISOString(),
      };
      await syncRemoteCheckoutOrders([linkedOrder]);

      setCheckoutOrders(paymentUpdatedOrders.map(item => item.id === orderId ? linkedOrder : item));
      setSyncStatus('cloud');
      setLastSync(new Date());
      logAuditEvent(AuditAction.CREATE, 'transactions', transaction.id, undefined, undefined, transaction);
      await loadData(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const saveMembershipTiers = async (updatedTiers: MembershipTier[]) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      setSyncStatus('syncing');
      const result = await syncRemoteMembershipTiers(updatedTiers);
      if (result.success) {
        setMembershipTiers(updatedTiers);
        setSyncStatus('cloud');
        await loadData(false);
      } else {
        setLastError(result.error || 'Membership tiers sync failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const saveCustomerMemberships = async (updatedMemberships: CustomerMembership[]) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      setSyncStatus('syncing');
      const result = await syncRemoteCustomerMemberships(updatedMemberships);
      if (result.success) {
        setCustomerMemberships(updatedMemberships);
        setSyncStatus('cloud');
        await loadData(false);
      } else {
        setLastError(result.error || 'Customer memberships sync failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const saveChargingRates = async (updatedRates: ChargingRateConfig[]) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      setSyncStatus('syncing');
      const result = await syncRemoteChargingRates(updatedRates);
      if (result.success) {
        setChargingRates(updatedRates);
        setSyncStatus('cloud');
        await loadData(false);
      } else {
        setLastError(result.error || 'Charging rates sync failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const saveChargingSessions = async (updatedSessions: ChargingSession[]) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      setSyncStatus('syncing');
      const result = await syncRemoteChargingSessions(updatedSessions);
      if (result.success) {
        setChargingSessions(updatedSessions);
        setSyncStatus('cloud');
        await loadData(false);
      } else {
        setLastError(result.error || 'Charging sessions sync failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const createChargingTransactions = async (newTransactions: Transaction[]) => {
    if (!ensureRoleCanMutate('transactions')) return false;
    if (!ensureCloudWritable()) return false;

    if (isEmployee && !isIncomeOnlyPayload(newTransactions)) {
      alert(language === 'zh' ? '員工只能新增收入交易' : 'Employees can only add income transactions');
      return false;
    }

    setIsSyncing(true);
    try {
      setSyncStatus('syncing');
      const rows = newTransactions.map((transaction) => ({
        ...transaction,
        updatedAt: transaction.updatedAt || new Date().toISOString(),
      }));
      const result = await syncRemoteTransactions(rows);
      if (!result.success) {
        const errorMessage = formatTransactionSyncError(result, 'Charging transaction sync failed');
        setLastError(errorMessage);
        setSyncStatus('error');
        return false;
      }

      setSyncStatus('cloud');
      setLastSync(new Date());
      await loadData(false);
      return true;
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteCheckoutOrder = async (orderId: string) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      const success = await deleteRemoteCheckoutOrder(orderId);
      if (success) {
        setCheckoutOrders(prev => prev.filter(order => order.id !== orderId));
        await loadData(false);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const saveAppointments = async (updatedAppointments: Appointment[]) => {
    if (!ensureCloudWritable()) return;
    setIsSyncing(true);
    try {
      setSyncStatus('syncing');
      const result = await syncRemoteAppointments(updatedAppointments);
      if (result.success) {
        setAppointments(updatedAppointments);
        setSyncStatus('cloud');
        await loadData(false);
      } else {
        setLastError(result.error || 'Appointments sync failed');
        setSyncStatus('error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConvertAppointmentToCheckout = async (appointment: Appointment) => {
    if (!ensureCloudWritable()) return;

    const latestAppointment = appointments.find(item => item.id === appointment.id) || appointment;
    if (latestAppointment.linkedCheckoutOrderId) {
      const linkedOrder = checkoutOrders.find(order => order.id === latestAppointment.linkedCheckoutOrderId);

      if (!linkedOrder || linkedOrder.status === CheckoutOrderStatus.DRAFT) {
        setPendingCheckoutOpenId(latestAppointment.linkedCheckoutOrderId);
        setPendingServiceLifecycleOpenId(null);
        setPendingCompletedCheckoutOpenId(null);
        setActiveTab('checkout');
        return;
      }

      if (linkedOrder.status === CheckoutOrderStatus.CHECKED_OUT) {
        setPendingCompletedCheckoutOpenId(linkedOrder.id);
        setPendingServiceLifecycleOpenId(null);
        setPendingCheckoutOpenId(null);
        setActiveTab('completed_checkout');
        return;
      }

      setPendingServiceLifecycleOpenId(linkedOrder.id);
      setPendingCompletedCheckoutOpenId(null);
      setPendingCheckoutOpenId(null);
      setActiveTab('service_lifecycle');
      return;
    }

    const now = new Date().toISOString();
    const lines: CheckoutOrderLine[] = appointment.serviceCategoryIds.map(catId => {
      const cat = categories.find(c => c.id === catId);
      return {
        id: crypto.randomUUID(),
        saleId: '',
        categoryId: catId,
        name: cat?.name ?? catId,
        quantity: 1,
        unitPrice: cat?.price ?? 0,
        lineSubtotal: cat?.price ?? 0,
        estimatedDurationMinutes: cat?.estimatedDurationMinutes,
        isDiscount: false,
        createdAt: now,
      };
    });
    const grossAmount = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
    const newOrderId = crypto.randomUUID();
    const newOrder: CheckoutOrder = {
      id: newOrderId,
      customerId: latestAppointment.customerId,
      vehicleId: latestAppointment.vehicleId,
      status: CheckoutOrderStatus.DRAFT,
      grossAmount,
      membershipDiscountAmount: 0,
      couponDiscountAmount: 0,
      netAmount: grossAmount,
      estimatedDurationMinutes: lines.reduce((sum, l) => sum + (l.estimatedDurationMinutes ?? 0), 0),
      currency: PaymentCurrency.HKD,
      createdAt: now,
      lines,
    };

    const updatedAppointments = appointments.map(item => {
      if (item.id !== latestAppointment.id) return item;
      return {
        ...item,
        linkedCheckoutOrderId: newOrderId,
        convertedAt: now,
        updatedAt: now,
      };
    });

    setIsSyncing(true);
    setSyncStatus('syncing');
    try {
      const [orderResult, appointmentResult] = await Promise.all([
        syncRemoteCheckoutOrders([newOrder, ...checkoutOrders]),
        syncRemoteAppointments(updatedAppointments),
      ]);

      if (!orderResult.success || !appointmentResult.success) {
        setLastError(orderResult.error || appointmentResult.error || 'Conversion sync failed');
        setSyncStatus('error');
        return;
      }

      setCheckoutOrders([newOrder, ...checkoutOrders]);
      setAppointments(updatedAppointments);
      setPendingCheckoutOpenId(newOrderId);
      setPendingServiceLifecycleOpenId(null);
      setPendingCompletedCheckoutOpenId(null);
      setSyncStatus('cloud');
      setLastSync(new Date());
      setActiveTab('checkout');
    } finally {
      setIsSyncing(false);
    }
  };

  const dueRemindersCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return notes.filter(n => n.reminderDate && n.reminderDate <= today).length;
  }, [notes]);

  const summary: FinancialSummary = useMemo(() => {
    // Helper to sum items by filter
    const sumItems = (filterFn: (tr: Transaction, item: TransactionItem) => boolean) =>
      transactions.reduce((sum, tr) =>
        sum + (tr.items ? tr.items.filter(item => filterFn(tr, item)).reduce((s, item) => s + (item.price || 0), 0) : 0), 0);

    const ownerAAccount = accounts.find(account => account.name.includes(Owner.OWNER_A));
    const ownerBAccount = accounts.find(account => account.name.includes(Owner.OWNER_B));
    const ownerAliases: Record<Owner, string[]> = {
      [Owner.OWNER_A]: ownerAAccount ? [ownerAAccount.id, ownerAAccount.name] : [Owner.OWNER_A],
      [Owner.OWNER_B]: ownerBAccount ? [ownerBAccount.id, ownerBAccount.name] : [Owner.OWNER_B],
    };

    const getOwnedAmount = (transaction: Transaction, owner: Owner) => {
      const ratio = getOwnerShareRatio(transaction, owner, ownerAliases[owner]);
      if (ratio <= 0) {
        return 0;
      }

      return sumItems((candidate, item) => candidate.id === transaction.id) * ratio;
    };

    // Helper to get startup cost for a partner - strict matching on contributedBy
    const getStartupCost = (owner: Owner) => {
      const investments = transactions.filter(tr => {
        return (tr.type === TransactionType.OWNER_INVESTMENT || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment')) && tr.isInitialInvestment === true;
      });
      const withdrawals = transactions.filter(tr => {
        return (tr.type === TransactionType.OWNER_WITHDRAWAL || tr.type === TransactionType.WITHDRAWAL || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_withdrawal')) && tr.isInitialInvestment === true;
      });
      const investmentTotal = investments.reduce((sum, tr) => sum + getOwnedAmount(tr, owner), 0);
      const withdrawalTotal = withdrawals.reduce((sum, tr) => sum + getOwnedAmount(tr, owner), 0);
      const result = investmentTotal - withdrawalTotal;
      return result;
    };

    // Startup cost: only sum owner_investment - owner_withdrawal where isInitialInvestment is true, for each partner
    const startupInvestments = transactions.filter(tr => (tr.type === TransactionType.OWNER_INVESTMENT || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment')) && tr.isInitialInvestment === true);
    const startupWithdrawals = transactions.filter(tr => (tr.type === TransactionType.OWNER_WITHDRAWAL || tr.type === TransactionType.WITHDRAWAL || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_withdrawal')) && tr.isInitialInvestment === true);
    const totalStartup = startupInvestments.reduce((sum, tr) => sum + sumItems((t, item) => t.id === tr.id), 0) - startupWithdrawals.reduce((sum, tr) => sum + sumItems((t, item) => t.id === tr.id), 0);

    // All money injected by owners into the business
    const addRmb = transactions
      .filter(tr => (tr.type === TransactionType.OWNER_INVESTMENT) || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment'))
      .reduce((sum, tr) => sum + sumItems((t, item) => t.id === tr.id), 0);

    // All money taken out by owners from the business
    const cashOut = transactions
      .filter(tr => (tr.type === TransactionType.OWNER_WITHDRAWAL) || (tr.type === TransactionType.WITHDRAWAL) || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_withdrawal'))
      .reduce((sum, tr) => sum + sumItems((t, item) => t.id === tr.id), 0);

    // Revenue and expenses: sum all items in revenue/expense transactions
    const revenue = sumItems((tr, item) => tr.type === TransactionType.REVENUE);
    const expenses = sumItems((tr, item) => tr.type === TransactionType.EXPENSE);

    // Total withdrawals (same as cashOut but used in balance calculation)
    const withdrawals = cashOut;

    // Actual cash balance: (Total Money In) - (Total Money Out)
    const currentBalance = (addRmb + revenue) - (expenses + withdrawals);
    const netProfit = revenue - expenses;

    // Bank balance and personal balance are often used interchangeably in this app's context
    // but here we align bankBalance with the actual cash on hand
    const bankBalance = currentBalance;
    const personalBalance = bankBalance;

    const getPartnerStats = (owner: Owner) => {
      const deposits = transactions
        .filter(tr => tr.type === TransactionType.OWNER_INVESTMENT || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment'))
        .reduce((sum, tr) => sum + getOwnedAmount(tr, owner), 0);

      const revenueHandled = transactions
        .filter(tr => tr.type === TransactionType.REVENUE)
        .reduce((sum, tr) => sum + getOwnedAmount(tr, owner), 0);

      const expensesHandled = transactions
        .filter(tr => tr.type === TransactionType.EXPENSE)
        .reduce((sum, tr) => sum + getOwnedAmount(tr, owner), 0);

      const ownerWithdrawals = transactions
        .filter(tr => tr.type === TransactionType.WITHDRAWAL || tr.type === TransactionType.OWNER_WITHDRAWAL || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_withdrawal'))
        .reduce((sum, tr) => sum + getOwnedAmount(tr, owner), 0);

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
      ownerA: { ...getPartnerStats(Owner.OWNER_A), startupCosts: getStartupCost(Owner.OWNER_A) },
      ownerB: { ...getPartnerStats(Owner.OWNER_B), startupCosts: getStartupCost(Owner.OWNER_B) }
    };
  }, [transactions, accounts]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(language === 'zh' ? 'zh-HK' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ErrorBoundary>
      <div id="app-root-check" style={{ display: 'none' }}>App Mounted</div>
      {!isLoggedIn ? (
        <LoginPage onAdminLogin={handleAdminLogin} onEmployeeLogin={handleEmployeeLogin} language={language} />
      ) : (
        <div data-app-shell="true" className={`min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-black font-sans selection:bg-blue-900/30 transition-colors duration-500`}>
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
      <aside className="hidden md:flex w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-white/5 flex-col p-4 sticky top-0 h-[100dvh] z-30">
        <div className="flex items-center space-x-3 mb-6 px-1">
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
            <div className="flex items-center gap-2 mt-1">
              <button 
                onClick={() => setShowBranchSelector(true)}
                className="text-[10px] font-bold text-slate-400 dark:text-slate-500 hover:text-blue-500 transition-colors text-left uppercase tracking-widest"
              >
                Change Branch
              </button>
              <button
                onClick={() => setIsScannerOpen(true)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center"
                title={language === 'zh' ? '掃描交易 QR' : 'Scan Transaction QR'}
              >
                <i className="fas fa-qrcode text-[11px]"></i>
              </button>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
          {canAccessTab('overview') && <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'overview' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-chart-pie w-5"></i>
            <span>{t.overview}</span>
          </button>}
          {canAccessTab('balance') && <button onClick={() => setActiveTab('balance')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'balance' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-wallet w-5"></i>
            <span>{t.accountBalance}</span>
          </button>}
          {canAccessTab('transactions') && <button onClick={() => setActiveTab('transactions')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'transactions' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-list-ul w-5"></i>
            <span>{t.transactions}</span>
          </button>}
          {canAccessTab('startup') && <button onClick={() => setActiveTab('startup')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'startup' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-rocket w-5"></i>
            <span>{t.investmentOverview}</span>
          </button>}
          {canAccessTab('notes') && <button onClick={() => setActiveTab('notes')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'notes' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-sticky-note w-5"></i>
            <span>{t.notes}</span>
          </button>}
          {canAccessTab('customers') && <button onClick={() => setActiveTab('customers')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'customers' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-users w-5"></i>
            <span>{language === 'zh' ? '客戶追蹤' : 'Customers'}</span>
          </button>}
          {canAccessTab('vehicles') && <button onClick={() => setActiveTab('vehicles')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'vehicles' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-car-side w-5"></i>
            <span>{language === 'zh' ? '車輛管理' : 'Vehicles'}</span>
          </button>}
          {canAccessTab('memberships') && <button onClick={() => setActiveTab('memberships')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'memberships' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-id-badge w-5"></i>
            <span>{language === 'zh' ? '會員方案' : 'Memberships'}</span>
          </button>}
          {canAccessTab('completed_checkout') && <button onClick={() => setActiveTab('completed_checkout')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'completed_checkout' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-clipboard-check w-5"></i>
            <span>{language === 'zh' ? '已完成訂單' : 'Completed Checkout'}</span>
          </button>}
          {canAccessTab('service_lifecycle') && <button onClick={() => setActiveTab('service_lifecycle')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'service_lifecycle' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-car-side w-5"></i>
            <span>{language === 'zh' ? '服務進度' : 'Service Life Cycle'}</span>
          </button>}
          {canAccessTab('charging') && <button onClick={() => setActiveTab('charging')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'charging' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-bolt w-5"></i>
            <span>{language === 'zh' ? '充電服務' : 'Charging Service'}</span>
          </button>}
          {canAccessTab('appointments') && <button onClick={() => setActiveTab('appointments')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'appointments' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-calendar-alt w-5"></i>
            <span>{language === 'zh' ? '預約管理' : 'Appointments'}</span>
          </button>}
          {canAccessTab('settings') && <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === 'settings' ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 font-bold' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}>
            <i className="fas fa-cog w-5"></i>
            <span>{t.settings}</span>
          </button>}
        </nav>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 space-y-3">
          <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-3 space-y-2.5">
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
                disabled={syncStatus === 'syncing' || !cloudConfig || isReadOnly || isEmployee} 
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
          <div className="flex gap-2">
            {canAccessTab('input') && <button 
              onClick={() => setActiveTab('input')} 
              disabled={isReadOnly || !canAccessTab('input')}
              className={`flex-1 flex items-center justify-center space-x-2 px-3 py-3 rounded-2xl transition-all shadow-lg active:scale-95 ${isReadOnly ? 'opacity-50 grayscale cursor-not-allowed' : ''} ${activeTab === 'input' ? 'bg-blue-600 text-white shadow-blue-600/20' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-slate-900/20 dark:shadow-white/10'}`}
            >
              <i className="fas fa-receipt text-lg"></i>
              <span className="text-[11px] uppercase tracking-widest font-black">{language === 'zh' ? '新增交易記錄' : 'Add Transaction'}</span>
            </button>}
            {canAccessTab('checkout') && <button 
              onClick={() => setActiveTab('checkout')} 
              disabled={isReadOnly || !canAccessTab('checkout')}
              className={`flex-1 flex items-center justify-center space-x-2 px-3 py-3 rounded-2xl transition-all shadow-lg active:scale-95 ${isReadOnly ? 'opacity-50 grayscale cursor-not-allowed' : ''} ${activeTab === 'checkout' ? 'bg-blue-600 text-white shadow-blue-600/20' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-slate-900/20 dark:shadow-white/10'}`}
            >
              <i className="fas fa-shopping-bag text-lg"></i>
              <span className="text-[11px] uppercase tracking-widest font-black">{language === 'zh' ? '新銷售' : 'New Sale'}</span>
            </button>}
          </div>
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
                  activeTab === 'input' ? (language === 'zh' ? '新增交易記錄' : 'Add Transaction') : 
                  activeTab === 'customers' ? (language === 'zh' ? '客戶追蹤' : 'Customers') : 
                  activeTab === 'vehicles' ? (language === 'zh' ? '車輛管理' : 'Vehicles') : 
                  activeTab === 'charging' ? (language === 'zh' ? '充電服務' : 'Charging Service') : 
                  activeTab === 'appointments' ? (language === 'zh' ? '預約管理' : 'Appointments') : 
                  activeTab === 'memberships' ? (language === 'zh' ? '會員方案' : 'Memberships') : 
                  activeTab === 'categories' ? (language === 'zh' ? '服務類別' : 'Categories') : 
                  activeTab === 'service_lifecycle' ? (language === 'zh' ? '服務進度' : 'Service Life Cycle') : 
                  activeTab === 'completed_checkout' ? (language === 'zh' ? '已完成訂單' : 'Completed Checkout') : 
                  (t[activeTab as keyof typeof t] || activeTab)
                )}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsScannerOpen(true)}
              className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200 flex items-center justify-center active:scale-90 transition-all"
              title={language === 'zh' ? '掃描交易 QR' : 'Scan Transaction QR'}
            >
              <i className="fas fa-qrcode text-sm"></i>
            </button>
            <button 
              onClick={pushAllData}
              disabled={isReadOnly || syncStatus === 'syncing' || isEmployee}
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

      {/* More Menu Modal */}
      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-[200] bg-white dark:bg-slate-900">
          <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10 flex items-center justify-between px-5 py-4">
            <button
              onClick={() => setIsMoreOpen(false)}
              className="w-10 h-10 flex items-center justify-center text-slate-600 dark:text-slate-300"
            >
              <i className="fas fa-times text-xl"></i>
            </button>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">
              {language === 'zh' ? '更多' : 'More'}
            </h2>
            <div className="w-10" />
          </div>

          <nav className="overflow-y-auto pb-40">
            <div className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 pt-6">
              {language === 'zh' ? 'BYD' : 'BYD'}
            </div>
            {[
              { id: 'input', icon: 'fa-receipt', label: language === 'zh' ? '新增交易記錄' : 'Add Transaction' },
              { id: 'checkout', icon: 'fa-shopping-cart', label: language === 'zh' ? '新銷售' : 'New Sale' },
              { id: 'completed_checkout', icon: 'fa-clipboard-check', label: language === 'zh' ? '已完成訂單' : 'Completed Checkout' },
              { id: 'service_lifecycle', icon: 'fa-car-side', label: language === 'zh' ? '服務進度' : 'Service Life Cycle' },
              { id: 'charging', icon: 'fa-bolt', label: language === 'zh' ? '充電服務' : 'Charging Service' },
              { id: 'appointments', icon: 'fa-calendar-alt', label: language === 'zh' ? '預約管理' : 'Appointments' },
              { id: 'transactions', icon: 'fa-chart-bar', label: language === 'zh' ? '報表' : 'Reports' },
              { id: 'overview', icon: 'fa-chart-pie', label: language === 'zh' ? '主頁' : 'Dashboard' },
              { id: 'notes', icon: 'fa-sticky-note', label: language === 'zh' ? '備忘錄' : 'Notes' },
              { id: 'categories', icon: 'fa-box', label: language === 'zh' ? '服務類別' : 'Categories' },
              { id: 'customers', icon: 'fa-users', label: language === 'zh' ? '客戶管理' : 'Customers' },
              { id: 'vehicles', icon: 'fa-car-side', label: language === 'zh' ? '車輛管理' : 'Vehicles' },
              { id: 'memberships', icon: 'fa-id-badge', label: language === 'zh' ? '會員方案' : 'Memberships' },
              { id: 'audit', icon: 'fa-users-cog', label: language === 'zh' ? '員工管理' : 'Team' },
              { id: 'settings', icon: 'fa-cog', label: language === 'zh' ? '設置' : 'Settings' },
            ].filter(item => canAccessTab(item.id as AppTab)).map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as any);
                  setIsMoreOpen(false);
                }}
                className="w-full flex items-center space-x-4 px-6 py-4 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 active:bg-blue-50 dark:active:bg-blue-600/10"
              >
                <i className={`fas ${item.icon} text-lg text-slate-700 dark:text-slate-300 w-6`}></i>
                <span className="text-base font-semibold text-slate-900 dark:text-white">{item.label}</span>
              </button>
            ))}
            
            {/* Floating Island - Time Status */}
            <div className="mx-4 my-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-3xl border-2 border-blue-200 dark:border-blue-800/50 shadow-lg">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                    <i className="fas fa-clock mr-2 text-blue-600 dark:text-blue-400"></i>
                    {language === 'zh' ? '已登錄時間' : 'Time Logged In'}
                  </span>
                  <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                    {serverTime || (language === 'zh' ? '珠海時間' : 'Zhuhai Time')}
                  </span>
                </div>
                <div className="h-px bg-gradient-to-r from-blue-200 to-indigo-200 dark:from-blue-800 dark:to-indigo-800"></div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                    <i className="fas fa-sync-alt mr-2 text-indigo-600 dark:text-indigo-400"></i>
                    {language === 'zh' ? '最後同步' : 'Last Synced'}
                  </span>
                  <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                    {lastSync ? formatTime(lastSync) : (language === 'zh' ? '未同步' : 'Never')}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <div className={`w-2 h-2 rounded-full ${syncStatus === 'cloud' ? 'bg-emerald-500 animate-pulse' : syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'}`}></div>
                  <span className="text-xs font-black uppercase tracking-tighter text-slate-500 dark:text-slate-400">
                    {syncStatus === 'cloud' ? (language === 'zh' ? '已連接' : 'Connected') : syncStatus === 'syncing' ? (language === 'zh' ? '同步中' : 'Syncing') : (language === 'zh' ? '本地模式' : 'Local Mode')}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowLogoutConfirm(true);
                setIsMoreOpen(false);
              }}
              className="w-full flex items-center space-x-4 px-6 py-4 border-t-2 border-slate-200 dark:border-white/10 hover:bg-rose-50 dark:hover:bg-rose-600/10 active:bg-rose-100 dark:active:bg-rose-600/20"
            >
              <i className="fas fa-sign-out-alt text-lg text-rose-600 dark:text-rose-400 w-6"></i>
              <span className="text-base font-semibold text-rose-600 dark:text-rose-400 underline">{language === 'zh' ? '登出 from Gardiner' : 'Sign out from Gardiner'}</span>
            </button>
          </nav>
        </div>
      )}
      <div className="md:hidden fixed inset-0 z-[60] pointer-events-none">
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="absolute inset-0 bg-slate-900/45 backdrop-blur-md pointer-events-auto"
            />
          )}
        </AnimatePresence>

        <div className="absolute left-1/2 bottom-6 -translate-x-1/2 w-[340px] h-[260px]">
          <AnimatePresence>
            {isMenuOpen && [
              { id: 'input-transaction', icon: 'fa-receipt', label: language === 'zh' ? '新增交易記錄' : 'Add Transaction Record' },
              { id: 'input-sale', icon: 'fa-shopping-bag', label: language === 'zh' ? '新增銷售草稿' : 'Add Sale Draft' },
            ].filter(item => (item.id === 'input-transaction' ? canAccessTab('input') : canAccessTab('checkout'))).map((item, index, arr) => {
              const radius = 130;
              const startAngle = (210 * Math.PI) / 180;
              const endAngle = (330 * Math.PI) / 180;
              const progress = arr.length === 1 ? 0.5 : index / (arr.length - 1);
              const angle = startAngle + (endAngle - startAngle) * progress;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                  animate={{ opacity: 1, scale: 1, x, y }}
                  exit={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 24, delay: index * 0.015 }}
                  className="absolute left-1/2 bottom-8 -translate-x-1/2 translate-y-1/2 pointer-events-auto flex flex-col items-center"
                >
                  <button
                    onClick={() => {
                      if (item.id === 'input-transaction') setActiveTab('input');
                      else if (item.id === 'input-sale') setActiveTab('checkout');
                      setIsMenuOpen(false);
                    }}
                    title={item.label}
                    className={`w-14 h-14 rounded-full border shadow-xl flex items-center justify-center active:scale-95 ${activeTab === item.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-white/10 dark:text-slate-200'}`}
                  >
                    <i className={`fas ${item.icon} text-sm`}></i>
                  </button>
                  <span className="mt-2 px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 whitespace-nowrap shadow-lg">
                    {item.label}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>

          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[280px] h-14 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-2xl shadow-slate-900/15 pointer-events-auto flex items-center justify-between px-6">
            <button
              onClick={() => { setActiveTab('service_lifecycle'); setIsMenuOpen(false); }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 ${activeTab === 'service_lifecycle' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}
              title={language === 'zh' ? '服務進度' : 'Service Life Cycle'}
            >
              <i className="fas fa-car-side text-base"></i>
            </button>

            <div className="w-14"></div>

            <button
              onClick={() => { setIsMoreOpen(true); setIsMenuOpen(false); }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 ${isMoreOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}
              title={language === 'zh' ? '更多' : 'More'}
            >
              <i className="fas fa-bars text-base"></i>
            </button>
          </div>

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`absolute left-1/2 bottom-8 -translate-x-1/2 translate-y-1/2 w-20 h-20 rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all duration-300 pointer-events-auto border-4 ${isMenuOpen ? 'bg-blue-600 text-white border-white dark:border-slate-900 shadow-blue-600/40' : 'bg-white text-blue-600 border-blue-200 dark:bg-slate-900 dark:text-blue-400 dark:border-blue-500/40 shadow-slate-900/20'}`}
          >
            <i className={`fas fa-plus text-3xl transition-transform duration-300 ${isMenuOpen ? 'rotate-45' : ''}`}></i>
          </button>
        </div>
      </div>

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
        className="flex-1 overflow-y-auto pb-32 md:pb-0 relative"
      >
        <AnimatePresence mode="wait">
          {syncStatus === 'syncing' ? (
            <LoadingScreen language={language} />
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
              {activeTab === 'startup' && <StartupList transactions={transactions} summary={summary} onDelete={deleteTransaction} language={language} isSyncing={isSyncing} isReadOnly={isReadOnly} />}
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
                  customers={customers}
                  onDelete={deleteTransaction} 
                  onUpdate={updateTransaction} 
                  onBulkUpdate={bulkUpdateTransactions} 
                  onExportExcel={exportToExcel} 
                  onExportJSON={exportToJSON} 
                  language={language} 
                  isSyncing={isSyncing} 
                  isReadOnly={isReadOnly || isEmployee}
                  isConnectionError={isReadOnly && !isForcedReadOnly}
                  hideFinancialData={hideFinancialData}
                  filter={isEmployee ? ((tr) => tr.type === TransactionType.REVENUE) : undefined}
                  openTransactionId={pendingTransactionOpenId}
                  initialSearchTerm={pendingTransactionSearch}
                  onOpenTransactionHandled={() => {
                    setPendingTransactionOpenId(null);
                    setPendingTransactionSearch('');
                  }}
                  onRetryConnection={syncStatus === 'error' ? () => loadData(true) : undefined}
                />
              )}
              {activeTab === 'checkout' && (
                <CheckoutPage
                  language={language}
                  categories={categories}
                  customers={customers}
                  vehicles={vehicles}
                  customerMemberships={customerMemberships}
                  discounts={discounts}
                  checkoutOrders={checkoutOrders}
                  exchangeRates={exchangeRates}
                  onSaveOrders={saveCheckoutOrders}
                  onMarkOrderPaid={markCheckoutOrderPaid}
                  onDeleteOrder={handleDeleteCheckoutOrder}
                  initialDraftOrderId={pendingCheckoutOpenId}
                  onInitialDraftOrderHandled={() => setPendingCheckoutOpenId(null)}
                  isReadOnly={isReadOnly}
                  onNavigateToVehicles={(licensePlate, draftOrderId) => {
                    setPendingVehiclePlatePrefill((licensePlate || '').trim().toUpperCase());
                    setPendingVehicleReturnToCheckout(true);
                    setPendingVehicleReturnDraftId(draftOrderId || null);
                    setActiveTab('vehicles');
                  }}
                  onNavigateToCustomers={() => setActiveTab('customers')}
                  onNavigateToAddCustomer={licensePlate => {
                    setPendingOpenAddCustomer(true);
                    setPendingAddCustomerPlatePrefill((licensePlate || '').trim().toUpperCase());
                    setActiveTab('customers');
                  }}
                  onNavigateToServiceLifeCycle={() => setActiveTab('service_lifecycle')}
                  prefillCustomerId={pendingCheckoutAutofillCustomerId}
                  prefillLicensePlate={pendingCheckoutAutofillPlate}
                  onPrefillConsumed={() => {
                    setPendingCheckoutAutofillCustomerId('');
                    setPendingCheckoutAutofillPlate('');
                  }}
                />
              )}
              {activeTab === 'completed_checkout' && (
                <CompletedCheckoutPage
                  language={language}
                  customers={customers}
                  vehicles={vehicles}
                  customerMemberships={customerMemberships}
                  discounts={discounts}
                  checkoutOrders={checkoutOrders}
                  exchangeRates={exchangeRates}
                  onMarkOrderPaid={markCheckoutOrderPaid}
                  onDeleteOrder={handleDeleteCheckoutOrder}
                  initialOpenOrderId={pendingCompletedCheckoutOpenId}
                  onInitialOpenOrderHandled={() => setPendingCompletedCheckoutOpenId(null)}
                  isReadOnly={isReadOnly}
                />
              )}
              {activeTab === 'service_lifecycle' && (
                <ServiceLifeCyclePage
                  language={language}
                  checkoutOrders={checkoutOrders}
                  customers={customers}
                  vehicles={vehicles}
                  onSaveOrders={saveCheckoutOrders}
                  initialOpenOrderId={pendingServiceLifecycleOpenId}
                  onInitialOpenOrderHandled={() => setPendingServiceLifecycleOpenId(null)}
                  isReadOnly={isReadOnly}
                />
              )}
              {activeTab === 'charging' && (
                <ChargingPage
                  language={language}
                  customers={customers}
                  vehicles={vehicles}
                  categories={categories}
                  chargingSessions={chargingSessions}
                  chargingRates={chargingRates}
                  onSaveSessions={saveChargingSessions}
                  onSaveRates={saveChargingRates}
                  onCreateTransactions={createChargingTransactions}
                  isReadOnly={isReadOnly}
                />
              )}
              {activeTab === 'appointments' && (
                <AppointmentsPage
                  language={language}
                  appointments={appointments}
                  customers={customers}
                  vehicles={vehicles}
                  categories={categories}
                  checkoutOrders={checkoutOrders}
                  onSaveAppointments={saveAppointments}
                  onConvertToCheckout={handleConvertAppointmentToCheckout}
                  isReadOnly={isReadOnly}
                />
              )}
              {activeTab === 'categories' && (
                <CategoriesPage
                  language={language}
                  categories={categories}
                  discounts={discounts}
                  onSaveCategories={saveCategories}
                  onSaveDiscounts={saveDiscounts}
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
                  customerGroups={customerGroups}
                  vehicles={vehicles}
                  transactions={transactions}
                  categories={categories}
                  onBack={() => setActiveTab('overview')}
                  onSaveCustomer={handleSaveCustomer}
                  onDeleteCustomer={handleDeleteCustomer}
                  onDeleteVehicle={handleDeleteVehicle}
                  onSaveCustomerGroups={saveCustomerGroups}
                  onDeleteCustomerGroup={handleDeleteCustomerGroup}
                  language={language}
                  isReadOnly={isReadOnly}
                  hideFinancialData={hideFinancialData}
                  openAddCustomerOnMount={pendingOpenAddCustomer}
                  addCustomerPrefillLicensePlate={pendingAddCustomerPlatePrefill}
                  onOpenAddCustomerConsumed={() => {
                    setPendingOpenAddCustomer(false);
                    setPendingAddCustomerPlatePrefill('');
                  }}
                  onSaveAndAutofillCheckout={(customerId, licensePlate) => {
                    setPendingCheckoutAutofillCustomerId((customerId || '').trim());
                    setPendingCheckoutAutofillPlate((licensePlate || '').trim().toUpperCase());
                    setActiveTab('checkout');
                  }}
                />
              )}
              {activeTab === 'vehicles' && (
                <VehiclesPage
                  vehicles={vehicles}
                  customers={customers}
                  onBack={() => setActiveTab('overview')}
                  onSaveVehicle={handleSaveVehicle}
                  onDeleteVehicle={handleDeleteVehicle}
                  language={language}
                  isReadOnly={isReadOnly}
                  prefillLicensePlate={pendingVehiclePlatePrefill}
                  onPrefillLicensePlateConsumed={() => setPendingVehiclePlatePrefill('')}
                  returnToCheckoutOnSave={pendingVehicleReturnToCheckout}
                  onReturnToCheckoutAfterSave={(licensePlate, customerId) => {
                    setPendingCheckoutOpenId(pendingVehicleReturnDraftId);
                    setPendingCheckoutAutofillPlate((licensePlate || '').trim().toUpperCase());
                    setPendingCheckoutAutofillCustomerId((customerId || '').trim());
                    setPendingVehicleReturnToCheckout(false);
                    setPendingVehicleReturnDraftId(null);
                    setPendingVehiclePlatePrefill('');
                    setActiveTab('checkout');
                  }}
                  onNavigateToAddCustomer={licensePlate => {
                    if (pendingVehicleReturnToCheckout && pendingVehicleReturnDraftId) {
                      setPendingCheckoutOpenId(pendingVehicleReturnDraftId);
                    }
                    setPendingVehicleReturnToCheckout(false);
                    setPendingVehicleReturnDraftId(null);
                    setPendingVehiclePlatePrefill('');
                    setPendingOpenAddCustomer(true);
                    setPendingAddCustomerPlatePrefill((licensePlate || '').trim().toUpperCase());
                    setActiveTab('customers');
                  }}
                />
              )}
              {activeTab === 'memberships' && (
                <MembershipsPage
                  language={language}
                  customers={customers}
                  membershipTiers={membershipTiers}
                  customerMemberships={customerMemberships}
                  onSaveMembershipTiers={saveMembershipTiers}
                  onSaveCustomerMemberships={saveCustomerMemberships}
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
                  onlyRevenueMode={isEmployee}
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
                  isReadOnly={isReadOnly || isEmployee}
                  isAdmin={canManageEmployeeUsers}
                  employeeUsers={employeeUsers}
                  employeePermissions={employeePermissions}
                  onSaveEmployeeUser={handleSaveEmployeeUser}
                  onSaveEmployeePermissions={handleSaveEmployeePermissions}
                  allPageOptions={ALL_APP_TABS}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {isScannerOpen && (
        <div className="fixed inset-0 z-[2100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {language === 'zh' ? '掃描交易 QR' : 'Scan Transaction QR'}
              </h3>
              <button
                onClick={() => setIsScannerOpen(false)}
                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {language === 'zh' ? '將交易詳情頁底部的 QR 碼對準鏡頭。' : 'Point camera at the QR code at the bottom of transaction detail.'}
            </p>
            <div id="transaction-qr-reader" className="rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-black min-h-[300px]" />
          </div>
        </div>
      )}


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
