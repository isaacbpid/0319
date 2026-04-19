import React, { useMemo, useState } from 'react';
import { CategoryItem, DiscountItem, TransactionType } from '../types';
import { reserveNextCategoryId } from '../services/database';

interface CategoriesPageProps {
  language: 'zh' | 'en';
  categories: CategoryItem[];
  discounts: DiscountItem[];
  onSaveCategories: (cats: CategoryItem[]) => Promise<void>;
  onSaveDiscounts: (items: DiscountItem[]) => Promise<void>;
  isReadOnly?: boolean;
}

type CategorySection = 'all-items' | 'all-expenses' | 'all-groups' | 'discounts';

type ManagedSection = 'all-items' | 'all-expenses' | 'all-groups';

const sectionMeta: Record<ManagedSection, { listTitle: string; singularTitle: string; categoryType: TransactionType; sequencePrefix: 'rev' | 'exp' }> = {
  'all-items': {
    listTitle: 'All Items',
    singularTitle: 'Item',
    categoryType: TransactionType.REVENUE,
    sequencePrefix: 'rev',
  },
  'all-expenses': {
    listTitle: 'All Expenses',
    singularTitle: 'Expense',
    categoryType: TransactionType.EXPENSE,
    sequencePrefix: 'exp',
  },
  'all-groups': {
    listTitle: 'All Groups',
    singularTitle: 'Group',
    categoryType: TransactionType.STARTUP,
    sequencePrefix: 'rev',
  },
};

