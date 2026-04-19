import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { FinancialSummary, Transaction, TransactionType, CategoryItem, Owner } from '../types';
import { translations } from '../translations';
import { getOwnerShareRatio } from '../utils/transactionSplit';

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

  const prevPeriodTransactions = React.useMemo(() => {
    if (selectedYear === 'all' || selectedMonth === 'all') return [];
    const prevMonth = (selectedMonth as number) === 1 ? 12 : (selectedMonth as number) - 1;
    const prevYear = (selectedMonth as number) === 1 ? (selectedYear as number) - 1 : (selectedYear as number);
    return transactions.filter(tr => {
      if (!tr.date) return false;
      const [y, m] = tr.date.split('-');
      return Number(y) === prevYear && Number(m) === prevMonth;
    });
  }, [transactions, selectedYear, selectedMonth]);

  // Revenue service data (by detailed items)
  const revenueCategoryData = React.useMemo(() => {
    const data: Record<string, number> = {};
    filteredTransactions
      .filter(tr => tr.type === TransactionType.REVENUE)
      .forEach(tr => {
        if (Array.isArray(tr.items) && tr.items.length > 0) {
          tr.items.forEach(item => {
            const category = categories.find(c => c.id === item.categoryId);
            const name = category ? category.name : item.name || item.categoryId;
            data[name] = (data[name] || 0) + (item.price || 0);
          });
        } else {
          // fallback for legacy/empty items
          const category = categories.find(c => c.id === tr.categoryId);
          const name = category ? category.name : tr.categoryId;
          data[name] = (data[name] || 0) + tr.amount;
        }
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
        if (Array.isArray(tr.items) && tr.items.length > 0) {
          tr.items.forEach(item => {
            const category = categories.find(c => c.id === item.categoryId);
            const name = category ? category.name : item.name || item.categoryId;
            data[name] = (data[name] || 0) + (item.price || 0);
          });
        } else {
          const category = categories.find(c => c.id === tr.categoryId);
          const name = category ? category.name : tr.categoryId;
          data[name] = (data[name] || 0) + tr.amount;
        }
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

    const totalStartup = summary.startupCosts > 0 ? summary.startupCosts : 1;

    return last6Months.map(m => {
      const data = months[m];
      const cumRev = transactions
        .filter(tr => tr.type === TransactionType.REVENUE && tr.date.substring(0, 7) <= m)
        .reduce((s, tr) => s + tr.amount, 0);
      const cumExp = transactions
        .filter(tr =>
          (tr.type === TransactionType.EXPENSE || tr.type === TransactionType.STARTUP) &&
          tr.date.substring(0, 7) <= m
        )
        .reduce((s, tr) => s + tr.amount, 0);
      const roiPct = Math.min(100, Math.max(0, ((cumRev - cumExp) / totalStartup) * 100));
      return { name: m, ...data, roiPct: Number(roiPct.toFixed(1)) };
    });
  }, [transactions, summary.startupCosts]);

  const trendPct = (curr: number, prev: number): number | null => {
    if (prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  };

  const currentRevenue = filteredTransactions.filter(tr => tr.type === TransactionType.REVENUE).reduce((sum, tr) => sum + tr.amount, 0);
  const prevRevenue = prevPeriodTransactions.filter(tr => tr.type === TransactionType.REVENUE).reduce((sum, tr) => sum + tr.amount, 0);
  const currentExpense = filteredTransactions.filter(tr => tr.type === TransactionType.EXPENSE || tr.type === TransactionType.STARTUP).reduce((sum, tr) => sum + tr.amount, 0);
  const prevExpense = prevPeriodTransactions.filter(tr => tr.type === TransactionType.EXPENSE || tr.type === TransactionType.STARTUP).reduce((sum, tr) => sum + tr.amount, 0);
  const currentNetProfit = currentRevenue - currentExpense;
  const prevNetProfit = prevRevenue - prevExpense;
  const revenueSpark = monthlyProfitData.map(d => d.revenue);
  const expenseSpark = monthlyProfitData.map(d => d.expense);
  const profitSpark = monthlyProfitData.map(d => d.revenue - d.expense);

  const currentOwnerProfitSplit = React.useMemo(() => {
    return filteredTransactions.reduce(
      (acc, transaction) => {
        const amount = Number(transaction.amount || 0);
        const multiplier = transaction.type === TransactionType.REVENUE ? 1 : transaction.type === TransactionType.EXPENSE ? -1 : 0;
        if (multiplier === 0) {
          return acc;
        }

        acc.ownerA += amount * multiplier * getOwnerShareRatio(transaction, Owner.OWNER_A, [Owner.OWNER_A]);
        acc.ownerB += amount * multiplier * getOwnerShareRatio(transaction, Owner.OWNER_B, [Owner.OWNER_B]);
        return acc;
      },
      { ownerA: 0, ownerB: 0 }
    );
  }, [filteredTransactions]);

  const formatCurrency = (val: number) => `¥${val.toLocaleString()}`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{t.businessOverview}</h2>
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
          trend={trendPct(currentNetProfit, prevNetProfit)}
          sparkData={profitSpark}
        />
        <SummaryCard 
          label={language === 'zh' ? '個人餘額（用戶1）' : 'Personal Balance (User 1)'} 
          value={summary.ownerA.settlement} 
          icon="fa-user" 
          color="violet" 
          secondary={language === 'zh' ? '用戶1權益餘額' : 'User 1 equity balance'}
          trend={trendPct(currentNetProfit, prevNetProfit)}
          sparkData={profitSpark}
        />
        <SummaryCard 
          label={language === 'zh' ? '個人餘額（用戶2）' : 'Personal Balance (User 2)'} 
          value={summary.ownerB.settlement} 
          icon="fa-user" 
          color="orange" 
          secondary={language === 'zh' ? '用戶2權益餘額' : 'User 2 equity balance'}
          trend={trendPct(currentNetProfit, prevNetProfit)}
          sparkData={profitSpark}
        />
        <SummaryCard 
          label={t.totalProfit} 
          value={summary.netProfit} 
          icon="fa-hand-holding-usd" 
          color="blue" 
          secondary={`${t.profitSplit}: User 1 ${formatCurrency(currentOwnerProfitSplit.ownerA)} / User 2 ${formatCurrency(currentOwnerProfitSplit.ownerB)}`}
          trend={trendPct(currentNetProfit, prevNetProfit)}
          sparkData={profitSpark}
        />
        <SummaryCard 
          label={t.startupCosts} 
          value={summary.startupCosts} 
          icon="fa-rocket" 
          color="amber" 
          secondary={t.startupDesc}
          onClick={onNavigateStartup}
          trend={trendPct(currentExpense, prevExpense)}
          sparkData={expenseSpark}
        />
        <SummaryCard 
          label={t.roiProgress} 
          value={`${summary.roiPercentage.toFixed(1)}%`} 
          icon="fa-percentage" 
          color="violet" 
          secondary={t.roiProgress}
          onClick={onNavigateStartup}
          trend={trendPct(currentRevenue, prevRevenue)}
          sparkData={revenueSpark}
        />
      </div>

      {/* Month/Year Selector */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="text-xs font-bold text-black dark:text-white">{language === 'zh' ? '月' : 'Month:'}</label>
        <select
          className="rounded-lg border px-2 py-1 text-xs font-bold text-black dark:text-white bg-white dark:bg-slate-800"
          value={selectedMonth}
          onChange={e => {
            const nextVal = e.target.value;
            setSelectedMonth(nextVal === 'all' ? 'all' : Number(nextVal));
          }}
        >
          <option value="all">{language === 'zh' ? '全部' : 'All'}</option>
          {Array.from(new Set(availableMonths.map(m => Number(m.month)))).sort((a: number, b: number) => a - b).map(month => (
            <option key={month} value={month}>{month.toString().padStart(2, '0')}</option>
          ))}
        </select>
        <label className="text-xs font-bold text-black dark:text-white ml-2">{language === 'zh' ? '年' : 'Year:'}</label>
        <select
          className="rounded-lg border px-2 py-1 text-xs font-bold text-black dark:text-white bg-white dark:bg-slate-800"
          value={selectedYear}
          onChange={e => {
            const nextVal = e.target.value;
            setSelectedYear(nextVal === 'all' ? 'all' : Number(nextVal));
          }}
        >
          <option value="all">{language === 'zh' ? '全部' : 'All'}</option>
          {Array.from(new Set(availableMonths.map(m => Number(m.year)))).sort((a: number, b: number) => b - a).map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Revenue Pie Chart */}
        <div className="bg-white p-4 rounded-[24px] shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-white/10 h-full">
          <h3 className="text-base font-black mb-4 text-slate-800 dark:text-white flex items-center gap-2">
            <i className="fas fa-chart-pie text-blue-500"></i>
            {language === 'zh' ? '收入分析' : 'Revenue Breakdown'}
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
          <h3 className="text-base font-black mb-4 text-slate-800 dark:text-white flex items-center gap-2">
            <i className="fas fa-chart-pie text-emerald-500"></i>
            {language === 'zh' ? '支出分析' : 'Expense Breakdown'}
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
        <h3 className="text-base font-black mb-4 text-slate-800 dark:text-white flex items-center gap-2">
          <i className="fas fa-chart-bar text-blue-500"></i>
          {t.revenueVsExpense}
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyProfitData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" className="opacity-20" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                interval={0}
                minTickGap={8}
                style={{ fontSize: '10px', fontWeight: 'bold' }}
                tick={{ fill: '#94a3b8' }}
                tickFormatter={(val) => {
                  if (!val) return '';
                  const parts = val.split('-');
                  if (parts.length < 2) return val;
                  return `${parts[1]}/${parts[0].slice(2)}`;
                }}
              />
              <YAxis
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                style={{ fontSize: '10px', fontWeight: 'bold' }}
                tick={{ fill: '#94a3b8' }}
                tickFormatter={(val) => `¥${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                style={{ fontSize: '10px', fontWeight: 'bold' }}
                tick={{ fill: '#f97316' }}
                tickFormatter={(val) => `${val}%`}
                label={{ value: 'ROI %', angle: 90, position: 'insideRight', offset: 12, style: { fontSize: '10px', fontWeight: 'bold', fill: '#f97316' } }}
              />
              <Tooltip
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', backgroundColor: '#1e293b', color: '#fff' }}
                itemStyle={{ fontWeight: 'bold', color: '#fff' }}
                formatter={(value: number, name: string) =>
                  name === 'ROI %'
                    ? [`ROI: ${value}%`]
                    : [`${name.toUpperCase()}: ${formatCurrency(value)}`]
                }
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '10px' }} />
              <Bar yAxisId="left" name={t.revenue} dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              <Bar yAxisId="left" name={t.expense} dataKey="expense" fill="#f43f5e" radius={[6, 6, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="roiPct"
                name="ROI %"
                stroke="#f97316"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#f97316', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6, fill: '#f97316' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const MiniSparkline = ({ data }: { data: number[] }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const stroke = last >= prev ? '#10b981' : '#f43f5e';
  return (
    <div className="mt-3 -mx-1 overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 28 }} preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      </svg>
    </div>
  );
};

const SummaryCard = ({ label, value, icon, color, secondary, onClick, trend, sparkData }: any) => {
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
      className={`bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm transition-all duration-300 dark:bg-slate-900 dark:border-white/10 flex flex-col ${onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98] hover:shadow-md active:shadow-inner' : ''}`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-base ${colorClasses[color]}`}>
          <i className={`fas ${icon}`}></i>
        </div>
        {trend !== null && trend !== undefined && (
          <span className={`text-[11px] font-black px-2 py-1 rounded-full flex items-center gap-1 ${
            trend >= 0
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
          }`}>
            <i className={`fas fa-arrow-${trend >= 0 ? 'up' : 'down'} text-[8px]`}></i>
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="flex-1">
        <p className="text-slate-400 text-xs font-black uppercase tracking-widest">{label}</p>
        <h4 className="text-2xl font-black text-slate-900 dark:text-white mt-1 tracking-tight">
          {typeof value === 'number' ? `¥${value.toLocaleString()}` : value}
        </h4>
        {secondary && <p className="text-[10px] font-bold text-slate-500 dark:text-slate-200 mt-2 flex items-center"><i className="fas fa-info-circle mr-1.5 opacity-50"></i>{secondary}</p>}
      </div>
      {sparkData && <MiniSparkline data={sparkData} />}
    </div>
  );
};

export default Dashboard;
