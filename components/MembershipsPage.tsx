import React, { useEffect, useMemo, useState } from 'react';
import CustomerPromptSelect from './CustomerPromptSelect';
import { Customer, CustomerMembership, MembershipBenefitType, MembershipTier, PaymentCurrency, PaymentMethod, Vehicle } from '../types';
import { getMembershipBenefitRemaining, getMembershipPrepaidBalance, getNextMembershipNo } from '../services/database';

interface MembershipsPageProps {
  language: 'zh' | 'en';
  customers: Customer[];
  vehicles: Vehicle[];
  membershipTiers: MembershipTier[];
  customerMemberships: CustomerMembership[];
  onSaveMembershipTiers: (tiers: MembershipTier[]) => Promise<void> | void;
  onSaveCustomerMemberships: (memberships: CustomerMembership[]) => Promise<void> | void;
  onAssignMembershipWithPayment: (input: {
    memberships: CustomerMembership[];
    customerId: string;
    membershipId: string;
    membershipNo?: string;
    tierName?: string;
    prepaidAmount: number;
    paymentMethod: PaymentMethod;
    paymentCurrency: PaymentCurrency;
  }) => Promise<{ error?: string } | void>;
  isReadOnly?: boolean;
}

const PAYMENT_METHOD_OPTIONS: PaymentMethod[] = [
  PaymentMethod.FPS,
  PaymentMethod.PAYME,
  PaymentMethod.HKD_CASH,
  PaymentMethod.RMB_CASH,
  PaymentMethod.ALIPAY,
  PaymentMethod.WECHAT,
  PaymentMethod.MOP_CASH,
  PaymentMethod.MPAY,
];

const getForcedCurrencyForMethod = (method: PaymentMethod): PaymentCurrency | null => {
  if (method === PaymentMethod.FPS) return PaymentCurrency.HKD;
  if (method === PaymentMethod.PAYME) return PaymentCurrency.HKD;
  if (method === PaymentMethod.HKD_CASH) return PaymentCurrency.HKD;
  if (method === PaymentMethod.RMB_CASH) return PaymentCurrency.RMB;
  if (method === PaymentMethod.MOP_CASH) return PaymentCurrency.MOP;
  if (method === PaymentMethod.MPAY) return PaymentCurrency.MOP;
  return null;
};

type PendingMembershipPayment = {
  memberships: CustomerMembership[];
  customerId: string;
  customerName: string;
  membershipId: string;
  membershipNo?: string;
  tierName?: string;
  prepaidAmount: number;
};

