import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { FinancialSummary, Transaction, TransactionType, CategoryItem } from '../types';
import { translations } from '../translations';

interface DashboardProps {
  summary: FinancialSummary;
  transactions: Transaction[];
  categories: CategoryItem[];
  language: 'zh' | 'en';
  onNavigateStartup?: () => void;
  onNavigateForecast?: () => void;
  onNavigateNotes?: () => void;
  dueRemindersCount: number;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ summary, transactions, categories, language, onNavigateStartup, onNavigateForecast, onNavigateNotes, dueRemindersCount }) => {
  const t = translations[language];
  


  // Month/year selector state
  const now = new Date();
  const [selectedYear, setSelectedYear] = React.useState<number | 'all'>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = React.useState<number | 'all'>(now.getMonth() + 1); // 1-based

  // Get available years and months from transactions
  const availableMonths = React.useMemo(() => {
    const monthsSet = new Set<string>();
    transactions.forEach(tr => {
      if (tr.date) monthsSet.add(tr.date.substring(0, 7));
    });
    const arr = Array.from(monthsSet).sort().reverse();
    return arr.map(m => {
      const [year, month] = m.split('-');
      return { year: Number(year), month: Number(month) };
    });
  }, [transactions]);

  // Filtered transactions for selected month/year
  const filteredTransactions = React.useMemo(() => {
    return transactions.filter(tr => {
      if (!tr.date) return false;
      const [year, month] = tr.date.split('-');
      const trYear = Number(year);
      const trMonth = Number(month);

      const yearMatch = selectedYear === 'all' || trYear === selectedYear;
      const monthMatch = selectedMonth === 'all' || trMonth === selectedMonth;

      return yearMatch && monthMatch;
    });
  }, [transactions, selectedYear, selectedMonth]);

  // Revenue category data (filtered)
  const revenueCategoryData = React.useMemo(() => {
    const data: Record<string, number> = {};
    filteredTransactions
      .filter(tr => tr.type === TransactionType.REVENUE)
      .forEach(tr => {
        const category = categories.find(c => c.id === tr.categoryId);
        const name = category ? category.name : tr.categoryId;
        data[name] = (data[name] || 0) + tr.amount;
      });
    const total = Object.values(data).reduce((sum, v) => sum + v, 0);
    return Object.entries(data).map(([name, value]) => ({ name, value, percent: total ? (value / total) * 100 : 0 }));
  }, [filteredTransactions, categories]);

  // Expense category data (filtered)
  const expenseCategoryData = React.useMemo(() => {
    const data: Record<string, number> = {};
    filteredTransactions
      .filter(tr => tr.type === TransactionType.EXPENSE || tr.type === TransactionType.STARTUP)
      .forEach(tr => {
        const category = categories.find(c => c.id === tr.categoryId);
        const name = category ? category.name : tr.categoryId;
        data[name] = (data[name] || 0) + tr.amount;
      });
    const total = Object.values(data).reduce((sum, v) => sum + v, 0);
    return Object.entries(data).map(([name, value]) => ({ name, value, percent: total ? (value / total) * 100 : 0 }));
  }, [filteredTransactions, categories]);

  const monthlyProfitData = React.useMemo(() => {
    const months: Record<string, { revenue: number, expense: number, startup: number }> = {};
    const last6Months = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthStr = (d.getMonth() + 1).toString().padStart(2, '0');
      return `${d.getFullYear()}-${monthStr}`;
    }).reverse();

    last6Months.forEach(m => months[m] = { revenue: 0, expense: 0, startup: 0 });

    transactions.forEach(tr => {
      const m = tr.date.substring(0, 7);
      if (months[m]) {
        if (tr.type === TransactionType.REVENUE) {
          months[m].revenue += tr.amount;
        } else if (
          tr.type === TransactionType.OWNER_INVESTMENT ||
          (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_investment')
        ) {
          months[m].startup += tr.amount;
        } else if (
          tr.type === TransactionType.OWNER_WITHDRAWAL ||
          tr.type === TransactionType.WITHDRAWAL ||
          (tr.type === TransactionType.TRANSFER && tr.categoryId === 'owner_withdrawal')
        ) {
          months[m].startup -= tr.amount;
        } else if (tr.type === TransactionType.EXPENSE) {
          months[m].expense += tr.amount;
        }
      }
    });

    return Object.entries(months).map(([name, data]) => ({ name, ...data }));
  }, [transactions]);

  const formatCurrency = (val: number) => `¥${val.toLocaleString()}`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t.businessOverview}</h2>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onNavigateNotes}
            className={`relative hidden md:flex w-10 h-10 rounded-xl items-center justify-center transition-all bg-white border border-slate-100 shadow-sm dark:bg-slate-900 dark:border-white/10 ${dueRemindersCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}
          >
            <i className={`fas fa-bell ${dueRemindersCount > 0 ? 'animate-pulse' : ''}`}></i>
            {dueRemindersCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900">
                {dueRemindersCount}
              </span>
            )}
          </button>
          <div className="flex items-center space-x-2 text-[11px] font-bold uppercase tracking-wider text-slate-200 bg-slate-900 px-3 py-2 rounded-xl border border-white/10 shadow-sm">
            <i className="far fa-calendar-alt text-blue-500"></i>
            <span>{t.asOfToday}: {new Date().toLocaleDateString(language === 'zh' ? 'zh-HK' : 'en-US')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard 
          label={t.accountBalance} 
          value={summary.currentBalance} 
          icon="fa-wallet" 
          color="emerald" 
          secondary={t.balanceDesc}
          onClick={onNavigateForecast}
        />
        <SummaryCard 
          label={language === 'zh' ? '銀行餘額' : 'Bank Balance'} 
          value={summary.bankBalance} 
          icon="fa-university" 
          color="blue" 
          secondary={language === 'zh' ? '所有存取款總和' : 'Sum of all deposits/withdrawals'}
        />
        <SummaryCard 
          label={language === 'zh' ? '個人餘額（用戶1）' : 'Personal Balance (User 1)'} 
          value={summary.ownerA.settlement} 
          icon="fa-user" 
          color="violet" 
          secondary={language === 'zh' ? '用戶1權益餘額' : 'User 1 equity balance'}
        />
        <SummaryCard 
          label={language === 'zh' ? '個人餘額（用戶2）' : 'Personal Balance (User 2)'} 
          value={summary.ownerB.settlement} 
          icon="fa-user" 
          color="orange" 
          secondary={language === 'zh' ? '用戶2權益餘額' : 'User 2 equity balance'}
        />
        <SummaryCard 
          label={t.totalProfit} 
          value={summary.netProfit} 
          icon="fa-hand-holding-usd" 
          color="blue" 
          secondary={`${t.profitSplit}: ${formatCurrency(summary.netProfit / 2)}`}
        />
        <SummaryCard 
          label={t.startupCosts} 
          value={summary.startupCosts} 
          icon="fa-rocket" 
          color="amber" 
          secondary={t.startupDesc}
          onClick={onNavigateStartup}
        />
        <SummaryCard 
          label={t.roiProgress} 
          value={`${summary.roiPercentage.toFixed(1)}%`} 
          icon="fa-percentage" 
          color="violet" 
          secondary={t.roiProgress}
          onClick={onNavigateStartup}
        />
      </div>

      {/* Month/Year Selector */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="text-xs font-bold text-black dark:text-white">Month:</label>
        <select
          className="rounded-lg border px-2 py-1 text-xs font-bold text-black dark:text-white bg-white dark:bg-slate-800"
          value={selectedMonth}
          onChange={e => {
            const nextVal = e.target.value;
            setSelectedMonth(nextVal === 'all' ? 'all' : Number(nextVal));
          }}
        >
          <option value="all">All</option>
          {Array.from(new Set(availableMonths.map(m => m.month))).sort((a, b) => a - b).map(month => (
            <option key={month} value={month}>{month.toString().padStart(2, '0')}</option>
          ))}
        </select>
        <label className="text-xs font-bold text-black dark:text-white ml-2">Year:</label>
        <select
          className="rounded-lg border px-2 py-1 text-xs font-bold text-black dark:text-white bg-white dark:bg-slate-800"
          value={selectedYear}
          onChange={e => {
            const nextVal = e.target.value;
            setSelectedYear(nextVal === 'all' ? 'all' : Number(nextVal));
          }}
        >
          <option value="all">All</option>
          {Array.from(new Set(availableMonths.map(m => m.year))).sort((a, b) => b - a).map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Revenue Pie Chart */}
        <div className="bg-white p-4 rounded-[24px] shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-white/10 h-full">
          <h3 className="text-xs font-black uppercase tracking-[0.15em] mb-4 text-slate-800 dark:text-white flex items-center">
            <i className="fas fa-chart-pie text-blue-500 mr-2"></i>
            Revenue Breakdown
          </h3>
          <div className="h-[300px] flex flex-col items-center justify-center">
            {revenueCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={revenueCategoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={0}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ percent }) => `${percent.toFixed(1)}%`}
                    labelLine={false}
                  >
                    {revenueCategoryData.map((entry, index) => (
                      <Cell key={`cell-rev-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [`${formatCurrency(value)} (${props.payload.percent.toFixed(1)}%)`, name]}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', backgroundColor: '#1e293b', color: '#fff' }}
                    itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', marginTop: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 italic text-sm font-medium">{t.noRevenueData || 'No revenue data'}</div>
            )}
          </div>
        </div>

        {/* Expense Pie Chart */}
        <div className="bg-white p-4 rounded-[24px] shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-white/10 h-full">
          <h3 className="text-xs font-black uppercase tracking-[0.15em] mb-4 text-slate-800 dark:text-white flex items-center">
            <i className="fas fa-chart-pie text-emerald-500 mr-2"></i>
            Expense Breakdown
          </h3>
          <div className="h-[300px] flex flex-col items-center justify-center">
            {expenseCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={expenseCategoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={0}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ percent }) => `${percent.toFixed(1)}%`}
                    labelLine={false}
                  >
                    {expenseCategoryData.map((entry, index) => (
                      <Cell key={`cell-exp-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [`${formatCurrency(value)} (${props.payload.percent.toFixed(1)}%)`, name]}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', backgroundColor: '#1e293b', color: '#fff' }}
                    itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', marginTop: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 italic text-sm font-medium">{t.noExpenseData}</div>
            )}
          </div>
        </div>
      </div>

      {/* Flow Plot */}
      <div className="bg-white p-4 rounded-[24px] shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-white/10 mt-6">
        <h3 className="text-xs font-black uppercase tracking-[0.15em] mb-4 text-slate-800 dark:text-white flex items-center">
          <i className="fas fa-chart-bar text-blue-500 mr-2"></i>
          {t.revenueVsExpense}
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyProfitData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" className="opacity-20" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                interval={0}
                minTickGap={8}
                style={{ fontSize: '10px', fontWeight: 'bold' }}
                tick={{ fill: '#ef4444' }}
                tickFormatter={(val) => {
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
                tick={{ fill: 'currentColor' }}
                className="text-slate-400 dark:text-white"
                tickFormatter={(val) => `¥${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
              />
              <Tooltip
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', backgroundColor: '#1e293b', color: '#fff' }}
                itemStyle={{ fontWeight: 'bold', color: '#fff' }}
                formatter={(value: number, name: string) => [`${name.toUpperCase()}: ${formatCurrency(value)}`]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '10px' }} />
              <Bar name={t.revenue} dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              <Bar name={t.expense} dataKey="expense" fill="#f43f5e" radius={[6, 6, 0, 0]} />
              <Bar name={t.startupCosts} dataKey="startup" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, icon, color, secondary, onClick }: any) => {
  const colorClasses: any = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
  };

  return (
    <div 
      onClick={onClick}
      className={`bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm transition-all duration-300 dark:bg-slate-900 dark:border-white/10 ${onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98] hover:shadow-md active:shadow-inner' : ''}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm ${colorClasses[color]}`}>
          <i className={`fas ${icon}`}></i>
        </div>
      </div>
      <div>
        <p className="text-slate-300 text-[9px] font-black uppercase tracking-widest">{label}</p>
        <h4 className="text-xl font-black text-slate-900 dark:text-white mt-1 tracking-tight">
          {typeof value === 'number' ? `¥ ${value.toLocaleString()}` : value}
        </h4>
        {secondary && <p className="text-[10px] font-bold text-slate-500 dark:text-slate-200 mt-2 flex items-center"><i className="fas fa-info-circle mr-1.5 opacity-50"></i>{secondary}</p>}
      </div>
    </div>
  );
};

export default Dashboard;
