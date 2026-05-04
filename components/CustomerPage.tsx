import React, { useEffect, useMemo, useState } from 'react';
import CustomerPromptSelect from './CustomerPromptSelect';
import { CategoryItem, Customer, CustomerGroup, CustomerMembership, Transaction, TransactionType, Vehicle, VehicleSize, VehicleType } from '../types';
import LicensePlateField from './LicensePlateField';
import { translations } from '../translations';
import { normalizeLicensePlate } from '../utils/licensePlate';
import { VEHICLE_COLORS, VEHICLE_MAKES_EXTENDED, getVehicleModelsForMake } from '../vehicleData_v2';
import { getMembershipPrepaidBalance } from '../services/database';

interface CustomerPageProps {
  customers: Customer[];
  customerGroups: CustomerGroup[];
  vehicles: Vehicle[];
  transactions: Transaction[];
  categories: CategoryItem[];
  customerMemberships?: CustomerMembership[];
  onBack: () => void;
  onSaveCustomer: (
    customer: Customer,
    vehicleSelection?: {
      existingVehicleId?: string;
      newVehicle?: { licensePlate: string; make: string; model: string; color: string; vehicleType: VehicleType; vehicleSize: VehicleSize };
      updatedVehicle?: { id: string; licensePlate: string; make: string; model: string; color: string; vehicleType: VehicleType; vehicleSize: VehicleSize };
    }
  ) => void;
  onDeleteCustomer: (id: string) => void;
  onDeleteVehicle: (id: string) => Promise<void> | void;
  onSaveCustomerGroups: (groups: CustomerGroup[]) => Promise<void>;
  onDeleteCustomerGroup: (id: string) => Promise<void>;
  language: 'zh' | 'en';
  isReadOnly?: boolean;
  hideFinancialData?: boolean;
  openAddCustomerOnMount?: boolean;
  addCustomerPrefillLicensePlate?: string;
  onOpenAddCustomerConsumed?: () => void;
  onSaveAndAutofillCheckout?: (customerId: string, licensePlate?: string) => void;
}

type CustomerFormState = {
  name: string;
  chineseName: string;
  whatsappEnabled: boolean;
  countryCode: string;
  phone: string;
  group: string;
  birthday: string;
  creditDays: string;
  companyCode: string;
  notes: string;
};

