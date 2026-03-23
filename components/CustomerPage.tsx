
import React, { useState, useMemo } from 'react';
import { Customer, Transaction, TransactionType } from '../types';
import { translations } from '../translations';

interface CustomerPageProps {
  customers: Customer[];
  transactions: Transaction[];
  onUpdateCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  language: 'zh' | 'en';
  isReadOnly?: boolean;
}

const CustomerPage: React.FC<CustomerPageProps> = ({ customers, transactions, onUpdateCustomer, onDeleteCustomer, language, isReadOnly }) => {
  const t = translations[language];
  const [search, setSearch] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      (c.phone && c.phone.includes(search)) ||
      (c.vehicleMake && c.vehicleMake.toLowerCase().includes(search.toLowerCase())) ||
      (c.vehicleModel && c.vehicleModel.toLowerCase().includes(search.toLowerCase()))
    );
  }, [customers, search]);

  const customerStats = useMemo(() => {
    const stats: Record<string, { totalSpend: number, visitCount: number, lastVisit: string }> = {};
    
    transactions.forEach(tr => {
      if (tr.customerId && tr.type === TransactionType.REVENUE) {
        if (!stats[tr.customerId]) {
          stats[tr.customerId] = { totalSpend: 0, visitCount: 0, lastVisit: tr.date };
        }
        stats[tr.customerId].totalSpend += tr.amount;
        stats[tr.customerId].visitCount += 1;
        if (new Date(tr.date) > new Date(stats[tr.customerId].lastVisit)) {
          stats[tr.customerId].lastVisit = tr.date;
        }
      }
    });
    
    return stats;
  }, [transactions]);

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const customerData: Customer = {
      id: editingCustomer?.id || Math.random().toString(36).substr(2, 9),
      name: formData.get('name') as string,
      phone: formData.get('phone') as string,
      vehicleMake: formData.get('vehicleMake') as string,
      vehicleModel: formData.get('vehicleModel') as string,
      vehicleColor: formData.get('vehicleColor') as string,
      notes: formData.get('notes') as string,
      createdAt: editingCustomer?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpdateCustomer(customerData);
    setEditingCustomer(null);
    setIsAdding(false);
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const selectedCustomerTransactions = transactions.filter(tr => tr.customerId === selectedCustomerId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {isReadOnly && (
        <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/20 rounded-2xl p-4 flex items-center gap-3 text-rose-600 dark:text-rose-400">
          <i className="fas fa-lock text-sm"></i>
          <span className="text-xs font-bold uppercase tracking-widest">
            {language === 'zh' ? '連接不穩定，目前處於唯讀模式。' : 'Connection unstable. Currently in Read-Only mode.'}
          </span>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {language === 'zh' ? '客戶追蹤' : 'Customer Tracking'}
          </h2>
          <p className="text-slate-500 text-sm font-bold dark:text-slate-400">
            {language === 'zh' ? `共有 ${customers.length} 位客戶` : `Total ${customers.length} customers`}
          </p>
        </div>
        {!isReadOnly && (
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-2"
          >
            <i className="fas fa-user-plus"></i>
            {language === 'zh' ? '新增客戶' : 'Add Customer'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input 
              type="text"
              placeholder={language === 'zh' ? '搜尋姓名、電話或車型...' : 'Search name, phone or vehicle...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-900 dark:border-white/10 dark:text-white"
            />
          </div>

          <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto pr-2 custom-scrollbar">
            {filteredCustomers.map(customer => {
              const stats = customerStats[customer.id] || { totalSpend: 0, visitCount: 0, lastVisit: '-' };
              return (
                <button
                  key={customer.id}
                  onClick={() => setSelectedCustomerId(customer.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedCustomerId === customer.id ? 'bg-blue-50 border-blue-200 dark:bg-blue-600/10 dark:border-blue-500/30' : 'bg-white border-slate-100 hover:border-slate-200 dark:bg-slate-900 dark:border-white/5 dark:hover:border-white/10'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-black text-slate-900 dark:text-white">{customer.name}</h4>
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full dark:bg-blue-600/20 dark:text-blue-400">
                      {stats.visitCount} {language === 'zh' ? '次到訪' : 'Visits'}
                    </span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 space-y-1">
                    <p className="flex items-center gap-2">
                      <i className="fas fa-car w-3"></i>
                      {customer.vehicleMake} {customer.vehicleModel} ({customer.vehicleColor})
                    </p>
                    <p className="flex items-center gap-2">
                      <i className="fas fa-phone w-3"></i>
                      {customer.phone || '-'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customer Detail */}
        <div className="lg:col-span-2">
          {selectedCustomer ? (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-white/10">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black">
                      {selectedCustomer.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 dark:text-white">{selectedCustomer.name}</h3>
                      <p className="text-slate-500 font-bold dark:text-slate-400">{selectedCustomer.phone || (language === 'zh' ? '無電話資料' : 'No phone')}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!isReadOnly && (
                      <>
                        <button 
                          onClick={() => setEditingCustomer(selectedCustomer)}
                          className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center hover:bg-slate-100 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm(selectedCustomer.id)}
                          className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/30"
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="p-4 bg-slate-50 rounded-2xl dark:bg-white/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{language === 'zh' ? '車輛資料' : 'Vehicle Info'}</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      {selectedCustomer.vehicleMake} {selectedCustomer.vehicleModel}
                    </p>
                    <p className="text-xs font-bold text-slate-500">{selectedCustomer.vehicleColor}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl dark:bg-white/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{language === 'zh' ? '總消費' : 'Total Spend'}</p>
                    <p className="text-sm font-black text-emerald-600">
                      ¥{(customerStats[selectedCustomer.id]?.totalSpend || 0).toLocaleString()}
                    </p>
                    <p className="text-xs font-bold text-slate-500">{customerStats[selectedCustomer.id]?.visitCount || 0} {language === 'zh' ? '次交易' : 'Transactions'}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl dark:bg-white/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{language === 'zh' ? '平均消費' : 'Avg Spend'}</p>
                    <p className="text-sm font-black text-blue-600">
                      ¥{Math.round((customerStats[selectedCustomer.id]?.totalSpend || 0) / (customerStats[selectedCustomer.id]?.visitCount || 1)).toLocaleString()}
                    </p>
                    <p className="text-xs font-bold text-slate-500">{language === 'zh' ? '最後到訪' : 'Last Visit'}: {customerStats[selectedCustomer.id]?.lastVisit || '-'}</p>
                  </div>
                </div>

                {selectedCustomer.notes && (
                  <div className="mb-8">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{language === 'zh' ? '備註' : 'Notes'}</p>
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-sm font-bold text-amber-900 dark:bg-amber-900/10 dark:border-amber-900/20 dark:text-amber-200">
                      {selectedCustomer.notes}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">{language === 'zh' ? '交易紀錄' : 'Transaction History'}</p>
                  <div className="space-y-2">
                    {selectedCustomerTransactions.length > 0 ? (
                      selectedCustomerTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tr => (
                        <div key={tr.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl dark:bg-slate-900 dark:border-white/5">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${tr.type === TransactionType.REVENUE ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                              <i className={`fas ${tr.type === TransactionType.REVENUE ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-900 dark:text-white">{tr.categoryId}</p>
                              <p className="text-[10px] font-bold text-slate-400">{tr.date}</p>
                            </div>
                          </div>
                          <p className={`text-sm font-black ${tr.type === TransactionType.REVENUE ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {tr.type === TransactionType.REVENUE ? '+' : '-'}¥{tr.amount.toLocaleString()}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-center py-8 text-slate-400 text-xs font-bold">{language === 'zh' ? '暫無交易紀錄' : 'No transaction history'}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 py-20 bg-white dark:bg-slate-900 rounded-[32px] border border-dashed border-slate-200 dark:border-white/10">
              <i className="fas fa-user-circle text-6xl opacity-20"></i>
              <p className="font-bold text-sm">{language === 'zh' ? '請從左側選擇一位客戶查看詳情' : 'Select a customer from the list to view details'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(isAdding || editingCustomer) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden border border-white/10">
            <div className="p-8 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                {editingCustomer ? (language === 'zh' ? '編輯客戶' : 'Edit Customer') : (language === 'zh' ? '新增客戶' : 'Add Customer')}
              </h3>
              <button onClick={() => { setIsAdding(false); setEditingCustomer(null); }} className="text-slate-400 hover:text-slate-600">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{language === 'zh' ? '姓名' : 'Name'} *</label>
                  <input name="name" defaultValue={editingCustomer?.name} required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/5 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{language === 'zh' ? '電話' : 'Phone'}</label>
                  <input name="phone" defaultValue={editingCustomer?.phone} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/5 dark:text-white" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{language === 'zh' ? '品牌' : 'Make'}</label>
                  <input name="vehicleMake" defaultValue={editingCustomer?.vehicleMake} placeholder="e.g. Toyota" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/5 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{language === 'zh' ? '型號' : 'Model'}</label>
                  <input name="vehicleModel" defaultValue={editingCustomer?.vehicleModel} placeholder="e.g. Camry" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/5 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{language === 'zh' ? '顏色' : 'Color'}</label>
                  <input name="vehicleColor" defaultValue={editingCustomer?.vehicleColor} placeholder="e.g. White" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/5 dark:text-white" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{language === 'zh' ? '備註' : 'Notes'}</label>
                <textarea name="notes" defaultValue={editingCustomer?.notes} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/5 dark:text-white resize-none" />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => { setIsAdding(false); setEditingCustomer(null); }} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest dark:bg-white/5 dark:text-slate-400">
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/20">
                  {language === 'zh' ? '儲存' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] shadow-2xl p-8 border border-white/10">
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-4 uppercase tracking-tight">
              {language === 'zh' ? '確認刪除' : 'Confirm Delete'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm font-bold">
              {language === 'zh' ? '確定要刪除此客戶嗎？此操作無法撤銷。' : 'Are you sure you want to delete this customer? This action cannot be undone.'}
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest dark:bg-white/5 dark:text-slate-400"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button 
                onClick={() => {
                  onDeleteCustomer(deleteConfirm);
                  setSelectedCustomerId(null);
                  setDeleteConfirm(null);
                }}
                className="flex-1 py-4 bg-rose-700 hover:bg-rose-800 text-white dark:text-white border border-rose-800 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-700/30"
              >
                {language === 'zh' ? '刪除' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPage;
