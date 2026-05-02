import React, { useEffect, useMemo, useState } from 'react';
import LicensePlateField from './LicensePlateField';
import { Customer, Vehicle, VehicleSize, VehicleType } from '../types';
import { VEHICLE_COLORS, VEHICLE_MAKES_EXTENDED, getVehicleModelsForMake } from '../vehicleData_v2';
import { normalizeLicensePlate } from '../utils/licensePlate';

interface VehiclesPageProps {
  vehicles: Vehicle[];
  customers: Customer[];
  onBack: () => void;
  onSaveVehicle: (vehicle: Vehicle) => Promise<void> | void;
  onDeleteVehicle: (vehicleId: string) => Promise<void> | void;
  language: 'zh' | 'en';
  isReadOnly?: boolean;
  prefillLicensePlate?: string;
  onPrefillLicensePlateConsumed?: () => void;
  returnToCheckoutOnSave?: boolean;
  onReturnToCheckoutAfterSave?: (licensePlate?: string, customerId?: string) => void;
  onNavigateToAddCustomer?: (licensePlate?: string) => void;
}

type VehicleDraft = {
  licensePlate: string;
  make: string;
  model: string;
  color: string;
  vehicleType: VehicleType;
  vehicleSize: VehicleSize;
  customerId: string;
};

const VEHICLE_TYPE_OPTIONS: Array<{ value: VehicleType; label: string }> = [
  { value: VehicleType.SEDAN, label: 'Sedan' },
  { value: VehicleType.HATCHBACK, label: 'Hatchback' },
  { value: VehicleType.WAGON, label: 'Wagon' },
  { value: VehicleType.COUPE, label: 'Coupe' },
  { value: VehicleType.SPORTS, label: 'Sports' },
  { value: VehicleType.CROSSOVER, label: 'Crossover' },
  { value: VehicleType.SUV, label: 'SUV' },
  { value: VehicleType.OFFROAD, label: 'Off-road' },
  { value: VehicleType.PICKUP, label: 'Pick-up' },
  { value: VehicleType.MPV, label: 'MPV' },
  { value: VehicleType.VAN, label: 'VAN' },
  { value: VehicleType.LIMOUSINE, label: 'Limousine' },
];

const LARGE_VEHICLE_TYPES = new Set<VehicleType>([
  VehicleType.CROSSOVER,
  VehicleType.SUV,
  VehicleType.OFFROAD,
  VehicleType.PICKUP,
  VehicleType.MPV,
  VehicleType.VAN,
  VehicleType.LIMOUSINE,
]);

const getVehicleSizeForType = (type: VehicleType): VehicleSize => {
  return LARGE_VEHICLE_TYPES.has(type) ? VehicleSize.LARGE : VehicleSize.REGULAR;
};

const normalizeMakeKey = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[\/|]/g, '');
};

const canonicalMakeKey = (value: string): string => {
  const normalized = normalizeMakeKey(value);
  const englishOnly = normalized.replace(/[\u4e00-\u9fff]/g, '');
  return englishOnly || normalized;
};

const emptyDraft: VehicleDraft = {
  licensePlate: '',
  make: '',
  model: '',
  color: '',
  vehicleType: VehicleType.SEDAN,
  vehicleSize: VehicleSize.REGULAR,
  customerId: '',
};

