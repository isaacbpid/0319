import React, { useMemo, useState } from 'react';
import CustomerPromptSelect, { type CustomerStats } from './CustomerPromptSelect';
import { Appointment, AppointmentStatus, CategoryItem, CheckoutOrder, Customer, TransactionType, Vehicle } from '../types';
import { normalizeLicensePlate } from '../utils/licensePlate';
import LicensePlateField from './LicensePlateField';

interface AppointmentsPageProps {
  language: 'zh' | 'en';
  appointments: Appointment[];
  customers: Customer[];
  vehicles: Vehicle[];
  categories: CategoryItem[];
  checkoutOrders: CheckoutOrder[];
  onSaveAppointments: (appointments: Appointment[]) => Promise<void>;
  onConvertToCheckout: (appointment: Appointment) => Promise<void>;
  isReadOnly?: boolean;
}

type ViewMode = 'list' | 'calendar';

const STATUS_LABELS: Record<AppointmentStatus, { zh: string; en: string; color: string }> = {
  PENDING:   { zh: '待確認', en: 'Pending',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  CONFIRMED: { zh: '已確認', en: 'Confirmed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  CANCELLED: { zh: '已取消', en: 'Cancelled', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDateLocal(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toDatetimeLocalValue(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isSameCalendarDay(isoString: string, year: number, month: number, day: number): boolean {
  const d = new Date(isoString);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
}

const AppointmentsPage: React.FC<AppointmentsPageProps> = ({
  language,
  appointments,
  customers,
  vehicles,
  categories,
  checkoutOrders,
  onSaveAppointments,
  onConvertToCheckout,
  isReadOnly,
}) => {
  const checkoutOrderIds = useMemo(() => new Set(checkoutOrders.map(o => o.id)), [checkoutOrders]);
  const zh = language === 'zh';
  const appointmentList = Array.isArray(appointments) ? appointments : [];
  const customerList = Array.isArray(customers) ? customers : [];
  const vehicleList = Array.isArray(vehicles) ? vehicles : [];
  const categoryList = Array.isArray(categories) ? categories : [];

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [listTab, setListTab] = useState<'upcoming' | 'past'>('upcoming');
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formVehicleInput, setFormVehicleInput] = useState('');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formServiceIds, setFormServiceIds] = useState<string[]>([]);
  const [formNotes, setFormNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [expandedApptGroup, setExpandedApptGroup] = useState<string | null>(null);

  // Cancel modal
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [convertingAppointmentId, setConvertingAppointmentId] = useState<string | null>(null);

  // ── derived ──────────────────────────────────────────────────────────────

  const customerMap = useMemo(() => new Map(customerList.map(c => [c.id, c])), [customerList]);
  const vehicleMap = useMemo(() => new Map(vehicleList.map(v => [v.id, v])), [vehicleList]);

  const EV_CHARGING_FALLBACK: CategoryItem = useMemo(() => ({
    id: 'rev-ev-charging',
    name: '電車充電 (EV Charging)',
    type: TransactionType.REVENUE,
    isActiveService: true,
  }), []);

  const revenueCategories = useMemo(() => {
    const cats = categoryList.filter(
      c => c.type === TransactionType.REVENUE && c.isActiveService !== false && c.id !== 'rev-ev-gap',
    );
    // Always show EV Charging even if the seed migration hasn't been run
    if (!cats.find(c => c.id === 'rev-ev-charging')) {
      cats.push(EV_CHARGING_FALLBACK);
    }
    return cats;
  }, [categoryList, EV_CHARGING_FALLBACK]);

  const selectableVehicles = useMemo(() => {
    if (!formCustomerId) return vehicleList;
    return vehicleList.filter(v => v.customerId === formCustomerId);
  }, [formCustomerId, vehicleList]);

  const preferredVehicleByCustomerId = useMemo(() => {
    const map = new Map<string, Vehicle>();
    for (const customer of customerList) {
      if (!customer.vehicleId) continue;
      const linked = vehicleMap.get(customer.vehicleId);
      if (linked?.customerId === customer.id) {
        map.set(customer.id, linked);
      }
    }
    for (const vehicle of vehicleList) {
      if (!map.has(vehicle.customerId)) {
        map.set(vehicle.customerId, vehicle);
      }
    }
    return map;
  }, [customerList, vehicleList, vehicleMap]);

  const customerStats = useMemo<Record<string, CustomerStats>>(() => {
    const stats: Record<string, CustomerStats> = {};
    for (const c of customerList) {
      const v = vehicleList.find(veh => veh.customerId === c.id);
      stats[c.id] = {
        visitCount: 0,
        totalSpent: 0,
        vehicleSummary: v ? [v.licensePlate, v.make, v.model].filter(Boolean).join(' ') : '',
      };
    }
    return stats;
  }, [customerList, vehicleList]);

  const now = new Date();

  const upcomingAppointments = useMemo(
    () => appointmentList
      .filter(a => a.status !== 'CANCELLED' && new Date(a.scheduledAt) >= now)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [appointmentList],
  );

  const pastAppointments = useMemo(
    () => appointmentList
      .filter(a => a.status === 'CANCELLED' || new Date(a.scheduledAt) < now)
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
    [appointmentList],
  );

  const calendarDayAppointments = useMemo(() => {
    if (selectedCalendarDay === null) return [];
    return appointmentList
      .filter(a => isSameCalendarDay(a.scheduledAt, calendarYear, calendarMonth, selectedCalendarDay))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [appointmentList, selectedCalendarDay, calendarYear, calendarMonth]);

  // ── form helpers ─────────────────────────────────────────────────────────

  const openNewForm = () => {
    setEditingAppointment(null);
    setFormCustomerId('');
    setFormVehicleId('');
    setFormVehicleInput('');
    const def = new Date();
    def.setHours(def.getHours() + 1, 0, 0, 0);
    setFormScheduledAt(toDatetimeLocalValue(def.toISOString()));
    setFormServiceIds([]);
    setFormNotes('');
    setShowForm(true);
  };

  const openEditForm = (appt: Appointment) => {
    setEditingAppointment(appt);
    setFormCustomerId(appt.customerId);
    setFormVehicleId(appt.vehicleId);
    const v = vehicleMap.get(appt.vehicleId);
    setFormVehicleInput(v?.licensePlate ?? '');
    setFormScheduledAt(toDatetimeLocalValue(appt.scheduledAt));
    setFormServiceIds([...appt.serviceCategoryIds]);
    setFormNotes(appt.notes ?? '');
    setShowForm(true);
  };

  const handleCustomerSelect = (customerId: string) => {
    setFormCustomerId(customerId);
    const preferred = customerId ? preferredVehicleByCustomerId.get(customerId) : undefined;
    if (preferred) {
      setFormVehicleId(preferred.id);
      setFormVehicleInput(preferred.licensePlate ?? '');
    } else {
      setFormVehicleId('');
      setFormVehicleInput('');
    }
  };

  const handleVehicleInputChange = (value: string) => {
    setFormVehicleInput(value);
    const normalized = normalizeLicensePlate(value);
    const match = selectableVehicles.find(
      v => normalizeLicensePlate(v.licensePlate ?? '') === normalized,
    );
    setFormVehicleId(match?.id ?? '');
  };

  const toggleServiceId = (id: string) => {
    setFormServiceIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id],
    );
  };

  const handleSaveForm = async () => {
    if (!formCustomerId) { alert(zh ? '請選擇客戶' : 'Please select a customer'); return; }
    if (!formVehicleId) { alert(zh ? '請選擇車輛' : 'Please select a vehicle'); return; }
    if (!formScheduledAt) { alert(zh ? '請選擇日期/時間' : 'Please select date and time'); return; }
    if (formServiceIds.length === 0) { alert(zh ? '請選擇至少一項服務' : 'Please select at least one service'); return; }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      let updatedList: Appointment[];
      if (editingAppointment) {
        const updated: Appointment = {
          ...editingAppointment,
          customerId: formCustomerId,
          vehicleId: formVehicleId,
          scheduledAt: new Date(formScheduledAt).toISOString(),
          serviceCategoryIds: formServiceIds,
          notes: formNotes || undefined,
          updatedAt: nowIso,
        };
        updatedList = appointmentList.map(a => a.id === updated.id ? updated : a);
      } else {
        const newAppt: Appointment = {
          id: crypto.randomUUID(),
          status: 'PENDING',
          customerId: formCustomerId,
          vehicleId: formVehicleId,
          scheduledAt: new Date(formScheduledAt).toISOString(),
          serviceCategoryIds: formServiceIds,
          notes: formNotes || undefined,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        updatedList = [newAppt, ...appointmentList];
      }
      await onSaveAppointments(updatedList);
      setShowForm(false);
    } finally {
      setIsSaving(false);
    }
  };

  // ── actions ───────────────────────────────────────────────────────────────

  const handleConfirm = async (id: string) => {
    if (isReadOnly) return;
    const updated = appointmentList.map(a =>
      a.id === id ? { ...a, status: 'CONFIRMED' as AppointmentStatus, updatedAt: new Date().toISOString() } : a,
    );
    await onSaveAppointments(updated);
  };

  const handleCancelSubmit = async () => {
    if (!cancelTargetId) return;
    const updated = appointmentList.map(a =>
      a.id === cancelTargetId
        ? { ...a, status: 'CANCELLED' as AppointmentStatus, cancelledReason: cancelReason || undefined, updatedAt: new Date().toISOString() }
        : a,
    );
    await onSaveAppointments(updated);
    setCancelTargetId(null);
    setCancelReason('');
  };

  const handleConvert = async (appt: Appointment) => {
    if (isReadOnly) return;
    if (convertingAppointmentId === appt.id) return;
    setConvertingAppointmentId(appt.id);
    try {
      await onConvertToCheckout(appt);
    } finally {
      setConvertingAppointmentId(null);
    }
  };

  // ── calendar helpers ──────────────────────────────────────────────────────

  const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarFirstDow = new Date(calendarYear, calendarMonth, 1).getDay();

  const appointmentDaysInMonth = useMemo(() => {
    const days = new Set<number>();
    for (const a of appointmentList) {
      const d = new Date(a.scheduledAt);
      if (d.getFullYear() === calendarYear && d.getMonth() === calendarMonth) {
        days.add(d.getDate());
      }
    }
    return days;
  }, [appointmentList, calendarYear, calendarMonth]);

  // ── card renderer ─────────────────────────────────────────────────────────

  const renderCard = (appt: Appointment) => {
    const customer = customerMap.get(appt.customerId);
    const vehicle = vehicleMap.get(appt.vehicleId);
    const KNOWN_NAMES: Record<string, string> = { 'rev-ev-charging': '電車充電 (EV Charging)' };
    const services = appt.serviceCategoryIds.map(id => categoryList.find(c => c.id === id)?.name ?? KNOWN_NAMES[id] ?? id);
    const label = STATUS_LABELS[appt.status];
    const isConverted = Boolean(appt.linkedCheckoutOrderId) && checkoutOrderIds.has(appt.linkedCheckoutOrderId!);

    return (
      <div key={appt.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-white/10 p-4 space-y-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-slate-900 dark:text-white truncate">
              {customer?.name ?? (zh ? '未知客戶' : 'Unknown Customer')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              {vehicle?.licensePlate ?? '—'}{vehicle?.make ? ` · ${vehicle.make}` : ''}
            </p>
          </div>
          <span className={`shrink-0 text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${label.color}`}>
            {zh ? label.zh : label.en}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <i className="fas fa-calendar-alt text-blue-500 w-4"></i>
          <span>{formatDateLocal(appt.scheduledAt)}</span>
        </div>

        {services.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {services.map((s, i) => (
              <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {s}
              </span>
            ))}
          </div>
        )}

        {appt.notes && (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">{appt.notes}</p>
        )}

        {appt.status === 'CANCELLED' && appt.cancelledReason && (
          <p className="text-xs text-rose-500 italic">{zh ? '取消原因：' : 'Reason: '}{appt.cancelledReason}</p>
        )}

        {!isReadOnly && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-white/5">
            {appt.status === 'PENDING' && (
              <button
                onClick={() => handleConfirm(appt.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-white active:scale-95 transition-all"
              >
                <i className="fas fa-check"></i>
                {zh ? '確認' : 'Confirm'}
              </button>
            )}
            {(appt.status === 'PENDING' || appt.status === 'CONFIRMED') && (
              <>
                <button
                  onClick={() => openEditForm(appt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200 active:scale-95 transition-all"
                >
                  <i className="fas fa-pencil-alt"></i>
                  {zh ? '編輯' : 'Edit'}
                </button>
                <button
                  onClick={() => { setCancelTargetId(appt.id); setCancelReason(''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 active:scale-95 transition-all"
                >
                  <i className="fas fa-times"></i>
                  {zh ? '取消預約' : 'Cancel'}
                </button>
              </>
            )}
            {appt.status === 'CONFIRMED' && !isConverted && (
              <button
                onClick={() => handleConvert(appt)}
                disabled={convertingAppointmentId === appt.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white active:scale-95 transition-all disabled:opacity-60"
              >
                <i className="fas fa-shopping-cart"></i>
                {convertingAppointmentId === appt.id
                  ? (zh ? '轉換中…' : 'Converting...')
                  : (zh ? '轉為訂單' : 'Convert to Checkout')}
              </button>
            )}
            {appt.status === 'CONFIRMED' && isConverted && (
              <button
                onClick={() => handleConvert(appt)}
                disabled={convertingAppointmentId === appt.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 active:scale-95 transition-all disabled:opacity-60"
              >
                <i className="fas fa-link"></i>
                {convertingAppointmentId === appt.id
                  ? (zh ? '開啟中…' : 'Opening...')
                  : (zh ? '已轉為草稿（開啟）' : 'Converted to Draft (Open)')}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-32">

      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 rounded-2xl p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <i className="fas fa-list mr-1.5"></i>{zh ? '列表' : 'List'}
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'calendar' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <i className="fas fa-calendar-alt mr-1.5"></i>{zh ? '日曆' : 'Calendar'}
          </button>
        </div>

        {!isReadOnly && (
          <button
            onClick={openNewForm}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
          >
            <i className="fas fa-plus"></i>
            {zh ? '新預約' : 'New Appointment'}
          </button>
        )}
      </div>

      {/* ── LIST VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-2xl p-1 w-fit">
            <button
              onClick={() => setListTab('upcoming')}
              className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${listTab === 'upcoming' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {zh ? '即將到來' : 'Upcoming'} <span className="ml-1 bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{upcomingAppointments.length}</span>
            </button>
            <button
              onClick={() => setListTab('past')}
              className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${listTab === 'past' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {zh ? '過去記錄' : 'Past'} <span className="ml-1 bg-slate-400 text-white text-[9px] px-1.5 py-0.5 rounded-full">{pastAppointments.length}</span>
            </button>
          </div>

          {/* Cards */}
          {listTab === 'upcoming' && (
            upcomingAppointments.length === 0
              ? <div className="text-center py-16 text-slate-400 text-sm">{zh ? '暫無即將到來的預約' : 'No upcoming appointments'}</div>
              : <div className="space-y-3">{upcomingAppointments.map(renderCard)}</div>
          )}
          {listTab === 'past' && (
            pastAppointments.length === 0
              ? <div className="text-center py-16 text-slate-400 text-sm">{zh ? '暫無過去記錄' : 'No past records'}</div>
              : <div className="space-y-3">{pastAppointments.map(renderCard)}</div>
          )}
        </div>
      )}

      {/* ── CALENDAR VIEW ──────────────────────────────────────────────────── */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          {/* Month nav */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={() => {
                if (calendarMonth === 0) { setCalendarYear(y => y - 1); setCalendarMonth(11); }
                else setCalendarMonth(m => m - 1);
                setSelectedCalendarDay(null);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 active:scale-95"
            >
              <i className="fas fa-chevron-left text-xs"></i>
            </button>
            <span className="font-black text-slate-800 dark:text-white">
              {MONTHS[calendarMonth]} {calendarYear}
            </span>
            <button
              onClick={() => {
                if (calendarMonth === 11) { setCalendarYear(y => y + 1); setCalendarMonth(0); }
                else setCalendarMonth(m => m + 1);
                setSelectedCalendarDay(null);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 active:scale-95"
            >
              <i className="fas fa-chevron-right text-xs"></i>
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 text-center">
            {DAYS.map(d => (
              <div key={d} className="text-[10px] font-black uppercase text-slate-400 py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calendarFirstDow }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: calendarDaysInMonth }, (_, i) => {
              const day = i + 1;
              const hasAppts = appointmentDaysInMonth.has(day);
              const isSelected = selectedCalendarDay === day;
              const isToday = new Date().getFullYear() === calendarYear && new Date().getMonth() === calendarMonth && new Date().getDate() === day;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedCalendarDay(isSelected ? null : day)}
                  className={`relative flex flex-col items-center justify-center h-10 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : isToday
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                >
                  {day}
                  {hasAppts && (
                    <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected day appointments */}
          {selectedCalendarDay !== null && (
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <p className="text-xs font-black uppercase text-slate-500 tracking-widest">
                {MONTHS[calendarMonth]} {selectedCalendarDay}, {calendarYear}
              </p>
              {calendarDayAppointments.length === 0
                ? <div className="text-center py-8 text-slate-400 text-sm">{zh ? '當天沒有預約' : 'No appointments on this day'}</div>
                : calendarDayAppointments.map(renderCard)
              }
            </div>
          )}
        </div>
      )}

      {/* ── NEW / EDIT FORM MODAL ──────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="w-full md:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl max-h-[90dvh] flex flex-col">
            {/* Form header */}
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-white/10 flex items-center justify-between px-6 py-4">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {editingAppointment ? (zh ? '編輯預約' : 'Edit Appointment') : (zh ? '新增預約' : 'New Appointment')}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 flex items-center justify-center active:scale-95"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-5">
              {/* Customer */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                  {zh ? '客戶' : 'Customer'}
                </label>
                <CustomerPromptSelect
                  value={formCustomerId}
                  onChange={handleCustomerSelect}
                  options={customerList.map(customer => ({ id: customer.id, name: customer.name }))}
                  language={language}
                  promptText={zh ? '新增客戶' : 'Add a customer'}
                  emptyOptionText={zh ? '未選擇' : 'Unassigned'}
                  customerStats={customerStats}
                />
              </div>

              {/* Vehicle */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                  {zh ? '車輛 (車牌)' : 'Vehicle (License Plate)'}
                </label>
                <LicensePlateField
                  value={formVehicleInput}
                  onChange={handleVehicleInputChange}
                  language={language}
                  placeholder={zh ? '輸入車牌…' : 'Enter plate…'}
                  // Optionally, you can add a label or action prop if needed
                />
                {formVehicleInput && !formVehicleId && (
                  <p className="mt-1 text-xs text-amber-500">{zh ? '未找到匹配車輛' : 'No matching vehicle found'}</p>
                )}
              </div>

              {/* Date + Time */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                  {zh ? '預約日期/時間' : 'Appointment Date & Time'}
                </label>
                <input
                  type="datetime-local"
                  value={formScheduledAt}
                  onChange={e => setFormScheduledAt(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Services */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                  {zh ? '服務項目' : 'Services'}
                </label>
                {(() => {
                  const groups = new Map<string, typeof revenueCategories>();
                  for (const cat of revenueCategories) {
                    const key = cat.itemCategory?.trim() || 'other';
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(cat);
                  }
                  groups.forEach((items, key) => groups.set(key, [...items].sort((a, b) => {
                    const na = parseInt((a.id.match(/(\d+)$/) || ['0','0'])[1], 10);
                    const nb = parseInt((b.id.match(/(\d+)$/) || ['0','0'])[1], 10);
                    return na - nb;
                  })));
                  const groupKeys = [...groups.keys()].sort();
                  const palette = [
                    { border: 'border-blue-200 dark:border-blue-900/40', header: 'bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/30', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconText: 'text-blue-500 dark:text-blue-400', label: 'text-blue-800 dark:text-blue-200' },
                    { border: 'border-violet-200 dark:border-violet-900/40', header: 'bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/30', iconBg: 'bg-violet-100 dark:bg-violet-900/40', iconText: 'text-violet-500 dark:text-violet-400', label: 'text-violet-800 dark:text-violet-200' },
                    { border: 'border-emerald-200 dark:border-emerald-900/40', header: 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/30', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconText: 'text-emerald-500 dark:text-emerald-400', label: 'text-emerald-800 dark:text-emerald-200' },
                    { border: 'border-orange-200 dark:border-orange-900/40', header: 'bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/30', iconBg: 'bg-orange-100 dark:bg-orange-900/40', iconText: 'text-orange-500 dark:text-orange-400', label: 'text-orange-800 dark:text-orange-200' },
                    { border: 'border-rose-200 dark:border-rose-900/40', header: 'bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/30', iconBg: 'bg-rose-100 dark:bg-rose-900/40', iconText: 'text-rose-500 dark:text-rose-400', label: 'text-rose-800 dark:text-rose-200' },
                    { border: 'border-cyan-200 dark:border-cyan-900/40', header: 'bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/30', iconBg: 'bg-cyan-100 dark:bg-cyan-900/40', iconText: 'text-cyan-500 dark:text-cyan-400', label: 'text-cyan-800 dark:text-cyan-200' },
                  ];
                  const itemShades = [
                    ['bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-100', 'bg-blue-200 text-blue-900 dark:bg-blue-800/60 dark:text-blue-100', 'bg-blue-300 text-blue-900 dark:bg-blue-700/60 dark:text-blue-50', 'bg-blue-400/70 text-blue-950 dark:bg-blue-600/50 dark:text-blue-50'],
                    ['bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100', 'bg-violet-200 text-violet-900 dark:bg-violet-800/60 dark:text-violet-100', 'bg-violet-300 text-violet-900 dark:bg-violet-700/60 dark:text-violet-50', 'bg-violet-400/70 text-violet-950 dark:bg-violet-600/50 dark:text-violet-50'],
                    ['bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100', 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100', 'bg-emerald-300 text-emerald-900 dark:bg-emerald-700/60 dark:text-emerald-50', 'bg-emerald-400/70 text-emerald-950 dark:bg-emerald-600/50 dark:text-emerald-50'],
                    ['bg-orange-100 text-orange-900 dark:bg-orange-900/50 dark:text-orange-100', 'bg-orange-200 text-orange-900 dark:bg-orange-800/60 dark:text-orange-100', 'bg-orange-300 text-orange-900 dark:bg-orange-700/60 dark:text-orange-50', 'bg-orange-400/70 text-orange-950 dark:bg-orange-600/50 dark:text-orange-50'],
                    ['bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100', 'bg-rose-200 text-rose-900 dark:bg-rose-800/60 dark:text-rose-100', 'bg-rose-300 text-rose-900 dark:bg-rose-700/60 dark:text-rose-50', 'bg-rose-400/70 text-rose-950 dark:bg-rose-600/50 dark:text-rose-50'],
                    ['bg-cyan-100 text-cyan-900 dark:bg-cyan-900/50 dark:text-cyan-100', 'bg-cyan-200 text-cyan-900 dark:bg-cyan-800/60 dark:text-cyan-100', 'bg-cyan-300 text-cyan-900 dark:bg-cyan-700/60 dark:text-cyan-50', 'bg-cyan-400/70 text-cyan-950 dark:bg-cyan-600/50 dark:text-cyan-50'],
                  ];
                  return (
                    <div className="space-y-2">
                      {groupKeys.map((key, idx) => {
                        const items = groups.get(key)!;
                        const isExpanded = expandedApptGroup === key;
                        const label = key.charAt(0).toUpperCase() + key.slice(1);
                        const c = palette[idx % palette.length];
                        const shades = itemShades[idx % itemShades.length];
                        return (
                          <div key={key} className={`rounded-2xl border ${c.border} overflow-hidden`}>
                            <button
                              type="button"
                              onClick={() => setExpandedApptGroup(isExpanded ? null : key)}
                              className={`w-full flex items-center justify-between px-4 py-3 ${c.header} transition-all`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-lg ${c.iconBg} flex items-center justify-center`}>
                                  <i className={`fas fa-tag ${c.iconText} text-[9px]`}></i>
                                </div>
                                <span className={`text-xs font-black ${c.label} tracking-tight`}>{label}</span>
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">({items.length})</span>
                              </div>
                              <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-slate-400 text-[10px]`}></i>
                            </button>
                            {isExpanded && (
                              <div className="px-3 py-3 flex flex-wrap gap-3 bg-white dark:bg-slate-900/60">
                                {items.map((cat, sIdx) => {
                                  const shade = shades[sIdx % shades.length];
                                  const isSelected = formServiceIds.includes(cat.id);
                                  const initials = cat.name.trim().substring(0, 2).toUpperCase();
                                  return (
                                    <button
                                      key={cat.id}
                                      type="button"
                                      onClick={() => toggleServiceId(cat.id)}
                                      className="relative flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                                      style={{ width: '112px' }}
                                    >
                                      <div className={`w-28 h-28 rounded-2xl flex flex-col items-center justify-center gap-0.5 px-2 transition-all ${shade} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 brightness-110' : ''}`}>
                                        <span className="text-xl font-black leading-none">{initials}</span>
                                        <span className="text-[11px] font-bold text-center leading-tight line-clamp-2 w-full px-1">{cat.name}</span>
                                        {cat.price != null && cat.price > 0 && (
                                          <span className="text-[10px] font-black opacity-70">¥{cat.price}</span>
                                        )}
                                      </div>
                                      {isSelected && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                                          <i className="fas fa-check text-white" style={{fontSize:'7px'}}></i>
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {revenueCategories.length === 0 && (
                        <p className="text-xs text-slate-400">{zh ? '沒有可用服務' : 'No services available'}</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                  {zh ? '備注（可選）' : 'Notes (optional)'}
                </label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder={zh ? '例如：提前到達…' : 'e.g. arriving early…'}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 dark:border-white/10 flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleSaveForm}
                disabled={isSaving}
                className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {isSaving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CANCEL REASON MODAL ────────────────────────────────────────────── */}
      {cancelTargetId && (
        <div className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              {zh ? '取消預約' : 'Cancel Appointment'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {zh ? '請輸入取消原因（可選）：' : 'Enter a cancellation reason (optional):'}
            </p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={2}
              placeholder={zh ? '取消原因…' : 'Reason…'}
              className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setCancelTargetId(null); setCancelReason(''); }}
                className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-black text-xs uppercase tracking-widest active:scale-95"
              >
                {zh ? '返回' : 'Back'}
              </button>
              <button
                onClick={handleCancelSubmit}
                className="flex-1 py-3 rounded-2xl bg-rose-500 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-95"
              >
                {zh ? '確認取消' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentsPage;