const CategoriesPage: React.FC<CategoriesPageProps> = ({ language, categories, discounts, onSaveCategories, onSaveDiscounts, isReadOnly }) => {
  const [selectedSection, setSelectedSection] = useState<CategorySection | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [searchText, setSearchText] = useState('');
  const [isDiscountFormOpen, setIsDiscountFormOpen] = useState(false);
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [discountSearchText, setDiscountSearchText] = useState('');
  const [discountName, setDiscountName] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [discountEffectType, setDiscountEffectType] = useState<'discount' | 'surcharge'>('discount');
  const [discountAmountType, setDiscountAmountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountAmount, setDiscountAmount] = useState('');
  const [isDiscountTypePickerOpen, setIsDiscountTypePickerOpen] = useState(false);

  const sections: Array<{ id: CategorySection; label: string }> = [
    { id: 'all-items', label: language === 'zh' ? 'All Items' : 'All Items' },
    { id: 'all-expenses', label: language === 'zh' ? 'All Expenses' : 'All Expenses' },
    { id: 'all-groups', label: language === 'zh' ? 'All Groups' : 'All Groups' },
    { id: 'discounts', label: language === 'zh' ? 'Discounts' : 'Discounts' },
  ];

  const selectedLabel = sections.find(section => section.id === selectedSection)?.label || '';

  const activeManagedSection: ManagedSection | null = selectedSection && selectedSection !== 'discounts' ? selectedSection : null;
  const activeMeta = activeManagedSection ? sectionMeta[activeManagedSection] : null;

  const sectionItems = useMemo(() => {
    if (!activeMeta) return [];

    const normalizedSearch = searchText.trim().toLowerCase();
    return categories
      .filter(category => category.type === activeMeta.categoryType)
      .filter(category => {
        if (!normalizedSearch) return true;
        return category.name.toLowerCase().includes(normalizedSearch) || (category.description || '').toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activeMeta, categories, searchText]);

  const filteredDiscounts = useMemo(() => {
    const normalizedSearch = discountSearchText.trim().toLowerCase();
    return discounts
      .filter(discount => {
        if (!normalizedSearch) return true;
        return discount.name.toLowerCase().includes(normalizedSearch)
          || (discount.code || '').toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [discounts, discountSearchText]);

  const getNextCategoryIdLocal = (prefix: 'rev' | 'exp'): string => {
    const storageKey = `gardiner_category_seq_${prefix}`;
    const maxExisting = categories
      .map(category => {
        const match = category.id.match(new RegExp(`^${prefix}-(\\d+)$`));
        return match ? Number(match[1]) : 0;
      })
      .reduce((max, value) => Math.max(max, value), 0);

    const storedValue = Number(localStorage.getItem(storageKey) || '0');
    const nextValue = Math.max(maxExisting, Number.isFinite(storedValue) ? storedValue : 0) + 1;
    localStorage.setItem(storageKey, String(nextValue));
    return `${prefix}-${nextValue}`;
  };

  const getNextCategoryId = async (prefix: 'rev' | 'exp'): Promise<string> => {
    const reserved = await reserveNextCategoryId(prefix);
    if (reserved.id) {
      const match = reserved.id.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (match) {
        localStorage.setItem(`gardiner_category_seq_${prefix}`, match[1]);
      }
      return reserved.id;
    }
    return getNextCategoryIdLocal(prefix);
  };

  const resetCreateForm = () => {
    setItemName('');
    setItemDescription('');
    setItemPrice('');
    setSearchText('');
    setEditingItemId(null);
    setIsCreateOpen(false);
  };

  const resetDiscountForm = () => {
    setEditingDiscountId(null);
    setDiscountName('');
    setDiscountCode('');
    setDiscountEffectType('discount');
    setDiscountAmountType('fixed');
    setDiscountAmount('');
    setIsDiscountTypePickerOpen(false);
    setIsDiscountFormOpen(false);
  };

  const openCreateForm = () => {
    if (!activeMeta) return;
    setEditingItemId(null);
    setItemName('');
    setItemDescription('');
    setItemPrice('');
    setIsCreateOpen(true);
  };

  const openEditForm = (item: CategoryItem) => {
    if (isReadOnly) return;
    setEditingItemId(item.id);
    setItemName(item.name || '');
    setItemDescription(item.description || '');
    setItemPrice(Number.isFinite(item.price as number) ? String(item.price) : '');
    setIsCreateOpen(true);
  };

  const handleSaveItem = async () => {
    const trimmedName = itemName.trim();
    if (!trimmedName || isReadOnly || isSaving || !activeMeta) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const parsedPrice = Number(itemPrice);
      if (editingItemId) {
        const updatedCategories = categories.map(category => {
          if (category.id !== editingItemId) return category;
          return {
            ...category,
            name: trimmedName,
            description: itemDescription.trim(),
            price: Number.isFinite(parsedPrice) ? Math.max(0, parsedPrice) : 0,
            updatedAt: now,
          };
        });
        await onSaveCategories(updatedCategories);
      } else {
        const id = await getNextCategoryId(activeMeta.sequencePrefix);
        const newItem: CategoryItem = {
          id,
          name: trimmedName,
          type: activeMeta.categoryType,
          createdAt: now,
          updatedAt: now,
          description: itemDescription.trim(),
          price: Number.isFinite(parsedPrice) ? Math.max(0, parsedPrice) : 0,
        };
        await onSaveCategories([newItem, ...categories]);
      }

      resetCreateForm();
    } finally {
      setIsSaving(false);
    }
  };

  const openCreateDiscountForm = () => {
    if (isReadOnly) return;
    setEditingDiscountId(null);
    setDiscountName('');
    setDiscountCode('');
    setDiscountEffectType('discount');
    setDiscountAmountType('fixed');
    setDiscountAmount('');
    setIsDiscountFormOpen(true);
  };

  const openEditDiscountForm = (discount: DiscountItem) => {
    if (isReadOnly) return;
    setEditingDiscountId(discount.id);
    setDiscountName(discount.name || '');
    setDiscountCode(discount.code || '');
    setDiscountEffectType(discount.effectType === 'surcharge' ? 'surcharge' : 'discount');
    setDiscountAmountType(discount.amountType || 'fixed');
    setDiscountAmount(Number.isFinite(discount.amount) ? String(discount.amount) : '');
    setIsDiscountFormOpen(true);
  };

  const handleSaveDiscount = async () => {
    const trimmedName = discountName.trim();
    if (!trimmedName || isReadOnly || isSaving) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const parsedAmount = Number(discountAmount);
      const safeAmount = Number.isFinite(parsedAmount) ? Math.max(0, parsedAmount) : 0;

      if (editingDiscountId) {
        const updated = discounts.map(discount => {
          if (discount.id !== editingDiscountId) return discount;
          return {
            ...discount,
            name: trimmedName,
            code: discountCode.trim().toUpperCase() || undefined,
            effectType: discountEffectType,
            amountType: discountAmountType,
            amount: safeAmount,
            updatedAt: now,
          };
        });
        await onSaveDiscounts(updated);
      } else {
        const newDiscount: DiscountItem = {
          id: `dsc-${Date.now()}`,
          name: trimmedName,
          code: discountCode.trim().toUpperCase() || undefined,
          effectType: discountEffectType,
          amountType: discountAmountType,
          amount: safeAmount,
          category: 'general',
          createdAt: now,
          updatedAt: now,
        };
        await onSaveDiscounts([newDiscount, ...discounts]);
      }

      resetDiscountForm();
    } finally {
      setIsSaving(false);
    }
  };

  if (activeManagedSection && activeMeta && isCreateOpen) {
    return (
      <div className="md:max-w-2xl md:mx-auto min-h-[70vh] bg-slate-100 dark:bg-slate-900 rounded-3xl overflow-hidden">
        <div className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 px-4 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <button
            onClick={resetCreateForm}
            className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {editingItemId
              ? (language === 'zh' ? `Edit ${activeMeta.singularTitle}` : `Edit ${activeMeta.singularTitle}`)
              : (language === 'zh' ? `Create ${activeMeta.singularTitle}` : `Create ${activeMeta.singularTitle}`)}
          </h2>
          <button
            onClick={handleSaveItem}
            disabled={!itemName.trim() || isSaving || isReadOnly}
            className="px-6 h-11 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-300 disabled:opacity-60 disabled:cursor-not-allowed font-black text-xl"
          >
            {language === 'zh' ? 'Save' : 'Save'}
          </button>
        </div>

        <div className="p-4 space-y-7">
          <section className="space-y-3">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {language === 'zh' ? 'Details' : 'Details'}
            </h3>
            <input
              type="text"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              placeholder={language === 'zh' ? 'Name' : 'Name'}
              className="w-full px-4 py-4 rounded-2xl border-2 border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-slate-800 text-lg text-slate-900 dark:text-white outline-none"
            />
            <textarea
              value={itemDescription}
              onChange={e => setItemDescription(e.target.value)}
              placeholder={language === 'zh' ? 'Description' : 'Description'}
              rows={5}
              className="w-full px-4 py-4 rounded-2xl border-2 border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-slate-800 text-lg text-slate-900 dark:text-white outline-none resize-none"
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {language === 'zh' ? 'Price' : 'Price'}
            </h3>
            <input
              type="number"
              min="0"
              step="0.01"
              value={itemPrice}
              onChange={e => setItemPrice(e.target.value)}
              placeholder={language === 'zh' ? 'Price' : 'Price'}
              className="w-full px-4 py-4 rounded-2xl border-2 border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-slate-800 text-lg text-slate-900 dark:text-white outline-none"
            />
          </section>

          <section className="pt-2 pb-10 border-t border-slate-200 dark:border-white/10">
            <div className="pt-5">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                {language === 'zh' ? 'Grouping' : 'Grouping'}
              </h3>
              <p className="text-base font-semibold text-slate-500 dark:text-slate-400 mt-1">
                {language === 'zh' ? `Saved under ${activeMeta.listTitle}` : `Saved under ${activeMeta.listTitle}`}
              </p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (selectedSection === 'discounts' && isDiscountFormOpen) {
    return (
      <div className="md:max-w-2xl md:mx-auto min-h-[70vh] bg-slate-100 dark:bg-slate-900 rounded-3xl overflow-hidden">
        <div className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 px-4 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <button
            onClick={resetDiscountForm}
            className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {language === 'zh'
              ? (editingDiscountId ? 'Edit discount' : 'Create discount')
              : (editingDiscountId ? 'Edit discount' : 'Create discount')}
          </h2>
          <button
            onClick={handleSaveDiscount}
            disabled={!discountName.trim() || isSaving || isReadOnly}
            className="px-6 h-11 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-300 disabled:opacity-60 disabled:cursor-not-allowed font-black text-xl"
          >
            {language === 'zh' ? 'Save' : 'Save'}
          </button>
        </div>

        <div className="p-4 space-y-6">
          <h3 className="text-5xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Create discount</h3>

          <input
            type="text"
            value={discountName}
            onChange={e => setDiscountName(e.target.value)}
            placeholder={language === 'zh' ? 'Discount name' : 'Discount name'}
            className="w-full px-4 py-4 rounded-2xl border-2 border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-slate-800 text-lg text-slate-900 dark:text-white outline-none"
          />

          <input
            type="text"
            value={discountCode}
            onChange={e => setDiscountCode(e.target.value.toUpperCase())}
            placeholder={language === 'zh' ? 'Code (e.g. LARGE_CAR)' : 'Code (e.g. LARGE_CAR)'}
            className="w-full px-4 py-4 rounded-2xl border-2 border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-slate-800 text-lg text-slate-900 dark:text-white outline-none"
          />

          <select
            value={discountEffectType}
            onChange={e => setDiscountEffectType(e.target.value as 'discount' | 'surcharge')}
            className="w-full px-4 py-4 rounded-2xl border-2 border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-slate-800 text-lg text-slate-900 dark:text-white outline-none"
          >
            <option value="discount">{language === 'zh' ? 'Discount (減項)' : 'Discount'}</option>
            <option value="surcharge">{language === 'zh' ? 'Surcharge (加項)' : 'Surcharge'}</option>
          </select>

          <button
            onClick={() => setIsDiscountTypePickerOpen(true)}
            className="w-full px-4 py-4 rounded-2xl border-2 border-slate-900 dark:border-white text-left bg-slate-100 dark:bg-slate-800"
          >
            <p className="text-xl font-black text-slate-900 dark:text-white">Amount type</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-2xl font-semibold text-slate-900 dark:text-white">{discountAmountType === 'fixed' ? 'Amount ($)' : 'Amount (%)'}</p>
              <i className="fas fa-chevron-up text-slate-600 dark:text-slate-300"></i>
            </div>
          </button>

          <input
            type="number"
            min="0"
            step="0.01"
            value={discountAmount}
            onChange={e => setDiscountAmount(e.target.value)}
            placeholder={language === 'zh' ? 'Amount' : 'Amount'}
            className="w-full px-4 py-4 rounded-2xl border-2 border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-slate-800 text-lg text-slate-900 dark:text-white outline-none"
          />

          <div className="pt-6 border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
            <p className="text-2xl font-black text-slate-900 dark:text-white">Advanced settings</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white underline">Display settings</p>
          </div>
        </div>

        {isDiscountTypePickerOpen && (
          <div className="fixed inset-0 z-[300] bg-black/45 flex items-end" onClick={() => setIsDiscountTypePickerOpen(false)}>
            <div className="w-full bg-white dark:bg-slate-900 rounded-t-3xl px-5 py-6" onClick={e => e.stopPropagation()}>
              <h4 className="text-4xl md:text-2xl font-black text-slate-900 dark:text-white mb-6">Amount type</h4>
              <button
                onClick={() => {
                  setDiscountAmountType('fixed');
                  setIsDiscountTypePickerOpen(false);
                }}
                className="w-full text-left py-5 border-b border-slate-200 dark:border-white/10 text-2xl md:text-xl font-bold text-slate-900 dark:text-white"
              >
                Amount ($)
              </button>
              <button
                onClick={() => {
                  setDiscountAmountType('percent');
                  setIsDiscountTypePickerOpen(false);
                }}
                className="w-full text-left py-5 text-2xl md:text-xl font-bold text-slate-900 dark:text-white"
              >
                Amount (%)
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (selectedSection === 'discounts') {
    return (
      <div className="md:max-w-2xl md:mx-auto min-h-[70vh] bg-slate-100 dark:bg-slate-900 rounded-3xl overflow-hidden">
        <div className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 px-4 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <button
            onClick={() => setSelectedSection(null)}
            className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-300"
          >
            <i className="fas fa-arrow-left text-xl"></i>
          </button>
          <h2 className="text-2xl font-black text-slate-700 dark:text-slate-300">Discounts</h2>
          <div className="w-11" />
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-white/10">
          <div className="relative">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-500 dark:text-slate-400"></i>
            <input
              type="text"
              value={discountSearchText}
              onChange={e => setDiscountSearchText(e.target.value)}
              placeholder={language === 'zh' ? 'Search discounts' : 'Search discounts'}
              className="w-full pl-14 pr-4 py-3 rounded-2xl border border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-slate-800 text-lg text-slate-800 dark:text-white outline-none"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-300 dark:divide-white/10">
          {filteredDiscounts.map(discount => (
            <button
              key={discount.id}
              onClick={() => openEditDiscountForm(discount)}
              disabled={isReadOnly}
              className="w-full flex items-center text-left disabled:opacity-60"
            >
              <div className="w-20 py-5 bg-slate-600 dark:bg-slate-700 flex items-center justify-center">
                <i className="fas fa-tags text-white text-xl"></i>
              </div>
              <div className="flex-1 flex items-center justify-between px-4 py-5">
                <div className="min-w-0 pr-3">
                  <p className="text-xl font-black text-slate-700 dark:text-slate-200 truncate">{discount.name}</p>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate">{discount.code || '-'} • {(discount.effectType === 'surcharge' ? 'surcharge' : 'discount')}</p>
                </div>
                <p className="text-xl font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {(discount.effectType === 'surcharge' ? '+' : '-') + (discount.amountType === 'fixed' ? `$${discount.amount.toFixed(2)}` : `${discount.amount}%`)}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center py-8">
          <button
            onClick={openCreateDiscountForm}
            disabled={isReadOnly}
            className="px-8 py-5 bg-black text-white font-black text-2xl md:text-xl disabled:opacity-60"
          >
            Create item
          </button>
        </div>
      </div>
    );
  }

  if (activeManagedSection && activeMeta) {
    return (
      <div className="md:max-w-2xl md:mx-auto min-h-[70vh] bg-slate-100 dark:bg-slate-900 rounded-3xl overflow-hidden">
        <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 px-4 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <button
            onClick={() => setSelectedSection(null)}
            className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center"
          >
            <i className="fas fa-arrow-left text-xl"></i>
          </button>

          <h2 className="text-2xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {activeMeta.listTitle}
          </h2>

          <button
            onClick={openCreateForm}
            disabled={isReadOnly}
            className="w-11 h-11 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fas fa-plus text-xl"></i>
          </button>
        </div>

        <div className="p-4">
          <div className="relative mb-6">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-700 dark:text-slate-300"></i>
            <input
              type="text"
              placeholder={language === 'zh' ? 'Search' : 'Search'}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full pl-14 pr-4 py-3 rounded-full border-2 border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-slate-800 text-lg text-slate-800 dark:text-white outline-none"
            />
          </div>

          <div className="divide-y divide-slate-200 dark:divide-white/10 min-h-[46vh]">
            {sectionItems.map(item => (
              <button
                key={item.id}
                onClick={() => openEditForm(item)}
                disabled={isReadOnly}
                className="w-full flex items-center justify-between py-5 gap-3 text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-400">
                    <i className="fas fa-image"></i>
                  </div>
                  <p className="text-xl md:text-lg font-black text-slate-900 dark:text-white truncate">{item.name}</p>
                </div>
                <p className="text-xl md:text-lg font-black text-slate-500 dark:text-slate-300 whitespace-nowrap">
                  ${(Number.isFinite(item.price as number) ? Number(item.price) : 0).toFixed(2)}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (selectedSection) {
    return (
      <div className="md:max-w-2xl md:mx-auto min-h-[70vh] bg-slate-100 dark:bg-slate-900 rounded-3xl p-6">
        <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 py-2 mb-6 flex items-center gap-3">
          <button
            onClick={() => setSelectedSection(null)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <i className="fas fa-arrow-left text-lg"></i>
          </button>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">{selectedLabel}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="md:max-w-2xl md:mx-auto min-h-[70vh] bg-slate-100 dark:bg-slate-900 rounded-3xl px-6 py-8">
      <h2 className="text-4xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-10">
        {language === 'zh' ? 'Categories' : 'Categories'}
      </h2>

      <div className="space-y-10">
        {sections.map(section => (
          <button
            key={section.id}
            onClick={() => setSelectedSection(section.id)}
            className="block w-full text-left text-2xl md:text-[1.7rem] font-black text-slate-900 dark:text-white leading-none"
          >
            {section.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CategoriesPage;