const VehiclesPage: React.FC<VehiclesPageProps> = ({
  vehicles,
  customers,
  onBack,
  onSaveVehicle,
  onDeleteVehicle,
  language,
  isReadOnly,
  prefillLicensePlate,
  onPrefillLicensePlateConsumed,
  returnToCheckoutOnSave,
  onReturnToCheckoutAfterSave,
  onNavigateToAddCustomer,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [makeFilter, setMakeFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [draft, setDraft] = useState<VehicleDraft>(emptyDraft);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const customer of customers) {
      map.set(customer.id, customer);
    }
    return map;
  }, [customers]);

  const makeOptions = useMemo(() => {
    const list = Array.from(new Set(vehicles.map(v => (v.make || '').trim()).filter(Boolean)));
    return (list as string[]).sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  const autofillMakes = useMemo(() => {
    return Array.from(new Set([...VEHICLE_MAKES_EXTENDED, ...makeOptions])).sort((a, b) => a.localeCompare(b));
  }, [makeOptions]);

  const autofillModels = useMemo(() => {
    const makeKey = canonicalMakeKey(draft.make.trim());
    if (!makeKey) return [];
    const staticModels = getVehicleModelsForMake(draft.make);
    const existingModels = vehicles
      .filter(vehicle => canonicalMakeKey((vehicle.make || '').trim()) === makeKey)
      .map(vehicle => (vehicle.model || '').trim())
      .filter(Boolean);
    return Array.from(new Set([...staticModels, ...existingModels])).sort((a, b) => a.localeCompare(b));
  }, [draft.make, vehicles]);

  const autofillColors = useMemo(() => {
    const existingColors = vehicles.map(vehicle => (vehicle.color || '').trim()).filter(Boolean);
    return Array.from(new Set([...VEHICLE_COLORS, ...existingColors])).sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();

    return vehicles.filter(vehicle => {
      const linked = Boolean(vehicle.customerId && customerById.get(vehicle.customerId));
      if (statusFilter === 'linked' && !linked) return false;
      if (statusFilter === 'unlinked' && linked) return false;

      const makeName = (vehicle.make || '').trim();
      if (makeFilter !== 'all' && makeName.toLowerCase() !== makeFilter.toLowerCase()) return false;

      if (!term) return true;

      const customerName = vehicle.customerId ? (customerById.get(vehicle.customerId)?.name || '') : '';
      const haystack = [
        vehicle.licensePlate || '',
        vehicle.make || '',
        vehicle.model || '',
        vehicle.color || '',
        vehicle.vehicleType || '',
        vehicle.vehicleSize || '',
        customerName,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [vehicles, customerById, search, statusFilter, makeFilter]);

  const openNew = (licensePlate?: string) => {
    const normalizedPlate = (licensePlate || '').trim().toUpperCase();
    setEditingVehicle(null);
    setDraft(normalizedPlate ? { ...emptyDraft, licensePlate: normalizedPlate } : emptyDraft);
    setShowForm(true);
  };

  const openEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setDraft({
      licensePlate: vehicle.licensePlate || '',
      make: vehicle.make || '',
      model: vehicle.model || '',
      color: vehicle.color || '',
      vehicleType: vehicle.vehicleType || VehicleType.SEDAN,
      vehicleSize: vehicle.vehicleSize || getVehicleSizeForType(vehicle.vehicleType || VehicleType.SEDAN),
      customerId: vehicle.customerId || '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingVehicle(null);
    setDraft(emptyDraft);
  };

  useEffect(() => {
    const plate = (prefillLicensePlate || '').trim().toUpperCase();
    if (!plate || isReadOnly) return;

    setEditingVehicle(null);
    setDraft({ ...emptyDraft, licensePlate: plate });
    setShowForm(true);
    onPrefillLicensePlateConsumed?.();
  }, [prefillLicensePlate, isReadOnly, onPrefillLicensePlateConsumed]);

  const saveVehicle = async (customerIdOverride?: string, skipCheckoutReturn = false) => {
    if (isSaving) return;
    const normalizedPlate = draft.licensePlate.trim().toUpperCase();
    if (!normalizedPlate) return;

    const normalizedPlateKey = normalizeLicensePlate(normalizedPlate);
    const duplicatedPlateVehicle = vehicles.find(candidate => {
      if (!candidate.licensePlate) return false;
      if (editingVehicle && candidate.id === editingVehicle.id) return false;
      return normalizeLicensePlate(candidate.licensePlate) === normalizedPlateKey;
    });

    const resolvedCustomerId = customerIdOverride !== undefined
      ? customerIdOverride
      : (draft.customerId || duplicatedPlateVehicle?.customerId || '');

    const now = new Date().toISOString();
    const vehicle: Vehicle = {
      id: editingVehicle?.id || duplicatedPlateVehicle?.id || crypto.randomUUID(),
      customerId: resolvedCustomerId,
      licensePlate: normalizedPlate,
      make: draft.make.trim(),
      model: draft.model.trim(),
      color: draft.color.trim(),
      vehicleType: draft.vehicleType,
      vehicleSize: draft.vehicleSize,
      createdAt: editingVehicle?.createdAt || duplicatedPlateVehicle?.createdAt || now,
      updatedAt: now,
    };

    setIsSaving(true);
    try {
      await onSaveVehicle(vehicle);

      if (returnToCheckoutOnSave && !skipCheckoutReturn) {
        onReturnToCheckoutAfterSave?.(normalizedPlate, resolvedCustomerId || undefined);
        closeForm();
        return;
      }

      closeForm();
    } finally {
      setIsSaving(false);
    }
  };

  const saveVehicleAndOpenAddCustomer = async () => {
    if (isReadOnly) return;

    const normalizedPlate = draft.licensePlate.trim().toUpperCase();
    if (!normalizedPlate) return;

    await saveVehicle(undefined, true);
    onNavigateToAddCustomer?.(normalizedPlate);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await onDeleteVehicle(deleteId);
    setDeleteId(null);
  };

  return (
    <div className="md:max-w-3xl md:mx-auto bg-slate-100 dark:bg-slate-950 min-h-[calc(100vh-120px)]">
      <div className="sticky top-0 bg-slate-100 dark:bg-slate-950 px-5 py-5 z-10">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-100"
            title={language === 'zh' ? '返回' : 'Back'}
          >
            <i className="fas fa-arrow-left text-xl"></i>
          </button>
          <h2 className="text-3xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {language === 'zh' ? '車輛' : 'Vehicles'}
          </h2>
          <button
            onClick={() => openNew()}
            disabled={isReadOnly}
            className="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title={language === 'zh' ? '新增車輛' : 'Add Vehicle'}
          >
            <i className="fas fa-plus text-xl"></i>
          </button>
        </div>
      </div>

      <div className="px-5 pb-4 space-y-3">
        <div className="relative">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
          <input
            type="text"
            placeholder={language === 'zh' ? '搜尋車牌/品牌/客戶' : 'Search plate/make/customer'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 rounded-2xl text-sm font-semibold outline-none text-slate-900 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | 'linked' | 'unlinked')}
            className="h-11 rounded-xl border border-slate-300 dark:border-white/10 px-3 bg-white dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-white"
          >
            <option value="all">{language === 'zh' ? '全部狀態' : 'All Status'}</option>
            <option value="linked">{language === 'zh' ? '已連結客戶' : 'Linked'}</option>
            <option value="unlinked">{language === 'zh' ? '未連結客戶' : 'Unlinked'}</option>
          </select>

          <select
            value={makeFilter}
            onChange={e => setMakeFilter(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 dark:border-white/10 px-3 bg-white dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-white"
          >
            <option value="all">{language === 'zh' ? '全部品牌' : 'All Makes'}</option>
            {makeOptions.map(make => (
              <option key={make} value={make}>{make}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/10">
        {filteredVehicles.length > 0 ? (
          filteredVehicles.map(vehicle => {
            const owner = vehicle.customerId ? customerById.get(vehicle.customerId) : undefined;
            return (
              <div key={vehicle.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-black text-slate-900 dark:text-white tracking-wide">
                      {(vehicle.licensePlate || '').toUpperCase() || '-'}
                    </p>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      {vehicle.make || '-'} {vehicle.model || ''} {vehicle.color || ''}
                    </p>
                    <p className="text-xs font-bold text-slate-400 mt-1">
                      {(vehicle.vehicleType || '-').toString().toUpperCase()} • {(vehicle.vehicleSize || '-').toString().toUpperCase()}
                    </p>
                    <p className="text-xs font-bold text-slate-400 mt-1">
                      {owner ? `${language === 'zh' ? '客戶' : 'Customer'}: ${owner.name}` : (language === 'zh' ? '未連結客戶' : 'No linked customer')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(vehicle)}
                      disabled={isReadOnly}
                      className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                      title={language === 'zh' ? '編輯' : 'Edit'}
                    >
                      <i className="fas fa-pen text-xs"></i>
                    </button>
                    <button
                      onClick={() => setDeleteId(vehicle.id)}
                      disabled={isReadOnly}
                      className="w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 disabled:opacity-50"
                      title={language === 'zh' ? '刪除' : 'Delete'}
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-5 py-12 text-center text-sm font-bold space-y-3">
            <div className="text-slate-400">
              {language === 'zh' ? '沒有符合條件的車輛' : 'No vehicles found'}
            </div>
            {search.trim() && (
              <button
                type="button"
                onClick={() => openNew(search)}
                disabled={isReadOnly}
                className="w-full text-left px-4 py-3 rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:border-blue-900/30 dark:text-blue-300 disabled:opacity-50"
              >
                {`Add ${(search || '').trim().toUpperCase()} as a new vehicle`}
              </button>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[520] bg-slate-900/60 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-5 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {editingVehicle ? (language === 'zh' ? '編輯車輛' : 'Edit Vehicle') : (language === 'zh' ? '新增車輛' : 'Add Vehicle')}
              </h3>
              <button
                onClick={closeForm}
                disabled={isSaving}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center"
              >
                <i className="fas fa-times text-slate-600 dark:text-slate-300"></i>
              </button>
            </div>

            <LicensePlateField
              value={draft.licensePlate}
              onChange={licensePlate => setDraft(prev => ({ ...prev, licensePlate }))}
              language={language}
              placeholder={language === 'zh' ? '車牌號碼' : 'License Plate'}
              disabled={isReadOnly}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={draft.make}
                onChange={e => setDraft(prev => ({ ...prev, make: e.target.value, model: '' }))}
                placeholder={language === 'zh' ? '品牌' : 'Make'}
                list="vehicle-makes-list"
                autoComplete="off"
                className="w-full h-12 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 px-3 font-semibold text-slate-900 dark:text-white"
              />
              <datalist id="vehicle-makes-list">
                {autofillMakes.map(make => (
                  <option key={make} value={make} />
                ))}
              </datalist>
              <input
                value={draft.model}
                onChange={e => setDraft(prev => ({ ...prev, model: e.target.value }))}
                placeholder={language === 'zh' ? '型號' : 'Model'}
                list="vehicle-models-list"
                autoComplete="off"
                className="w-full h-12 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 px-3 font-semibold text-slate-900 dark:text-white"
              />
              <datalist id="vehicle-models-list">
                {autofillModels.map(model => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </div>
            <input
              value={draft.color}
              onChange={e => setDraft(prev => ({ ...prev, color: e.target.value }))}
              placeholder={language === 'zh' ? '顏色' : 'Color'}
              list="vehicle-colors-list"
              autoComplete="off"
              className="w-full h-12 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 px-3 font-semibold text-slate-900 dark:text-white"
            />
            <datalist id="vehicle-colors-list">
              {autofillColors.map(color => (
                <option key={color} value={color} />
              ))}
            </datalist>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={draft.vehicleType}
                onChange={e => {
                  const vehicleType = e.target.value as VehicleType;
                  setDraft(prev => ({
                    ...prev,
                    vehicleType,
                    vehicleSize: getVehicleSizeForType(vehicleType),
                  }));
                }}
                className="w-full h-12 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 px-3 font-semibold text-slate-900 dark:text-white"
              >
                {VEHICLE_TYPE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input
                value={draft.vehicleSize === VehicleSize.LARGE ? (language === 'zh' ? 'Large (大型)' : 'Large') : (language === 'zh' ? 'Regular (一般)' : 'Regular')}
                disabled
                className="w-full h-12 rounded-xl border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-700/60 px-3 font-semibold text-slate-700 dark:text-slate-200"
              />
            </div>
            <div className="flex gap-3 pt-1">
              {returnToCheckoutOnSave ? (
                <>
                  <button
                    onClick={() => { void saveVehicle(''); }}
                    disabled={isReadOnly || isSaving || !draft.licensePlate.trim()}
                    className="flex-1 h-11 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200 font-black text-xs uppercase tracking-widest disabled:opacity-50"
                  >
                    {isSaving ? (language === 'zh' ? '儲存中...' : 'Saving...') : (language === 'zh' ? '儲存車輛' : 'Save Vehicle')}
                  </button>
                  <button
                    onClick={() => { void saveVehicleAndOpenAddCustomer(); }}
                    disabled={isReadOnly || isSaving || !draft.licensePlate.trim() || !onNavigateToAddCustomer}
                    className="flex-1 h-11 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50"
                  >
                    {isSaving ? (language === 'zh' ? '儲存中...' : 'Saving...') : (language === 'zh' ? '儲存並連結客戶' : 'Save & Link Customer')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={closeForm}
                    className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 font-black text-xs uppercase tracking-widest"
                  >
                    {language === 'zh' ? '取消' : 'Cancel'}
                  </button>
                  <button
                    onClick={() => { void saveVehicle(); }}
                    disabled={isReadOnly || isSaving || !draft.licensePlate.trim()}
                    className="flex-1 h-11 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50"
                  >
                    {isSaving ? (language === 'zh' ? '儲存中...' : 'Saving...') : (language === 'zh' ? '儲存車輛' : 'Save Vehicle')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[540] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-6 space-y-5">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              {language === 'zh' ? '刪除車輛' : 'Delete Vehicle'}
            </h3>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {language === 'zh' ? '確定刪除此車輛？已連結客戶會自動解除連結。' : 'Delete this vehicle? Linked customers will be unlinked.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 font-black text-xs uppercase tracking-widest"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 h-11 rounded-xl bg-rose-600 text-white font-black text-xs uppercase tracking-widest"
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

export default VehiclesPage;
