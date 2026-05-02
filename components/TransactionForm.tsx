
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Transaction, TransactionItem, TransactionType, Category, Owner, CategoryItem, Customer, Account, AccountType } from '../types';
import ServiceItemPicker from './ServiceItemPicker';
import { scanReceipt } from '../services/geminiService';
import { translations } from '../translations';

type ServiceItemDraft = {
  id: string;
  categoryId: string;
  price: string;
  notes: string;
};

const SPLIT_CONTRIBUTOR_LABEL = 'User 1 & User 2';

const createServiceItemDraft = (categoryId = ''): ServiceItemDraft => ({
  id: crypto.randomUUID(),
  categoryId,
  price: '',
  notes: ''
});

const buildTransactionItemId = (transactionId: string, seed: string, index: number): string => {
  const normalizedSeed = seed.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || `item_${index + 1}`;
  return `${transactionId}_item_${index + 1}_${normalizedSeed}`;
};

interface TransactionFormProps {
  onAdd: (tr: Transaction | Transaction[], transactionNoteText?: string) => void;
  language: 'zh' | 'en';
  transactions: Transaction[];
  categories: CategoryItem[];
  customers: Customer[];
  accounts: Account[];
  isSyncing?: boolean;
  isReadOnly?: boolean;
  onlyRevenueMode?: boolean;
}

