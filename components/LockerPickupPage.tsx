import React, { useEffect, useMemo, useState } from 'react';
import { Locker, LockerReservation } from '../types';
import { confirmLockerPickupByPlate, fetchRemoteLockerReservations, fetchRemoteLockers } from '../services/database';
import { normalizeLicensePlate } from '../utils/licensePlate';
import LicensePlateField from './LicensePlateField';

interface LockerPickupPageProps {
  language: 'zh' | 'en';
  isReadOnly?: boolean;
}

const LockerPickupPage: React.FC<LockerPickupPageProps> = ({ language, isReadOnly }) => {
  const zh = language === 'zh';
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [reservations, setReservations] = useState<LockerReservation[]>([]);
  const [plateFilter, setPlateFilter] = useState('');
  const [confirmPlateByReservation, setConfirmPlateByReservation] = useState<Record<string, string>>({});
  const [activeReservationId, setActiveReservationId] = useState<string | null>(null);
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

  const storedReservations = useMemo(() => {
    const normalizedFilter = normalizeLicensePlate(plateFilter);
    return reservations
      .filter((reservation) => reservation.status === 'stored')
      .filter((reservation) => {
        if (!normalizedFilter) return true;
        return normalizeLicensePlate(reservation.plateNumber || '')
          .includes(normalizedFilter);
      })
      .sort((a, b) => new Date(a.storedAt || a.createdAt).getTime() - new Date(b.storedAt || b.createdAt).getTime());
  }, [reservations, plateFilter]);

  const handleConfirmPickup = async (reservation: LockerReservation) => {
    if (isReadOnly) return;

    const inputPlate = normalizeLicensePlate(confirmPlateByReservation[reservation.id] || '');
    if (!inputPlate) {
      alert(zh ? '請輸入車牌以確認取件。' : 'Please enter the plate number to confirm pickup.');
      return;
    }

    setActiveReservationId(reservation.id);
    setStatusMessage('');

    const result = await confirmLockerPickupByPlate({
      reservationId: reservation.id,
      plateNumber: inputPlate,
      changedBy: 'locker_staff',
    });

    setActiveReservationId(null);

    if (!result.success) {
      setStatusMessage(result.error || (zh ? '取件失敗，請重試。' : 'Pickup failed. Please retry.'));
      return;
    }

    setStatusMessage(zh ? '已完成取件。' : 'Pickup confirmed.');
    setConfirmPlateByReservation((previous) => ({
      ...previous,
      [reservation.id]: '',
    }));
    await loadData();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">
              {zh ? 'Locker 取件' : 'Locker Pickup'}
            </h2>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-2">
              {zh ? '僅需要車牌確認即可放行' : 'Release with plate confirmation only'}
            </p>
          </div>
          <div className="rounded-2xl bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-300">
              {zh ? '等待取件' : 'Awaiting Pickup'}
            </div>
            <div className="text-xl font-black text-blue-700 dark:text-blue-200">{storedReservations.length}</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 p-6 space-y-4">
        <LicensePlateField
          value={plateFilter}
          onChange={setPlateFilter}
          language={language}
          label={zh ? '按車牌搜尋' : 'Search by Plate'}
          placeholder={zh ? '輸入車牌' : 'Enter plate'}
          disabled={isReadOnly}
        />

        {statusMessage && (
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{statusMessage}</div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 p-6">
        <div className="space-y-4">
          {storedReservations.length === 0 ? (
            <div className="text-sm text-slate-400">{zh ? '目前沒有待取件記錄。' : 'No items waiting for pickup.'}</div>
          ) : (
            storedReservations.map((reservation) => {
              const locker = lockerById.get(reservation.lockerId);
              const isSubmitting = activeReservationId === reservation.id;
              return (
                <div key={reservation.id} className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                    <span>{normalizeLicensePlate(reservation.plateNumber)}</span>
                    <span className="text-slate-400">•</span>
                    <span>{locker ? `${locker.locationCode.toUpperCase()}-${locker.lockerNumber}` : reservation.lockerId}</span>
                    <span className="text-slate-400">•</span>
                    <span>{new Date(reservation.storedAt || reservation.createdAt).toLocaleString()}</span>
                  </div>

                  {reservation.itemDescription && (
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {reservation.itemDescription}
                    </div>
                  )}

                  <div className="space-y-3">
                    <LicensePlateField
                      value={confirmPlateByReservation[reservation.id] || ''}
                      onChange={(value) => setConfirmPlateByReservation((previous) => ({
                        ...previous,
                        [reservation.id]: normalizeLicensePlate(value),
                      }))}
                      language={language}
                      label={zh ? '輸入車牌確認取件' : 'Enter plate to confirm pickup'}
                      placeholder={zh ? '輸入車牌確認取件' : 'Enter plate to confirm pickup'}
                      disabled={isReadOnly || isSubmitting}
                    />
                    <button
                      onClick={() => handleConfirmPickup(reservation)}
                      disabled={isReadOnly || isSubmitting}
                      className="px-5 py-3 rounded-2xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50"
                    >
                      {isSubmitting ? (zh ? '確認中...' : 'Confirming...') : (zh ? '確認取件' : 'Confirm Pickup')}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default LockerPickupPage;
