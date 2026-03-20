
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Transaction, TransactionType, Category, Owner, CategoryItem, Customer, Account, AccountType } from '../types';
import { scanReceipt } from '../services/geminiService';
import { translations } from '../translations';

interface TransactionFormProps {
  onAdd: (tr: Transaction | Transaction[]) => void;
  language: 'zh' | 'en';
  transactions: Transaction[];
  categories: CategoryItem[];
  customers: Customer[];
  accounts: Account[];
  isSyncing?: boolean;
  isReadOnly?: boolean;
}

const TransactionForm: React.FC<TransactionFormProps> = ({ onAdd, language, transactions, categories, customers, accounts, isSyncing, isReadOnly }) => {
  const t = translations[language];
  const [loading, setLoading] = useState(false);
  const [isSplit, setIsSplit] = useState(true); // Default to split
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [formData, setFormData] = useState({
    type: TransactionType.EXPENSE,
    categoryId: Category.WASH as string,
    amount: '',
    description: '',
    date: new Date().toISOString().substring(0, 10),
    receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
    contributedBy: Owner.OWNER_A as string,
    isInitialInvestment: false,
    customerId: '',
    fromAccountId: '',
    toAccountId: '',
    fundedBy: 'Bank'
  });

  const suggestions = useMemo(() => {
    const used = transactions.map(tr => tr.categoryId as string);
    const defaults = categories.map(c => c.id);
    return Array.from(new Set([...defaults, ...used]));
  }, [transactions, categories]);

  const filteredCategories = useMemo(() => {
    return categories;
  }, [categories]);

  const fromAccounts = useMemo(() => {
    return accounts;
  }, [accounts]);

  const toAccounts = useMemo(() => {
    return accounts;
  }, [accounts]);

  useEffect(() => {
    // No longer resetting fromAccountId/toAccountId as we show all accounts
  }, [fromAccounts, toAccounts]);

  useEffect(() => {
    // No longer auto-updating category as we show all categories
  }, [formData.type, filteredCategories]);

  useEffect(() => {
    // Default Split to ON for business operations (Revenue, Expense)
    // Startup (Investment) and Withdrawals (cashing out) default to personal
    if (formData.type === TransactionType.REVENUE || formData.type === TransactionType.EXPENSE) {
      setIsSplit(true);
    } else {
      setIsSplit(false);
    }
  }, [formData.type]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const result = await scanReceipt(base64);
      if (result) {
        setFormData(prev => ({
          ...prev,
          amount: result.amount?.toString() || '',
          description: result.description || '',
          date: result.date || prev.date,
          categoryId: result.category as Category || prev.categoryId
        }));
        setImageUrl(reader.result as string);
      }
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleToday = () => {
    setFormData(prev => ({
      ...prev,
      date: new Date().toISOString().substring(0, 10)
    }));
  };

  const handleNewCategory = () => {
    setFormData(prev => ({
      ...prev,
      categoryId: ''
    }));
  };

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || isNaN(Number(formData.amount))) return;

    const baseId = Math.random().toString(36).substr(2, 9);
    const amount = Number(formData.amount);
    const transactionsToAdd: Transaction[] = [];

    if (formData.type === TransactionType.ADD_RMB || formData.type === TransactionType.CASH_OUT) {
      const isInvestment = formData.type === TransactionType.ADD_RMB;
      
      // For owner transactions, contributedBy must be the owner account ID
      const ownerAccountId = isInvestment ? formData.fromAccountId : formData.toAccountId;

      transactionsToAdd.push({
        id: baseId,
        type: TransactionType.TRANSFER,
        fromAccountId: formData.fromAccountId || undefined,
        toAccountId: formData.toAccountId || undefined,
        amount: amount,
        date: formData.date,
        receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
        contributedBy: ownerAccountId || formData.contributedBy,
        description: formData.description || (isInvestment ? 'Owner Investment' : 'Owner Withdrawal'),
        categoryId: isInvestment ? 'owner_investment' : 'owner_withdrawal',
        isInitialInvestment: formData.isInitialInvestment,
        notes: formData.notes || '',
        imageUrl: imageUrl
      });
      onAdd(transactionsToAdd);
      
      setFormData({
        ...formData,
        amount: '',
        description: '',
        isInitialInvestment: false,
        customerId: '',
        fromAccountId: '',
        toAccountId: '',
        receiptNumber: `REC-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`
      });
      setImageUrl(undefined);
      return;
    }

    // Handle fundedBy logic
    let finalNotes = formData.notes || '';
    if (formData.fundedBy !== 'Bank') {
      finalNotes += `\n[Funded by ${formData.fundedBy}]`;
      
      // Find the owner's account ID
      const ownerAccount = accounts.find(acc => acc.name === formData.fundedBy);
      const ownerAccountId = ownerAccount?.id || (formData.fundedBy === 'User 1' ? Owner.OWNER_A : Owner.OWNER_B);

      // Create equivalent "owner investment" transfer
      transactionsToAdd.push({
        id: Math.random().toString(36).substr(2, 9),
        type: TransactionType.TRANSFER,
        categoryId: 'owner_investment',
        amount: amount,
        description: `Owner Investment from ${formData.fundedBy} (Funded Expense)`,
        date: formData.date,
        receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
        contributedBy: ownerAccountId,
        fromAccountId: ownerAccountId,
        toAccountId: formData.fromAccountId || undefined,
        notes: `Equivalent transaction for expense ${formData.description}`
      });
    }

    const { fromAccountId, toAccountId, ...rest } = formData;
    const finalFromAccountId = (formData.type === TransactionType.EXPENSE || formData.type === TransactionType.WITHDRAWAL) ? fromAccountId : undefined;
    const finalToAccountId = (formData.type === TransactionType.REVENUE || formData.type === TransactionType.STARTUP) ? toAccountId : undefined;

    if (isSplit) {
      transactionsToAdd.push({
        ...rest,
        fromAccountId: finalFromAccountId,
        toAccountId: finalToAccountId,
        notes: finalNotes,
        id: `${baseId}-A`,
        amount: amount / 2,
        contributedBy: Owner.OWNER_A,
        description: `[SPLIT] ${formData.description}`,
        imageUrl: imageUrl
      });
      transactionsToAdd.push({
        ...rest,
        fromAccountId: finalFromAccountId,
        toAccountId: finalToAccountId,
        notes: finalNotes,
        id: `${baseId}-B`,
        amount: amount / 2,
        contributedBy: Owner.OWNER_B,
        description: `[SPLIT] ${formData.description}`,
        imageUrl: imageUrl
      });
      onAdd(transactionsToAdd);
    } else {
      transactionsToAdd.push({
        ...rest,
        fromAccountId: finalFromAccountId,
        toAccountId: finalToAccountId,
        id: baseId,
        notes: finalNotes,
        amount: amount,
        date: formData.date || new Date().toISOString().substring(0, 10),
        imageUrl: imageUrl
      });
      onAdd(transactionsToAdd);
    }

    setFormData({
      ...formData,
      amount: '',
      description: '',
      isInitialInvestment: false,
      customerId: '',
      fromAccountId: '',
      toAccountId: '',
      receiptNumber: `REC-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`
    });
    setImageUrl(undefined);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {isReadOnly && (
        <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/20 rounded-2xl p-4 flex items-center gap-3 text-rose-600 dark:text-rose-400">
          <i className="fas fa-lock text-sm"></i>
          <span className="text-xs font-bold uppercase tracking-widest">
            {language === 'zh' ? '連接不穩定，目前處於唯讀模式。' : 'Connection unstable. Currently in Read-Only mode.'}
          </span>
        </div>
      )}
      <div className={`bg-blue-600 text-white p-8 rounded-[32px] shadow-2xl relative overflow-hidden dark:bg-blue-700 ${isReadOnly ? 'opacity-60 grayscale' : ''}`}>
        <div className="relative z-10">
          <h2 className="text-2xl font-black mb-2 tracking-tight">{t.addEntry}</h2>
          <p className="text-blue-100/80 text-sm font-bold">{language === 'zh' ? '輸入交易詳情或直接掃描收據' : 'Enter transaction details or scan a receipt'}</p>
        </div>
        <i className="fas fa-receipt absolute -right-4 -bottom-4 text-9xl text-white/10 transform -rotate-12"></i>
      </div>

      <div className={`p-8 rounded-[32px] shadow-sm border-2 transition-all duration-500 ${isReadOnly ? 'opacity-60 pointer-events-none grayscale' : ''} ${
        formData.type === TransactionType.EXPENSE 
          ? 'bg-rose-50/30 border-rose-500/50 dark:bg-rose-950/20 dark:border-rose-500/30' 
          : 'bg-emerald-50/30 border-emerald-500/50 dark:bg-emerald-950/20 dark:border-emerald-500/30'
      }`}>
        <div className="mb-8">
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className={`w-full py-6 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.98] ${loading ? 'opacity-50' : 'border-blue-200 text-blue-600 dark:border-blue-900/50 dark:text-blue-400'}`}
          >
            {loading ? (
              <>
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <span className="font-black text-[10px] uppercase tracking-widest">{t.scanning}</span>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-3 dark:bg-blue-900/20">
                  <i className="fas fa-camera text-xl"></i>
                </div>
                <span className="font-black text-sm uppercase tracking-wider">{t.scanReceipt} (AI)</span>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-300 mt-2 tracking-wide">{t.scanDesc}</span>
              </>
            )}
          </button>
          <input type="file" ref={fileInputRef} onChange={handleScan} accept="image/*" className="hidden" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="h-7 mb-2 flex items-center">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{t.type}</label>
              </div>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as TransactionType})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:bg-slate-800 dark:border-white/5 dark:text-white">
                <option value={TransactionType.REVENUE}>{t.revenue}</option>
                <option value={TransactionType.EXPENSE}>{t.expense}</option>
                <option value={TransactionType.ADD_RMB}>{language === 'zh' ? 'Owner Investment / 入金' : 'Owner Investment'}</option>
                <option value={TransactionType.CASH_OUT}>{language === 'zh' ? 'Owner Withdrawal / 攞錢' : 'Owner Withdrawal'}</option>
              </select>
            </div>
            <div>
              <div className="h-7 mb-2 flex items-center">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{language === 'zh' ? '關聯客戶' : 'Customer'}</label>
              </div>
              <select 
                value={formData.customerId} 
                onChange={e => setFormData({...formData, customerId: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
              >
                <option value="">{language === 'zh' ? '無 (None)' : 'None'}</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.vehicleModel || 'N/A'})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="h-7 mb-2 flex items-center">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">
                  {formData.type === TransactionType.ADD_RMB 
                    ? (language === 'zh' ? '出賬賬戶 (業主)' : 'From Account (Owner)')
                    : (language === 'zh' ? '出賬賬戶' : 'From Account')}
                </label>
              </div>
              <select 
                value={formData.fromAccountId} 
                onChange={e => setFormData({...formData, fromAccountId: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
              >
                <option value="">{language === 'zh' ? '選擇賬戶' : 'Select Account'}</option>
                {fromAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.id} - {a.name} ({a.type.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="h-7 mb-2 flex items-center">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">
                  {formData.type === TransactionType.CASH_OUT
                    ? (language === 'zh' ? '入賬賬戶 (業主)' : 'To Account (Owner)')
                    : (language === 'zh' ? '入賬賬戶' : 'To Account')}
                </label>
              </div>
              <select 
                value={formData.toAccountId} 
                onChange={e => setFormData({...formData, toAccountId: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
              >
                <option value="">{language === 'zh' ? '選擇賬戶' : 'Select Account'}</option>
                {toAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.id} - {a.name} ({a.type.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="h-7 mb-2 flex items-center">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{language === 'zh' ? '資金來源' : 'Funded By'}</label>
              </div>
              <select 
                value={formData.fundedBy} 
                onChange={e => setFormData({...formData, fundedBy: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
              >
                <option value="Bank">{language === 'zh' ? '銀行賬戶' : 'Bank Account'}</option>
                <option value="User 1">User 1</option>
                <option value="User 2">User 2</option>
              </select>
            </div>
            <div>
              <div className="flex justify-between items-center h-7 mb-2">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{t.category}</label>
                <button 
                  type="button" 
                  onClick={handleNewCategory} 
                  className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all dark:bg-blue-900/20 dark:text-blue-400"
                >
                  {t.new}
                </button>
              </div>
              <div className="relative">
                <input 
                  list="category-suggestions"
                  value={formData.categoryId} 
                  onChange={e => setFormData({...formData, categoryId: e.target.value})} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                  placeholder={language === 'zh' ? '選擇或輸入分類' : 'Select or type category'}
                />
                <datalist id="category-suggestions">
                  {filteredCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                  {suggestions.filter(s => !filteredCategories.find(c => c.id === s)).map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between items-center h-7 mb-2">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{t.amount} (RMB)</label>
                <span className="text-[10px] font-black text-blue-600 animate-pulse dark:text-blue-400">{getAmountUnit(formData.amount)}</span>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-slate-400 dark:text-slate-500 font-bold">¥</span>
                <input 
                  type="number" required value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-8 pr-16 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center h-7 mb-2">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{t.date}</label>
                <button 
                  type="button" 
                  onClick={handleToday} 
                  className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all dark:bg-blue-900/20 dark:text-blue-400"
                >
                  {t.today}
                </button>
              </div>
              <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest mb-2">{t.uploadPhoto}</label>
            <div className="flex items-center gap-4">
               <button 
                 type="button" 
                 onClick={() => photoInputRef.current?.click()} 
                 className="flex-1 py-3 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase text-slate-600 hover:bg-slate-100 transition-all flex items-center justify-center gap-2 dark:bg-slate-800 dark:border-white/5 dark:text-slate-300 dark:hover:bg-white/5"
               >
                 <i className="fas fa-image"></i>
                 {imageUrl ? t.changePhoto : t.uploadPhoto}
               </button>
            </div>
            <input type="file" ref={photoInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{t.contributedBy}</label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 justify-end">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tight">{t.split5050}</span>
                  <input 
                    type="checkbox" 
                    checked={isSplit} 
                    onChange={() => setIsSplit(!isSplit)}
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                  />
                </div>
                {(formData.type === TransactionType.EXPENSE || formData.type === TransactionType.ADD_RMB) && (
                  <div className="flex items-center gap-3 justify-end">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tight">{t.initialInvestment}</span>
                    <input 
                      type="checkbox" 
                      checked={formData.isInitialInvestment} 
                      onChange={() => setFormData({...formData, isInitialInvestment: !formData.isInitialInvestment})}
                      className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 transition-all cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
            
            {!isSplit ? (
              <div className="flex gap-4 mt-1">
                <button type="button" onClick={() => setFormData({...formData, contributedBy: Owner.OWNER_A})} className={`flex-1 py-3.5 rounded-2xl text-sm font-black uppercase tracking-wider transition-all shadow-sm border ${formData.contributedBy === Owner.OWNER_A ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'}`}>User 1</button>
                <button type="button" onClick={() => setFormData({...formData, contributedBy: Owner.OWNER_B})} className={`flex-1 py-3.5 rounded-2xl text-sm font-black uppercase tracking-wider transition-all shadow-sm border ${formData.contributedBy === Owner.OWNER_B ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'}`}>User 2</button>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-center dark:bg-blue-900/10 dark:border-blue-900/20"><p className="text-[10px] font-black text-blue-600 uppercase tracking-widest dark:text-blue-400">{t.splitNote}</p></div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest mb-2">{t.description}</label>
            <textarea 
              rows={3} value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
              placeholder={language === 'zh' ? 'e.g. 洗車液採購...' : 'e.g. washing fluid purchase...'}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest mb-2">{t.transactionNotes}</label>
            <textarea 
              rows={3} value={formData.notes || ''}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
              placeholder={language === 'zh' ? '輸入交易備註 (Notepad)...' : 'Enter transaction notes (Notepad)...'}
            />
          </div>

          <button 
            type="submit" 
            disabled={isSyncing}
            className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 transition-all transform active:scale-95 text-sm uppercase tracking-widest dark:shadow-none flex items-center justify-center gap-2 ${isSyncing ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isSyncing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {t.syncing}
              </>
            ) : (
              t.save
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TransactionForm;