const MembershipsPage: React.FC<MembershipsPageProps> = ({
  language,
  customers,
  vehicles,
  membershipTiers,
  customerMemberships,
  onSaveMembershipTiers,
  onSaveCustomerMemberships,
  onAssignMembershipWithPayment,
  isReadOnly,
}) => {
  const getDefaultValidTillDate = () => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedValidTillDate, setSelectedValidTillDate] = useState<string>(getDefaultValidTillDate);
  const [selectedPrepaidAmount, setSelectedPrepaidAmount] = useState<string>('0');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>(PaymentMethod.RMB_CASH);
  const [selectedPaymentCurrency, setSelectedPaymentCurrency] = useState<PaymentCurrency>(PaymentCurrency.RMB);
  const [isPaymentPopupOpen, setIsPaymentPopupOpen] = useState<boolean>(false);
  const [pendingPayment, setPendingPayment] = useState<PendingMembershipPayment | null>(null);
  const [prepaidBalanceByMembershipId, setPrepaidBalanceByMembershipId] = useState<Record<string, number>>({});
  const [assignError, setAssignError] = useState<string>('');
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [detailBenefitRemaining, setDetailBenefitRemaining] = useState<Partial<Record<MembershipBenefitType, number>>>({});

  // Load live benefit remaining counts whenever the popup opens for a different member.
  useEffect(() => {
    if (!detailCustomerId) { setDetailBenefitRemaining({}); return; }
    const membership = customerMemberships.find(m => m.customerId === detailCustomerId && m.isActive);
    if (!membership) { setDetailBenefitRemaining({}); return; }
    let cancelled = false;
    const types: MembershipBenefitType[] = ['car_care_upgrade', 'hzmb_shuttle'];
    Promise.all(types.map(bt => getMembershipBenefitRemaining(membership.id, bt).then(r => [bt, r.remaining ?? 0] as [MembershipBenefitType, number])))
      .then(entries => { if (!cancelled) setDetailBenefitRemaining(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailCustomerId]);

  const sortedTiers = useMemo(() => {
    return [...membershipTiers].sort((a, b) => a.name.localeCompare(b.name));
  }, [membershipTiers]);

  const tierById = useMemo(() => {
    return new Map(sortedTiers.map(tier => [tier.id, tier]));
  }, [sortedTiers]);

  const activeMembershipByCustomer = useMemo(() => {
    const map = new Map<string, CustomerMembership>();
    const active = customerMemberships
      .filter(m => m.isActive)
      .sort((a, b) => {
        const aTime = new Date(a.startAt || a.createdAt).getTime();
        const bTime = new Date(b.startAt || b.createdAt).getTime();
        return bTime - aTime;
      });
    for (const membership of active) {
      if (!map.has(membership.customerId)) {
        map.set(membership.customerId, membership);
      }
    }
    return map;
  }, [customerMemberships]);

  const updateTier = (tierId: string, patch: Partial<MembershipTier>) => {
    const updated = membershipTiers.map(tier =>
      tier.id === tierId
        ? {
            ...tier,
            ...patch,
            updatedAt: new Date().toISOString(),
          }
        : tier
    );
    onSaveMembershipTiers(updated);
  };

  const vehiclesForCustomer = useMemo(() => {
    if (!selectedCustomerId) return [];
    return vehicles.filter(v => v.customerId === selectedCustomerId);
  }, [vehicles, selectedCustomerId]);

  const assignMembership = async () => {
    if (isReadOnly) return;
    if (!selectedCustomerId || !selectedTierId) return;
    if (!selectedValidTillDate) {
      setAssignError(language === 'zh' ? '請選擇有效期限' : 'Please select valid-till date');
      return;
    }
    if (!selectedVehicleId) {
      setAssignError(language === 'zh' ? '請選擇主要車輛' : 'Please select a primary vehicle');
      return;
    }

    const tier = tierById.get(selectedTierId);
    if (!tier) return;

    setAssignError('');
    const { membershipNo, error: noError } = await getNextMembershipNo();
    if (noError) {
      setAssignError(noError);
      return;
    }

    const now = new Date().toISOString();
    const validTill = new Date(`${selectedValidTillDate}T23:59:59.999`).toISOString();
    if (Number.isNaN(new Date(validTill).getTime()) || new Date(validTill).getTime() <= new Date(now).getTime()) {
      setAssignError(language === 'zh' ? '有效期限需晚於目前時間' : 'Valid-till must be after now');
      return;
    }

    const initialPrepaidAmount = Math.max(0, Number(selectedPrepaidAmount) || 0);

    const updatedMemberships = customerMemberships.map(membership =>
      membership.customerId === selectedCustomerId && membership.isActive
        ? {
            ...membership,
            isActive: false,
            endAt: now,
            updatedAt: now,
          }
        : membership
    );

    const newMembership: CustomerMembership = {
      id: crypto.randomUUID(),
      customerId: selectedCustomerId,
      tierId: selectedTierId,
      discountEligibleCarLimitSnapshot: tier.linkedLicensePlates,
      priorityLevelSnapshot: tier.priorityWash,
      exclusiveEventsSnapshot: tier.exclusiveEvents,
      statusPoints: 0,
      startAt: now,
      endAt: undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      statusPointsSnapshot: tier.statusPointsThreshold,
      birthdayGiftSnapshot: tier.birthdayGift,
      discountedRateSnapshot: tier.discountedRate,
      linkedLicensePlatesSnapshot: tier.linkedLicensePlates,
      hzmbServiceSnapshot: tier.hzmbService,
      complimentaryCarCareUpgradeSnapshot: tier.complimentaryCarCareUpgrade,
      priorityWashSnapshot: tier.priorityWash,
      exclusiveInvitationSnapshot: tier.exclusiveEvents,
      membershipNo,
      primaryVehicleId: selectedVehicleId,
      validTill,
      prepaidAmount: initialPrepaidAmount,
    };

    const nextMemberships = [newMembership, ...updatedMemberships];
    if (initialPrepaidAmount > 0) {
      const forcedCurrency = getForcedCurrencyForMethod(selectedPaymentMethod);
      if (forcedCurrency) {
        setSelectedPaymentCurrency(forcedCurrency);
      }
      setPendingPayment({
        memberships: nextMemberships,
        customerId: selectedCustomerId,
        customerName: customers.find(customer => customer.id === selectedCustomerId)?.name || '-',
        membershipId: newMembership.id,
        membershipNo: newMembership.membershipNo,
        tierName: tier.name,
        prepaidAmount: initialPrepaidAmount,
      });
      setIsPaymentPopupOpen(true);
      return;
    } else {
      await onSaveCustomerMemberships(nextMemberships);
    }

    setSelectedCustomerId('');
    setSelectedTierId('');
    setSelectedVehicleId('');
    setSelectedValidTillDate(getDefaultValidTillDate());
    setSelectedPrepaidAmount('0');
    setSelectedPaymentMethod(PaymentMethod.RMB_CASH);
    setSelectedPaymentCurrency(PaymentCurrency.RMB);
  };

  const confirmMembershipPayment = async () => {
    if (!pendingPayment) return;
    const result = await onAssignMembershipWithPayment({
      memberships: pendingPayment.memberships,
      customerId: pendingPayment.customerId,
      membershipId: pendingPayment.membershipId,
      membershipNo: pendingPayment.membershipNo,
      tierName: pendingPayment.tierName,
      prepaidAmount: pendingPayment.prepaidAmount,
      paymentMethod: selectedPaymentMethod,
      paymentCurrency: selectedPaymentCurrency,
    });
    if (result && result.error) {
      setAssignError(result.error);
      return;
    }

    setIsPaymentPopupOpen(false);
    setPendingPayment(null);
    setSelectedCustomerId('');
    setSelectedTierId('');
    setSelectedVehicleId('');
    setSelectedValidTillDate(getDefaultValidTillDate());
    setSelectedPrepaidAmount('0');
    setSelectedPaymentMethod(PaymentMethod.RMB_CASH);
    setSelectedPaymentCurrency(PaymentCurrency.RMB);
  };

  const cancelMembershipPayment = () => {
    setIsPaymentPopupOpen(false);
    setPendingPayment(null);
  };

  const deactivateMembership = async (membershipId: string) => {
    if (isReadOnly) return;
    const now = new Date().toISOString();
    const updated = customerMemberships.map(membership =>
      membership.id === membershipId
        ? {
            ...membership,
            isActive: false,
            endAt: membership.endAt || now,
            updatedAt: now,
          }
        : membership
    );
    await onSaveCustomerMemberships(updated);
  };

  const formatMembershipDate = (value?: string): string => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value.length >= 10 ? value.slice(0, 10) : value;
    }
    return parsed.toISOString().slice(0, 10);
  };

  const activeCustomerRows = useMemo(() => {
    return customers
      .map(customer => {
        const activeMembership = activeMembershipByCustomer.get(customer.id);
        const tier = activeMembership ? tierById.get(activeMembership.tierId) : undefined;
        return {
          customer,
          membership: activeMembership,
          tier,
        };
      })
      .sort((a, b) => a.customer.name.localeCompare(b.customer.name));
  }, [customers, activeMembershipByCustomer, tierById]);

  useEffect(() => {
    let isCancelled = false;
    const activeMemberships = customerMemberships.filter(membership => membership.isActive);

    if (activeMemberships.length === 0) {
      setPrepaidBalanceByMembershipId({});
      return;
    }

    void (async () => {
      const entries = await Promise.all(activeMemberships.map(async membership => {
        const { balance } = await getMembershipPrepaidBalance(membership.id);
        return [membership.id, balance ?? Math.max(0, Number(membership.prepaidAmount || 0))] as const;
      }));

      if (!isCancelled) {
        setPrepaidBalanceByMembershipId(Object.fromEntries(entries));
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [customerMemberships]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {language === 'zh' ? '會員級別管理' : 'Membership Tier Management'}
          </h2>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-300">
            {language === 'zh' ? '級別固定為 5 種：Guest / Plus / Priority / Platinum / Sapphire' : 'Tiers are fixed: Guest / Plus / Priority / Platinum / Sapphire'}
          </p>
        </div>

        <div className="space-y-3">
          {sortedTiers.map(tier => (
            <div key={tier.id} className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 space-y-3">
              <div className="grid md:grid-cols-4 gap-2">
                <div className="rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-black text-slate-900 dark:text-white">
                  {tier.name}
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? '折扣率 %' : 'Discount %'}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={tier.discountedRate}
                    onChange={event => updateTier(tier.id, { discountedRate: Number(event.target.value) || 0, discountRate: Number(event.target.value) || 0 })}
                    disabled={isReadOnly}
                    className="w-24 rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-1 text-xs font-bold text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? '可綁車牌數' : 'Linked Plates'}</span>
                  <input
                    type="number"
                    min="0"
                    value={tier.linkedLicensePlates}
                    onChange={event => updateTier(tier.id, { linkedLicensePlates: Math.max(0, Number(event.target.value) || 0), discountEligibleCarLimit: Math.max(0, Number(event.target.value) || 0) })}
                    disabled={isReadOnly}
                    className="w-24 rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-1 text-xs font-bold text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? '生日禮' : 'Birthday Gift'}</span>
                  <input
                    type="checkbox"
                    checked={tier.birthdayGift}
                    onChange={event => updateTier(tier.id, { birthdayGift: event.target.checked })}
                    disabled={isReadOnly}
                    className="w-4 h-4"
                  />
                </label>
              </div>

              <div className="grid md:grid-cols-6 gap-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? '積分門檻' : 'Status Points'}</span>
                  <input
                    type="number"
                    min="0"
                    value={tier.statusPointsThreshold}
                    onChange={event => updateTier(tier.id, { statusPointsThreshold: Math.max(0, Number(event.target.value) || 0) })}
                    disabled={isReadOnly}
                    className="w-24 rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-1 text-xs font-bold text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? 'Car Care 升級' : 'Car Care Upgrades'}</span>
                  <input
                    type="number"
                    min="0"
                    value={tier.complimentaryCarCareUpgrade}
                    onChange={event => updateTier(tier.id, { complimentaryCarCareUpgrade: Math.max(0, Number(event.target.value) || 0) })}
                    disabled={isReadOnly}
                    className="w-24 rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-1 text-xs font-bold text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? '港珠澳接送次數' : 'HZMB Service'}</span>
                  <input
                    type="number"
                    min="0"
                    value={tier.hzmbService}
                    onChange={event => updateTier(tier.id, { hzmbService: Math.max(0, Number(event.target.value) || 0) })}
                    disabled={isReadOnly}
                    className="w-24 rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-1 text-xs font-bold text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? 'Priority Wash 次數' : 'Priority Wash'}</span>
                  <input
                    type="number"
                    min="0"
                    value={tier.priorityWash}
                    onChange={event => updateTier(tier.id, { priorityWash: Math.max(0, Number(event.target.value) || 0), priorityLevel: Math.max(0, Number(event.target.value) || 0) })}
                    disabled={isReadOnly}
                    className="w-24 rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-1 text-xs font-bold text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? '專屬邀請' : 'Exclusive Invite'}</span>
                  <input
                    type="checkbox"
                    checked={tier.exclusiveEvents}
                    onChange={event => updateTier(tier.id, { exclusiveEvents: event.target.checked })}
                    disabled={isReadOnly}
                    className="w-4 h-4"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? 'EV 充電費率' : 'EV Charging Rates'}</span>
                  <input
                    type="number"
                    min="0"
                    value={tier.evChargingRates}
                    onChange={event => updateTier(tier.id, { evChargingRates: Math.max(0, Number(event.target.value) || 0) })}
                    disabled={isReadOnly}
                    className="w-24 rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-1 text-xs font-bold text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? '啟用' : 'Active'}</span>
                  <input
                    type="checkbox"
                    checked={tier.isActive}
                    onChange={event => updateTier(tier.id, { isActive: event.target.checked })}
                    disabled={isReadOnly}
                    className="w-4 h-4"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="text-lg font-black text-slate-900 dark:text-white">
          {language === 'zh' ? '客戶會員設定' : 'Customer Membership Assignment'}
        </h3>

        <div className="grid md:grid-cols-2 gap-3">
          <CustomerPromptSelect
            value={selectedCustomerId}
            onChange={id => { setSelectedCustomerId(id); setSelectedVehicleId(''); }}
            options={customers.map(customer => ({ id: customer.id, name: customer.name }))}
            language={language}
            promptText={language === 'zh' ? '新增客戶' : 'Add a customer'}
            emptyOptionText={language === 'zh' ? '選擇客戶' : 'Select customer'}
            className="rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
          />

          <select
            value={selectedTierId}
            onChange={event => {
              const tierId = event.target.value;
              setSelectedTierId(tierId);
              const tier = tierById.get(tierId);
              if (tier) {
                setSelectedPrepaidAmount(String(tier.statusPointsThreshold * 10));
              } else {
                setSelectedPrepaidAmount('0');
              }
            }}
            className="rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
          >
            <option value="">{language === 'zh' ? '選擇會員級別' : 'Select tier'}</option>
            {sortedTiers
              .filter(tier => tier.isActive)
              .map(tier => (
                <option key={tier.id} value={tier.id}>{tier.name}</option>
              ))}
          </select>

          <select
            value={selectedVehicleId}
            onChange={event => setSelectedVehicleId(event.target.value)}
            disabled={!selectedCustomerId}
            className="rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white disabled:opacity-50"
          >
            <option value="">{language === 'zh' ? '選擇主要車輛（必填）' : 'Select primary vehicle (required)'}</option>
            {vehiclesForCustomer.map(v => (
              <option key={v.id} value={v.id}>{v.licensePlate}{v.make ? ` – ${v.make}` : ''}</option>
            ))}
          </select>

          <label className="rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-xs whitespace-nowrap">{language === 'zh' ? '有效至' : 'Valid Till'}</span>
            <input
              type="date"
              value={selectedValidTillDate}
              onChange={event => setSelectedValidTillDate(event.target.value)}
              className="w-full bg-transparent outline-none text-sm font-bold text-slate-900 dark:text-white"
            />
          </label>

          <label className="rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-xs whitespace-nowrap">{language === 'zh' ? '預付金' : 'Prepaid'}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={selectedPrepaidAmount}
              onChange={event => setSelectedPrepaidAmount(event.target.value)}
              className="w-full bg-transparent outline-none text-sm font-bold text-slate-900 dark:text-white"
            />
          </label>

          <button
            onClick={assignMembership}
            disabled={isReadOnly || !selectedCustomerId || !selectedTierId || !selectedVehicleId || !selectedValidTillDate}
            className="rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest px-3 py-2 disabled:opacity-50"
          >
            {language === 'zh' ? '套用會員' : 'Assign Membership'}
          </button>
        </div>
        {assignError && (
          <p className="text-xs font-bold text-rose-600">{assignError}</p>
        )}

        {isPaymentPopupOpen && pendingPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-xl rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-black text-slate-900 dark:text-white">{language === 'zh' ? '確認收款' : 'Confirm Payment'}</h4>
                <button
                  onClick={cancelMembershipPayment}
                  className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-black uppercase tracking-widest"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4 space-y-2">
                <p className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? '客戶' : 'Customer'}: {pendingPayment.customerName}</p>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-300">{language === 'zh' ? '會員編號' : 'Membership No.'}: {pendingPayment.membershipNo || '-'}</p>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-300">{language === 'zh' ? '會員級別' : 'Tier'}: {pendingPayment.tierName || '-'}</p>
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{language === 'zh' ? '應收金額' : 'Amount'}: {pendingPayment.prepaidAmount.toFixed(2)}</p>
              </div>

              <div className="grid gap-2">
                {PAYMENT_METHOD_OPTIONS.map(method => {
                  const isSelected = selectedPaymentMethod === method;
                  return (
                    <button
                      key={method}
                      onClick={() => {
                        setSelectedPaymentMethod(method);
                        const forcedCurrency = getForcedCurrencyForMethod(method);
                        if (forcedCurrency) {
                          setSelectedPaymentCurrency(forcedCurrency);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-black ${isSelected ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
                    >
                      <span>{method}</span>
                      <i className={`fas ${isSelected ? 'fa-check-circle' : 'fa-circle'} text-sm`}></i>
                    </button>
                  );
                })}
              </div>

              <label className="rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-xs whitespace-nowrap">{language === 'zh' ? '支付貨幣' : 'Payment Currency'}</span>
                <select
                  value={selectedPaymentCurrency}
                  onChange={event => setSelectedPaymentCurrency(event.target.value as PaymentCurrency)}
                  className="w-full bg-transparent outline-none text-sm font-bold text-slate-900 dark:text-white"
                  disabled={getForcedCurrencyForMethod(selectedPaymentMethod) !== null}
                >
                  <option value={PaymentCurrency.HKD}>{PaymentCurrency.HKD}</option>
                  <option value={PaymentCurrency.RMB}>{PaymentCurrency.RMB}</option>
                  <option value={PaymentCurrency.MOP}>{PaymentCurrency.MOP}</option>
                </select>
              </label>

              <button
                onClick={confirmMembershipPayment}
                disabled={isReadOnly}
                className="w-full px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black uppercase tracking-widest disabled:opacity-50"
              >
                {language === 'zh' ? '確認交易' : 'Confirm transaction'}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-300 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">{language === 'zh' ? '會員編號' : 'Membership No.'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '客戶' : 'Customer'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '目前級別' : 'Active Tier'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '折扣' : 'Discount'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '主要車牌' : 'Primary Plate'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '預付金' : 'Prepaid'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '有效至' : 'Valid Till'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '操作' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {activeCustomerRows.map(row => {
                const primaryVehicle = row.membership?.primaryVehicleId
                  ? vehicles.find(v => v.id === row.membership!.primaryVehicleId)
                  : undefined;
                return (
                <tr
                  key={row.customer.id}
                  className="border-t border-slate-100 dark:border-white/10 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                  onClick={() => setDetailCustomerId(row.customer.id)}
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{row.membership?.membershipNo || '-'}</td>
                  <td className="px-3 py-2 font-bold text-slate-900 dark:text-white">{row.customer.name}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{row.tier?.name || '-'}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                    {row.membership ? `${row.membership.discountedRateSnapshot.toFixed(2)}%` : '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                    {primaryVehicle?.licensePlate || '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                    {row.membership ? Number(prepaidBalanceByMembershipId[row.membership.id] ?? row.membership.prepaidAmount ?? 0).toFixed(2) : '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                    {formatMembershipDate(row.membership?.validTill)}
                  </td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    {row.membership?.isActive ? (
                      <button
                        onClick={() => deactivateMembership(row.membership!.id)}
                        disabled={isReadOnly}
                        className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        {language === 'zh' ? '停用' : 'Deactivate'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">{language === 'zh' ? '未啟用' : 'None'}</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Member Detail Popup ── */}
      {detailCustomerId && (() => {
        const row = activeCustomerRows.find(r => r.customer.id === detailCustomerId);
        if (!row) return null;
        const { customer, membership, tier } = row;
        const primaryVehicle = membership?.primaryVehicleId
          ? vehicles.find(v => v.id === membership.primaryVehicleId)
          : undefined;
        const prepaidBalance = membership
          ? Number(prepaidBalanceByMembershipId[membership.id] ?? membership.prepaidAmount ?? 0)
          : 0;

        type BenefitRow = { label: string; value: string | number | boolean; icon: string; sublabel?: string };
        const ccRemaining = detailBenefitRemaining.car_care_upgrade;
        const hzmbRemaining = detailBenefitRemaining.hzmb_shuttle;
        const benefits: BenefitRow[] = membership ? [
          { label: language === 'zh' ? '折扣率' : 'Discount Rate', value: `${membership.discountedRateSnapshot.toFixed(2)}%`, icon: 'fa-tag' },
          { label: language === 'zh' ? '可綁車牌數' : 'Linked Plates', value: membership.linkedLicensePlatesSnapshot, icon: 'fa-car' },
          {
            label: language === 'zh' ? 'Car Care 升級次數' : 'Car Care Upgrades',
            value: ccRemaining !== undefined ? `${ccRemaining} / ${membership.complimentaryCarCareUpgradeSnapshot}` : membership.complimentaryCarCareUpgradeSnapshot,
            icon: 'fa-star',
            sublabel: ccRemaining !== undefined ? (language === 'zh' ? '剩餘 / 總數' : 'remaining / total') : undefined,
          },
          { label: language === 'zh' ? 'Priority Wash 次數' : 'Priority Wash', value: membership.priorityWashSnapshot, icon: 'fa-shower' },
          {
            label: language === 'zh' ? '港珠澳接送次數' : 'HZMB Service',
            value: hzmbRemaining !== undefined ? `${hzmbRemaining} / ${membership.hzmbServiceSnapshot}` : membership.hzmbServiceSnapshot,
            icon: 'fa-ship',
            sublabel: hzmbRemaining !== undefined ? (language === 'zh' ? '剩餘 / 總數' : 'remaining / total') : undefined,
          },
          { label: language === 'zh' ? '生日禮' : 'Birthday Gift', value: membership.birthdayGiftSnapshot ? (language === 'zh' ? '是' : 'Yes') : (language === 'zh' ? '否' : 'No'), icon: 'fa-gift' },
          { label: language === 'zh' ? '專屬邀請' : 'Exclusive Invitation', value: membership.exclusiveInvitationSnapshot ? (language === 'zh' ? '是' : 'Yes') : (language === 'zh' ? '否' : 'No'), icon: 'fa-envelope-open-text' },
        ] : [];

        return (
          <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                    {membership?.membershipNo || '-'}
                  </p>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">{customer.name}</h3>
                  {customer.chineseName && (
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{customer.chineseName}</p>
                  )}
                </div>
                <button
                  onClick={() => setDetailCustomerId(null)}
                  className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 dark:text-slate-300"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="px-6 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Vehicle + Tier */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                      {language === 'zh' ? '主要車輛' : 'Vehicle'}
                    </p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      {primaryVehicle?.licensePlate || '-'}
                    </p>
                    {primaryVehicle && (
                      <p className="text-xs font-bold text-slate-500">{primaryVehicle.make} {primaryVehicle.model}</p>
                    )}
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                      {language === 'zh' ? '會員級別' : 'Tier'}
                    </p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">{tier?.name || '-'}</p>
                  </div>
                </div>

                {/* Points + Prepaid + Valid Till */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30">
                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-1">
                      {language === 'zh' ? '目前積分' : 'Points'}
                    </p>
                    <p className="text-lg font-black text-blue-600 dark:text-blue-300">
                      {membership?.statusPoints ?? 0}
                    </p>
                    {membership && (
                      <p className="text-[9px] font-bold text-slate-400">
                        / {membership.statusPointsSnapshot}
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30">
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1">
                      {language === 'zh' ? '預付餘額' : 'Prepaid'}
                    </p>
                    <p className="text-lg font-black text-emerald-600 dark:text-emerald-300">
                      ¥{prepaidBalance.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-1">
                      {language === 'zh' ? '有效至' : 'Valid Till'}
                    </p>
                    <p className="text-xs font-black text-amber-700 dark:text-amber-300 leading-tight">
                      {formatMembershipDate(membership?.validTill)}
                    </p>
                  </div>
                </div>

                {/* Benefits */}
                {benefits.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      {language === 'zh' ? '會員福利' : 'Benefits'}
                    </p>
                    <div className="space-y-2">
                      {benefits.map(b => (
                        <div key={b.label} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 text-xs shadow-sm">
                              <i className={`fas ${b.icon}`}></i>
                            </div>
                              <div>
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{b.label}</span>
                                {b.sublabel && <p className="text-[9px] font-bold text-slate-400">{b.sublabel}</p>}
                              </div>
                          </div>
                          <span className="text-sm font-black text-slate-900 dark:text-white">{String(b.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!membership && (
                  <p className="text-center text-sm font-bold text-slate-400 py-4">
                    {language === 'zh' ? '此客戶暫無有效會員' : 'No active membership'}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default MembershipsPage;