type VehicleDraft = {
  licensePlate: string;
  make: string;
  model: string;
  color: string;
  vehicleType: VehicleType;
  vehicleSize: VehicleSize;
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

const COMPANY_CODES = ['DEFAULT', 'VIP', 'FLEET', 'CORPORATE'];
const COUNTRY_CODES = ['+1', '+852', '+853', '+86', '+65', '+81', '+82', '+886'];
const getDefaultCountryCodeByKeyboardMode = (useSpecialKeyboard: boolean): string => {
  return useSpecialKeyboard ? '+86' : '+852';
};
const buildWhatsAppUrl = (countryCode?: string, phone?: string): string | null => {
  const areaCode = (countryCode || '').replace(/\D/g, '');
  const phoneNumber = (phone || '').replace(/\D/g, '');
  if (!areaCode || !phoneNumber) return null;
  return `https://wa.me/${areaCode}${phoneNumber}`;
};
const emptyVehicleDraft: VehicleDraft = {
  licensePlate: '',
  make: '',
  model: '',
  color: '',
  vehicleType: VehicleType.SEDAN,
  vehicleSize: VehicleSize.REGULAR,
};

const CustomerPage: React.FC<CustomerPageProps> = ({
  customers,
  customerGroups,
  vehicles,
  transactions,
  categories,
  customerMemberships = [],
  onBack,
  onSaveCustomer,
  onDeleteCustomer,
  onDeleteVehicle,
  onSaveCustomerGroups,
  onDeleteCustomerGroup,
  language,
  isReadOnly,
  hideFinancialData,
  openAddCustomerOnMount,
  addCustomerPrefillLicensePlate,
  onOpenAddCustomerConsumed,
  onSaveAndAutofillCheckout,
}) => {
  const t = translations[language];
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [lastVisitedFilter, setLastVisitedFilter] = useState<'all' | '7' | '30' | '90'>('all');
  const [notVisitedFilter, setNotVisitedFilter] = useState<'all' | '30' | '60' | '90'>('all');
  const [visitFrequencyFilter, setVisitFrequencyFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [groupNameFilter, setGroupNameFilter] = useState<string>('all');
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [membershipPrepaidBalance, setMembershipPrepaidBalance] = useState<number | null>(null);
  const [membershipPrepaidLoading, setMembershipPrepaidLoading] = useState(false);

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>({
    name: '',
    chineseName: '',
    whatsappEnabled: false,
    countryCode: '+852',
    phone: '',
    group: '',
    birthday: '',
    creditDays: '0',
    companyCode: 'DEFAULT',
    notes: '',
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [vehicleSearchInput, setVehicleSearchInput] = useState('');
  const [showNewVehiclePopup, setShowNewVehiclePopup] = useState(false);
  const [newVehicleDraft, setNewVehicleDraft] = useState<VehicleDraft>(emptyVehicleDraft);
  const [usePlateKeyboard, setUsePlateKeyboard] = useState(false);
  const [isBirthdayFocused, setIsBirthdayFocused] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

  const formatMoney = (value: number) => hideFinancialData ? '***' : `¥${value.toLocaleString()}`;

  const vehicleById = useMemo(() => {
    const map = new Map<string, Vehicle>();
    for (const vehicle of vehicles) {
      map.set(vehicle.id, vehicle);
    }
    return map;
  }, [vehicles]);

  const customerVisitStats = useMemo(() => {
    const stats = new Map<string, { count: number; lastVisited: Date | null }>();

    for (const customer of customers) {
      stats.set(customer.id, { count: 0, lastVisited: null });
    }

    for (const transaction of transactions) {
      if (!transaction.customerId || transaction.type !== TransactionType.REVENUE) continue;
      const visitDate = new Date(transaction.date);
      if (Number.isNaN(visitDate.getTime())) continue;

      const current = stats.get(transaction.customerId) || { count: 0, lastVisited: null };
      const nextLastVisited = !current.lastVisited || visitDate > current.lastVisited ? visitDate : current.lastVisited;
      stats.set(transaction.customerId, {
        count: current.count + 1,
        lastVisited: nextLastVisited,
      });
    }

    return stats;
  }, [customers, transactions]);

  const filteredCustomers = useMemo(() => {
    const today = new Date();

    return customers.filter(c => {
      const linkedVehicle = c.vehicleId ? vehicleById.get(c.vehicleId) : undefined;
      const vehicleText = [linkedVehicle?.licensePlate, linkedVehicle?.make, linkedVehicle?.model, linkedVehicle?.color]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const searchMatched =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.chineseName && c.chineseName.toLowerCase().includes(search.toLowerCase())) ||
        (c.group && c.group.toLowerCase().includes(search.toLowerCase())) ||
        (c.phone && c.phone.includes(search)) ||
        vehicleText.includes(search.toLowerCase());

      if (!searchMatched) return false;

      const visitStats = customerVisitStats.get(c.id) || { count: 0, lastVisited: null };
      const daysSinceLastVisit = visitStats.lastVisited
        ? Math.floor((today.getTime() - visitStats.lastVisited.getTime()) / (1000 * 60 * 60 * 24))
        : Number.POSITIVE_INFINITY;

      if (lastVisitedFilter !== 'all' && !(daysSinceLastVisit <= Number(lastVisitedFilter))) {
        return false;
      }

      if (notVisitedFilter !== 'all' && !(daysSinceLastVisit >= Number(notVisitedFilter))) {
        return false;
      }

      if (visitFrequencyFilter !== 'all') {
        const count = visitStats.count;
        const matched =
          (visitFrequencyFilter === 'low' && count <= 1) ||
          (visitFrequencyFilter === 'medium' && count >= 2 && count <= 4) ||
          (visitFrequencyFilter === 'high' && count >= 5);
        if (!matched) return false;
      }

      if (groupNameFilter !== 'all') {
        const matched = groupNameFilter === 'ungrouped'
          ? !c.group || c.group.trim().length === 0
          : c.group === groupNameFilter;
        if (!matched) return false;
      }

      return true;
    });
  }, [customers, search, customerVisitStats, lastVisitedFilter, notVisitedFilter, visitFrequencyFilter, groupNameFilter, vehicleById]);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const selectedCustomerWhatsAppUrl = selectedCustomer
    ? buildWhatsAppUrl(selectedCustomer.countryCode, selectedCustomer.phone)
    : null;
  const selectedCustomerTransactions = transactions.filter(tr => tr.customerId === selectedCustomerId);
  const selectedCustomerVehicle = selectedCustomer?.vehicleId ? vehicleById.get(selectedCustomer.vehicleId) : undefined;
  const selectedCustomerActiveMembership = useMemo(() => {
    if (!selectedCustomerId) return undefined;
    return customerMemberships
      .filter(membership => membership.customerId === selectedCustomerId && membership.isActive)
      .sort((a, b) => new Date(b.startAt || b.createdAt).getTime() - new Date(a.startAt || a.createdAt).getTime())[0];
  }, [customerMemberships, selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerActiveMembership) {
      setMembershipPrepaidBalance(null);
      return;
    }

    let isCancelled = false;
    setMembershipPrepaidLoading(true);
    getMembershipPrepaidBalance(selectedCustomerActiveMembership.id)
      .then(({ balance }) => {
        if (!isCancelled) {
          setMembershipPrepaidBalance(balance ?? Math.max(0, Number(selectedCustomerActiveMembership.prepaidAmount || 0)));
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setMembershipPrepaidBalance(Math.max(0, Number(selectedCustomerActiveMembership.prepaidAmount || 0)));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setMembershipPrepaidLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedCustomerActiveMembership]);
  const selectedFormVehicle = selectedVehicleId ? vehicleById.get(selectedVehicleId) : undefined;
  const vehicleSearchOptions = useMemo(() => {
    return [...vehicles]
      .sort((a, b) => (a.licensePlate || '').localeCompare(b.licensePlate || ''));
  }, [vehicles]);
  const hasMatchingVehiclePlate = useMemo(() => {
    const normalizedInput = normalizeLicensePlate(vehicleSearchInput || '');
    if (!normalizedInput) return false;
    return vehicles.some(vehicle => normalizeLicensePlate(vehicle.licensePlate || '') === normalizedInput);
  }, [vehicleSearchInput, vehicles]);

  const groupOptions = useMemo(() => {
    const fromSavedGroups = customerGroups.map(group => (group.name || '').trim()).filter(Boolean);
    const fromCustomers = customers.map(customer => (customer.group || '').trim()).filter(Boolean);
    return Array.from(new Set([...fromSavedGroups, ...fromCustomers])).sort((a, b) => a.localeCompare(b));
  }, [customerGroups, customers]);

  const hasMatchingGroup = useMemo(() => {
    const value = customerForm.group.trim().toLowerCase();
    if (!value) return false;
    return groupOptions.some(option => option.toLowerCase() === value);
  }, [customerForm.group, groupOptions]);

  const hasMatchingCompanyCode = useMemo(() => {
    const value = customerForm.companyCode.trim().toLowerCase();
    if (!value) return false;
    return COMPANY_CODES.some(code => code.toLowerCase() === value);
  }, [customerForm.companyCode]);

  const autofillMakes = useMemo(() => {
    return Array.from(new Set([
      ...VEHICLE_MAKES_EXTENDED,
      ...vehicles.map(vehicle => (vehicle.make || '').trim()).filter(Boolean),
    ])).sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  const autofillModels = useMemo(() => {
    const makeKey = canonicalMakeKey(newVehicleDraft.make.trim());
    if (!makeKey) return [];
    const staticModels = getVehicleModelsForMake(newVehicleDraft.make);
    const existingModels = vehicles
      .filter(vehicle => canonicalMakeKey((vehicle.make || '').trim()) === makeKey)
      .map(vehicle => (vehicle.model || '').trim())
      .filter(Boolean);
    return Array.from(new Set([...staticModels, ...existingModels])).sort((a, b) => a.localeCompare(b));
  }, [newVehicleDraft.make, vehicles]);

  const autofillColors = useMemo(() => {
    const existingColors = vehicles.map(vehicle => (vehicle.color || '').trim()).filter(Boolean);
    return Array.from(new Set([...VEHICLE_COLORS, ...existingColors])).sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  const beginAdd = (prefillLicensePlate?: string) => {
    const normalizedPrefillPlate = normalizeLicensePlate(prefillLicensePlate || '');
    setEditingCustomer(null);
    setCustomerForm({
      name: '',
      chineseName: '',
      whatsappEnabled: false,
      countryCode: getDefaultCountryCodeByKeyboardMode(usePlateKeyboard),
      phone: '',
      group: '',
      birthday: '',
      creditDays: '0',
      companyCode: 'DEFAULT',
      notes: '',
    });
    // If a vehicle with the prefill plate already exists, link to it directly
    // instead of creating a duplicate blank vehicle.
    const existingVehicle = normalizedPrefillPlate
      ? vehicles.find(v => normalizeLicensePlate(v.licensePlate || '') === normalizedPrefillPlate)
      : undefined;
    if (existingVehicle) {
      setSelectedVehicleId(existingVehicle.id);
      setVehicleSearchInput(normalizedPrefillPlate);
      setNewVehicleDraft(emptyVehicleDraft);
    } else {
      setSelectedVehicleId('');
      setVehicleSearchInput(normalizedPrefillPlate);
      setNewVehicleDraft(normalizedPrefillPlate ? { ...emptyVehicleDraft, licensePlate: normalizedPrefillPlate } : emptyVehicleDraft);
    }
    setShowCustomerForm(true);
  };

  useEffect(() => {
    if (!showCustomerForm || editingCustomer) return;
    if (customerForm.phone.trim()) return;
    if (customerForm.countryCode !== '+852' && customerForm.countryCode !== '+86') return;

    setCustomerForm(prev => ({
      ...prev,
      countryCode: getDefaultCountryCodeByKeyboardMode(usePlateKeyboard),
    }));
  }, [usePlateKeyboard, showCustomerForm, editingCustomer, customerForm.phone, customerForm.countryCode]);

  useEffect(() => {
    if (!openAddCustomerOnMount || isReadOnly) return;
    beginAdd(addCustomerPrefillLicensePlate);
    onOpenAddCustomerConsumed?.();
  }, [openAddCustomerOnMount, isReadOnly, onOpenAddCustomerConsumed, addCustomerPrefillLicensePlate]);

  const beginEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name || '',
      chineseName: customer.chineseName || '',
      whatsappEnabled: Boolean(customer.whatsappEnabled),
      countryCode: customer.countryCode || '+852',
      phone: customer.phone || '',
      group: customer.group || '',
      birthday: customer.birthday || '',
      creditDays: String(Math.max(0, Number(customer.creditDays || 0))),
      companyCode: customer.companyCode || 'DEFAULT',
      notes: customer.notes || '',
    });
    setSelectedVehicleId(customer.vehicleId || '');
    setVehicleSearchInput(selectedCustomerVehicle?.licensePlate || customer.vehicleId ? (vehicleById.get(customer.vehicleId || '')?.licensePlate || '') : '');
    setNewVehicleDraft(emptyVehicleDraft);
    setShowCustomerForm(true);
  };

  const closeCustomerForm = () => {
    setShowCustomerForm(false);
    setShowNewVehiclePopup(false);
    setEditingCustomer(null);
    setNewVehicleDraft(emptyVehicleDraft);
    setVehicleSearchInput('');
    setIsBirthdayFocused(false);
    setEditingVehicleId(null);
  };

  const handleVehicleSearchChange = (nextValue: string) => {
    const normalizedPlate = normalizeLicensePlate(nextValue);
    setVehicleSearchInput(normalizedPlate);
    setNewVehicleDraft(emptyVehicleDraft);
    setEditingVehicleId(null);

    if (!normalizedPlate) {
      setSelectedVehicleId('');
      return;
    }

    const matchedVehicle = vehicles.find(vehicle => normalizeLicensePlate(vehicle.licensePlate || '') === normalizedPlate);
    setSelectedVehicleId(matchedVehicle?.id || '');
  };

  const openNewVehiclePopup = () => {
    setEditingVehicleId(null);
    setNewVehicleDraft(emptyVehicleDraft);
    setShowNewVehiclePopup(true);
  };

  const openNewVehiclePopupWithPlate = (plate: string) => {
    const normalizedPlate = normalizeLicensePlate(plate || '');
    setEditingVehicleId(null);
    setNewVehicleDraft({ ...emptyVehicleDraft, licensePlate: normalizedPlate });
    setSelectedVehicleId('');
    setVehicleSearchInput(normalizedPlate);
    setShowNewVehiclePopup(true);
  };

  const openEditVehiclePopup = () => {
    if (!selectedFormVehicle) return;
    const vehicle = selectedFormVehicle;
    if (!vehicle) return;

    setEditingVehicleId(vehicle.id);
    setNewVehicleDraft({
      licensePlate: vehicle.licensePlate || '',
      make: vehicle.make || '',
      model: vehicle.model || '',
      color: vehicle.color || '',
      vehicleType: vehicle.vehicleType || VehicleType.SEDAN,
      vehicleSize: vehicle.vehicleSize || getVehicleSizeForType(vehicle.vehicleType || VehicleType.SEDAN),
    });
    setShowNewVehiclePopup(true);
  };

  const handleDeleteVehicleFromForm = async () => {
    if (!selectedVehicleId || isReadOnly) return;
    const confirmed = window.confirm(language === 'zh' ? '確定刪除此車輛？' : 'Delete this vehicle?');
    if (!confirmed) return;

    await onDeleteVehicle(selectedVehicleId);
    setSelectedVehicleId('');
    setVehicleSearchInput('');
    setEditingVehicleId(null);
    setNewVehicleDraft(emptyVehicleDraft);
  };

  const clearFilters = () => {
    setLastVisitedFilter('all');
    setNotVisitedFilter('all');
    setVisitFrequencyFilter('all');
    setGroupNameFilter('all');
  };

  const handleAddGroup = async () => {
    if (isReadOnly) return;

    const cleanName = newGroupName.trim();
    if (!cleanName) return;

    const duplicate = customerGroups.some(group => group.name.trim().toLowerCase() === cleanName.toLowerCase());
    if (duplicate) return;

    setIsSavingGroup(true);
    const now = new Date().toISOString();
    const updatedGroups = [
      ...customerGroups,
      {
        id: crypto.randomUUID(),
        name: cleanName,
        createdAt: now,
        updatedAt: now,
      },
    ];

    try {
      await onSaveCustomerGroups(updatedGroups);
      setNewGroupName('');
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleDeleteGroup = async (group: CustomerGroup) => {
    if (isReadOnly) return;

    setIsSavingGroup(true);
    try {
      await onDeleteCustomerGroup(group.id);
      if (groupNameFilter === group.name) {
        setGroupNameFilter('all');
      }
    } finally {
      setIsSavingGroup(false);
    }
  };

  const resolveAutofillLicensePlate = (): string => {
    const fromDraft = normalizeLicensePlate(newVehicleDraft.licensePlate || '');
    if (fromDraft) return fromDraft;

    const fromSearch = normalizeLicensePlate(vehicleSearchInput || '');
    if (fromSearch) return fromSearch;

    const fromSelected = normalizeLicensePlate(selectedFormVehicle?.licensePlate || '');
    return fromSelected;
  };

  const handleSaveCustomer = async (autofillToCheckout = false) => {
    const trimmedName = customerForm.name.trim();
    if (!trimmedName) return;

    const now = new Date().toISOString();
    const customer: Customer = {
      id: editingCustomer?.id || crypto.randomUUID(),
      name: trimmedName,
      chineseName: customerForm.chineseName.trim(),
      whatsappEnabled: customerForm.whatsappEnabled,
      countryCode: customerForm.countryCode,
      phone: customerForm.phone.trim(),
      group: customerForm.group,
      birthday: customerForm.birthday || undefined,
      creditDays: Math.max(0, Math.round(Number(customerForm.creditDays || 0))),
      companyCode: customerForm.companyCode,
      notes: customerForm.notes.trim(),
      vehicleId: selectedVehicleId || undefined,
      createdAt: editingCustomer?.createdAt || now,
      updatedAt: now,
    };

    const hasDraftVehicle = newVehicleDraft.licensePlate.trim().length > 0;
    const vehiclePayload = editingVehicleId && hasDraftVehicle
      ? {
          existingVehicleId: editingVehicleId,
          updatedVehicle: {
            id: editingVehicleId,
            licensePlate: newVehicleDraft.licensePlate,
            make: newVehicleDraft.make,
            model: newVehicleDraft.model,
            color: newVehicleDraft.color,
            vehicleType: newVehicleDraft.vehicleType,
            vehicleSize: newVehicleDraft.vehicleSize,
          },
        }
      : hasDraftVehicle
        ? {
            newVehicle: {
              licensePlate: newVehicleDraft.licensePlate,
              make: newVehicleDraft.make,
              model: newVehicleDraft.model,
              color: newVehicleDraft.color,
              vehicleType: newVehicleDraft.vehicleType,
              vehicleSize: newVehicleDraft.vehicleSize,
            },
          }
        : selectedVehicleId
          ? { existingVehicleId: selectedVehicleId }
          : undefined;

    await Promise.resolve(onSaveCustomer(customer, vehiclePayload));

    if (autofillToCheckout && !editingCustomer) {
      onSaveAndAutofillCheckout?.(customer.id, resolveAutofillLicensePlate());
    }

    closeCustomerForm();
  };

  return (
    <div className="md:max-w-2xl md:mx-auto bg-slate-100 dark:bg-slate-950 min-h-[calc(100vh-120px)]">
      <div className="sticky top-0 bg-slate-100 dark:bg-slate-950 px-5 py-5 z-10">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-100"
            title={language === 'zh' ? '返回' : 'Back'}
          >
            <i className="fas fa-arrow-left text-xl"></i>
          </button>
          <h2 className="text-5xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {language === 'zh' ? '客戶' : 'Customers'}
          </h2>
          <button
            onClick={() => beginAdd()}
            disabled={isReadOnly}
            className="w-14 h-14 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title={language === 'zh' ? '新增客戶' : 'Add Customer'}
          >
            <i className="fas fa-plus text-2xl"></i>
          </button>
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-700 dark:text-slate-300 text-2xl md:text-base"></i>
            <input
              type="text"
              placeholder={language === 'zh' ? '搜尋' : 'Search'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-14 pr-4 py-4 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-white/10 rounded-[30px] text-3xl md:text-base font-semibold outline-none text-slate-900 dark:text-white"
            />
          </div>

          <button
            onClick={() => setShowFilters(true)}
            className="w-14 h-14 rounded-[18px] bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200"
            title={language === 'zh' ? '篩選' : 'Filter'}
          >
            <i className="fas fa-filter text-2xl md:text-base"></i>
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-white/10 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10">
        {filteredCustomers.length > 0 ? (
          filteredCustomers.map(customer => {
            const vehicle = customer.vehicleId ? vehicleById.get(customer.vehicleId) : undefined;
            return (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                className="w-full flex items-center gap-4 px-5 py-5 hover:bg-slate-50 dark:hover:bg-white/5 active:bg-blue-50 dark:active:bg-blue-600/10 text-left transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 text-sm font-black text-slate-700 dark:text-slate-200">
                  {customer.name.split(' ').slice(0, 2).map(n => n.charAt(0)).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white text-base">{customer.name}</p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold">
                    {customer.countryCode || ''} {customer.phone || (language === 'zh' ? '無聯絡方式' : 'No contact')}
                  </p>
                  {vehicle && (
                    <p className="text-xs font-bold text-slate-400 mt-0.5">
                      {(vehicle.licensePlate || '').toUpperCase()} {vehicle.make || ''} {vehicle.model || ''}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        ) : (
          <div className="px-5 py-12 text-center text-slate-400 text-sm font-bold">
            {language === 'zh' ? '沒有找到客戶' : 'No customers found'}
          </div>
        )}
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 z-[380] bg-slate-900/60 backdrop-blur-sm flex items-end md:items-center justify-center">
          <div className="w-full h-full md:h-auto md:max-w-2xl bg-white dark:bg-slate-900 md:rounded-3xl md:shadow-2xl md:border md:border-white/10 md:max-h-[90vh] overflow-y-auto isolate">
            <div className="fixed top-0 left-0 right-0 z-[500] bg-white/98 dark:bg-slate-900/98 backdrop-blur-md border-b border-slate-200 dark:border-white/10 flex justify-between items-center px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 md:absolute md:top-0 md:left-0 md:right-0 md:rounded-t-3xl md:z-[50]">
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="min-w-[88px] h-11 px-4 flex items-center justify-center gap-2 text-slate-700 dark:text-slate-200 rounded-full bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 transition-colors font-black text-sm"
              >
                <i className="fas fa-arrow-left text-base"></i>
                <span>{language === 'zh' ? '返回' : 'Back'}</span>
              </button>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">{selectedCustomer.name}</h3>
              {!isReadOnly && (
                <button
                  onClick={() => setDeleteConfirm(selectedCustomer.id)}
                  className="w-11 h-11 rounded-full flex items-center justify-center text-rose-600 hover:text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20"
                >
                  <i className="fas fa-trash-alt text-lg"></i>
                </button>
              )}
            </div>

            <div className="p-6 pt-24 md:pt-24 space-y-6">
              <div className="space-y-3 mb-3">
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 flex items-center justify-center"
                  title={language === 'zh' ? '返回客戶列表' : 'Back to customers'}
                >
                  <i className="fas fa-arrow-left text-sm"></i>
                </button>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black">
                    {selectedCustomer.name.charAt(0)}
                  </div>
                <div className="flex-1">
                  <h4 className="text-xl font-black text-slate-900 dark:text-white">{selectedCustomer.name}</h4>
                  {selectedCustomer.chineseName && (
                    <p className="text-slate-500 font-bold dark:text-slate-400">{selectedCustomer.chineseName}</p>
                  )}
                  <p className="text-slate-500 font-bold dark:text-slate-400">{selectedCustomer.countryCode || ''} {selectedCustomer.phone || (language === 'zh' ? '無電話資料' : 'No phone')}</p>
                  {selectedCustomer.whatsappEnabled && selectedCustomerWhatsAppUrl && (
                    <a
                      href={selectedCustomerWhatsAppUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-600 text-white text-xs font-black uppercase tracking-wider"
                    >
                      <i className="fab fa-whatsapp"></i>
                      <span>{language === 'zh' ? '開啟 WhatsApp' : 'Open WhatsApp'}</span>
                    </a>
                  )}
                  {selectedCustomer.group && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{selectedCustomer.group}</p>
                  )}
                </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-slate-50 rounded-2xl dark:bg-white/5 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{language === 'zh' ? '車輛' : 'Vehicle'}</p>
                  <p className="text-sm font-black text-slate-900 dark:text-white line-clamp-2">{selectedCustomerVehicle?.make || '-'} {selectedCustomerVehicle?.model || ''}</p>
                  <p className="text-xs font-bold text-slate-500">{selectedCustomerVehicle?.licensePlate || (language === 'zh' ? '未設定' : 'Not linked')}</p>
                </div>
                {!hideFinancialData && <div className="p-4 bg-slate-50 rounded-2xl dark:bg-white/5 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{language === 'zh' ? '消費' : 'Spend'}</p>
                  <p className="text-sm font-black text-emerald-600">
                    {formatMoney(transactions.filter(tr => tr.customerId === selectedCustomer.id && tr.type === TransactionType.REVENUE).reduce((sum, tr) => sum + tr.amount, 0))}
                  </p>
                  <p className="text-xs font-bold text-slate-500">{transactions.filter(tr => tr.customerId === selectedCustomer.id && tr.type === TransactionType.REVENUE).length} {language === 'zh' ? '次' : 'times'}</p>
                </div>}
                {!hideFinancialData && <div className="p-4 bg-slate-50 rounded-2xl dark:bg-white/5 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{language === 'zh' ? '平均' : 'Avg'}</p>
                  <p className="text-sm font-black text-blue-600">
                    {formatMoney(Math.round((transactions.filter(tr => tr.customerId === selectedCustomer.id && tr.type === TransactionType.REVENUE).reduce((sum, tr) => sum + tr.amount, 0)) / (transactions.filter(tr => tr.customerId === selectedCustomer.id && tr.type === TransactionType.REVENUE).length || 1)))}
                  </p>
                </div>}
              </div>

              {selectedCustomer.notes && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{language === 'zh' ? '備註' : 'Notes'}</p>
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-sm font-bold text-amber-900 dark:bg-amber-900/10 dark:border-amber-900/20 dark:text-amber-200">
                    {selectedCustomer.notes}
                  </div>
                </div>
              )}

              {/* ── Account Balance Widget ── */}
              {!hideFinancialData && (
                <div>
                  {selectedCustomerActiveMembership && (
                    <div className="mb-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{language === 'zh' ? '會員預付餘額' : 'Membership Prepaid Balance'}</p>
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-900/30">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">RMB {language === 'zh' ? '剩餘預付金' : 'Remaining Prepaid'}</p>
                        {membershipPrepaidLoading
                          ? <p className="text-sm font-black text-slate-400">{language === 'zh' ? '載入中...' : 'Loading...'}</p>
                          : <p className="text-2xl font-black text-emerald-600">¥{Number(membershipPrepaidBalance || 0).toFixed(2)}</p>
                        }
                        <p className="mt-1 text-[10px] font-bold text-slate-400">{language === 'zh' ? '以會員預付金計算實時餘額' : 'Live remaining balance from membership prepaid usage'}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{language === 'zh' ? '交易紀錄' : 'Transaction History'}</p>
                <div className="space-y-2">
                  {selectedCustomerTransactions.length > 0 ? (
                    selectedCustomerTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tr => (
                      <div key={tr.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl dark:bg-slate-800 dark:border-white/5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${tr.type === TransactionType.REVENUE ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            <i className={`fas ${tr.type === TransactionType.REVENUE ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900 dark:text-white">
                              {categories.find(c => c.id === tr.categoryId)?.name || 'Unknown'}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400">{tr.date}</p>
                          </div>
                        </div>
                        <p className={`text-sm font-black ${tr.type === TransactionType.REVENUE ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {hideFinancialData ? '***' : `${tr.type === TransactionType.REVENUE ? '+' : '-'}${formatMoney(tr.amount)}`}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-center py-6 text-slate-400 text-xs font-bold">{language === 'zh' ? '暫無交易紀錄' : 'No transaction history'}</p>
                  )}
                </div>
              </div>

              {!isReadOnly && (
                <button
                  onClick={() => beginEdit(selectedCustomer)}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-600/20"
                >
                  {language === 'zh' ? '編輯客戶' : 'Edit Customer'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showFilters && (
        <div className="fixed inset-0 z-[170] bg-slate-900/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[28px] shadow-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">{language === 'zh' ? '篩選客戶' : 'Filter Customers'}</h3>
              <button
                onClick={() => setShowFilters(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{language === 'zh' ? '最近到訪' : 'Last Visited'}</label>
                <select
                  value={lastVisitedFilter}
                  onChange={e => setLastVisitedFilter(e.target.value as 'all' | '7' | '30' | '90')}
                  className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/10 dark:text-white"
                >
                  <option value="all">{language === 'zh' ? '全部' : 'All'}</option>
                  <option value="7">{language === 'zh' ? '7 天內' : 'Within 7 days'}</option>
                  <option value="30">{language === 'zh' ? '30 天內' : 'Within 30 days'}</option>
                  <option value="90">{language === 'zh' ? '90 天內' : 'Within 90 days'}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{language === 'zh' ? '未到訪' : "Haven't Visited"}</label>
                <select
                  value={notVisitedFilter}
                  onChange={e => setNotVisitedFilter(e.target.value as 'all' | '30' | '60' | '90')}
                  className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/10 dark:text-white"
                >
                  <option value="all">{language === 'zh' ? '全部' : 'All'}</option>
                  <option value="30">{language === 'zh' ? '超過 30 天' : 'More than 30 days'}</option>
                  <option value="60">{language === 'zh' ? '超過 60 天' : 'More than 60 days'}</option>
                  <option value="90">{language === 'zh' ? '超過 90 天' : 'More than 90 days'}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{language === 'zh' ? '到訪頻率' : 'Visit Frequency'}</label>
                <select
                  value={visitFrequencyFilter}
                  onChange={e => setVisitFrequencyFilter(e.target.value as 'all' | 'low' | 'medium' | 'high')}
                  className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/10 dark:text-white"
                >
                  <option value="all">{language === 'zh' ? '全部' : 'All'}</option>
                  <option value="low">{language === 'zh' ? '低 (1 次或以下)' : 'Low (1 or less)'}</option>
                  <option value="medium">{language === 'zh' ? '中 (2-4 次)' : 'Medium (2-4)'}</option>
                  <option value="high">{language === 'zh' ? '高 (5 次以上)' : 'High (5+)'}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{language === 'zh' ? '分組名稱' : 'Group Name'}</label>
                <select
                  value={groupNameFilter}
                  onChange={e => setGroupNameFilter(e.target.value)}
                  className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/10 dark:text-white"
                >
                  <option value="all">{language === 'zh' ? '全部' : 'All'}</option>
                  <option value="ungrouped">{language === 'zh' ? '未分組' : 'Ungrouped'}</option>
                  {customerGroups.map(group => (
                    <option key={group.id} value={group.name}>{group.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={clearFilters}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-xs font-black uppercase tracking-widest"
                >
                  {language === 'zh' ? '清除篩選' : 'Clear Filter'}
                </button>
                {!isReadOnly && (
                  <button
                    onClick={() => {
                      setShowFilters(false);
                      setShowGroupManager(true);
                    }}
                    className="flex-1 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-widest"
                  >
                    {language === 'zh' ? '管理分組' : 'Manage Groups'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCustomerForm && (
        <div className="fixed inset-0 z-[420] bg-white dark:bg-slate-950 overflow-y-auto isolate">
          <div className="fixed top-0 left-0 right-0 z-[430] bg-white/98 dark:bg-slate-950/98 backdrop-blur-md px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shadow-sm">
            <button
              onClick={closeCustomerForm}
              className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200"
            >
              <i className="fas fa-times text-xl"></i>
            </button>

            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              {editingCustomer ? (language === 'zh' ? '編輯客戶' : 'Edit Customer') : (language === 'zh' ? '新增客戶' : 'New Customer')}
            </h3>

            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleSaveCustomer(false)}
                disabled={isReadOnly || !customerForm.name.trim()}
                className="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/15 text-slate-600 dark:text-slate-200 flex items-center justify-center disabled:opacity-50"
                title={language === 'zh' ? '儲存' : 'Save'}
                aria-label={language === 'zh' ? '儲存' : 'Save'}
              >
                <i className="fas fa-floppy-disk text-lg"></i>
              </button>
              <button
                onClick={() => void handleSaveCustomer(true)}
                disabled={isReadOnly || !!editingCustomer || !customerForm.name.trim() || !resolveAutofillLicensePlate()}
                className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center disabled:opacity-50"
                title={language === 'zh' ? '儲存並自動填入銷售草稿' : 'Save and Autofill New Sale'}
                aria-label={language === 'zh' ? '儲存並自動填入銷售草稿' : 'Save and Autofill New Sale'}
              >
                <i className="fas fa-arrow-up-right-from-square text-lg"></i>
              </button>
            </div>
          </div>

          <div className="px-5 pt-28 py-5 space-y-7 pb-16">
            <div className="space-y-3">
              <label className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? '姓名' : 'Name'}</label>
              <input
                value={customerForm.name}
                onChange={e => setCustomerForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full h-14 rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-4 text-base font-semibold text-slate-900 dark:text-white"
                placeholder={language === 'zh' ? '輸入姓名' : 'Name'}
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? '中文名 / 暱稱 / 聯絡方式' : 'Chinese Name / Nickname / Contact Method'}</label>
              <input
                value={customerForm.chineseName}
                onChange={e => setCustomerForm(prev => ({ ...prev, chineseName: e.target.value }))}
                className="w-full h-14 rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-4 text-base font-semibold text-slate-900 dark:text-white"
                placeholder={language === 'zh' ? '中文名或暱稱' : 'Chinese name or nickname'}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? '電話 / WhatsApp' : 'Phone Number / WhatsApp'}</label>
                <label className="inline-flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200 select-none">
                  <input
                    type="checkbox"
                    checked={customerForm.whatsappEnabled}
                    onChange={e => setCustomerForm(prev => ({ ...prev, whatsappEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span>WhatsApp</span>
                </label>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <select
                  value={customerForm.countryCode}
                  onChange={e => setCustomerForm(prev => ({ ...prev, countryCode: e.target.value }))}
                  className="h-14 rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-3 text-base font-bold text-slate-900 dark:text-white"
                >
                  {COUNTRY_CODES.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
                <input
                  value={customerForm.phone}
                  onChange={e => setCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full h-14 rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-4 text-base font-semibold text-slate-900 dark:text-white"
                  placeholder={language === 'zh' ? '電話號碼' : 'Phone number'}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? '車輛' : 'Vehicle'}</label>
                <div className="flex items-center gap-2">
                  {selectedFormVehicle && (
                    <button
                      onClick={openEditVehiclePopup}
                      className="px-4 h-9 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white text-xs font-black uppercase tracking-widest"
                    >
                      {language === 'zh' ? '編輯車輛' : 'Edit Vehicle'}
                    </button>
                  )}
                  {selectedFormVehicle && (
                    <button
                      onClick={handleDeleteVehicleFromForm}
                      className="px-4 h-9 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-xs font-black uppercase tracking-widest"
                    >
                      {language === 'zh' ? '刪除車輛' : 'Delete Vehicle'}
                    </button>
                  )}
                  <button
                    onClick={openNewVehiclePopup}
                    className="px-4 h-9 rounded-full bg-blue-600 text-white text-xs font-black uppercase tracking-widest"
                  >
                    {language === 'zh' ? '新增車輛' : 'Add New Vehicle'}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <input
                  value={vehicleSearchInput}
                  onChange={e => handleVehicleSearchChange(e.target.value)}
                  list="customer-vehicle-plate-list"
                  placeholder={language === 'zh' ? '搜尋車牌號碼' : 'Search license plate'}
                  className="w-full h-14 rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-4 text-base font-semibold tracking-[0.08em] text-slate-900 dark:text-white"
                />
                <datalist id="customer-vehicle-plate-list">
                  {vehicleSearchOptions.map(vehicle => (
                    <option key={vehicle.id} value={(vehicle.licensePlate || '').toUpperCase()}>
                      {(vehicle.make || '').trim()} {(vehicle.model || '').trim()} {(vehicle.color || '').trim()}
                    </option>
                  ))}
                </datalist>
                {vehicleSearchInput.trim() && !hasMatchingVehiclePlate && (
                  <button
                    type="button"
                    onClick={() => openNewVehiclePopupWithPlate(vehicleSearchInput)}
                    className="w-full text-left px-4 py-3 rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:border-blue-900/30 dark:text-blue-300 text-sm font-bold"
                  >
                    {language === 'zh'
                      ? `新增「${normalizeLicensePlate(vehicleSearchInput)}」為新車輛`
                      : `Add "${normalizeLicensePlate(vehicleSearchInput)}" as a new vehicle`}
                  </button>
                )}
              </div>
              {newVehicleDraft.licensePlate.trim() && (
                <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900/20 dark:border-blue-900/30 dark:text-blue-300 flex items-start justify-between gap-3">
                  <p className="min-w-0">
                    {language === 'zh' ? '將新增並連結:' : 'Will create and link:'} {(newVehicleDraft.licensePlate || '').toUpperCase()} {newVehicleDraft.make} {newVehicleDraft.model} {newVehicleDraft.color}
                  </p>
                  <button
                    type="button"
                    onClick={() => setNewVehicleDraft(emptyVehicleDraft)}
                    className="w-7 h-7 rounded-full bg-white/70 dark:bg-slate-800/60 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0"
                    title={language === 'zh' ? '取消新增車輛' : 'Cancel add vehicle'}
                    aria-label={language === 'zh' ? '取消新增車輛' : 'Cancel add vehicle'}
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-3">
              <label className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? '分組' : 'Group'}</label>
              <input
                value={customerForm.group}
                onChange={e => setCustomerForm(prev => ({ ...prev, group: e.target.value }))}
                list="customer-group-list"
                autoComplete="off"
                placeholder={language === 'zh' ? '搜尋或輸入分組' : 'Search or enter group'}
                className="w-full h-14 rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-4 text-base font-semibold text-slate-900 dark:text-white"
              />
              <datalist id="customer-group-list">
                {groupOptions.map(groupName => (
                  <option key={groupName} value={groupName} />
                ))}
              </datalist>
              {customerForm.group.trim() && !hasMatchingGroup && (
                <div className="px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-900/30 dark:text-emerald-300 text-sm font-bold">
                  {language === 'zh'
                    ? `新增「${customerForm.group.trim()}」為新分組`
                    : `Add "${customerForm.group.trim()}" as a new group`}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="space-y-3">
                <label className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? '生日' : 'Birthday'}</label>
                <input
                  type={isBirthdayFocused || customerForm.birthday ? 'date' : 'text'}
                  value={customerForm.birthday}
                  onChange={e => setCustomerForm(prev => ({ ...prev, birthday: e.target.value }))}
                  onFocus={() => setIsBirthdayFocused(true)}
                  onBlur={() => setIsBirthdayFocused(false)}
                  placeholder={language === 'zh' ? '未提供生日' : 'Birthday not provided'}
                  className="w-full h-14 rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-4 text-base font-semibold text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? '信用天數' : 'Credit Days'}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={customerForm.creditDays}
                  onChange={e => setCustomerForm(prev => ({ ...prev, creditDays: e.target.value }))}
                  className="w-full h-14 rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-4 text-base font-semibold text-slate-900 dark:text-white"
                  placeholder={language === 'zh' ? '預設 0' : 'Default 0'}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="space-y-3">
                <label className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? '公司代碼' : 'Company Code'}</label>
                <input
                  value={customerForm.companyCode}
                  onChange={e => setCustomerForm(prev => ({ ...prev, companyCode: e.target.value }))}
                  list="customer-company-code-list"
                  autoComplete="off"
                  placeholder={language === 'zh' ? '搜尋或輸入公司代碼' : 'Search or enter company code'}
                  className="w-full h-14 rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-4 text-base font-semibold text-slate-900 dark:text-white"
                />
                <datalist id="customer-company-code-list">
                  {COMPANY_CODES.map(code => (
                    <option key={code} value={code} />
                  ))}
                </datalist>
                {customerForm.companyCode.trim() && !hasMatchingCompanyCode && (
                  <div className="px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-900/30 dark:text-emerald-300 text-sm font-bold">
                    {language === 'zh'
                      ? `新增「${customerForm.companyCode.trim()}」為新公司代碼`
                      : `Add "${customerForm.companyCode.trim()}" as a new corporate code`}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <label className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? '備註' : 'Notes'}</label>
              <textarea
                rows={4}
                value={customerForm.notes}
                onChange={e => setCustomerForm(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-2xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-white/10 px-4 py-3 text-base font-semibold text-slate-900 dark:text-white resize-none"
                placeholder={language === 'zh' ? '備註...' : 'Notes...'}
              />
            </div>
          </div>
        </div>
      )}

      {showNewVehiclePopup && (
        <div className="fixed inset-0 z-[460] bg-slate-900/55 backdrop-blur-sm flex items-start md:items-center justify-center p-4 pt-8 pb-28 md:pb-4 overflow-y-auto">
          <div className="w-full max-w-[760px] rounded-3xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-white/10 p-5 space-y-4 max-h-[calc(100vh-8rem)] md:max-h-[calc(100vh-2rem)] overflow-y-auto my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">{editingVehicleId ? (language === 'zh' ? '編輯車輛' : 'Edit Vehicle') : (language === 'zh' ? '新增車輛' : 'Add New Vehicle')}</h3>
              <button
                onClick={() => {
                  setShowNewVehiclePopup(false);
                  setEditingVehicleId(null);
                  setNewVehicleDraft(emptyVehicleDraft);
                }}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center"
              >
                <i className="fas fa-times text-slate-600 dark:text-slate-300"></i>
              </button>
            </div>

            <div className="space-y-3">
              <LicensePlateField
                value={newVehicleDraft.licensePlate}
                onChange={licensePlate => {
                  setNewVehicleDraft(prev => ({ ...prev, licensePlate }));
                  setSelectedVehicleId('');
                  setVehicleSearchInput('');
                }}
                onPlateKeyboardModeChange={setUsePlateKeyboard}
                language={language}
              />
              <input
                value={newVehicleDraft.make}
                onChange={e => setNewVehicleDraft(prev => ({ ...prev, make: e.target.value, model: '' }))}
                placeholder={language === 'zh' ? '品牌' : 'Make'}
                list="customer-vehicle-makes-list"
                autoComplete="off"
                className="w-full h-12 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900 px-3 font-semibold"
              />
              <datalist id="customer-vehicle-makes-list">
                {autofillMakes.map(make => (
                  <option key={make} value={make} />
                ))}
              </datalist>
              <input
                value={newVehicleDraft.model}
                onChange={e => setNewVehicleDraft(prev => ({ ...prev, model: e.target.value }))}
                placeholder={language === 'zh' ? '型號' : 'Model'}
                list="customer-vehicle-models-list"
                autoComplete="off"
                className="w-full h-12 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900 px-3 font-semibold"
              />
              <datalist id="customer-vehicle-models-list">
                {autofillModels.map(model => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <input
                value={newVehicleDraft.color}
                onChange={e => setNewVehicleDraft(prev => ({ ...prev, color: e.target.value }))}
                placeholder={language === 'zh' ? '顏色' : 'Color'}
                list="customer-vehicle-colors-list"
                autoComplete="off"
                className="w-full h-12 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900 px-3 font-semibold"
              />
              <datalist id="customer-vehicle-colors-list">
                {autofillColors.map(color => (
                  <option key={color} value={color} />
                ))}
              </datalist>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newVehicleDraft.vehicleType}
                  onChange={e => {
                    const vehicleType = e.target.value as VehicleType;
                    setNewVehicleDraft(prev => ({
                      ...prev,
                      vehicleType,
                      vehicleSize: getVehicleSizeForType(vehicleType),
                    }));
                  }}
                  className="w-full h-12 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900 px-3 font-semibold"
                >
                  {VEHICLE_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input
                  value={newVehicleDraft.vehicleSize === VehicleSize.LARGE ? (language === 'zh' ? 'Large (大型)' : 'Large') : (language === 'zh' ? 'Regular (一般)' : 'Regular')}
                  disabled
                  className="w-full h-12 rounded-xl border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-800 px-3 font-semibold text-slate-700 dark:text-slate-200"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              {editingVehicleId && !isReadOnly && (
                <button
                  onClick={async () => {
                    await onDeleteVehicle(editingVehicleId);
                    if (selectedVehicleId === editingVehicleId) {
                      setSelectedVehicleId('');
                    }
                    setShowNewVehiclePopup(false);
                    setEditingVehicleId(null);
                    setNewVehicleDraft(emptyVehicleDraft);
                    setUsePlateKeyboard(false);
                  }}
                  className="h-11 px-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 font-black text-xs uppercase tracking-widest"
                >
                  {language === 'zh' ? '刪除' : 'Delete'}
                </button>
              )}
              <button
                onClick={() => {
                  setShowNewVehiclePopup(false);
                  setEditingVehicleId(null);
                  setNewVehicleDraft(emptyVehicleDraft);
                  setUsePlateKeyboard(false);
                }}
                className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 font-black text-xs uppercase tracking-widest"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={() => {
                  if (!newVehicleDraft.licensePlate.trim()) return;
                  if (editingVehicleId) {
                    setSelectedVehicleId(editingVehicleId);
                  } else {
                    setSelectedVehicleId('');
                  }
                  setShowNewVehiclePopup(false);
                }}
                className="flex-1 h-11 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest"
              >
                {language === 'zh' ? '儲存車輛' : 'Save Vehicle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
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

      {showGroupManager && (
        <div className="fixed inset-0 z-[160] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[28px] shadow-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {language === 'zh' ? '客戶分組' : 'Customer Groups'}
              </h3>
              <button
                onClick={() => setShowGroupManager(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder={language === 'zh' ? '新增分組名稱' : 'New group name'}
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold dark:bg-slate-800 dark:border-white/10 dark:text-white"
                />
                <button
                  onClick={handleAddGroup}
                  disabled={isSavingGroup || isReadOnly || !newGroupName.trim()}
                  className="px-4 py-3 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {language === 'zh' ? '新增' : 'Add'}
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {customerGroups.length === 0 ? (
                  <p className="text-center text-sm font-bold text-slate-400 py-6">
                    {language === 'zh' ? '尚無分組' : 'No groups yet'}
                  </p>
                ) : (
                  customerGroups.map(group => (
                    <div key={group.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10">
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{group.name}</span>
                      {!isReadOnly && (
                        <button
                          onClick={() => handleDeleteGroup(group)}
                          disabled={isSavingGroup}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50"
                        >
                          <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPage;
