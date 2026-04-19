import React, { useMemo, useState } from 'react';
import { Customer, CustomerMembership, MembershipTier } from '../types';

interface MembershipsPageProps {
  language: 'zh' | 'en';
  customers: Customer[];
  membershipTiers: MembershipTier[];
  customerMemberships: CustomerMembership[];
  onSaveMembershipTiers: (tiers: MembershipTier[]) => Promise<void> | void;
  onSaveCustomerMemberships: (memberships: CustomerMembership[]) => Promise<void> | void;
  isReadOnly?: boolean;
}

const MembershipsPage: React.FC<MembershipsPageProps> = ({
  language,
  customers,
  membershipTiers,
  customerMemberships,
  onSaveMembershipTiers,
  onSaveCustomerMemberships,
  isReadOnly,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTierId, setSelectedTierId] = useState<string>('');

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

  const assignMembership = async () => {
    if (isReadOnly) return;
    if (!selectedCustomerId || !selectedTierId) return;

    const tier = tierById.get(selectedTierId);
    if (!tier) return;

    const now = new Date().toISOString();
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
      discountRateSnapshot: tier.discountedRate,
      discountEligibleCarLimitSnapshot: tier.linkedLicensePlates,
      priorityLevelSnapshot: tier.priorityWash,
      exclusiveEventsSnapshot: tier.exclusiveInvitation,
      statusPoints: 0,
      startAt: now,
      endAt: undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      statusPointsSnapshot: tier.statusPoints,
      birthdayGiftSnapshot: tier.birthdayGift,
      discountedRateSnapshot: tier.discountedRate,
      linkedLicensePlatesSnapshot: tier.linkedLicensePlates,
      complimentaryCarCareUpgradeSnapshot: tier.complimentaryCarCareUpgrade,
      priorityWashSnapshot: tier.priorityWash,
      exclusiveInvitationSnapshot: tier.exclusiveInvitation,
    };

    await onSaveCustomerMemberships([newMembership, ...updatedMemberships]);
    setSelectedCustomerId('');
    setSelectedTierId('');
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

              <div className="grid md:grid-cols-4 gap-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>{language === 'zh' ? '積分門檻' : 'Status Points'}</span>
                  <input
                    type="number"
                    min="0"
                    value={tier.statusPoints}
                    onChange={event => updateTier(tier.id, { statusPoints: Math.max(0, Number(event.target.value) || 0), statusPointsThreshold: Math.max(0, Number(event.target.value) || 0) })}
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
                    checked={tier.exclusiveInvitation}
                    onChange={event => updateTier(tier.id, { exclusiveInvitation: event.target.checked, exclusiveEvents: event.target.checked })}
                    disabled={isReadOnly}
                    className="w-4 h-4"
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

        <div className="grid md:grid-cols-3 gap-3">
          <select
            value={selectedCustomerId}
            onChange={event => setSelectedCustomerId(event.target.value)}
            className="rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
          >
            <option value="">{language === 'zh' ? '選擇客戶' : 'Select customer'}</option>
            {customers.map(customer => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>

          <select
            value={selectedTierId}
            onChange={event => setSelectedTierId(event.target.value)}
            className="rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
          >
            <option value="">{language === 'zh' ? '選擇會員級別' : 'Select tier'}</option>
            {sortedTiers
              .filter(tier => tier.isActive)
              .map(tier => (
                <option key={tier.id} value={tier.id}>{tier.name}</option>
              ))}
          </select>

          <button
            onClick={assignMembership}
            disabled={isReadOnly || !selectedCustomerId || !selectedTierId}
            className="rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest px-3 py-2 disabled:opacity-50"
          >
            {language === 'zh' ? '套用會員' : 'Assign Membership'}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-300 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">{language === 'zh' ? '客戶' : 'Customer'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '目前級別' : 'Active Tier'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '折扣' : 'Discount'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '車牌上限' : 'Plate Limit'}</th>
                <th className="px-3 py-2">{language === 'zh' ? '操作' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {activeCustomerRows.map(row => (
                <tr key={row.customer.id} className="border-t border-slate-100 dark:border-white/10">
                  <td className="px-3 py-2 font-bold text-slate-900 dark:text-white">{row.customer.name}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{row.tier?.name || '-'}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                    {row.membership ? `${row.membership.discountedRateSnapshot.toFixed(2)}%` : '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                    {row.membership ? row.membership.linkedLicensePlatesSnapshot : '-'}
                  </td>
                  <td className="px-3 py-2">
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
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default MembershipsPage;