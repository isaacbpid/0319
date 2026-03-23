
import React, { useState } from 'react';
import { Account, AccountType, Owner } from '../types';
import { translations } from '../translations';

interface AccountsPageProps {
  accounts: Account[];
  onUpdateAccount: (account: Account) => void;
  onDeleteAccount: (id: string) => void;
  language: 'zh' | 'en';
  isReadOnly?: boolean;
}

const AccountsPage: React.FC<AccountsPageProps> = ({ accounts, onUpdateAccount, onDeleteAccount, language, isReadOnly }) => {
  const t = translations[language];
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [formData, setFormData] = useState<Partial<Account>>({
    id: '',
    name: '',
    type: AccountType.COMPANY_BANK
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormData(account);
    setIsAdding(true);
  };

  const confirmDelete = (id: string) => {
    onDeleteAccount(id);
    setDeletingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.id) return;

    const accountToSave: Account = {
      id: formData.id!,
      name: formData.name!,
      type: (formData.type as AccountType) || AccountType.COMPANY_BANK,
      createdAt: editingAccount?.createdAt || new Date().toISOString()
    };

    onUpdateAccount(accountToSave);
    setIsAdding(false);
    setEditingAccount(null);
    setFormData({
      name: '',
      type: AccountType.COMPANY_BANK,
      id: ''
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto relative">
      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 max-w-sm w-full shadow-2xl border border-slate-100 dark:border-white/10 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-exclamation-triangle text-2xl text-rose-500"></i>
            </div>
            <h3 className="text-xl font-black text-center dark:text-white mb-2 uppercase tracking-tight">
              {language === 'zh' ? '確認刪除' : 'Confirm Delete'}
            </h3>
            <p className="text-sm font-bold text-slate-400 text-center mb-8 uppercase tracking-widest leading-relaxed">
              {language === 'zh' ? '此操作無法撤銷，確定要刪除此賬戶嗎？' : 'This action cannot be undone. Are you sure you want to delete this account?'}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => confirmDelete(deletingId)}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-rose-600/20 transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                {language === 'zh' ? '確認刪除' : 'Delete'}
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

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          {language === 'zh' ? '賬戶管理' : 'Account Management'}
        </h2>
        {!isReadOnly && (
          <button 
            onClick={() => {
              setIsAdding(true);
              setEditingAccount(null);
              setFormData({
                id: '',
                name: '',
                type: AccountType.COMPANY_BANK
              });
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-600/20"
          >
            <i className="fas fa-plus mr-2"></i>
            {language === 'zh' ? '新增賬戶' : 'Add Account'}
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] shadow-sm border border-slate-100 dark:border-white/10 animate-in fade-in slide-in-from-top-4">
          <h3 className="text-lg font-black dark:text-white mb-6 uppercase tracking-tight">
            {editingAccount ? (language === 'zh' ? '編輯賬戶' : 'Edit Account') : (language === 'zh' ? '新增賬戶' : 'New Account')}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{language === 'zh' ? '賬戶代碼' : 'Account ID'}</label>
                <input 
                  type="text" required value={formData.id || ''}
                  onChange={e => setFormData({...formData, id: e.target.value})}
                  disabled={!!editingAccount}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="e.g. BANK_1, CASH, ALIPAY"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{language === 'zh' ? '賬戶名稱' : 'Account Name'}</label>
                <input 
                  type="text" required value={formData.name || ''}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                  placeholder="e.g. Bank of China / Alipay"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{language === 'zh' ? '賬戶類型' : 'Account Type'}</label>
                <select 
                  value={formData.type || AccountType.COMPANY_BANK}
                  onChange={e => setFormData({...formData, type: e.target.value as AccountType})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                >
                  <option value={AccountType.CASH}>{language === 'zh' ? '現金' : 'Cash'}</option>
                  <option value={AccountType.COMPANY_BANK}>{language === 'zh' ? '銀行' : 'Bank'}</option>
                  <option value={AccountType.WECHAT}>{language === 'zh' ? '微信支付' : 'WeChat Pay'}</option>
                  <option value={AccountType.ALIPAY}>{language === 'zh' ? '支付寶' : 'Alipay'}</option>
                  <option value={AccountType.PARTNER_PERSONAL}>{language === 'zh' ? '業主個人' : 'Partner Personal'}</option>
                  <option value={AccountType.OTHER}>{language === 'zh' ? '其他' : 'Other'}</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button 
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                {t.save}
              </button>
              <button 
                type="button"
                onClick={() => { setIsAdding(false); setEditingAccount(null); }}
                className="flex-1 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-black py-4 rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map(account => (
          <div key={account.id} className="bg-white dark:bg-slate-900 p-6 rounded-[32px] shadow-sm border border-slate-100 dark:border-white/10 flex justify-between items-center group transition-all hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                <i className={`fas ${account.type === AccountType.COMPANY_BANK ? 'fa-university' : account.type === AccountType.CASH ? 'fa-money-bill-wave' : 'fa-credit-card'} text-lg`}></i>
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {account.name}
                </h4>
                <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-0.5">{account.id}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-[9px] font-black px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 rounded-full uppercase tracking-widest">{account.type.toUpperCase()}</span>
                </div>
              </div>
            </div>
            <div className="text-right flex items-center gap-4">
              {!isReadOnly && (
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleEdit(account)}
                    className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:bg-white/5 dark:text-slate-500 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 flex items-center justify-center transition-all"
                  >
                    <i className="fas fa-edit text-xs"></i>
                  </button>
                  <button 
                    onClick={() => setDeletingId(account.id)}
                    className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:bg-white/5 dark:text-slate-500 dark:hover:bg-rose-900/20 dark:hover:text-rose-400 flex items-center justify-center transition-all"
                  >
                    <i className="fas fa-trash text-xs"></i>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {accounts.length === 0 && !isAdding && (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-[32px] border border-dashed border-slate-200 dark:border-white/10">
          <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-university text-2xl text-slate-300"></i>
          </div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
            {language === 'zh' ? '尚未添加賬戶' : 'No accounts added yet'}
          </p>
        </div>
      )}
    </div>
  );
};

export default AccountsPage;
