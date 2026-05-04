import React, { useEffect, useMemo, useState } from 'react';
import { CheckoutOrder, Locker, LockerReservation, Vehicle } from '../types';
import { createLockerDepositReservationAutoAssign, fetchRemoteLockerReservations, fetchRemoteLockers } from '../services/database';
import { normalizeLicensePlate } from '../utils/licensePlate';
import LicensePlateField from './LicensePlateField';

interface LockerDepositPageProps {
  language: 'zh' | 'en';
  vehicles: Vehicle[];
  checkoutOrders: CheckoutOrder[];
  isReadOnly?: boolean;
}

const LockerDepositPage: React.FC<LockerDepositPageProps> = ({
  language,
  vehicles,
  checkoutOrders,
  isReadOnly,
}) => {
  const zh = language === 'zh';
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [reservations, setReservations] = useState<LockerReservation[]>([]);
  const [plateInput, setPlateInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const lockerById = useMemo(() => new Map(lockers.map((locker) => [locker.id, locker])), [lockers]);

  const loadData = async () => {
    const [lockersResult, reservationsResult] = await Promise.all([
      fetchRemoteLockers(),
      fetchRemoteLockerReservations(),
    ]);

    if (lockersResult.data) setLockers(lockersResult.data);
    if (reservationsResult.data) setReservations(reservationsResult.data);

    if (lockersResult.error || reservationsResult.error) {
      setStatusMessage(lockersResult.error || reservationsResult.error || 'Load failed.');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const activeReservations = useMemo(() => {
    return reservations.filter((item) => item.status === 'reserved' || item.status === 'stored');
  }, [reservations]);

  const recentDeposits = useMemo(() => {
    return reservations
      .filter((item) => item.status === 'stored')
      .sort((a, b) => new Date(b.storedAt || b.createdAt).getTime() - new Date(a.storedAt || a.createdAt).getTime())
      .slice(0, 8);
  }, [reservations]);

  const availableCount = Math.max(0, lockers.filter((locker) => locker.isActive).length - activeReservations.length);

  const linkedCheckoutOrders = useMemo(() => {
    return [...checkoutOrders]
      .filter((order) => order.status === 'checked_out' || order.status === 'task_completed')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 40);
  }, [checkoutOrders]);

  const handleCreateDeposit = async () => {
    if (isReadOnly) return;

    const normalizedPlate = normalizeLicensePlate(plateInput);
    if (!normalizedPlate) {
      alert(zh ? '請先輸入車牌。' : 'Please enter a plate number.');
      return;
    }

    setIsSaving(true);
    setStatusMessage('');

    const matchedVehicle = vehicles.find(
      (vehicle) => normalizeLicensePlate(vehicle.licensePlate || '') === normalizedPlate,
    );

    const result = await createLockerDepositReservationAutoAssign({
      plateNumber: normalizedPlate,
      itemDescription: descriptionInput.trim() || undefined,
      checkoutOrderId: selectedOrderId || undefined,
      vehicleId: matchedVehicle?.id,
      createdBy: 'locker_staff',
    });

    setIsSaving(false);

    if (!result.success) {
      setStatusMessage(result.error || (zh ? '存放失敗，請重試。' : 'Deposit failed. Please retry.'));
      return;
    }

    const lockerLabel = result.locker ? `${result.locker.locationCode.toUpperCase()}-${result.locker.lockerNumber}` : '-';
    setStatusMessage(zh ? `已存放到櫃位 ${lockerLabel}` : `Stored in locker ${lockerLabel}`);
    setPlateInput('');
    setDescriptionInput('');
    setSelectedOrderId('');
    await loadData();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">
              {zh ? 'Locker 存放' : 'Locker Deposit'}
            </h2>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-2">
              {zh ? '系統自動分配第一個可用櫃位' : 'System auto-assigns the first available locker'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
                {zh ? '可用櫃位' : 'Available'}
              </div>
              <div className="text-xl font-black text-emerald-700 dark:text-emerald-200">{availableCount}</div>
            </div>
            <div className="rounded-2xl bg-blue-50 dark:bg-blue-900/20 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-300">
                {zh ? '存放中' : 'Stored'}
              </div>
              <div className="text-xl font-black text-blue-700 dark:text-blue-200">{activeReservations.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LicensePlateField
            value={plateInput}
            onChange={setPlateInput}
            language={language}
            label={zh ? '車牌' : 'Plate'}
            placeholder={zh ? '例如 AB1234' : 'e.g. AB1234'}
            disabled={isReadOnly || isSaving}
          />

          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {zh ? '關聯訂單（可選）' : 'Linked Checkout (optional)'}
            </span>
            <select
              value={selectedOrderId}
              onChange={(event) => setSelectedOrderId(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-bold text-slate-900 dark:text-white"
              disabled={isReadOnly || isSaving}
            >
              <option value="">{zh ? '不關聯訂單' : 'No linked order'}</option>
              {linkedCheckoutOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.invoiceNumber || order.id.slice(0, 8)} - {normalizeLicensePlate(
                    vehicles.find((vehicle) => vehicle.id === order.vehicleId)?.licensePlate || '',
                  )}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="space-y-2 block">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {zh ? '物品描述（可選）' : 'Item Description (optional)'}
          </span>
          <input
            value={descriptionInput}
            onChange={(event) => setDescriptionInput(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-bold text-slate-900 dark:text-white"
            placeholder={zh ? '例如：車匙、文件、包裹' : 'e.g. Keys, documents, package'}
            disabled={isReadOnly || isSaving}
          />
        </label>

        <button
          onClick={handleCreateDeposit}
          disabled={isReadOnly || isSaving}
          className="w-full md:w-auto px-6 py-3 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50"
        >
          {isSaving ? (zh ? '存放中...' : 'Depositing...') : (zh ? '存放到 Locker' : 'Deposit to Locker')}
        </button>

        {statusMessage && (
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {statusMessage}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-4">
          {zh ? '最新存放記錄' : 'Recent Stored Items'}
        </h3>
        <div className="space-y-3">
          {recentDeposits.length === 0 ? (
            <div className="text-sm text-slate-400">{zh ? '暫無存放記錄。' : 'No stored records yet.'}</div>
          ) : (
            recentDeposits.map((reservation) => {
              const locker = lockerById.get(reservation.lockerId);
              return (
                <div key={reservation.id} className="rounded-2xl border border-slate-200 dark:border-white/10 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                    <span>{normalizeLicensePlate(reservation.plateNumber)}</span>
                    <span className="text-slate-400">•</span>
                    <span>{locker ? `${locker.locationCode.toUpperCase()}-${locker.lockerNumber}` : reservation.lockerId}</span>
                    <span className="text-slate-400">•</span>
                    <span>{new Date(reservation.storedAt || reservation.createdAt).toLocaleString()}</span>
                  </div>
                  {reservation.itemDescription && (
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
                      {reservation.itemDescription}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default LockerDepositPage;
