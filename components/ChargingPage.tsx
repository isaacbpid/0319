import React, { useEffect, useMemo, useState } from 'react';
import CustomerPromptSelect, { type CustomerStats } from './CustomerPromptSelect';
import { CategoryItem, ChargingRateConfig, ChargingSession, Customer, Owner, Transaction, TransactionType, Vehicle } from '../types';
import { normalizeLicensePlate } from '../utils/licensePlate';

interface ChargingPageProps {
  language: 'zh' | 'en';
  customers: Customer[];
  vehicles: Vehicle[];
  categories: CategoryItem[];
  chargingSessions: ChargingSession[];
  chargingRates: ChargingRateConfig[];
  onSaveSessions: (sessions: ChargingSession[]) => Promise<void>;
  onSaveRates: (rates: ChargingRateConfig[]) => Promise<void>;
  onCreateTransactions: (transactions: Transaction[]) => Promise<boolean>;
  isReadOnly?: boolean;
}

const round1 = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
const round2 = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const formatMeter = (value: number): string => `${round1(value).toFixed(1)} kWh`;

const buildTransactionItemId = (transactionId: string, suffix: string): string => `${transactionId}_${suffix}`;

const ChargingPage: React.FC<ChargingPageProps> = ({
  language,
  customers,
  vehicles,
  categories,
  chargingSessions,
  chargingRates,
  onSaveSessions,
  onSaveRates,
  onCreateTransactions,
  isReadOnly,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [vehicleSearchInput, setVehicleSearchInput] = useState('');
  const [startMeterInput, setStartMeterInput] = useState('0.0');
  const [endMeterInput, setEndMeterInput] = useState('0.0');
  const [isGapConfirmOpen, setIsGapConfirmOpen] = useState(false);
  const [rateDraftInput, setRateDraftInput] = useState('0');

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);

  const activeSession = useMemo(() => {
    return chargingSessions
      .filter((session) => session.status === 'CHARGING' && !session.completedAt)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  }, [chargingSessions]);

  const lastSessionByTime = useMemo(() => {
    return [...chargingSessions].sort((a, b) => {
      const aTime = new Date(a.completedAt || a.startedAt).getTime();
      const bTime = new Date(b.completedAt || b.startedAt).getTime();
      return bTime - aTime;
    })[0];
  }, [chargingSessions]);

  const currentMeter = useMemo(() => {
    if (activeSession) return round1(activeSession.meterAtStart);
    if (typeof lastSessionByTime?.meterAtEnd === 'number') return round1(lastSessionByTime.meterAtEnd);
    if (typeof lastSessionByTime?.meterAtStart === 'number') return round1(lastSessionByTime.meterAtStart);
    return 0;
  }, [activeSession, lastSessionByTime]);

  const statusLabel = activeSession
    ? (language === 'zh' ? '充電中' : 'Charging')
    : (language === 'zh' ? '閒置' : 'Idle');

  const activeRate = useMemo(() => {
    return chargingRates.find((rate) => rate.isActive) || chargingRates[0];
  }, [chargingRates]);

  const startMeter = Number(startMeterInput);
  const endMeter = Number(endMeterInput);
  const gapKwh = round1(Math.max(0, startMeter - currentMeter));
  const chargingConsumedKwh = activeSession ? round1(Math.max(0, endMeter - activeSession.meterAtStart)) : 0;

  const selectableVehicles = useMemo(() => {
    if (!selectedCustomerId) return vehicles;
    return vehicles.filter((vehicle) => vehicle.customerId === selectedCustomerId);
  }, [selectedCustomerId, vehicles]);

  const selectableVehicleSearchOptions = useMemo(() => {
    return [...selectableVehicles].sort((a, b) => (a.licensePlate || '').localeCompare(b.licensePlate || ''));
  }, [selectableVehicles]);

  const customerStats = useMemo<Record<string, CustomerStats>>(() => {
    const stats: Record<string, CustomerStats> = {};
    for (const customer of customers) {
      const linkedVehicle = vehicles.find((vehicle) => vehicle.customerId === customer.id);
      stats[customer.id] = {
        visitCount: 0,
        totalSpent: 0,
        vehicleSummary: linkedVehicle
          ? [linkedVehicle.licensePlate, linkedVehicle.make, linkedVehicle.model].filter(Boolean).join(' ')
          : undefined,
      };
    }
    return stats;
  }, [customers, vehicles]);

  useEffect(() => {
    if (activeSession) {
      setSelectedCustomerId(activeSession.customerId);
      setSelectedVehicleId(activeSession.vehicleId);
      const vehicle = vehicleMap.get(activeSession.vehicleId);
      setVehicleSearchInput(vehicle?.licensePlate || '');
      setEndMeterInput(String(round1(activeSession.meterAtStart)));
      return;
    }

    setSelectedCustomerId('');
    setSelectedVehicleId('');
    setVehicleSearchInput('');
    setStartMeterInput(String(round1(currentMeter)));
    setEndMeterInput(String(round1(currentMeter)));
  }, [activeSession, currentMeter, vehicleMap]);

  useEffect(() => {
    setRateDraftInput(activeRate ? String(activeRate.costPerKwh) : '0');
  }, [activeRate]);

  const resolveChargingCategoryId = (nameMatch: RegExp): string => {
    const category = categories.find((item) => item.type === TransactionType.REVENUE && nameMatch.test(item.name));
    return category?.id || 'OTHER_ID';
  };

  const buildGapTransaction = (sessionId: string, valueGapKwh: number, ratePerKwh: number): Transaction => {
    const id = `chg_gap_${sessionId}`;
    const amount = round2(valueGapKwh * ratePerKwh);
    const categoryId = resolveChargingCategoryId(/gap|missing|缺口|補錄/i);

    return {
      id,
      receiptNumber: `CHG-GAP-${sessionId.slice(0, 6).toUpperCase()}`,
      date: new Date().toISOString().slice(0, 10),
      type: TransactionType.REVENUE,
      items: [{
        id: buildTransactionItemId(id, 'item_1'),
        transactionId: id,
        categoryId,
        name: language === 'zh' ? '充電缺口補錄' : 'Charging Gap Draft',
        price: amount,
        notes: `${language === 'zh' ? '缺口' : 'Gap'}: ${valueGapKwh.toFixed(1)} kWh @ ${ratePerKwh.toFixed(2)}`,
      }],
      categoryId,
      amount,
      description: language === 'zh' ? `充電缺口草稿 ${valueGapKwh.toFixed(1)} kWh` : `Charging gap draft ${valueGapKwh.toFixed(1)} kWh`,
      contributedBy: Owner.OWNER_A,
      customerId: selectedCustomerId,
      notes: `CHARGING_GAP_DRAFT session:${sessionId}`,
      splitMode: 'NONE',
      updatedAt: new Date().toISOString(),
    };
  };

  const buildCompleteTransaction = (session: ChargingSession): Transaction => {
    const id = `chg_tx_${session.id}`;
    const consumed = round1(session.consumedKwh || 0);
    const rate = round2(session.ratePerKwh || 0);
    const amount = round2(session.amount || 0);
    const categoryId = resolveChargingCategoryId(/charging|charge|充電/i);

    return {
      id,
      receiptNumber: `CHG-${session.id.slice(0, 8).toUpperCase()}`,
      date: new Date().toISOString().slice(0, 10),
      type: TransactionType.REVENUE,
      items: [{
        id: buildTransactionItemId(id, 'item_1'),
        transactionId: id,
        categoryId,
        name: language === 'zh' ? '電車充電' : 'EV Charging',
        price: amount,
        notes: `${consumed.toFixed(1)} kWh @ ${rate.toFixed(2)}`,
      }],
      categoryId,
      amount,
      description: language === 'zh' ? `電車充電 ${consumed.toFixed(1)} kWh` : `EV charging ${consumed.toFixed(1)} kWh`,
      contributedBy: Owner.OWNER_A,
      customerId: session.customerId,
      notes: `Charging session ${session.id}`,
      splitMode: 'NONE',
      updatedAt: new Date().toISOString(),
    };
  };

  const handleVehicleSearchChange = (nextValue: string) => {
    const normalized = normalizeLicensePlate(nextValue);
    setVehicleSearchInput(normalized);

    if (!normalized) {
      setSelectedVehicleId('');
      return;
    }

    const matched = selectableVehicles.find((vehicle) => normalizeLicensePlate(vehicle.licensePlate || '') === normalized);
    if (!matched) {
      setSelectedVehicleId('');
      return;
    }

    setSelectedVehicleId(matched.id);
    setSelectedCustomerId(matched.customerId);
  };

  const persistStartSession = async (confirmGap: boolean) => {
    if (activeSession || isReadOnly) return;

    if (!selectedCustomerId || !selectedVehicleId) {
      alert(language === 'zh' ? '開始充電前需要選擇客戶和車輛。' : 'Customer and vehicle are required before starting charging.');
      return;
    }

    if (!Number.isFinite(startMeter)) {
      alert(language === 'zh' ? '請輸入有效的起始電錶讀數。' : 'Enter a valid start meter reading.');
      return;
    }

    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const ratePerKwh = round2(activeRate?.costPerKwh || 0);

    let gapTransactionId: string | undefined;
    if (gapKwh > 0 && confirmGap) {
      const gapTransaction = buildGapTransaction(sessionId, gapKwh, ratePerKwh);
      const gapSaved = await onCreateTransactions([gapTransaction]);
      if (!gapSaved) return;
      gapTransactionId = gapTransaction.id;
    }

    const nextSession: ChargingSession = {
      id: sessionId,
      status: 'CHARGING',
      customerId: selectedCustomerId,
      vehicleId: selectedVehicleId,
      meterAtStart: round1(startMeter),
      currentMeterSnapshot: round1(currentMeter),
      gapKwh: gapKwh > 0 ? gapKwh : undefined,
      gapTransactionId,
      gapConfirmed: gapKwh > 0 ? confirmGap : false,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await onSaveSessions([nextSession, ...chargingSessions]);
    setIsGapConfirmOpen(false);
  };

  const handleStartCharging = async () => {
    if (gapKwh > 0) {
      setIsGapConfirmOpen(true);
      return;
    }
    await persistStartSession(false);
  };

  const handleCompleteCharging = async () => {
    if (!activeSession || isReadOnly) return;
    if (!Number.isFinite(endMeter)) {
      alert(language === 'zh' ? '請輸入有效的結束電錶讀數。' : 'Enter a valid end meter reading.');
      return;
    }

    if (endMeter < activeSession.meterAtStart) {
      alert(language === 'zh' ? '結束讀數不能小於起始讀數。' : 'End meter cannot be less than start meter.');
      return;
    }

    const consumedKwh = round1(endMeter - activeSession.meterAtStart);
    const ratePerKwh = round2(activeRate?.costPerKwh || 0);
    const amount = round2(consumedKwh * ratePerKwh);

    if (ratePerKwh <= 0) {
      alert(language === 'zh' ? '請先設定每 kWh 電費單價，再完成充電。' : 'Please set a rate per kWh before completing the charging session.');
      return;
    }

    if (amount <= 0) {
      alert(language === 'zh' ? '充電金額必須大於 0。請確認電錶讀數及電費單價。' : 'Charging amount must be greater than 0. Please check the meter reading and rate.');
      return;
    }

    const now = new Date().toISOString();

    const completedSession: ChargingSession = {
      ...activeSession,
      status: 'COMPLETED',
      meterAtEnd: round1(endMeter),
      consumedKwh,
      ratePerKwh,
      amount,
      completedAt: now,
      updatedAt: now,
    };

    const transaction = buildCompleteTransaction(completedSession);
    const saved = await onCreateTransactions([transaction]);
    if (!saved) return;

    const nextSessions = chargingSessions.map((session) => {
      if (session.id !== activeSession.id) return session;
      return completedSession;
    });

    await onSaveSessions(nextSessions);
  };

  const handleSaveRate = async () => {
    const parsed = Number(rateDraftInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert(language === 'zh' ? '請輸入有效的每 kWh 單價。' : 'Enter a valid per-kWh rate.');
      return;
    }

    const now = new Date().toISOString();
    const activeId = activeRate?.id || 'charging_rate_default';
    const nextRate: ChargingRateConfig = {
      id: activeId,
      name: activeRate?.name || 'EV Charging',
      costPerKwh: round2(parsed),
      isActive: true,
      createdAt: activeRate?.createdAt || now,
      updatedAt: now,
    };

    const updatedRates = [
      nextRate,
      ...chargingRates
        .filter((rate) => rate.id !== activeId)
        .map((rate) => ({ ...rate, isActive: false, updatedAt: now })),
    ];

    await onSaveRates(updatedRates);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h2 className="text-xl font-black text-slate-900 dark:text-white">
          {language === 'zh' ? '電車充電服務' : 'EV Charging Service'}
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50 dark:bg-white/5">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '目前狀態' : 'Current Status'}</p>
            <div className="mt-2 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activeSession ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                <i className={`fas ${activeSession ? 'fa-bolt' : 'fa-plug'}`}></i>
              </div>
              <p className="text-lg font-black text-slate-900 dark:text-white">{statusLabel}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50 dark:bg-white/5">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '目前電錶' : 'Current Meter'}</p>
            <p className="mt-3 text-2xl font-black text-blue-600 dark:text-blue-300">{formatMeter(currentMeter)}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '客戶' : 'Customer'}</label>
            <div className="mt-1">
              <CustomerPromptSelect
                value={selectedCustomerId}
                onChange={setSelectedCustomerId}
                options={customers.map((customer) => ({ id: customer.id, name: customer.name }))}
                language={language}
                promptText={language === 'zh' ? '新增客戶' : 'Add a customer'}
                emptyOptionText={language === 'zh' ? '未選擇' : 'Unassigned'}
                customerStats={customerStats}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '車牌' : 'License Plate'}</label>
            <input
              value={vehicleSearchInput}
              onChange={(event) => handleVehicleSearchChange(event.target.value)}
              list="charging-vehicle-plate-list"
              placeholder={language === 'zh' ? '搜尋車牌號碼' : 'Search license plate'}
              className="mt-1 w-full h-14 rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-4 text-base font-semibold tracking-[0.08em] text-slate-900 dark:text-white"
              disabled={isReadOnly || Boolean(activeSession)}
            />
            <datalist id="charging-vehicle-plate-list">
              {selectableVehicleSearchOptions.map((vehicle) => (
                <option key={vehicle.id} value={(vehicle.licensePlate || '').toUpperCase()}>
                  {(vehicle.make || '').trim()} {(vehicle.model || '').trim()}
                </option>
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '單價 (每 kWh)' : 'Rate (per kWh)'}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={rateDraftInput}
              onChange={(event) => setRateDraftInput(event.target.value)}
              disabled={isReadOnly}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
            />
            <button
              onClick={handleSaveRate}
              disabled={isReadOnly}
              className="mt-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
            >
              {language === 'zh' ? '更新單價' : 'Update Rate'}
            </button>
          </div>

          {!activeSession ? (
            <>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '起始電錶' : 'Start Meter'}</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={startMeterInput}
                  onChange={(event) => setStartMeterInput(event.target.value)}
                  disabled={isReadOnly}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
                />
                {gapKwh > 0 && (
                  <p className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                    {language === 'zh'
                      ? `偵測到缺口 ${gapKwh.toFixed(1)} kWh，會建立草稿缺口交易。`
                      : `Gap detected ${gapKwh.toFixed(1)} kWh. A draft gap transaction will be created.`}
                  </p>
                )}
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleStartCharging}
                  disabled={isReadOnly || !selectedCustomerId || !selectedVehicleId || !Number.isFinite(startMeter)}
                  className="w-full px-4 py-3 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {language === 'zh' ? '開始充電' : 'Start Charging'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '結束電錶' : 'End Meter'}</label>
                <input
                  type="number"
                  min={activeSession.meterAtStart}
                  step="0.1"
                  value={endMeterInput}
                  onChange={(event) => setEndMeterInput(event.target.value)}
                  disabled={isReadOnly}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
                />
                <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-300">
                  {language === 'zh' ? '本次消耗' : 'Session Usage'}: {chargingConsumedKwh.toFixed(1)} kWh
                </p>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleCompleteCharging}
                  disabled={isReadOnly || !Number.isFinite(endMeter) || endMeter < activeSession.meterAtStart}
                  className="w-full px-4 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {language === 'zh' ? '完成充電' : 'Charge Complete'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {activeSession && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '進行中會話' : 'Active Session'}</p>
          <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            {language === 'zh' ? '客戶' : 'Customer'}: {customerMap.get(activeSession.customerId)?.name || '-'}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
            {language === 'zh' ? '車牌' : 'Vehicle'}: {vehicleMap.get(activeSession.vehicleId)?.licensePlate || '-'}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
            {language === 'zh' ? '起始電錶' : 'Start Meter'}: {formatMeter(activeSession.meterAtStart)}
          </p>
        </div>
      )}

      {isGapConfirmOpen && (
        <div className="fixed inset-0 z-[600] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-6 space-y-5">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              {language === 'zh' ? '確認建立缺口草稿交易' : 'Confirm Draft Gap Transaction'}
            </h3>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {language === 'zh'
                ? `起始電錶大於目前電錶，缺口 ${gapKwh.toFixed(1)} kWh。確認後會建立草稿缺口交易，然後開始充電。`
                : `Start meter is higher than current meter. Gap ${gapKwh.toFixed(1)} kWh. Confirm to create a draft gap transaction and start charging.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setIsGapConfirmOpen(false)}
                className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-widest"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={() => persistStartSession(true)}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest"
              >
                {language === 'zh' ? '確認並開始' : 'Confirm and Start'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChargingPage;