const TransactionForm: React.FC<TransactionFormProps> = ({ onAdd, language, transactions, categories, customers, accounts, isSyncing, isReadOnly, onlyRevenueMode }) => {
  const t = translations[language];
  const [loading, setLoading] = useState(false);
  const [isSplit, setIsSplit] = useState(true); // Default to split
  const [showSplitInfo, setShowSplitInfo] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [transactionNoteText, setTransactionNoteText] = useState('');
  const [addToNotes, setAddToNotes] = useState(false);
  const [validationIssue, setValidationIssue] = useState<{ field: string; message: string } | null>(null);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [serviceItems, setServiceItems] = useState<ServiceItemDraft[]>([createServiceItemDraft(Category.WASH as string)]);
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
    fundedBy: 'Bank',
    notes: ''
  });

  const isRevenue = formData.type === TransactionType.REVENUE;
  const isExpense = formData.type === TransactionType.EXPENSE;
  const isOwnerInvestment = formData.type === TransactionType.OWNER_INVESTMENT;
  const isOwnerWithdrawal = formData.type === TransactionType.OWNER_WITHDRAWAL;
  const showFromAccountField = !isRevenue;
  const showToAccountField = !isExpense;
  const showFundedByAccountField = !(isSplit || isOwnerInvestment || isOwnerWithdrawal);

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

  const suggestions = useMemo(() => {
    const used = transactions.map(tr => tr.categoryId as string);
    const defaults = categories.map(c => c.id);
    return Array.from(new Set([...defaults, ...used]));
  }, [transactions, categories]);

  const revenueCategories = useMemo(() => {
    return categories.filter(category => category.type === TransactionType.REVENUE);
  }, [categories]);

  const expenseCategories = useMemo(() => {
    return categories.filter(category => category.type === TransactionType.EXPENSE);
  }, [categories]);

  const filteredCategories = useMemo(() => {
    if (isRevenue) return revenueCategories;
    if (isExpense) return expenseCategories;
    return categories;
  }, [categories, isExpense, isRevenue, expenseCategories, revenueCategories]);

  const selectedCategory = useMemo(() => {
    const categoryId = isRevenue || isExpense ? serviceItems[0]?.categoryId : formData.categoryId;
    return categories.find(category => category.id === categoryId) || null;
  }, [categories, formData.categoryId, isExpense, isRevenue, serviceItems]);

  const normalizedServiceItems = useMemo(() => {
    return serviceItems
      .map(item => {
        const price = Number(item.price);
        if (!item.categoryId.trim() || !Number.isFinite(price) || price <= 0) {
          return null;
        }

        const category = categories.find(entry => entry.id === item.categoryId);
        return {
          id: item.id,
          transactionId: '',
          categoryId: item.categoryId.trim(),
          name: category?.name || item.categoryId.trim(),
          price,
          notes: item.notes.trim() || undefined,
        } satisfies TransactionItem;
      })
      .filter((item): item is TransactionItem => Boolean(item));
  }, [categories, serviceItems]);

  const computedTotalAmount = useMemo(() => {
    return normalizedServiceItems.reduce((sum, item) => sum + item.price, 0);
  }, [normalizedServiceItems]);

  const serviceSummary = useMemo(() => {
    if (normalizedServiceItems.length === 0) return '';
    return normalizedServiceItems.map(item => item.name).join(' + ');
  }, [normalizedServiceItems]);

  const fromAccounts = useMemo(() => {
    if (isOwnerInvestment) return normalizedAccounts.filter(a => a.type === AccountType.PARTNER_PERSONAL);
    if (isOwnerWithdrawal) return normalizedAccounts.filter(a => a.type !== AccountType.PARTNER_PERSONAL);
    return normalizedAccounts;
  }, [normalizedAccounts, isOwnerInvestment, isOwnerWithdrawal]);

  const toAccounts = useMemo(() => {
    if (isOwnerInvestment) return normalizedAccounts.filter(a => a.type !== AccountType.PARTNER_PERSONAL);
    if (isOwnerWithdrawal) return normalizedAccounts.filter(a => a.type === AccountType.PARTNER_PERSONAL);
    return normalizedAccounts;
  }, [normalizedAccounts, isOwnerInvestment, isOwnerWithdrawal]);

  const accountIdSet = useMemo(() => new Set(normalizedAccounts.map(a => a.id)), [normalizedAccounts]);

  const selectedCustomer = useMemo(() => {
    return customers.find(customer => customer.id === formData.customerId) || null;
  }, [customers, formData.customerId]);

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers;

    return customers.filter(customer => {
      const haystack = `${customer.name || ''} ${customer.phone || ''} ${customer.chineseName || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [customers, customerSearch]);

  useEffect(() => {
    if (validationIssue) {
      setValidationIssue(null);
    }
  }, [formData, isSplit]);

  useEffect(() => {
    // No longer resetting fromAccountId/toAccountId as we show all accounts
  }, [fromAccounts, toAccounts]);

  useEffect(() => {
    if (!isRevenue) {
      return;
    }

    setServiceItems(prev => {
      if (prev.length === 0) return [createServiceItemDraft(revenueCategories[0]?.id || '')];
      return prev.map(item => ({
        ...item,
        categoryId: revenueCategories.some(category => category.id === item.categoryId)
          ? item.categoryId
          : (revenueCategories[0]?.id || '')
      }));
    });

    setFormData(prev => {
      // Default toAccountId to 'Cash' if not set and if 'Cash' exists in accounts
      let nextToAccountId = prev.toAccountId;
      if (!nextToAccountId) {
        const cashAccount = toAccounts.find(a => a.name === 'Cash' || a.id === 'Cash');
        if (cashAccount) {
          nextToAccountId = cashAccount.id;
        }
      }
      const nextContributedBy = prev.contributedBy && accountIdSet.has(prev.contributedBy)
        ? prev.contributedBy
        : Owner.OWNER_A;

      if (
        prev.fromAccountId === '' &&
        prev.fundedBy === 'Bank' &&
        prev.contributedBy === nextContributedBy &&
        prev.toAccountId === nextToAccountId
      ) {
        return prev;
      }

      return {
        ...prev,
        categoryId: revenueCategories[0]?.id || prev.categoryId,
        fromAccountId: '',
        fundedBy: 'Bank',
        contributedBy: nextContributedBy,
        toAccountId: nextToAccountId
      };
    });
  }, [isRevenue, revenueCategories, accountIdSet, toAccounts]);

  useEffect(() => {
    if (!isExpense) {
      return;
    }

    setServiceItems(prev => {
      if (prev.length === 0) return [createServiceItemDraft(expenseCategories[0]?.id || '')];
      return prev.map(item => ({
        ...item,
        categoryId: expenseCategories.some(category => category.id === item.categoryId)
          ? item.categoryId
          : (expenseCategories[0]?.id || '')
      }));
    });

    setFormData(prev => {
      // Default fromAccountId to 'Cash' if not set and if 'Cash' exists in accounts
      let nextFromAccountId = prev.fromAccountId;
      if (!nextFromAccountId) {
        const cashAccount = fromAccounts.find(a => a.name === 'Cash' || a.id === 'Cash');
        if (cashAccount) {
          nextFromAccountId = cashAccount.id;
        }
      }

      if (
        prev.fromAccountId === nextFromAccountId &&
        prev.toAccountId === ''
      ) {
        return prev;
      }

      return {
        ...prev,
        categoryId: expenseCategories[0]?.id || prev.categoryId,
        fromAccountId: nextFromAccountId,
        toAccountId: ''
      };
    });
  }, [expenseCategories, isExpense, isSplit, fromAccounts]);

  useEffect(() => {
    // Default Split to ON for business operations (Revenue, Expense)
    // Startup (Investment) and Withdrawals (cashing out) default to personal
    if (formData.type === TransactionType.REVENUE || formData.type === TransactionType.EXPENSE) {
      setIsSplit(true);
    } else {
      setIsSplit(false);
      setShowSplitInfo(false);
    }
  }, [formData.type]);

  useEffect(() => {
    if (!onlyRevenueMode) return;

    setFormData((prev) => {
      if (prev.type === TransactionType.REVENUE) return prev;
      return {
        ...prev,
        type: TransactionType.REVENUE,
      };
    });
  }, [onlyRevenueMode]);

  useEffect(() => {
    if (!isSplit) setShowSplitInfo(false);
  }, [isSplit]);

  useEffect(() => {
    if (!isOwnerInvestment && !isOwnerWithdrawal) return;
    const targetCategoryId = isOwnerInvestment ? 'owner_investment' : 'owner_withdrawal';
    setFormData(prev => {
      if (prev.categoryId === targetCategoryId && prev.fromAccountId === '' && prev.toAccountId === '') return prev;
      return { ...prev, categoryId: targetCategoryId, fromAccountId: '', toAccountId: '' };
    });
  }, [isOwnerInvestment, isOwnerWithdrawal]);

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
        const detectedCategoryId = (result.category as string) || (isRevenue ? revenueCategories[0]?.id : expenseCategories[0]?.id) || formData.categoryId;
        setFormData(prev => ({
          ...prev,
          description: result.description || '',
          date: result.date || prev.date,
          categoryId: detectedCategoryId || prev.categoryId
        }));
        setServiceItems(prev => {
          const next = prev.length > 0 ? [...prev] : [createServiceItemDraft(detectedCategoryId)];
          next[0] = {
            ...next[0],
            categoryId: detectedCategoryId,
            price: result.amount?.toString() || next[0].price,
            notes: result.description || next[0].notes,
          };
          return next;
        });
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

  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [pickerTargetItemId, setPickerTargetItemId] = useState<string | null>(null);

  const openPickerForExisting = (serviceItemId: string) => {
    setPickerTargetItemId(serviceItemId);
    setIsServicePickerOpen(true);
  };

  const handleNewCategory = () => {
    const newDraft = createServiceItemDraft('');
    setServiceItems(prev => [...prev, newDraft]);
    setPickerTargetItemId(newDraft.id);
    setIsServicePickerOpen(true);
  };

  const handlePickerSelect = (cat: CategoryItem) => {
    if (!pickerTargetItemId) return;
    updateServiceItem(pickerTargetItemId, { categoryId: cat.id, price: String(cat.price ?? '') });
    setIsServicePickerOpen(false);
    setPickerTargetItemId(null);
  };

  const updateServiceItem = (id: string, patch: Partial<ServiceItemDraft>) => {
    setServiceItems(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const removeServiceItem = (id: string) => {
    setServiceItems(prev => {
      if (prev.length === 1) {
        return [{ ...prev[0], categoryId: '', price: '', notes: '' }];
      }
      return prev.filter(item => item.id !== id);
    });
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

  const validateBeforeSubmit = (): { field: string; message: string } | null => {
    if (isRevenue || isExpense) {
      if (serviceItems.some(item => !item.categoryId.trim() || !Number.isFinite(Number(item.price)) || Number(item.price) <= 0)) {
        return { field: 'serviceItems', message: language === 'zh' ? '每個服務項目都需要分類與大於 0 的金額。' : 'Each service item needs a category and an amount greater than 0.' };
      }
      if (normalizedServiceItems.length === 0 || computedTotalAmount <= 0) {
        return { field: 'serviceItems', message: language === 'zh' ? '請至少新增一個有效服務項目。' : 'Add at least one valid service item.' };
      }
    } else {
      const amount = Number(formData.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { field: 'amount', message: language === 'zh' ? '金額必須大於 0。' : 'Amount must be greater than 0.' };
      }

      if (!formData.categoryId.trim()) {
        return { field: 'categoryId', message: language === 'zh' ? '請輸入分類。' : 'Category is required.' };
      }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.date) || Number.isNaN(new Date(`${formData.date}T00:00:00.000Z`).getTime())) {
      return { field: 'date', message: language === 'zh' ? '日期格式無效，請使用 YYYY-MM-DD。' : 'Invalid date format. Please use YYYY-MM-DD.' };
    }

    if ((isRevenue || isExpense) && !selectedCategory) {
      return { field: 'serviceItems', message: language === 'zh' ? '請選擇有效的服務分類。' : 'Select valid service categories.' };
    }

    if (!isSplit && !formData.contributedBy.trim()) {
      return { field: 'contributedBy', message: language === 'zh' ? '請選擇出資人。' : 'Contributor is required.' };
    }

    if (formData.fromAccountId && !accountIdSet.has(formData.fromAccountId)) {
      return { field: 'fromAccountId', message: language === 'zh' ? '取錢帳戶無效，請重新選擇。' : 'Invalid from account. Please reselect.' };
    }

    if (formData.toAccountId && !accountIdSet.has(formData.toAccountId)) {
      return { field: 'toAccountId', message: language === 'zh' ? '收錢帳戶無效，請重新選擇。' : 'Invalid to account. Please reselect.' };
    }

    if (formData.type === TransactionType.OWNER_INVESTMENT || formData.type === TransactionType.OWNER_WITHDRAWAL) {
      if (!formData.fromAccountId || !formData.toAccountId) {
        return { field: 'general', message: language === 'zh' ? '轉賬必須同時選擇取錢帳戶與收錢帳戶。' : 'Owner transfer requires both from and to accounts.' };
      }
    }

    if (isExpense && !formData.fromAccountId) {
      return { field: 'fromAccountId', message: language === 'zh' ? '支出必須選擇取錢帳戶。' : 'Expense requires a from account.' };
    }

    if (isRevenue) {
      if (!formData.toAccountId) {
        return { field: 'toAccountId', message: language === 'zh' ? '收入必須選擇收錢帳戶。' : 'Revenue requires a to account.' };
      }
    }

    if (formData.contributedBy && !isSplit && !accountIdSet.has(formData.contributedBy)) {
      return { field: 'contributedBy', message: language === 'zh' ? '資金來源賬戶無效，請重新選擇。' : 'Invalid funded-by account. Please reselect.' };
    }

    return null;
  };

  const getFieldClasses = (field: string, baseClasses: string): string => {
    const hasError = validationIssue?.field === field;
    if (!hasError) return baseClasses;
    return `${baseClasses} border-rose-400 ring-2 ring-rose-200 dark:border-rose-500 dark:ring-rose-900/40`;
  };

  const focusValidationField = (field: string) => {
    requestAnimationFrame(() => {
      const selector = `[data-validation-field="${field}"]`;
      const target = document.querySelector(selector) as HTMLElement | null;
      if (!target) return;

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus();
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateBeforeSubmit();
    if (validationError) {
      setValidationIssue(validationError);
      focusValidationField(validationError.field);
      return;
    }
    setValidationIssue(null);

    const baseId = Math.random().toString(36).substr(2, 9);
    const amount = isRevenue || isExpense ? computedTotalAmount : Number(formData.amount);
    const transactionsToAdd: Transaction[] = [];
    const transactionItems = (isRevenue || isExpense)
      ? normalizedServiceItems.map((item, index) => ({
          ...item,
          id: item.id || buildTransactionItemId(baseId, item.categoryId || item.name, index),
          transactionId: baseId,
        }))
      : [{
          id: buildTransactionItemId(baseId, formData.categoryId || 'single', 0),
          transactionId: baseId,
          categoryId: formData.categoryId,
          name: selectedCategory?.name || formData.description.trim() || formData.categoryId,
          price: amount,
          notes: formData.notes.trim() || undefined,
        } satisfies TransactionItem];
    const primaryCategoryId = transactionItems[0]?.categoryId || formData.categoryId;
    const revenueDescription = serviceSummary || selectedCategory?.name || formData.description.trim() || primaryCategoryId;
    const finalTransactionNoteText = addToNotes
      ? (transactionNoteText.trim() || formData.notes.trim())
      : '';
    const resetReceiptNumber = `REC-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;

    const resetForm = () => {
      setFormData(prev => {
        const nextCategoryId = prev.type === TransactionType.REVENUE
          ? (revenueCategories[0]?.id || '')
          : prev.type === TransactionType.EXPENSE
            ? (expenseCategories[0]?.id || prev.categoryId)
            : prev.categoryId;
        const nextDescription = '';

        return {
          ...prev,
          categoryId: nextCategoryId,
          amount: '',
          description: nextDescription,
          isInitialInvestment: false,
          customerId: '',
          fromAccountId: '',
          toAccountId: '',
          fundedBy: 'Bank',
          contributedBy: Owner.OWNER_A,
          notes: '',
          receiptNumber: resetReceiptNumber
        };
      });
      setServiceItems([
        createServiceItemDraft(formData.type === TransactionType.REVENUE ? (revenueCategories[0]?.id || '') : (expenseCategories[0]?.id || ''))
      ]);
      setImageUrl(undefined);
      setTransactionNoteText('');
      setAddToNotes(false);
    };

    if (formData.type === TransactionType.OWNER_INVESTMENT || formData.type === TransactionType.OWNER_WITHDRAWAL) {
      const isInvestment = formData.type === TransactionType.OWNER_INVESTMENT;
      
      // For owner transactions, contributedBy must be the owner account ID
      const ownerAccountId = isInvestment ? formData.fromAccountId : formData.toAccountId;

      transactionsToAdd.push({
        id: baseId,
        type: TransactionType.TRANSFER,
        items: transactionItems,
        fromAccountId: formData.fromAccountId || undefined,
        toAccountId: formData.toAccountId || undefined,
        amount: amount,
        date: formData.date,
        receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
        contributedBy: ownerAccountId || formData.contributedBy,
        description: formData.description || (isInvestment ? 'Owner Investment' : 'Owner Withdrawal'),
        categoryId: primaryCategoryId || (isInvestment ? 'owner_investment' : 'owner_withdrawal'),
        isInitialInvestment: formData.isInitialInvestment,
        notes: formData.notes || '',
        imageUrl: imageUrl
      });
      onAdd(transactionsToAdd, finalTransactionNoteText || undefined);

      resetForm();
      return;
    }

    // Notes are manual user input only.
    let finalNotes = formData.notes || '';

    const { fromAccountId, toAccountId, ...rest } = formData;
    const finalFromAccountId = (formData.type === TransactionType.EXPENSE || formData.type === TransactionType.WITHDRAWAL)
      ? fromAccountId
      : undefined;
    const finalToAccountId = (formData.type === TransactionType.REVENUE || formData.type === TransactionType.STARTUP) ? toAccountId : undefined;
    const expenseDescription = selectedCategory?.name || formData.description.trim() || formData.categoryId;

    if (isSplit) {
      transactionsToAdd.push({
        ...rest,
        items: transactionItems,
        categoryId: primaryCategoryId,
        fromAccountId: isRevenue ? undefined : finalFromAccountId,
        toAccountId: isRevenue ? (formData.toAccountId || undefined) : finalToAccountId,
        notes: finalNotes,
        id: baseId,
        amount: amount,
        date: formData.date || new Date().toISOString().substring(0, 10),
        contributedBy: SPLIT_CONTRIBUTOR_LABEL,
        description: isRevenue ? revenueDescription : (isExpense ? expenseDescription : formData.description),
        imageUrl: imageUrl,
        splitMode: 'EQUAL',
        splitRatioA: 0.5,
        splitRatioB: 0.5,
      });
      onAdd(transactionsToAdd, finalTransactionNoteText || undefined);
    } else {
      transactionsToAdd.push({
        ...rest,
        items: transactionItems,
        categoryId: primaryCategoryId,
        fromAccountId: isRevenue ? undefined : finalFromAccountId,
        toAccountId: isRevenue ? (formData.toAccountId || undefined) : finalToAccountId,
        id: baseId,
        notes: finalNotes,
        amount: amount,
        date: formData.date || new Date().toISOString().substring(0, 10),
        description: isRevenue ? revenueDescription : (isExpense ? expenseDescription : formData.description),
        contributedBy: formData.contributedBy,
        imageUrl: imageUrl
      });
      onAdd(transactionsToAdd, finalTransactionNoteText || undefined);
    }

    resetForm();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {isReadOnly && (
        <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/20 rounded-2xl p-4 flex items-center gap-3 text-rose-600 dark:text-rose-400">
          <i className="fas fa-lock text-sm"></i>
          <span className="text-xs font-bold uppercase tracking-widest">
            {language === 'zh' ? '連接不穩定，目前處於唯讀模式。' : 'Network unstable. Read-only mode.'}
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

        <form onSubmit={handleSubmit} className="space-y-7">
          {validationIssue && (
            <div data-validation-field="general" tabIndex={-1} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
              {validationIssue.message}
            </div>
          )}

          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-6 space-y-5 dark:border-white/10 dark:bg-slate-900/40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center dark:bg-blue-900/20 dark:text-blue-400">
                <i className="fas fa-pen text-xs"></i>
              </div>
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                  {language === 'zh' ? '基本資料' : 'Basic Details'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                  {language === 'zh' ? '先選類型與客戶，建立記錄基礎' : 'Start with type and customer context'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="h-7 mb-2 flex items-center">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{t.type}</label>
              </div>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as TransactionType})} disabled={onlyRevenueMode} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:bg-slate-800 dark:border-white/5 dark:text-white disabled:opacity-60">
                <option value={TransactionType.REVENUE}>{t.revenue}</option>
                {!onlyRevenueMode && <option value={TransactionType.EXPENSE}>{t.expense}</option>}
              </select>
            </div>
            <div>
              <div className="h-7 mb-2 flex items-center">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{language === 'zh' ? '關聯客戶' : 'Customer'}</label>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomerPickerOpen(true)}
                disabled={isOwnerInvestment || isOwnerWithdrawal || isReadOnly}
                className={`w-full rounded-2xl bg-slate-100 dark:bg-white/10 px-4 py-4 text-left flex items-center gap-3 border border-slate-200 dark:border-white/10 ${isOwnerInvestment || isOwnerWithdrawal || isReadOnly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-200/70 dark:hover:bg-white/15'}`}
              >
                <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-500">
                  <i className="fas fa-user-plus text-sm"></i>
                </div>
                <span className="flex-1 font-semibold text-slate-600 dark:text-slate-300 text-base">
                  {selectedCustomer ? selectedCustomer.name : (language === 'zh' ? '添加客戶' : 'Add a customer')}
                </span>
                <i className="fas fa-chevron-right text-slate-400 text-sm"></i>
              </button>
            </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-6 space-y-5 dark:border-white/10 dark:bg-slate-900/40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center dark:bg-emerald-900/20 dark:text-emerald-400">
                <i className="fas fa-layer-group text-xs"></i>
              </div>
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                  {isRevenue || isExpense
                    ? (language === 'zh' ? '賬戶與日期' : 'Accounts & Date')
                    : (language === 'zh' ? '賬戶與分類' : 'Accounts & Category')}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                  {isRevenue || isExpense
                    ? (language === 'zh' ? '設定資金流向，分類與金額將由服務項目自動計算' : 'Set account flow while category and amount are calculated from service items')
                    : (language === 'zh' ? '設定資金流向、分類、金額與日期' : 'Set account flow, category, amount, and date')}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {showFromAccountField && (
              <div>
              <div className="h-7 mb-2 flex items-center">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">
                  {formData.type === TransactionType.OWNER_INVESTMENT 
                    ? (language === 'zh' ? '取錢帳戶 (業主)' : 'Who paid for it out of pocket?')
                    : (language === 'zh' ? '取錢帳戶' : 'Who paid for it out of pocket?')}
                </label>
              </div>
              <select 
                value={formData.fromAccountId} 
                onChange={e => setFormData({...formData, fromAccountId: e.target.value, ...(isOwnerInvestment ? { contributedBy: e.target.value } : {})})} 
                data-validation-field="fromAccountId"
                className={getFieldClasses('fromAccountId', 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:bg-slate-800 dark:border-white/5 dark:text-white')}
              >
                <option value="">{language === 'zh' ? '選擇賬戶' : 'Select Account'}</option>
                {fromAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.id} - {a.name} ({String(a.type || '').replace('_', ' ') || 'other'})
                  </option>
                ))}
              </select>
              {validationIssue?.field === 'fromAccountId' && (
                <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
              )}
              </div>
              )}
              {showToAccountField && (
              <div>
              <div className="h-7 mb-2 flex items-center">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">
                  {formData.type === TransactionType.OWNER_WITHDRAWAL
                    ? (language === 'zh' ? '入賬賬戶 (業主)' : 'To Account (Owner)')
                    : (language === 'zh' ? '入賬賬戶' : 'To Account')}
                </label>
              </div>
              <select 
                value={formData.toAccountId} 
                onChange={e => setFormData({...formData, toAccountId: e.target.value, ...(isOwnerWithdrawal ? { contributedBy: e.target.value } : {})})} 
                data-validation-field="toAccountId"
                className={getFieldClasses('toAccountId', 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:bg-slate-800 dark:border-white/5 dark:text-white')}
              >
                <option value="">{language === 'zh' ? '選擇賬戶' : 'Select Account'}</option>
                  {toAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.id} - {a.name} ({String(a.type || '').replace('_', ' ') || 'other'})
                  </option>
                ))}
              </select>
              {validationIssue?.field === 'toAccountId' && (
                <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
              )}
              </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {showFundedByAccountField && (
              <div>
              <div className="h-7 mb-2 flex items-center">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{language === 'zh' ? '資金來源 (contributed_by)' : 'Funded By (contributed_by)'}</label>
              </div>
              <select
                value={formData.contributedBy}
                onChange={e => setFormData({...formData, contributedBy: e.target.value})}
                data-validation-field="contributedBy"
                className={getFieldClasses('contributedBy', 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:bg-slate-800 dark:border-white/5 dark:text-white')}
              >
                <option value="">{language === 'zh' ? '選擇賬戶 ID' : 'Select Account ID'}</option>
                {normalizedAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.id}</option>
                ))}
              </select>
              {validationIssue?.field === 'contributedBy' && (
                <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
              )}
              </div>
              )}
              {/* Revenue and expense categories are driven by service items only. */}
              {!(isRevenue || isExpense) && (
                <div className={showFundedByAccountField ? '' : 'md:col-span-2'}>
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
                    {isExpense ? (
                      <select
                        value={formData.categoryId}
                        onChange={e => {
                          const nextCategoryId = e.target.value;
                          setFormData({
                            ...formData,
                            categoryId: nextCategoryId,
                          });
                        }}
                        data-validation-field="categoryId"
                        className={getFieldClasses('categoryId', 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:bg-slate-800 dark:border-white/5 dark:text-white')}
                      >
                        <option value="">{language === 'zh' ? '選擇支出分類' : 'Select expense category'}</option>
                        {filteredCategories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input 
                          list="category-suggestions"
                          value={formData.categoryId} 
                          onChange={e => setFormData({...formData, categoryId: e.target.value})} 
                          data-validation-field="categoryId"
                          disabled={isOwnerInvestment || isOwnerWithdrawal}
                          className={getFieldClasses('categoryId', 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white')}
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
                      </>
                    )}
                  </div>
                  {validationIssue?.field === 'categoryId' && (
                    <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Revenue and expense totals are calculated from service items. */}
              {!(isRevenue || isExpense) && (
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
                      data-validation-field="amount"
                      className={getFieldClasses('amount', 'w-full bg-slate-50 border border-slate-200 rounded-2xl pl-8 pr-16 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white')}
                      placeholder="0.00"
                    />
                  </div>
                  {validationIssue?.field === 'amount' && (
                    <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
                  )}
                </div>
              )}
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
                <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} data-validation-field="date" className={getFieldClasses('date', 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white')} />
                {validationIssue?.field === 'date' && (
                  <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-6 space-y-5 dark:border-white/10 dark:bg-slate-900/40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center dark:bg-violet-900/20 dark:text-violet-400">
                <i className="fas fa-users text-xs"></i>
              </div>
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                  {language === 'zh' ? '分攤與歸屬' : 'Add this to whose bill?'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                  {language === 'zh' ? '選擇是否平分與歸屬到個人' : 'Control split mode and owner assignment'}
                </p>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
              <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{t.contributedBy}</label>
              <div className="flex flex-col gap-2">
                {!(isOwnerInvestment || isOwnerWithdrawal) && (
                  <div className="flex items-center gap-3 justify-end">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tight">{t.split5050}</span>
                    <input 
                      type="checkbox" 
                      checked={isSplit} 
                      onChange={() => setIsSplit(!isSplit)}
                      className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                    />
                    {isSplit && (
                      <button
                        type="button"
                        onClick={() => setShowSplitInfo(!showSplitInfo)}
                        className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-900/30"
                        aria-label={language === 'zh' ? '顯示分攤說明' : 'Show split info'}
                        title={language === 'zh' ? '顯示分攤說明' : 'Show split info'}
                      >
                        <i className="fas fa-info text-[9px]"></i>
                      </button>
                    )}
                  </div>
                )}
                {(formData.type === TransactionType.EXPENSE || formData.type === TransactionType.OWNER_INVESTMENT) && (
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
            
            {showSplitInfo && isSplit && !(isOwnerInvestment || isOwnerWithdrawal) && (
              <div className="bg-blue-50 border border-blue-100 px-4 py-3 rounded-2xl dark:bg-blue-900/10 dark:border-blue-900/30">
                <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 leading-relaxed">
                  {language === 'zh'
                    ? '已啟用平分：本筆交易會保存為單一記錄，並以 50/50 權益比例分配給 User 1 與 User 2。'
                    : 'Split is enabled: this transaction will be saved as one shared record with a 50/50 ownership split for User 1 and User 2.'}
                </p>
              </div>
            )}

            {(isOwnerInvestment || isOwnerWithdrawal) ? (
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl dark:bg-slate-800 dark:border-white/5">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest dark:text-slate-400">
                  {language === 'zh' ? `自動設定: ${formData.contributedBy || '(請先選擇出賬賬戶)'}` : `Auto-assigned: ${formData.contributedBy || '(Select from account first)'}`}
                </p>
              </div>
            ) : !isSplit ? (
              <div className="flex gap-4 mt-1">
                <button type="button" onClick={() => setFormData({...formData, contributedBy: Owner.OWNER_A})} data-validation-field="contributedBy" className={`flex-1 py-3.5 rounded-2xl text-sm font-black uppercase tracking-wider transition-all shadow-sm border ${formData.contributedBy === Owner.OWNER_A ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'} ${validationIssue?.field === 'contributedBy' ? 'border-rose-400 ring-2 ring-rose-200 dark:border-rose-500 dark:ring-rose-900/40' : ''}`}>User 1</button>
                <button type="button" onClick={() => setFormData({...formData, contributedBy: Owner.OWNER_B})} className={`flex-1 py-3.5 rounded-2xl text-sm font-black uppercase tracking-wider transition-all shadow-sm border ${formData.contributedBy === Owner.OWNER_B ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'} ${validationIssue?.field === 'contributedBy' ? 'border-rose-400 ring-2 ring-rose-200 dark:border-rose-500 dark:ring-rose-900/40' : ''}`}>User 2</button>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-center dark:bg-blue-900/10 dark:border-blue-900/20"><p className="text-[10px] font-black text-blue-600 uppercase tracking-widest dark:text-blue-400">{t.splitNote}</p></div>
            )}
            {validationIssue?.field === 'contributedBy' && (
              <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
            )}
          </div>

            {(isRevenue || isExpense) && (
              <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{language === 'zh' ? '服務項目' : 'Service Items'}</p>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1">{language === 'zh' ? '一筆交易可包含多個服務。' : 'A single visit can contain multiple services.'}</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleNewCategory} 
                    className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all dark:bg-blue-900/20 dark:text-blue-400"
                  >
                    {language === 'zh' ? '新增服務' : 'Add Service'}
                  </button>
                </div>
                {serviceItems.map((item, index) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-800/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">{language === 'zh' ? `服務 ${index + 1}` : `Item ${index + 1}`}</p>
                      <button
                        type="button"
                        onClick={() => removeServiceItem(item.id)}
                        className="text-[10px] font-black uppercase tracking-widest text-rose-500"
                      >
                        {t.delete}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[1.7fr_1fr] gap-3">
                      <button
                        type="button"
                        data-validation-field="serviceItems"
                        onClick={() => openPickerForExisting(item.id)}
                        className={getFieldClasses('serviceItems', 'w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 text-left flex items-center justify-between hover:border-blue-300 transition-all dark:bg-slate-900 dark:border-white/10 dark:text-white')}
                      >
                        <span className={item.categoryId ? '' : 'text-slate-400 dark:text-slate-500'}>
                          {item.categoryId
                            ? (filteredCategories.find(c => c.id === item.categoryId)?.name ?? item.categoryId)
                            : (isRevenue ? (language === 'zh' ? '選擇服務項目' : 'Select service') : (language === 'zh' ? '選擇支出分類' : 'Select expense category'))}
                        </span>
                        <i className="fas fa-chevron-right text-slate-300 dark:text-slate-600 text-xs"></i>
                      </button>
                      <div className="relative">
                        <span className="absolute left-4 top-3.5 text-slate-400 dark:text-slate-500 font-bold">¥</span>
                        <input
                          type="number"
                          value={item.price}
                          onChange={e => updateServiceItem(item.id, { price: e.target.value })}
                          className={getFieldClasses('serviceItems', 'w-full bg-white border border-slate-200 rounded-2xl pl-8 pr-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-900 dark:border-white/10 dark:text-white')}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={item.notes}
                      onChange={e => updateServiceItem(item.id, { notes: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-900 dark:border-white/10 dark:text-white"
                      placeholder={language === 'zh' ? '單項服務備註（可選）' : 'Optional notes for this service'}
                    />
                  </div>
                ))}
                {validationIssue?.field === 'serviceItems' && (
                  <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
                )}
                {isServicePickerOpen && (
                  <ServiceItemPicker
                    categories={filteredCategories}
                    language={language}
                    onSelect={handlePickerSelect}
                    onClose={() => { setIsServicePickerOpen(false); setPickerTargetItemId(null); }}
                  />
                )}
                <div className="rounded-2xl bg-slate-100 dark:bg-white/5 px-4 py-3 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">{language === 'zh' ? '合計' : 'Total'}</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">¥{computedTotalAmount.toLocaleString()}</span>
                </div>
              </div>
            )}

            {!(isRevenue || isExpense) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100 dark:border-white/10">
                <div>
                  <div className="flex justify-between items-center h-7 mb-2">
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{t.category}</label>
                  </div>
                  <input 
                    list="category-suggestions"
                    value={formData.categoryId} 
                    onChange={e => setFormData({...formData, categoryId: e.target.value})} 
                    data-validation-field="categoryId"
                    disabled={isOwnerInvestment || isOwnerWithdrawal}
                    className={getFieldClasses('categoryId', 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white')}
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
                  {validationIssue?.field === 'categoryId' && (
                    <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
                  )}
                </div>
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
                      data-validation-field="amount"
                      className={getFieldClasses('amount', 'w-full bg-slate-50 border border-slate-200 rounded-2xl pl-8 pr-16 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white')}
                      placeholder="0.00"
                    />
                  </div>
                  {validationIssue?.field === 'amount' && (
                    <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} data-validation-field="date" className={getFieldClasses('date', 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white')} />
              {validationIssue?.field === 'date' && (
                <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">{validationIssue.message}</p>
              )}
              </div>
              {(isRevenue || isExpense) && (
                <div>
                  <div className="flex justify-between items-center h-7 mb-2">
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{language === 'zh' ? '摘要' : 'Summary'}</label>
                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400">{getAmountUnit(computedTotalAmount)}</span>
                  </div>
                  <div className="w-full min-h-[52px] bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 dark:bg-slate-800 dark:border-white/5 dark:text-white flex items-center">
                    {serviceSummary || (language === 'zh' ? '請新增服務項目' : 'Add service items')}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-6 space-y-5 dark:border-white/10 dark:bg-slate-900/40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center dark:bg-amber-900/20 dark:text-amber-400">
                <i className="fas fa-paperclip text-xs"></i>
              </div>
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                  {language === 'zh' ? '附件與備註' : 'Attachments & Notes'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                  {language === 'zh' ? '上傳圖片並補充文字說明' : 'Attach receipt images and add notes'}
                </p>
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

            <div className="grid grid-cols-1 gap-6">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 dark:border-white/10">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">
                  {language === 'zh' ? '加入備註？' : 'Add to notes?'}
                </label>
                <input
                  type="checkbox"
                  checked={addToNotes}
                  onChange={e => setAddToNotes(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest mb-2">{language === 'zh' ? 'Note (備註)' : 'Note'}</label>
                <textarea
                  rows={3} value={formData.notes || ''}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                  placeholder={language === 'zh' ? '自由輸入備註...' : 'Enter note freely...'}
                />
              </div>
              {addToNotes && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest mb-2">{language === 'zh' ? 'Transaction Notes (自由輸入)' : 'Transaction Notes'}</label>
                  <textarea
                    rows={4} value={transactionNoteText}
                    onChange={e => setTransactionNoteText(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                    placeholder={language === 'zh' ? '手動輸入備註，不會自動帶入分類...' : 'Enter notes manually. This will not auto-copy category...'}
                  />
                </div>
              )}
            </div>
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

      {isCustomerPickerOpen && (
        <div className="fixed inset-0 z-[220] bg-slate-900/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-4 md:p-5 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsCustomerPickerOpen(false)}
                className="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-100"
              >
                <i className="fas fa-arrow-left"></i>
              </button>

              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                {language === 'zh' ? '客戶' : 'Customers'}
              </h3>

              <button
                type="button"
                onClick={() => {
                  setFormData({ ...formData, customerId: '' });
                  setIsCustomerPickerOpen(false);
                }}
                className="px-3 h-10 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest"
              >
                {language === 'zh' ? '清除' : 'Clear'}
              </button>
            </div>

            <div className="mt-4 relative">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
              <input
                value={customerSearch}
                onChange={event => setCustomerSearch(event.target.value)}
                placeholder={language === 'zh' ? '搜尋客戶' : 'Search customers'}
                className="w-full pl-12 pr-4 py-3 rounded-full border-2 border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-white/5 text-base font-semibold outline-none"
              />
            </div>

            <div className="mt-4 overflow-y-auto pr-1 flex-1 space-y-1">
              <p className="text-slate-500 dark:text-slate-400 font-semibold text-xs uppercase tracking-widest py-2">{language === 'zh' ? '客戶列表' : 'Customers'}</p>
              {filteredCustomers.map(customer => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, customerId: customer.id });
                    setIsCustomerPickerOpen(false);
                  }}
                  className={`w-full border-b px-1 py-4 text-left flex items-center gap-3 ${formData.customerId === customer.id ? 'border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5' : 'border-slate-200 dark:border-white/5'}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center font-black text-slate-600 dark:text-slate-200 flex-shrink-0">{customer.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white text-base leading-tight">{customer.name}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">{customer.phone || ''}</div>
                  </div>
                </button>
              ))}
              {filteredCustomers.length === 0 && (
                <div className="py-8 text-center text-sm font-bold text-slate-400">
                  {language === 'zh' ? '沒有找到客戶' : 'No customers found'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionForm;
