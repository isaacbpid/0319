import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Transaction, TransactionType, FinancialSummary, Category, Owner, Account } from '../types';
import { translations } from '../translations';

interface CashForecastProps {
  summary: FinancialSummary;
  transactions: Transaction[];
  accounts: Account[];
  language: 'zh' | 'en';
  onAdd: (tr: Transaction | Transaction[]) => void;
  onUpdate: (tr: Transaction) => void;
  onDelete: (id: string) => void;
  isSyncing?: boolean;
  isReadOnly?: boolean;
  totalInvested: number;
}

const CashForecast: React.FC<CashForecastProps> = ({ summary, transactions, accounts, language, onAdd, onUpdate, onDelete, isSyncing, isReadOnly, totalInvested }) => {
  const t = translations[language];
  const [showQuickAdjust, setShowQuickAdjust] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTr, setEditingTr] = useState<Transaction | null>(null);
  const [isSplit, setIsSplit] = useState(false);
  const [lastActionSummary, setLastActionSummary] = useState<{ amount: number, type: TransactionType, owner: Owner | 'SPLIT', newBalance: number } | null>(null);
  const [adjustData, setAdjustData] = useState({
    type: TransactionType.STARTUP, // Default to Deposit (Capital injection)
    amount: '',
    contributedBy: Owner.OWNER_A,
    description: '',
    receiptNumber: `BANK-${Date.now().toString().slice(-6)}`,
    isInitialInvestment: false,
    fromAccountId: '',
    toAccountId: ''
  });

  // Quick Fund account sources — same normalisation + fallback as TransactionForm
  const normalizedAccounts = useMemo(() => {
    const cleaned = (accounts || [])
      .filter(a => a && typeof a.id === 'string' && a.id.trim())
      .map(a => ({
        ...a,
        id: a.id.trim(),
        name: typeof a.name === 'string' && a.name.trim() ? a.name.trim() : a.id.trim(),
        type: typeof a.type === 'string' ? a.type : ''
      }));
    if (cleaned.length > 0) return cleaned;
    return [
      { id: 'Bank', name: 'Bank', type: 'company_bank', createdAt: '' },
      { id: 'Cash', name: 'Cash', type: 'cash', createdAt: '' },
      { id: 'User 1', name: 'User 1', type: 'partner_personal', createdAt: '' },
      { id: 'User 2', name: 'User 2', type: 'partner_personal', createdAt: '' }
    ];
  }, [accounts]);

  const partnerAccounts = useMemo(() => normalizedAccounts.filter(a => a.type === 'partner_personal'), [normalizedAccounts]);
  const nonOwnerAccounts = useMemo(() => normalizedAccounts.filter(a => a.type !== 'partner_personal'), [normalizedAccounts]);

  // For owner investment/withdrawal: set account fields appropriately
  React.useEffect(() => {
    if (!showQuickAdjust) return;
    if (adjustData.type === TransactionType.STARTUP) {
      // Investment: From = partner, To = Cash (default)
      const partnerAcc = partnerAccounts.find(a => a.name === adjustData.contributedBy);
      const cashAccount = nonOwnerAccounts.find(a => a.type === 'cash');
      const defaultTo = cashAccount?.id || nonOwnerAccounts[0]?.id || '';
      setAdjustData(adjust => ({
        ...adjust,
        fromAccountId: partnerAcc?.id || '',
        toAccountId: defaultTo
      }));
    } else if (adjustData.type === TransactionType.WITHDRAWAL) {
      // Withdrawal: From = Cash (default non-owner), To = partner
      const cashAccount = nonOwnerAccounts.find(a => a.type === 'cash');
      const defaultFrom = cashAccount?.id || nonOwnerAccounts[0]?.id || '';
      const partnerAcc = partnerAccounts.find(a => a.name === adjustData.contributedBy);
      setAdjustData(adjust => ({
        ...adjust,
        fromAccountId: defaultFrom,
        toAccountId: partnerAcc?.id || ''
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQuickAdjust, adjustData.type, adjustData.contributedBy]);

  const getPartnerBalance = (owner: Owner) => {
    return owner === Owner.OWNER_A ? summary.ownerA.settlement : summary.ownerB.settlement;
  };

  const currentPartnerBalance = getPartnerBalance(adjustData.contributedBy);
  const isOverdrawing = adjustData.type === TransactionType.WITHDRAWAL && Number(adjustData.amount) > currentPartnerBalance;

  const getAmountUnit = (amount: string) => {
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

  const forecastData = useMemo(() => {
    // Sort transactions by date ascending to calculate cumulative balance
    const sortedTr = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const data: any[] = [];
    let runningBalance = 0;
    
    // Start with a 0 point
    if (sortedTr.length > 0) {
      const firstDate = new Date(sortedTr[0].date);
      const dayBefore = new Date(firstDate);
      dayBefore.setDate(firstDate.getDate() - 1);
      data.push({
        name: dayBefore.toISOString().substring(0, 10),
        balance: 0,
        type: 'historical'
      });
    } else {
      data.push({ name: new Date().toISOString().substring(0, 10), balance: 0, type: 'historical' });
    }

    sortedTr.forEach(tr => {
      // Money IN: Owner investment, Revenue, Startup
      // Money OUT: Expenses, Owner withdrawal
      const isMoneyIn = tr.type === TransactionType.REVENUE || tr.type === TransactionType.STARTUP || tr.type === TransactionType.OWNER_INVESTMENT || (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment');
      const impact = isMoneyIn ? tr.amount : -tr.amount;
      runningBalance += impact;
      data.push({
        name: tr.date,
        balance: runningBalance,
        type: 'historical'
      });
    });

    // Add projection if we have data
    // Remove projection: do not add future months

    return data;
  }, [transactions]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTr) {
      await onUpdate(editingTr);
      setEditingTr(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deletingId) {
      await onDelete(deletingId);
      setDeletingId(null);
    }
  };

  const handleQuickAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(adjustData.amount);
    if (!adjustData.amount || isNaN(amountNum)) return;

    const baseId = Math.random().toString(36).substr(2, 9);
    const date = new Date().toISOString().substring(0, 10);
    const description = adjustData.description || (adjustData.type === TransactionType.STARTUP ? t.deposit : t.withdraw);

    // Find the business account (default to first bank/cash account)
    const businessAccount = accounts.find(acc => acc.type === 'Bank' || acc.type === 'Cash') || accounts[0];

    if (isSplit) {
      // Find owner accounts
      const ownerAAccount = accounts.find(acc => acc.name === Owner.OWNER_A);
      const ownerBAccount = accounts.find(acc => acc.name === Owner.OWNER_B);
      
      const ownerAId = ownerAAccount?.id || Owner.OWNER_A;
      const ownerBId = ownerBAccount?.id || Owner.OWNER_B;

      const splitItems: Transaction[] = [
        {
          id: `${baseId}-A`,
          receiptNumber: `${adjustData.receiptNumber}-A`,
          date,
          type: TransactionType.TRANSFER,
          categoryId: adjustData.type === TransactionType.STARTUP ? 'owner_investment' : 'owner_withdrawal',
          amount: amountNum / 2,
          description: `[SPLIT] ${description}`,
          contributedBy: ownerAId,
          fromAccountId: adjustData.type === TransactionType.STARTUP ? ownerAId : businessAccount?.id,
          toAccountId: adjustData.type === TransactionType.STARTUP ? businessAccount?.id : ownerAId,
          updatedAt: new Date().toISOString(),
          isInitialInvestment: adjustData.isInitialInvestment
        },
        {
          id: `${baseId}-B`,
          receiptNumber: `${adjustData.receiptNumber}-B`,
          date,
          type: TransactionType.TRANSFER,
          categoryId: adjustData.type === TransactionType.STARTUP ? 'owner_investment' : 'owner_withdrawal',
          amount: amountNum / 2,
          description: `[SPLIT] ${description}`,
          contributedBy: ownerBId,
          fromAccountId: adjustData.type === TransactionType.STARTUP ? ownerBId : businessAccount?.id,
          toAccountId: adjustData.type === TransactionType.STARTUP ? businessAccount?.id : ownerBId,
          updatedAt: new Date().toISOString(),
          isInitialInvestment: adjustData.isInitialInvestment
        }
      ];
      await onAdd(splitItems);
      
      setLastActionSummary({
        amount: amountNum,
        type: adjustData.type,
        owner: 'SPLIT',
        newBalance: summary.currentBalance + (adjustData.type === TransactionType.STARTUP ? amountNum : -amountNum)
      });
    } else {
      // Find the specific owner account
      const ownerAccount = accounts.find(acc => acc.name === adjustData.contributedBy);
      const ownerId = ownerAccount?.id || adjustData.contributedBy;

      const newTransaction: Transaction = {
        id: baseId,
        receiptNumber: adjustData.receiptNumber,
        date,
        type: TransactionType.TRANSFER,
        categoryId: adjustData.type === TransactionType.STARTUP ? 'owner_investment' : 'owner_withdrawal',
        amount: amountNum,
        description,
        contributedBy: ownerId,
        fromAccountId: adjustData.type === TransactionType.STARTUP
          ? (adjustData.fromAccountId || ownerId)
          : (adjustData.fromAccountId || businessAccount?.id),
        toAccountId: adjustData.type === TransactionType.STARTUP
          ? (adjustData.toAccountId || businessAccount?.id)
          : (adjustData.toAccountId || ownerId),
        updatedAt: new Date().toISOString(),
        isInitialInvestment: adjustData.isInitialInvestment
      };

      await onAdd(newTransaction);
      
      const impact = adjustData.type === TransactionType.STARTUP ? amountNum : -amountNum;
      setLastActionSummary({
        amount: amountNum,
        type: adjustData.type,
        owner: adjustData.contributedBy,
        newBalance: currentPartnerBalance + impact
      });
    }

    setShowQuickAdjust(false);
    setShowSummary(true);
    setIsSplit(false);
    
    setAdjustData({
      type: TransactionType.STARTUP,
      amount: '',
      contributedBy: Owner.OWNER_A,
      description: '',
      receiptNumber: `BANK-${Date.now().toString().slice(-6)}`,
      isInitialInvestment: false,
      fromAccountId: '',
      toAccountId: ''
    });
  };

  const formatCurrency = (val: number) => `¥${Math.round(val).toLocaleString()}`;

  const bankTransactions = useMemo(() => {
    return transactions
      .filter(tr => tr.type === TransactionType.STARTUP || tr.type === TransactionType.WITHDRAWAL)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {isReadOnly && (
        <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/20 rounded-2xl p-4 flex items-center gap-3 text-rose-600 dark:text-rose-400">
          <i className="fas fa-lock text-sm"></i>
          <span className="text-xs font-bold uppercase tracking-widest">
            {language === 'zh' ? '連接不穩定，目前處於唯讀模式。' : 'Connection unstable. Currently in Read-Only mode.'}
          </span>
        </div>
      )}
      {/* Header */}
      <div className="bg-[#0f172a] text-white p-8 rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="relative z-10 text-center md:text-left">
          <h2 className="text-3xl font-black mb-2 tracking-tight text-white">{t.accountBalance}</h2>
          <p className="text-slate-400 dark:text-slate-300 text-sm font-bold uppercase tracking-widest">{t.predictionDesc}</p>
        </div>
        <div className="flex flex-col items-center md:items-end gap-3 relative z-10">
          <div className="bg-blue-600/20 backdrop-blur-md px-8 py-5 rounded-3xl border border-blue-500/30 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-1">{t.accountBalance}</p>
            <p className="text-3xl font-black text-blue-400">¥ {summary.currentBalance.toLocaleString()}</p>
          </div>
          {!isReadOnly && (
            <button 
              onClick={() => {
                setShowQuickAdjust(true);
                setAdjustData(prev => ({ ...prev, receiptNumber: `BANK-${Date.now().toString().slice(-6)}` }));
              }}
              className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-600/20"
            >
              <i className="fas fa-exchange-alt mr-2"></i>
              {t.quickAdjust}
            </button>
          )}
        </div>
        <i className="fas fa-university absolute -right-6 -bottom-6 text-[12rem] text-white/5 transform -rotate-12"></i>
      </div>


      {/* Partner Ledger Section */}
      <div className="bg-[#0f172a] p-8 rounded-[40px] shadow-2xl text-white relative overflow-hidden">
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -left-20 -top-20 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 relative z-10">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.2em] flex items-center text-amber-400">
              <i className="fas fa-users-cog mr-3"></i>
              {t.partnerLedger}
            </h3>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
              {language === 'zh' ? '個人銀行餘額及投資記錄' : 'Personal Bank Balance & Investment Records'}
            </p>
          </div>
          <div className="bg-white/10 px-6 py-3 rounded-2xl border border-white/10 flex items-center gap-4">
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t.partnerStartupCosts}</p>
              <p className="text-xl font-black text-white">¥ {totalInvested.toLocaleString()}</p>
            </div>
            <div className="w-px h-8 bg-white/10"></div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t.accountBalance}</p>
              <p className="text-xl font-black text-emerald-400">¥ {summary.currentBalance.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
          {/* User 1 Stats */}
                  <div className="bg-white/5 backdrop-blur-md p-8 rounded-[32px] border border-white/10 shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500 flex items-center justify-center text-xs font-black shadow-lg shadow-blue-500/20">1</div>
                <span className="text-sm font-black text-white uppercase tracking-widest">{language === 'zh' ? '共享' : 'SHARED'}</span>
              </div>
              <div className="text-right">
                <p className="text-slate-400 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest mb-1">
                  {language === 'zh' ? '個人餘額' : 'Personal Balance'}
                </p>
                <h4 className={`text-xl font-black ${summary.ownerA.settlement >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ¥ {summary.ownerA.settlement.toLocaleString()}
                </h4>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-6">
              <div>
                <p className="text-slate-400 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest mb-1">{t.partnerStartupCosts}</p>
                <h4 className="text-sm font-bold text-white">¥ {summary.ownerA.startupCosts.toLocaleString()}</h4>
              </div>
              <div className="text-right">
                <p className="text-slate-400 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest mb-1">
                  {language === 'zh' ? '收入/支出' : 'Rev/Exp'}
                </p>
                <h4 className="text-sm font-bold text-blue-400">
                  ¥ {(summary.ownerA.revenueHandled - summary.ownerA.expensesHandled).toLocaleString()}
                </h4>
              </div>
            </div>
          </div>

          {/* User 2 Stats */}
          <div className="bg-white/5 backdrop-blur-md p-8 rounded-[32px] border border-white/10 shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center text-xs font-black shadow-lg shadow-emerald-500/20">2</div>
                <span className="text-sm font-black text-white uppercase tracking-widest">{language === 'zh' ? '共享' : 'SHARED'}</span>
              </div>
              <div className="text-right">
                <p className="text-slate-400 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest mb-1">
                  {language === 'zh' ? '個人餘額' : 'Personal Balance'}
                </p>
                <h4 className={`text-xl font-black ${summary.ownerB.settlement >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ¥ {summary.ownerB.settlement.toLocaleString()}
                </h4>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-6">
              <div>
                <p className="text-slate-400 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest mb-1">{t.partnerStartupCosts}</p>
                <h4 className="text-sm font-bold text-white">¥ {summary.ownerB.startupCosts.toLocaleString()}</h4>
              </div>
              <div className="text-right">
                <p className="text-slate-400 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest mb-1">
                  {language === 'zh' ? '收入/支出' : 'Rev/Exp'}
                </p>
                <h4 className="text-sm font-bold text-emerald-400">
                  ¥ {(summary.ownerB.revenueHandled - summary.ownerB.expensesHandled).toLocaleString()}
                </h4>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-8 text-[10px] text-slate-500 font-bold italic text-center relative z-10">{t.splitDesc}</p>
      </div>

      {/* Main Chart */}
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-white/10">
        <div className="mb-8">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 flex items-center dark:text-white">
            <i className="fas fa-chart-line mr-2 text-blue-500"></i>
            {t.predictionTitle}
          </h3>
          <p className="text-xs font-bold text-slate-400 dark:text-slate-300 mt-1 dark:text-slate-500">{t.forecastNote}</p>
        </div>

        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={forecastData}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" className="opacity-20" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                style={{ fontSize: '10px', fontWeight: 'bold' }} 
                tick={{ fill: '#ffffff' }}
                tickFormatter={(val) => {
                  // Show as mm/yy
                  if (!val) return '';
                  const parts = val.split('-');
                  if (parts.length < 2) return val;
                  return `${parts[1]}/${parts[0].slice(2)}`;
                }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                style={{ fontSize: '10px', fontWeight: 'bold' }} 
                tick={{ fill: '#ffffff' }} 
                tickFormatter={(val) => `¥${val.toLocaleString()}`}
                domain={['auto', 'auto']} 
              />
              <Tooltip 
                contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', padding: '16px', backgroundColor: '#1e293b', color: '#fff' }}
                formatter={(value: number) => [formatCurrency(value), t.accountBalance]}
                labelStyle={{ fontWeight: 'black', marginBottom: '4px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area 
                type="monotone" 
                dataKey="balance" 
                stroke="#3b82f6" 
                strokeWidth={4} 
                fillOpacity={1} 
                fill="url(#colorBalance)" 
                animationDuration={2000}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bank Transactions List */}
      <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden dark:bg-slate-900 dark:border-white/10">
        <div className="p-8 border-b border-slate-50 dark:border-white/5">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 dark:text-white">
            <i className="fas fa-history mr-2 text-blue-500"></i>
            {language === 'zh' ? '最近資金記錄' : 'Recent Bank Records'}
          </h3>
        </div>
        <div className="divide-y divide-slate-50 dark:divide-white/5">
          {bankTransactions.length > 0 ? bankTransactions.map(tr => (
            <div key={tr.id} className="p-6 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg shadow-sm ${tr.type === TransactionType.STARTUP ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'}`}>
                    <i className={`fas ${tr.type === TransactionType.STARTUP ? 'fa-arrow-down' : 'fa-arrow-up'}`}></i>
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900 dark:text-white">{tr.type === TransactionType.STARTUP ? t.deposit : t.withdraw}</div>
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-300 mt-0.5">{tr.date} • {tr.contributedBy}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className={`text-right ${isSyncing ? 'opacity-50' : ''}`}>
                    <div className={`text-sm font-black tracking-tight ${tr.type === TransactionType.STARTUP ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {tr.type === TransactionType.STARTUP ? '+' : '-'} ¥{tr.amount.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-300 mt-0.5 truncate max-w-[150px]">{tr.description}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isReadOnly && (
                      <>
                        <button 
                          onClick={() => setEditingTr(tr)} 
                          disabled={isSyncing}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-blue-500 hover:bg-blue-50 dark:text-slate-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-all active:scale-90"
                        >
                          <i className="fas fa-edit text-xs"></i>
                        </button>
                        <button 
                          onClick={() => setDeletingId(tr.id)} 
                          disabled={isSyncing}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:text-slate-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-400 transition-all active:scale-90"
                        >
                          <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )) : (
            <div className="p-20 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-white/5"><i className="fas fa-university text-slate-200 text-xl dark:text-slate-700"></i></div>
              <p className="text-sm font-black text-slate-300 uppercase tracking-widest dark:text-slate-600">{language === 'zh' ? '暫無資金記錄' : 'No bank records found'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Adjust Modal */}
      {showQuickAdjust && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 dark:bg-slate-900">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{t.quickAdjust}</h3>
              <button onClick={() => setShowQuickAdjust(false)} className="text-slate-400 p-2"><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleQuickAdjustSubmit} className="space-y-4">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl dark:bg-white/5">
                <button 
                  type="button" 
                  onClick={() => setAdjustData({...adjustData, type: TransactionType.STARTUP})}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${adjustData.type === TransactionType.STARTUP ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400' : 'text-slate-500'}`}
                >
                  {t.deposit}
                </button>
                <button 
                  type="button" 
                  onClick={() => setAdjustData({...adjustData, type: TransactionType.WITHDRAWAL})}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${adjustData.type === TransactionType.WITHDRAWAL ? 'bg-white text-rose-600 shadow-sm dark:bg-slate-800 dark:text-rose-400' : 'text-slate-500'}`}
                >
                  {t.withdraw}
                </button>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase">{t.adjustment}</label>
                  <span className="text-[10px] font-black text-blue-600 animate-pulse dark:text-blue-400">{getAmountUnit(adjustData.amount)}</span>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-slate-400 dark:text-slate-500 font-bold">¥</span>
                  <input 
                    type="number" 
                    value={adjustData.amount}
                    onChange={e => setAdjustData({...adjustData, amount: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.contributedBy}</label>
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => setAdjustData({...adjustData, contributedBy: Owner.OWNER_A})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${adjustData.contributedBy === Owner.OWNER_A ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-200 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'}`}>User 1</button>
                  <button type="button" onClick={() => setAdjustData({...adjustData, contributedBy: Owner.OWNER_B})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${adjustData.contributedBy === Owner.OWNER_B ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-200 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'}`}>User 2</button>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">From Account</label>
                    {adjustData.type === TransactionType.STARTUP ? (
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                        value={adjustData.fromAccountId}
                        disabled
                        required
                      >
                        <option value="">Select...</option>
                        {partnerAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                        value={adjustData.fromAccountId}
                        onChange={e => setAdjustData({ ...adjustData, fromAccountId: e.target.value })}
                        required
                        disabled={isSyncing || isReadOnly}
                      >
                        <option value="">Select...</option>
                        {nonOwnerAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">To Account</label>
                    {adjustData.type === TransactionType.STARTUP ? (
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                        value={adjustData.toAccountId}
                        onChange={e => setAdjustData({ ...adjustData, toAccountId: e.target.value })}
                        required
                        disabled={isSyncing || isReadOnly}
                      >
                        <option value="">Select...</option>
                        {nonOwnerAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-900 dark:bg-slate-800 dark:border-white/5 dark:text-white"
                        value={partnerAccounts.find(a => a.id === adjustData.toAccountId)?.name || ''}
                        disabled
                      />
                    )}
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">
                    {t.netPosition}: <span className={`font-black ${currentPartnerBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>¥{currentPartnerBalance.toLocaleString()}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-3 mb-2">
                  <input
                    id="initial-investment-checkbox"
                    type="checkbox"
                    checked={adjustData.isInitialInvestment}
                    onChange={e => setAdjustData({ ...adjustData, isInitialInvestment: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 transition-all"
                    disabled={isSyncing || isReadOnly}
                  />
                  <label htmlFor="initial-investment-checkbox" className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase cursor-pointer select-none">
                    Initial Investment
                  </label>
                </div>
              </div>

              {isOverdrawing && (
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl dark:bg-rose-900/20 dark:border-rose-900/30">
                  <p className="text-[10px] font-black text-rose-600 uppercase leading-relaxed text-center dark:text-rose-400">
                    <i className="fas fa-exclamation-triangle mr-1"></i>
                    {language === 'zh' ? '注意：提現金額超過可用餘額，個人結餘將變為負數。' : 'Warning: Withdrawal exceeds balance. Your equity will become negative.'}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.description}</label>
                <input 
                  value={adjustData.description}
                  onChange={e => setAdjustData({...adjustData, description: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                  placeholder={adjustData.type === TransactionType.STARTUP ? "e.g. 股東注資..." : "e.g. 提現..."}
                />
              </div>

              <button type="submit" disabled={isSyncing || isReadOnly} className={`w-full bg-blue-600 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all dark:shadow-none flex items-center justify-center gap-2 ${isSyncing || isReadOnly ? 'opacity-70' : ''}`}> 
                {isSyncing && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {t.action}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-8 space-y-6 animate-in zoom-in-95 dark:bg-slate-900">
            <div className="text-center">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500 dark:bg-rose-900/20"><i className="fas fa-exclamation-triangle text-2xl"></i></div>
              <h3 className="text-lg font-black text-slate-900 mb-2 dark:text-white">{t.deleteConfirmTitle}</h3>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-300">{t.deleteConfirmMessage}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} disabled={isSyncing} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10">{t.cancel}</button>
              <button onClick={handleDeleteConfirm} disabled={isSyncing} className={`flex-1 py-4 bg-rose-700 hover:bg-rose-800 text-white dark:text-white border border-rose-800 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-700/30 active:scale-95 flex items-center justify-center gap-2 ${isSyncing ? 'opacity-70' : ''}`}>
                {isSyncing && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                <span style={{ color: 'yellow', fontWeight: 'bold', textShadow: '0 1px 2px #0008' }}>{t.confirmDelete}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTr && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 space-y-6 animate-in zoom-in-95 dark:bg-slate-900">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{t.editEntry}</h3>
              <button onClick={() => setEditingTr(null)} className="text-slate-400 p-2"><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl dark:bg-white/5">
                <button type="button" onClick={() => setEditingTr({...editingTr, type: TransactionType.STARTUP})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${editingTr.type === TransactionType.STARTUP ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400' : 'text-slate-500'}`}>{t.deposit}</button>
                <button type="button" onClick={() => setEditingTr({...editingTr, type: TransactionType.WITHDRAWAL})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${editingTr.type === TransactionType.WITHDRAWAL ? 'bg-white text-rose-600 shadow-sm dark:bg-slate-800 dark:text-rose-400' : 'text-slate-500'}`}>{t.withdraw}</button>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.amount}</label>
                <input type="number" value={editingTr.amount} onChange={e => setEditingTr({...editingTr, amount: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.date}</label>
                <input type="date" value={editingTr.date.slice(0, 10)} onChange={e => setEditingTr({...editingTr, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase mb-1">{t.description}</label>
                <input value={editingTr.description} onChange={e => setEditingTr({...editingTr, description: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white" />
              </div>
              <button type="submit" disabled={isSyncing} className={`w-full bg-blue-600 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all dark:shadow-none flex items-center justify-center gap-2 ${isSyncing ? 'opacity-70' : ''}`}>
                {isSyncing && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {t.update}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Summary Popup */}
      {showSummary && lastActionSummary && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl p-8 space-y-6 text-center animate-in zoom-in-95 dark:bg-slate-900">
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center text-3xl shadow-xl ${lastActionSummary.type === TransactionType.STARTUP ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}>
              <i className={`fas ${lastActionSummary.type === TransactionType.STARTUP ? 'fa-arrow-down' : 'fa-arrow-up'}`}></i>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight dark:text-white">
                {lastActionSummary.type === TransactionType.STARTUP ? t.deposit : t.withdraw}
              </h3>
              <p className="text-slate-400 dark:text-slate-300 text-xs font-bold uppercase tracking-widest">
                {lastActionSummary.owner}
              </p>
            </div>

            <div className="bg-slate-50 rounded-3xl p-6 space-y-4 dark:bg-white/5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{t.amount}</span>
                <span className="text-lg font-black text-slate-900 dark:text-white">¥{lastActionSummary.amount.toLocaleString()}</span>
              </div>
              <div className="h-px bg-slate-200 w-full dark:bg-white/10"></div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{language === 'zh' ? '最新個人餘額' : 'New Balance'}</span>
                <span className={`text-lg font-black ${lastActionSummary.newBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  ¥{lastActionSummary.newBalance.toLocaleString()}
                </span>
              </div>
            </div>

            <button 
              onClick={() => setShowSummary(false)}
              className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all dark:bg-white dark:text-slate-900"
            >
              {language === 'zh' ? '完成' : 'Done'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashForecast;
