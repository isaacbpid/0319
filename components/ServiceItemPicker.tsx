import React, { useState, useMemo } from 'react';
import { CategoryItem } from '../types';

interface ServiceItemPickerProps {
  categories: CategoryItem[];
  language: 'zh' | 'en';
  onSelect: (category: CategoryItem) => void;
  onClose: () => void;
}

// Detail panel shown after clicking a specific service
interface DetailPanelProps {
  item: CategoryItem;
  language: 'zh' | 'en';
  onBack: () => void;
  onSelect: (item: CategoryItem) => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ item, language, onBack, onSelect }) => {
  const durationLabel = item.estimatedDurationMinutes
    ? `${item.estimatedDurationMinutes} ${language === 'zh' ? '分鐘' : 'min'}`
    : (language === 'zh' ? '未知' : 'Unknown');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-base font-black text-slate-800 dark:text-white tracking-tight">
          {language === 'zh' ? '服務詳情' : 'Service Detail'}
        </h3>
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-[11px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/20 transition-all flex items-center gap-1.5"
        >
          <i className="fas fa-arrow-left text-[10px]"></i>
          {language === 'zh' ? '返回' : 'Back'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* Name */}
        <div className="rounded-2xl bg-slate-50 dark:bg-white/5 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
            {language === 'zh' ? '名稱' : 'Name'}
          </p>
          <p className="text-sm font-black text-slate-800 dark:text-white">{item.name}</p>
        </div>

        {/* Description */}
        {item.description && (
          <div className="rounded-2xl bg-slate-50 dark:bg-white/5 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
              {language === 'zh' ? '說明' : 'Description'}
            </p>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed">{item.description}</p>
          </div>
        )}

        {/* Duration */}
        <div className="rounded-2xl bg-slate-50 dark:bg-white/5 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
            {language === 'zh' ? '預計時間' : 'Est. Duration'}
          </p>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <i className="fas fa-clock text-blue-400 text-xs"></i>
            {durationLabel}
          </p>
        </div>

        {/* Not sold separately */}
        <div className="rounded-2xl bg-slate-50 dark:bg-white/5 px-5 py-4 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {language === 'zh' ? '可單獨銷售' : 'Sold Separately'}
          </p>
          {item.notSoldSeparately ? (
            <span className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest">
              {language === 'zh' ? '否' : 'No'}
            </span>
          ) : (
            <span className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">
              {language === 'zh' ? '是' : 'Yes'}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="rounded-2xl bg-blue-50 dark:bg-blue-900/20 px-5 py-4 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 dark:text-blue-400">
            {language === 'zh' ? '定價' : 'Price'}
          </p>
          <p className="text-xl font-black text-blue-700 dark:text-blue-300">
            ¥{(item.price ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Select button */}
      <div className="pt-4 mt-4 border-t border-slate-100 dark:border-white/10">
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
        >
          {language === 'zh' ? '選擇此服務' : 'Select This Service'}
        </button>
      </div>
    </div>
  );
};

// Sort categories by numeric suffix of id, e.g. rev-3 < rev-10
const sortByNumericId = (a: CategoryItem, b: CategoryItem): number => {
  const numA = parseInt((a.id.match(/(\d+)$/) || ['0', '0'])[1], 10);
  const numB = parseInt((b.id.match(/(\d+)$/) || ['0', '0'])[1], 10);
  return numA - numB;
};

const ServiceItemPicker: React.FC<ServiceItemPickerProps> = ({ categories, language, onSelect, onClose }) => {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<CategoryItem | null>(null);

  // Group categories by itemCategory, fallback to 'other'
  const groups = useMemo(() => {
    const map = new Map<string, CategoryItem[]>();
    categories.forEach(cat => {
      const key = cat.itemCategory?.trim() || 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(cat);
    });
    // Sort items within each group by numeric ID
    map.forEach((items, key) => map.set(key, [...items].sort(sortByNumericId)));
    return map;
  }, [categories]);

  const groupKeys = useMemo(() => Array.from(groups.keys()).sort(), [groups]);

  const formatGroupLabel = (key: string) => {
    const labels: Record<string, { zh: string; en: string }> = {
      revenue: { zh: '收入', en: 'Revenue' },
      expense: { zh: '支出', en: 'Expense' },
      other: { zh: '其他', en: 'Other' },
    };
    const label = labels[key];
    if (label) return language === 'zh' ? label.zh : label.en;
    // Capitalise unknown keys
    return key.charAt(0).toUpperCase() + key.slice(1);
  };

  const handleSelectItem = (item: CategoryItem) => {
    onSelect(item);
    onClose();
  };

  return (
    // Full-screen overlay
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="relative w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col max-h-[90vh]">

        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/20"></div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-4 border-b border-slate-100 dark:border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-black text-slate-800 dark:text-white tracking-tight">
              {language === 'zh' ? '選擇服務' : 'Select Service'}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
              {language === 'zh' ? '選擇類別後展開服務' : 'Tap a category to expand'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/20 transition-all"
            aria-label="Close"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {detailItem ? (
            <DetailPanel
              item={detailItem}
              language={language}
              onBack={() => setDetailItem(null)}
              onSelect={handleSelectItem}
            />
          ) : (
            <div className="space-y-3">
              {groupKeys.map(key => {
                const items = groups.get(key)!;
                const isExpanded = expandedGroup === key;
                return (
                  <div key={key} className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                    {/* Group header */}
                    <button
                      type="button"
                      onClick={() => setExpandedGroup(isExpanded ? null : key)}
                      className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <i className="fas fa-tag text-blue-500 dark:text-blue-400 text-[10px]"></i>
                        </div>
                        <span className="text-sm font-black text-slate-700 dark:text-white tracking-tight">
                          {formatGroupLabel(key)}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                          ({items.length})
                        </span>
                      </div>
                      <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-slate-400 dark:text-slate-500 text-xs transition-transform`}></i>
                    </button>

                    {/* Expanded items list */}
                    {isExpanded && (
                      <div className="divide-y divide-slate-100 dark:divide-white/5">
                        {items.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setDetailItem(item)}
                            className="w-full flex items-center justify-between px-5 py-3.5 bg-white dark:bg-slate-900 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all text-left group"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{item.name}</p>
                              {item.description && (
                                <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                  {item.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3 ml-3 shrink-0">
                              <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                                ¥{(item.price ?? 0).toLocaleString()}
                              </span>
                              <i className="fas fa-chevron-right text-slate-300 dark:text-slate-600 text-xs group-hover:text-blue-400 transition-colors"></i>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {groupKeys.length === 0 && (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500">
                  <i className="fas fa-box-open text-3xl mb-3 block"></i>
                  <p className="text-sm font-bold">
                    {language === 'zh' ? '沒有可用的服務項目' : 'No services available'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceItemPicker;
