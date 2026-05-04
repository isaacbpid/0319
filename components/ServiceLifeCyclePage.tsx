import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckoutOrder,
  CheckoutOrderStatus,
  Customer,
  Vehicle,
} from '../types';
import LicensePlateField from './LicensePlateField';
import workorderFieldsCsv from '../workorder_fields.csv?raw';

interface ServiceLifeCyclePageProps {
  language: 'zh' | 'en';
  checkoutOrders: CheckoutOrder[];
  customers: Customer[];
  vehicles: Vehicle[];
  onSaveOrders: (orders: CheckoutOrder[]) => Promise<void>;
  initialOpenOrderId?: string | null;
  onInitialOpenOrderHandled?: () => void;
  isReadOnly?: boolean;
}

interface WorkorderFieldDef {
  x: number;
  y: number;
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
}

const normalizeFieldName = (value: string): string => {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
};

const parseWorkorderFieldDefinitions = (csvText: string): Map<string, WorkorderFieldDef> => {
  const map = new Map<string, WorkorderFieldDef>();
  const lines = csvText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (let index = 1; index < lines.length; index += 1) {
    const [nameRaw, xRaw, yRaw, fontSizeRaw, alignmentRaw] = lines[index].split(',');
    if (!nameRaw) continue;
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const parsedFont = Number(fontSizeRaw);
    const alignment = (alignmentRaw || 'center').trim().toLowerCase();
    const safeAlignment: 'left' | 'center' | 'right' = alignment === 'left' || alignment === 'right' ? alignment : 'center';
    map.set(normalizeFieldName(nameRaw), {
      x,
      y,
      fontSize: Number.isFinite(parsedFont) ? parsedFont : 10,
      alignment: safeAlignment,
    });
  }

  return map;
};

const formatDateTime = (value?: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
};

const htmlEscape = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const STATUS_ORDER: CheckoutOrderStatus[] = [
  CheckoutOrderStatus.COMMITTED,
  CheckoutOrderStatus.IN_PROGRESS,
  CheckoutOrderStatus.TASK_COMPLETED,
  CheckoutOrderStatus.CHECKED_OUT,
];

const STATUS_ICON: Record<CheckoutOrderStatus, string> = {
  [CheckoutOrderStatus.DRAFT]: 'fa-pencil-alt',
  [CheckoutOrderStatus.COMMITTED]: 'fa-clipboard-list',
  [CheckoutOrderStatus.IN_PROGRESS]: 'fa-tools',
  [CheckoutOrderStatus.TASK_COMPLETED]: 'fa-check-circle',
  [CheckoutOrderStatus.CHECKED_OUT]: 'fa-flag-checkered',
};

const STATUS_LABEL_ZH: Record<CheckoutOrderStatus, string> = {
  [CheckoutOrderStatus.DRAFT]: '草稿',
  [CheckoutOrderStatus.COMMITTED]: '排隊中',
  [CheckoutOrderStatus.IN_PROGRESS]: '進行中',
  [CheckoutOrderStatus.TASK_COMPLETED]: '服務完成',
  [CheckoutOrderStatus.CHECKED_OUT]: '已結帳',
};

const STATUS_LABEL_EN: Record<CheckoutOrderStatus, string> = {
  [CheckoutOrderStatus.DRAFT]: 'Draft',
  [CheckoutOrderStatus.COMMITTED]: 'Queued',
  [CheckoutOrderStatus.IN_PROGRESS]: 'In Progress',
  [CheckoutOrderStatus.TASK_COMPLETED]: 'Task Completed',
  [CheckoutOrderStatus.CHECKED_OUT]: 'Checked Out',
};

const STATUS_COLOR: Record<CheckoutOrderStatus, string> = {
  [CheckoutOrderStatus.DRAFT]: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  [CheckoutOrderStatus.COMMITTED]: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  [CheckoutOrderStatus.IN_PROGRESS]: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  [CheckoutOrderStatus.TASK_COMPLETED]: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  [CheckoutOrderStatus.CHECKED_OUT]: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const formatCurrency = (value: number): string => `¥${value.toFixed(2)}`;

const parseTimeMs = (value?: string | null): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const formatDuration = (startMs: number | null, endMs: number | null): string => {
  if (startMs === null || endMs === null || endMs <= startMs) return '0m';

  const totalSeconds = Math.floor((endMs - startMs) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 0)}m`;
};

const isDisplayableServiceLine = (line: CheckoutOrder['lines'][number]): boolean => {
  if (line.isDiscount !== true) return true;
  // Some historical rows may carry discount flags incorrectly.
  // Keep lines that are clearly service-backed so work-order items do not disappear.
  return Boolean(line.categoryId) || Number(line.estimatedDurationMinutes || 0) > 0;
};

const getStatusDuration = (order: CheckoutOrder, status: CheckoutOrderStatus, nowMs: number): string => {
  const checkInMs = parseTimeMs(order.checkInAt || order.occurredAt || order.createdAt);
  const committedMs = parseTimeMs(order.committedAt);
  const inProgressMs = parseTimeMs(order.inProgressAt);
  const taskCompletedMs = parseTimeMs(order.taskCompletedAt);
  const checkedOutMs = parseTimeMs(order.checkedOutAt);

  switch (status) {
    case CheckoutOrderStatus.COMMITTED:
      return formatDuration(committedMs ?? checkInMs, inProgressMs ?? nowMs);
    case CheckoutOrderStatus.IN_PROGRESS:
      return formatDuration(inProgressMs ?? committedMs ?? checkInMs, taskCompletedMs ?? nowMs);
    case CheckoutOrderStatus.TASK_COMPLETED:
      return formatDuration(taskCompletedMs ?? inProgressMs ?? committedMs ?? checkInMs, checkedOutMs ?? nowMs);
    case CheckoutOrderStatus.CHECKED_OUT:
      return formatDuration(checkInMs, checkedOutMs ?? nowMs);
    case CheckoutOrderStatus.DRAFT:
    default:
      return formatDuration(checkInMs, committedMs ?? nowMs);
  }
};

// ── Work-order print ──────────────────────────────────────────────────────────

const printWorkOrder = async (
  order: CheckoutOrder,
  customer: Customer | undefined,
  vehicle: Vehicle | undefined,
  language: 'zh' | 'en',
  workorderFieldMap: Map<string, WorkorderFieldDef>
) => {
  const serviceLines = order.lines.filter(isDisplayableServiceLine);
  const discountLines = order.lines.filter(line => line.isDiscount);
  const workorderRows = [
    ...serviceLines.map(line => ({
      name: line.name,
      quantity: line.quantity > 0 ? String(line.quantity) : '-',
      unitPrice: line.unitPrice > 0 ? formatCurrency(line.unitPrice) : '-',
      amount: line.lineSubtotal > 0 ? formatCurrency(line.lineSubtotal) : '-',
    })),
    ...discountLines.map(line => ({
      name: line.name,
      quantity: '-',
      unitPrice: '-',
      amount: `-${formatCurrency(Math.max(0, Number(line.lineSubtotal || 0)))}`,
    })),
  ];
  const timeIn = formatDateTime(order.checkInAt || order.occurredAt || order.createdAt);

  // Fetch the template image as a base64 data URL so the self-contained blob
  // HTML does not need to load external resources (avoids CSP / cross-origin issues).
  let templateSrc: string;
  try {
    const templateUrl = new URL('work_order_template2.png', document.baseURI).toString();
    const resp = await fetch(templateUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob2 = await resp.blob();
    templateSrc = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(blob2);
    });
  } catch {
    templateSrc = '';
  }

  // Virtual coordinate system matching the CSV (A4 landscape ~230×160 units)
  const virtualWidth = 230;
  const virtualHeight = 160;
  const toXPct = (v: number) => ((v / virtualWidth) * 100).toFixed(4);
  const toYPct = (v: number) => ((v / virtualHeight) * 100).toFixed(4);

  const resolve = (fieldName: string, fallback: WorkorderFieldDef): WorkorderFieldDef =>
    workorderFieldMap.get(normalizeFieldName(fieldName)) || fallback;

  const printableLicensePlate = (vehicle?.licensePlate || '-').slice(0, 10);
  const licensePlateDef = resolve('License Plate', { x: 189, y: 35, fontSize: 22, alignment: 'center' });
  const licensePlateFontSize = 40;

  const field = (
    value: string,
    x: number,
    y: number,
    fontSize: number,
    widthUnits: number,
    align: 'left' | 'center' | 'right'
  ) => {
    const left = align === 'center' ? `${toXPct(x)}%` : `${toXPct(x)}%`;
    const transform = align === 'center'
      ? 'translate(-50%, -50%)'
      : align === 'right'
      ? 'translate(-100%, -50%)'
      : 'translate(0, -50%)';
    return `<div class="wf" style="left:${left};top:${toYPct(y)}%;width:${toXPct(widthUnits)}%;font-size:${fontSize}pt;text-align:${align};transform:${transform};">${htmlEscape(value)}</div>`;
  };

  const fieldFromCsv = (fieldName: string, value: string, widthUnits: number, fallback: WorkorderFieldDef) => {
    const def = resolve(fieldName, fallback);
    return field(value, def.x, def.y, def.fontSize, widthUnits, def.alignment);
  };

  const metadataFieldsBase = [
    fieldFromCsv('Order Number', order.invoiceNumber || order.id.slice(0, 8), 40, { x: 74, y: 16, fontSize: 9, alignment: 'center' }),
    fieldFromCsv('Date', new Date(order.checkInAt || order.createdAt).toLocaleDateString(), 40, { x: 120, y: 16, fontSize: 9, alignment: 'center' }),
    fieldFromCsv('Expected Pickup', order.estimatedFinishAt ? formatDateTime(order.estimatedFinishAt) : '-', 40, { x: 184, y: 16, fontSize: 9, alignment: 'center' }),
    field(printableLicensePlate, licensePlateDef.x, licensePlateDef.y, licensePlateFontSize, 120, 'left'),
    fieldFromCsv('Car Make', vehicle?.make || '-', 35, { x: 130, y: 40, fontSize: 9, alignment: 'center' }),
    fieldFromCsv('Car Model', vehicle?.model || '-', 35, { x: 130, y: 50, fontSize: 9, alignment: 'center' }),
    fieldFromCsv('Car Color', vehicle?.color || '-', 35, { x: 130, y: 60, fontSize: 9, alignment: 'center' }),
    fieldFromCsv('Time In', timeIn, 40, { x: 74, y: 26, fontSize: 9, alignment: 'center' }),
    fieldFromCsv('Customer Name', customer?.name || '-', 100, { x: 16, y: 72, fontSize: 10, alignment: 'left' }),
  ].join('');

  // ── Multi-line block helper (allows wrapping, no ellipsis) ─────────────────
  const multilineBlock = (
    text: string,
    x: number,
    y: number,
    fontSize: number,
    widthUnits: number,
  ) => {
    const left = `${toXPct(x)}%`;
    return `<div class="wf-ml" style="left:${left};top:${toYPct(y)}%;width:${toXPct(widthUnits)}%;font-size:${fontSize}pt;">${htmlEscape(text)}</div>`;
  };

  const multilineBox = (
    text: string,
    x: number,
    y: number,
    fontSize: number,
    widthUnits: number,
    heightUnits: number,
  ) => {
    const left = `${toXPct(x)}%`;
    // CSV Y positions are used as visual center in this template flow.
    // Convert to top-left so long text stays constrained inside the target box.
    const topUnits = Math.max(0, y - heightUnits / 2);
    return `<div class="wf-box" style="left:${left};top:${toYPct(topUnits)}%;width:${toXPct(widthUnits)}%;height:${toYPct(heightUnits)}%;font-size:${fontSize}pt;">${htmlEscape(text)}</div>`;
  };

  // Attention Details → Sales Notes black box
  const attentionText = (order.attentionDetails && order.attentionDetails.length > 0)
    ? order.attentionDetails.map(s => `• ${s}`).join('\n')
    : (order.notes || '');
  const attentionFontSize = attentionText.length > 120 ? 6 : attentionText.length > 60 ? 7 : 8;
  const attentionDef = resolve('Sales Notes', { x: 16, y: 82, fontSize: attentionFontSize, alignment: 'left' });
  const salesNotesHtml = multilineBox(attentionText, attentionDef.x, attentionDef.y, attentionFontSize, 100, 14);

  // Customer Additional Comments → Customer Requirement area (with checkboxes)
  const commentsText = (order.customerAdditionalComments && order.customerAdditionalComments.length > 0)
    ? order.customerAdditionalComments.map(s => `☐ ${s}`).join('\n')
    : (order.preWorkRequirement || '');
  const commentsFontSize = commentsText.length > 120 ? 6 : commentsText.length > 60 ? 7 : 8;
  const requirementDef = resolve('Customer Requirement', { x: 16, y: 100, fontSize: commentsFontSize, alignment: 'left' });
  const customerReqHtml = multilineBlock(commentsText, requirementDef.x, requirementDef.y, commentsFontSize, 95);

  const metadataFields = [
    metadataFieldsBase,
    salesNotesHtml,
    customerReqHtml,
  ].join('');

  const lineItemDef = resolve('Line item description', { x: 116, y: 108, fontSize: 8, alignment: 'left' });
  const qtyDef = resolve('Qty', { x: 177, y: 108, fontSize: 8, alignment: 'center' });
  const unitPriceDef = resolve('Unit price', { x: 196, y: 108, fontSize: 8, alignment: 'right' });
  const amountDef = resolve('Amount', { x: 216, y: 108, fontSize: 8, alignment: 'right' });
  const rowStep = 6;

  const lineRows = (workorderRows.length > 0 ? workorderRows : [{ name: '-', quantity: '-', unitPrice: '-', amount: '-' } as any])
    .slice(0, 8)
    .map((l: any, i: number) => {
      const y = lineItemDef.y + i * rowStep;
      return [
        field(l.name, lineItemDef.x, y, lineItemDef.fontSize, 80, lineItemDef.alignment),
        field(l.quantity, qtyDef.x, y, qtyDef.fontSize, 14, qtyDef.alignment),
        field(l.unitPrice, unitPriceDef.x, y, unitPriceDef.fontSize, 22, unitPriceDef.alignment),
        field(l.amount, amountDef.x, y, amountDef.fontSize, 22, amountDef.alignment),
      ].join('');
    }).join('');

  const totalDef = resolve('Total', { x: 216, y: 148, fontSize: 9, alignment: 'right' });
  const totalField = field(formatCurrency(order.netAmount), totalDef.x, totalDef.y, totalDef.fontSize, 22, totalDef.alignment);

  const html = `<!doctype html><html><head><meta charset="UTF-8"/><title>${htmlEscape(language === 'zh' ? '工作單' : 'Work Order')}</title><style>* { box-sizing: border-box; } @page { size: A4 landscape; margin: 0; } body { margin: 0; font-family: Arial, sans-serif; color: #111; background: #fff; } .sheet { width: 297mm; height: 210mm; margin: 0 auto; } .shell { position: relative; width: 297mm; height: 210mm; overflow: hidden; } .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; } .content { position: absolute; inset: 0; z-index: 1; } .wf { position: absolute; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: Arial, sans-serif; } .wf-ml { position: absolute; line-height: 1.3; white-space: pre-wrap; word-break: break-word; overflow: visible; font-family: Arial, sans-serif; transform: translateY(-50%); } .wf-box { position: absolute; line-height: 1.25; white-space: pre-wrap; word-break: break-word; overflow: hidden; font-family: Arial, sans-serif; }</style></head><body><div class="sheet"><div class="shell">${templateSrc ? `<img class="bg" src="${templateSrc}" alt="" />` : ''}<div class="content">${metadataFields}${lineRows}${totalField}</div></div></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script></body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer,width=900,height=1200');
  if (!win) {
    URL.revokeObjectURL(url);
    alert(language === 'zh'
      ? '彈出視窗被瀏覽器封鎖，請允許本網站的彈出視窗後再試。'
      : 'Popup blocked. Please allow popups for this site and try again.');
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// ── Component ─────────────────────────────────────────────────────────────────

const ServiceLifeCyclePage: React.FC<ServiceLifeCyclePageProps> = ({
  language,
  checkoutOrders,
  customers,
  vehicles,
  onSaveOrders,
  initialOpenOrderId,
  onInitialOpenOrderHandled,
  isReadOnly,
}) => {
  const t = language === 'zh';

  const [searchPlate, setSearchPlate] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<CheckoutOrderStatus | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('TODAY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // per-order form state
  const [preWorkReq, setPreWorkReq] = useState('');
  const [salesNotes, setSalesNotes] = useState('');
  const [inProgressNote, setInProgressNote] = useState('');
  const [postWorkNote, setPostWorkNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // pre-inspection comment state
  const [attentionDetails, setAttentionDetails] = useState<string[]>([]);
  const [customerAdditionalComments, setCustomerAdditionalComments] = useState<string[]>([]);
  const [attentionInput, setAttentionInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [preInspectionStarted, setPreInspectionStarted] = useState(false);

  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles]);
  const workorderFieldMap = useMemo(() => parseWorkorderFieldDefinitions(workorderFieldsCsv), []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const lifecycleOrders = useMemo(() =>
    checkoutOrders.filter(o => STATUS_ORDER.includes(o.status)).sort((a, b) => {
      const aT = new Date(a.checkInAt || a.createdAt).getTime();
      const bT = new Date(b.checkInAt || b.createdAt).getTime();
      return bT - aT;
    }),
    [checkoutOrders]
  );

  const ordersAfterBaseFilters = useMemo(() => {
    let nextOrders = lifecycleOrders;

    // Date filter
    if (dateFilter !== 'ALL') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      nextOrders = nextOrders.filter(order => {
        const orderDate = new Date(order.checkInAt || order.occurredAt || order.createdAt);
        orderDate.setHours(0, 0, 0, 0);

        if (dateFilter === 'TODAY') {
          return orderDate.getTime() === today.getTime();
        } else if (dateFilter === 'WEEK') {
          const weekAgo = new Date(today);
          weekAgo.setDate(today.getDate() - 7);
          return orderDate >= weekAgo;
        } else if (dateFilter === 'MONTH') {
          const monthAgo = new Date(today);
          monthAgo.setDate(today.getDate() - 30);
          return orderDate >= monthAgo;
        } else if (dateFilter === 'CUSTOM') {
          if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            return orderDate >= start && orderDate <= end;
          } else if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            return orderDate >= start;
          } else if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            return orderDate <= end;
          }
        }
        return true;
      });
    }

    const kw = searchPlate.trim().toLowerCase();
    if (!kw) return nextOrders;

    return nextOrders.filter(order => {
      const plate = (vehicleMap.get(order.vehicleId || '')?.licensePlate || '').toLowerCase();
      const name = (customerMap.get(order.customerId || '')?.name || '').toLowerCase();
      return plate.includes(kw) || name.includes(kw);
    });
  }, [lifecycleOrders, dateFilter, startDate, endDate, searchPlate, customerMap, vehicleMap]);

  const filteredOrders = useMemo(() => {
    if (!selectedStatusFilter) return ordersAfterBaseFilters;
    return ordersAfterBaseFilters.filter(order => order.status === selectedStatusFilter);
  }, [ordersAfterBaseFilters, selectedStatusFilter]);

  const filteredStatusCounts = useMemo(() => {
    const counts: Record<CheckoutOrderStatus, number> = {
      [CheckoutOrderStatus.DRAFT]: 0,
      [CheckoutOrderStatus.COMMITTED]: 0,
      [CheckoutOrderStatus.IN_PROGRESS]: 0,
      [CheckoutOrderStatus.TASK_COMPLETED]: 0,
      [CheckoutOrderStatus.CHECKED_OUT]: 0,
    };

    for (const order of ordersAfterBaseFilters) {
      counts[order.status] = (counts[order.status] || 0) + 1;
    }

    return counts;
  }, [ordersAfterBaseFilters]);

  const selectedOrder = selectedOrderId ? checkoutOrders.find(o => o.id === selectedOrderId) : null;

  // Keep preInspectionStarted in sync if the order is updated externally (e.g. Supabase real-time)
  useEffect(() => {
    if (selectedOrder?.preInspectionCompleted) {
      setPreInspectionStarted(true);
    }
  }, [selectedOrder?.preInspectionCompleted]);

  const openOrder = (order: CheckoutOrder) => {
    setSelectedOrderId(order.id);
    setPreWorkReq(order.preWorkRequirement || '');
    setSalesNotes(order.notes || '');
    setInProgressNote(order.inProgressNote || '');
    setPostWorkNote(order.postWorkNote || '');
    setAttentionDetails(order.attentionDetails || []);
    setCustomerAdditionalComments(order.customerAdditionalComments || []);
    setAttentionInput('');
    setCommentInput('');
    setPreInspectionStarted(order.preInspectionCompleted || false);
  };

  useEffect(() => {
    if (!initialOpenOrderId) return;

    const target = lifecycleOrders.find(order => order.id === initialOpenOrderId);
    if (!target) {
      onInitialOpenOrderHandled?.();
      return;
    }

    openOrder(target);
    onInitialOpenOrderHandled?.();
  }, [initialOpenOrderId, lifecycleOrders, onInitialOpenOrderHandled]);

  const closeDetail = () => {
    setSelectedOrderId(null);
    setPreWorkReq('');
    setSalesNotes('');
    setInProgressNote('');
    setPostWorkNote('');
  };

  const saveUpdatedOrder = async (patch: Partial<CheckoutOrder>) => {
    if (!selectedOrder || isReadOnly) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const updated: CheckoutOrder = { ...selectedOrder, ...patch, updatedAt: now };
      await onSaveOrders([updated]);
      // Refresh local state
      setPreWorkReq(updated.preWorkRequirement || '');
      setSalesNotes(updated.notes || '');
      setInProgressNote(updated.inProgressNote || '');
      setPostWorkNote(updated.postWorkNote || '');
      setAttentionDetails(updated.attentionDetails || []);
      setCustomerAdditionalComments(updated.customerAdditionalComments || []);
      if (updated.preInspectionCompleted) setPreInspectionStarted(true);
      setSelectedOrderId(updated.id);
    } finally {
      setIsSaving(false);
    }
  };

  const proceedToInProgress = async () => {
    if (!selectedOrder || isReadOnly) return;
    const now = new Date().toISOString();
    await saveUpdatedOrder({
      status: CheckoutOrderStatus.IN_PROGRESS,
      inProgressAt: selectedOrder.inProgressAt || now,
      preWorkRequirement: preWorkReq,
      notes: salesNotes,
      attentionDetails,
      customerAdditionalComments,
      preInspectionCompleted: true,
      preInspectionCompletedAt: selectedOrder.preInspectionCompletedAt || now,
    });
  };

  const markTaskCompleted = async () => {
    if (!selectedOrder || isReadOnly) return;
    const now = new Date().toISOString();
    await saveUpdatedOrder({
      status: CheckoutOrderStatus.TASK_COMPLETED,
      taskCompletedAt: selectedOrder.taskCompletedAt || now,
      inProgressNote,
    });
  };

  const markCheckedOut = async () => {
    if (!selectedOrder || isReadOnly) return;
    const now = new Date().toISOString();
    await saveUpdatedOrder({
      status: CheckoutOrderStatus.CHECKED_OUT,
      checkedOutAt: selectedOrder.checkedOutAt || now,
      postWorkNote,
    });
    closeDetail();
  };

  const cancelOrder = async () => {
    if (!selectedOrder || isReadOnly) return;
    await saveUpdatedOrder({
      status: CheckoutOrderStatus.DRAFT,
      committedAt: undefined,
      inProgressAt: undefined,
      taskCompletedAt: undefined,
      checkedOutAt: undefined,
    });
    closeDetail();
  };

  // ── Status step bar ─────────────────────────────────────────────────────────
  const StatusBar: React.FC<{ current: CheckoutOrderStatus; order: CheckoutOrder }> = ({ current, order }) => {
    const steps = STATUS_ORDER;
    const currentIdx = steps.indexOf(current);
    return (
      <div className="flex items-start gap-1 py-3 overflow-x-auto">
        {steps.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const upcoming = i > currentIdx;
          const duration = !upcoming ? getStatusDuration(order, s, nowMs) : null;
          return (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center flex-1 min-w-[72px]">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm mb-1 ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : done ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-400'}`}>
                  <i className={`fas ${done ? 'fa-check' : STATUS_ICON[s]} text-xs`}></i>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-wide text-center leading-tight ${active ? 'text-blue-600 dark:text-blue-400' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                  {t ? STATUS_LABEL_ZH[s] : STATUS_LABEL_EN[s]}
                </span>
                <span className="mt-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  {duration !== null ? <><i className="fas fa-stopwatch mr-1"></i>{duration}</> : <span className="opacity-0">-</span>}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 max-w-8 rounded-full mt-4 ${i < currentIdx ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-white/10'}`}></div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // ── Detail page ─────────────────────────────────────────────────────────────
  if (selectedOrder) {
    const customer = customerMap.get(selectedOrder.customerId || '');
    // Resolve vehicle: prefer the one linked directly to the order, fall back
    // to the customer's primary vehicle so make/model/color always populate.
    const vehicle =
      vehicleMap.get(selectedOrder.vehicleId || '') ??
      vehicleMap.get(customer?.vehicleId || '');
    const timeIn = formatDateTime(selectedOrder.checkInAt || selectedOrder.occurredAt || selectedOrder.createdAt);
    const serviceLines = selectedOrder.lines.filter(isDisplayableServiceLine);
    const discountLines = selectedOrder.lines.filter(line => line.isDiscount);
    const status = selectedOrder.status;
    const printCurrentWorkOrder = () => {
      void printWorkOrder(
        { ...selectedOrder, preWorkRequirement: preWorkReq, notes: salesNotes, attentionDetails, customerAdditionalComments },
        customer,
        vehicle,
        language,
        workorderFieldMap
      );
    };

    return (
      <>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={closeDetail}
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center"
          >
            <i className="fas fa-arrow-left text-sm"></i>
          </button>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex-1">
            {t ? '服務進度' : 'Service Progress'}
          </h2>
          {!isReadOnly && (status === CheckoutOrderStatus.COMMITTED || status === CheckoutOrderStatus.IN_PROGRESS) && (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="px-3 py-2 rounded-xl bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400 text-xs font-black uppercase tracking-widest"
            >
              <i className="fas fa-ban mr-1.5"></i>
              {t ? '取消訂單' : 'Cancel'}
            </button>
          )}
        </div>

        {/* Car info card */}
        <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-black text-slate-900 dark:text-white">{customer?.name || (t ? '未指定客戶' : 'No customer')}</p>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-300">{vehicle?.licensePlate || '-'}{[vehicle?.make, vehicle?.model].some(Boolean) ? ` · ${[vehicle?.make, vehicle?.model].filter(Boolean).join(' ')}` : ''}</p>
              {vehicle?.color ? <p className="text-xs font-semibold text-slate-400 mt-0.5">{vehicle.color}</p> : null}
              <p className="text-xs font-semibold text-slate-400 mt-0.5">{t ? '到達時間' : 'Time In'}: {timeIn}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide ${STATUS_COLOR[status]}`}>
                {t ? STATUS_LABEL_ZH[status] : STATUS_LABEL_EN[status]}
              </span>
              <span className="text-xs font-black text-slate-500 dark:text-slate-300 whitespace-nowrap">
                <i className="fas fa-stopwatch mr-1.5 text-blue-600 dark:text-blue-400"></i>
                {getStatusDuration(selectedOrder, status, nowMs)}
              </span>
            </div>
          </div>

          <StatusBar current={status} order={selectedOrder} />

          <div className="pt-1 space-y-1">
            {serviceLines.length > 0 ? (
              serviceLines.map(l => (
                <div key={l.id} className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>{l.name}</span>
                  <span>{l.quantity > 1 ? `${l.quantity} × ` : ''}{formatCurrency(l.unitPrice)}</span>
                </div>
              ))
            ) : (
              <div className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                {t ? '無服務項目' : 'No service items'}
              </div>
            )}
            {discountLines.map(line => (
              <div key={`discount-${line.id}`} className="flex justify-between text-xs font-semibold text-rose-600 dark:text-rose-400">
                <span>{line.name}</span>
                <span>-{formatCurrency(Math.max(0, Number(line.lineSubtotal || 0)))}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-black text-blue-600 dark:text-blue-400 pt-1 border-t border-slate-100 dark:border-white/10">
              <span>{t ? '淨額' : 'Net'}</span>
              <span>{formatCurrency(selectedOrder.netAmount)}</span>
            </div>
          </div>
        </section>

        {/* ── COMMITTED → Pre-work inspection ──────────────────────────────── */}
        {status === CheckoutOrderStatus.COMMITTED && (
          <section className="rounded-3xl border border-blue-200 dark:border-blue-800/50 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                <i className="fas fa-clipboard-list mr-2"></i>
                {t ? '開工前檢查' : 'Pre-Work Inspection'}
              </h3>
              {!selectedOrder.preInspectionCompleted && !preInspectionStarted && !isReadOnly && (
                <button
                  onClick={() => setPreInspectionStarted(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest"
                >
                  <i className="fas fa-search mr-1.5"></i>
                  {t ? '開始驗車' : 'Start Pre-work Inspection'}
                </button>
              )}
            </div>

            {(preInspectionStarted || selectedOrder.preInspectionCompleted || attentionDetails.length > 0 || customerAdditionalComments.length > 0) && (<>

            {/* ── Attention Details for Customer ── */}
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {t ? '注意事項（客戶關注）' : 'Attention Details for Customer'}
              </label>
              {attentionDetails.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-2">
                  <span className="text-slate-400 text-xs mr-1">•</span>
                  <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">{item}</span>
                  {!isReadOnly && (
                    <button
                      onClick={() => setAttentionDetails(prev => prev.filter((_, i) => i !== idx))}
                      className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center text-[10px] shrink-0"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
              ))}
              {!isReadOnly && (
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t ? '快速選項' : 'Quick Suggestions'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[t?'車頂':'Roof', t?'前方':'Front', t?'左側':'Left', t?'右側':'Right', t?'後方':'Rear', t?'引擎蓋':'Hood', t?'車門':'Door', t?'保險桿':'Bumper'].map(loc => (
                      <button key={loc} onClick={() => setAttentionInput(v => v ? `${v} ${loc}` : loc)} className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-100 dark:border-blue-800/40">{loc}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[t?'燈泡':'Bulb', t?'格柵':'Grill', t?'座椅':'Seat', t?'輪毂':'Wheel', t?'車窗':'Window', t?'後視鏡':'Mirror'].map(part => (
                      <button key={part} onClick={() => setAttentionInput(v => v ? `${v} ${part}` : part)} className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-100 dark:border-indigo-800/40">{part}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[t?'劃痕':'Scratch', t?'凹陷':'Dent', t?'故障':'Malfunction', t?'掉漆':'Peeling', t?'破損':'Damaged'].map(issue => (
                      <button key={issue} onClick={() => setAttentionInput(v => v ? `${v} ${issue}` : issue)} className="px-2 py-1 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-[10px] font-bold border border-orange-100 dark:border-orange-800/40">{issue}</button>
                    ))}
                    <button
                      onClick={() => {
                        if (!attentionDetails.includes('N/A')) {
                          setAttentionDetails(prev => [...prev, 'N/A']);
                        }
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-[10px] font-bold border border-slate-200 dark:border-white/20"
                    >
                      N/A
                    </button>
                  </div>
                </div>
              )}
              {!isReadOnly && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={attentionInput}
                    onChange={e => setAttentionInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && attentionInput.trim()) { setAttentionDetails(prev => [...prev, attentionInput.trim()]); setAttentionInput(''); } }}
                    placeholder={t ? '輸入注意事項…' : 'Type attention detail…'}
                    className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => { if (attentionInput.trim()) { setAttentionDetails(prev => [...prev, attentionInput.trim()]); setAttentionInput(''); } }}
                    disabled={!attentionInput.trim()}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40"
                  >
                    {t ? '添加' : 'Add'}
                  </button>
                </div>
              )}
            </div>

            {/* ── Customer Additional Comments ── */}
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {t ? '客戶補充備注' : 'Customer Additional Comments'}
              </label>
              {customerAdditionalComments.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-2">
                  <span className="text-slate-400 text-xs mr-1">•</span>
                  <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">{item}</span>
                  {!isReadOnly && (
                    <button
                      onClick={() => setCustomerAdditionalComments(prev => prev.filter((_, i) => i !== idx))}
                      className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center text-[10px] shrink-0"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
              ))}
              {!isReadOnly && (
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t ? '快速選項' : 'Quick Suggestions'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['需要額外護理', '無香味', '車內有嬰兒或寵物', '請勿移除'].map(sug => (
                      <button key={sug} onClick={() => { if (!customerAdditionalComments.includes(sug)) setCustomerAdditionalComments(prev => [...prev, sug]); }} className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-100 dark:border-emerald-800/40">{sug}</button>
                    ))}
                    <button
                      onClick={() => {
                        if (!customerAdditionalComments.includes('N/A')) {
                          setCustomerAdditionalComments(prev => [...prev, 'N/A']);
                        }
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-[10px] font-bold border border-slate-200 dark:border-white/20"
                    >
                      N/A
                    </button>
                  </div>
                </div>
              )}
              {!isReadOnly && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && commentInput.trim()) { setCustomerAdditionalComments(prev => [...prev, commentInput.trim()]); setCommentInput(''); } }}
                    placeholder={t ? '輸入客戶備注…' : 'Type customer comment…'}
                    className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => { if (commentInput.trim()) { setCustomerAdditionalComments(prev => [...prev, commentInput.trim()]); setCommentInput(''); } }}
                    disabled={!commentInput.trim()}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40"
                  >
                    {t ? '添加' : 'Add'}
                  </button>
                </div>
              )}
            </div>

            {!isReadOnly && (
              <button
                onClick={async () => {
                  const now = new Date().toISOString();
                  await saveUpdatedOrder({
                    attentionDetails,
                    customerAdditionalComments,
                    preWorkRequirement: preWorkReq,
                    notes: salesNotes,
                    preInspectionCompleted: true,
                    preInspectionCompletedAt: selectedOrder.preInspectionCompletedAt || now,
                  });
                  setPreInspectionStarted(true);
                }}
                disabled={isSaving}
                className="w-full px-4 py-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-black uppercase tracking-widest disabled:opacity-50 border border-blue-200 dark:border-blue-800/40"
              >
                <i className="fas fa-save mr-1.5"></i>
                {isSaving ? (t ? '保存中…' : 'Saving…') : (t ? '完成驗車檢查' : 'Complete Pre-Inspection')}
              </button>
            )}
            </>)}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={printCurrentWorkOrder}
                disabled={!selectedOrder.preInspectionCompleted}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selectedOrder.preInspectionCompleted ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-slate-100 dark:bg-white/10 text-slate-400 dark:text-slate-500 opacity-40 cursor-not-allowed'}`}
              >
                <i className="fas fa-print mr-1.5"></i>
                {t ? '列印工作單' : 'Print Work Order'}
              </button>
              <button
                onClick={proceedToInProgress}
                disabled={isReadOnly || isSaving || !selectedOrder.preInspectionCompleted}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40 disabled:grayscale"
              >
                <i className="fas fa-tools mr-1.5"></i>
                {isSaving ? (t ? '保存中…' : 'Saving…') : (t ? '開始施工' : 'Proceed to In Progress')}
              </button>
            </div>
          </section>
        )}

        {/* ── IN_PROGRESS ───────────────────────────────────────────────────── */}
        {status === CheckoutOrderStatus.IN_PROGRESS && (
          <section className="rounded-3xl border border-amber-200 dark:border-amber-800/50 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
              <i className="fas fa-tools mr-2"></i>
              {t ? '施工中' : 'In Progress'}
            </h3>

            {selectedOrder.preWorkRequirement && (
              <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1">{t ? '客戶額外要求' : 'Customer Requirements'}</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{selectedOrder.preWorkRequirement}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                {t ? '施工備註' : 'In-Progress Notes'}
              </label>
              <textarea
                value={inProgressNote}
                onChange={e => setInProgressNote(e.target.value)}
                disabled={isReadOnly}
                rows={3}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder={t ? '施工過程備註…' : 'Notes during service…'}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={printCurrentWorkOrder}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-widest"
              >
                <i className="fas fa-print mr-1.5"></i>
                {t ? '列印工作單' : 'Print Work Order'}
              </button>

              <button
                onClick={markTaskCompleted}
                disabled={isReadOnly || isSaving}
                className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                <i className="fas fa-check mr-1.5"></i>
                {isSaving ? (t ? '保存中…' : 'Saving…') : (t ? '服務完成' : 'Mark as Completed')}
              </button>
            </div>
          </section>
        )}

        {/* ── TASK_COMPLETED → Post-work inspection ────────────────────────── */}
        {status === CheckoutOrderStatus.TASK_COMPLETED && (
          <section className="rounded-3xl border border-emerald-200 dark:border-emerald-800/50 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              <i className="fas fa-check-circle mr-2"></i>
              {t ? '完工後檢查' : 'Post-Work Inspection'}
            </h3>

            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                {t ? '完工備註' : 'Post-Work Notes'}
              </label>
              <textarea
                value={postWorkNote}
                onChange={e => setPostWorkNote(e.target.value)}
                disabled={isReadOnly}
                rows={3}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={t ? '完工後備註…' : 'Post-work inspection notes…'}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={printCurrentWorkOrder}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-widest"
              >
                <i className="fas fa-print mr-1.5"></i>
                {t ? '列印工作單' : 'Print Work Order'}
              </button>

              <button
                onClick={markCheckedOut}
                disabled={isReadOnly || isSaving}
                className="flex-1 px-4 py-3 rounded-xl bg-purple-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                <i className="fas fa-flag-checkered mr-1.5"></i>
                {isSaving ? (t ? '保存中…' : 'Saving…') : (t ? '確認結帳' : 'Proceed to Checkout')}
              </button>
            </div>
          </section>
        )}

        {/* ── CHECKED_OUT summary ───────────────────────────────────────────── */}
        {status === CheckoutOrderStatus.CHECKED_OUT && (
          <section className="rounded-3xl border border-purple-200 dark:border-purple-800/50 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">
              <i className="fas fa-flag-checkered mr-2"></i>
              {t ? '已結帳' : 'Checked Out'}
            </h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t ? '結帳時間' : 'Checked Out At'}: {formatDateTime(selectedOrder.checkedOutAt)}
            </p>
            {selectedOrder.postWorkNote && (
              <p className="text-sm text-slate-700 dark:text-slate-200">{selectedOrder.postWorkNote}</p>
            )}

            <button
              onClick={printCurrentWorkOrder}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-widest"
            >
              <i className="fas fa-print mr-1.5"></i>
              {t ? '列印工作單' : 'Print Work Order'}
            </button>
          </section>
        )}
      </div>

      {/* ── Cancel Order Confirmation ─────────────────────────────────────── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <i className="fas fa-ban text-red-600 dark:text-red-400"></i>
              </div>
              <div>
                <p className="text-base font-black text-slate-900 dark:text-white">
                  {t ? '確認取消訂單？' : 'Cancel this order?'}
                </p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                  {t ? '訂單將退回至草稿狀態。' : 'The order will be moved back to Draft status.'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 p-3 space-y-1">
              <p className="text-sm font-black text-slate-900 dark:text-white">
                {customerMap.get(selectedOrder.customerId || '')?.name || (t ? '未指定客戶' : 'No customer')}
              </p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                {vehicleMap.get(selectedOrder.vehicleId || '')?.licensePlate || '-'}
              </p>
              <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${STATUS_COLOR[selectedOrder.status]}`}>
                {t ? STATUS_LABEL_ZH[selectedOrder.status] : STATUS_LABEL_EN[selectedOrder.status]}
              </span>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-widest"
              >
                {t ? '返回' : 'Go Back'}
              </button>
              <button
                onClick={async () => { setShowCancelConfirm(false); await cancelOrder(); }}
                disabled={isSaving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                <i className="fas fa-ban mr-1.5"></i>
                {isSaving ? (t ? '處理中…' : 'Processing…') : (t ? '確認取消' : 'Confirm Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-slate-900 dark:text-white">
          {t ? '服務進度管理' : 'Service Life Cycle'}
        </h2>

        {/* Date filter */}
        <div className="relative flex items-center shrink-0">
          <i className={`fas fa-calendar-alt absolute left-3 text-xs z-10 transition-colors ${dateFilter !== 'ALL' ? 'text-emerald-600' : 'text-slate-400'}`}></i>
          <select
            value={dateFilter}
            onChange={e => {
              setDateFilter(e.target.value as any);
              if (e.target.value !== 'CUSTOM') { setStartDate(''); setEndDate(''); }
            }}
            className={`pl-9 pr-8 py-2 rounded-2xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm appearance-none border transition-all ${
              dateFilter !== 'ALL'
                ? 'bg-emerald-50 border-emerald-200 shadow-emerald-500/10 dark:bg-emerald-900/20 dark:border-emerald-900/40 dark:text-emerald-400'
                : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-white/10'
            }`}
          >
            <option value="ALL">{t ? '時間' : 'Range'}</option>
            <option value="TODAY">{t ? '今天' : 'Today'}</option>
            <option value="WEEK">{t ? '7天內' : '7 Days'}</option>
            <option value="MONTH">{t ? '30天內' : '30 Days'}</option>
            <option value="CUSTOM">{t ? '自定義範圍' : 'Custom Range'}</option>
          </select>
        </div>
      </div>

      {/* Custom date range */}
      {dateFilter === 'CUSTOM' && (
        <div className="flex flex-col sm:flex-row items-center gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10">
          <div className="flex-1 w-full grid grid-cols-2 gap-3">
            <div className="relative">
              <label className="absolute -top-2 left-3 px-1 bg-slate-50 dark:bg-slate-900 text-[8px] font-black text-slate-400 uppercase tracking-widest z-10">
                {t ? '開始日期' : 'Start Date'}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full pl-3 pr-3 py-2.5 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-900 dark:border-white/10 dark:text-white"
              />
            </div>
            <div className="relative">
              <label className="absolute -top-2 left-3 px-1 bg-slate-50 dark:bg-slate-900 text-[8px] font-black text-slate-400 uppercase tracking-widest z-10">
                {t ? '結束日期' : 'End Date'}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full pl-3 pr-3 py-2.5 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-900 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>
          <button
            onClick={() => { setDateFilter('ALL'); setStartDate(''); setEndDate(''); }}
            className="h-10 px-4 rounded-xl bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/20 transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
          >
            <i className="fas fa-times"></i>
            {t ? '清除' : 'Clear'}
          </button>
        </div>
      )}

      {/* Status summary icons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => {
            setSelectedStatusFilter(null);
            setSearchPlate('');
          }}
          className={`rounded-2xl border p-3 text-center transition-all ${selectedStatusFilter === null ? 'bg-slate-700 text-white border-slate-700 shadow-lg shadow-slate-700/20' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10'}`}
        >
          <i className="fas fa-layer-group text-xl mb-1"></i>
          <p className="text-xl font-black">{ordersAfterBaseFilters.length}</p>
          <p className="text-[9px] font-black uppercase tracking-wide leading-tight">
            {t ? '全部訂單' : 'All Orders'}
          </p>
        </button>

        {STATUS_ORDER.map(s => {
          const count = filteredStatusCounts[s] ?? 0;
          const selected = selectedStatusFilter === s;
          return (
            <button
              type="button"
              key={s}
              onClick={() => setSelectedStatusFilter(current => current === s ? null : s)}
              className={`rounded-2xl border p-3 text-center transition-all ${STATUS_COLOR[s]} border-current/20 ${selected ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-slate-950 scale-[1.01]' : ''}`}
            >
              <i className={`fas ${STATUS_ICON[s]} text-xl mb-1`}></i>
              <p className="text-xl font-black">{count}</p>
              <p className="text-[9px] font-black uppercase tracking-wide leading-tight">
                {t ? STATUS_LABEL_ZH[s] : STATUS_LABEL_EN[s]}
              </p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <LicensePlateField
        value={searchPlate}
        onChange={setSearchPlate}
        language={language}
        label={t ? '搜索車牌' : 'Search by Plate'}
        placeholder={t ? '例如 粤B1234' : 'e.g. AB1234'}
      />

      {/* Orders list */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-16">
          <i className="fas fa-car text-4xl text-slate-200 dark:text-white/10 mb-4"></i>
          <p className="text-sm font-bold text-slate-400">
            {searchPlate || selectedStatusFilter ? (t ? '找不到匹配的訂單' : 'No matching orders') : (t ? '暫無訂單' : 'No orders yet')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const customer = customerMap.get(order.customerId || '');
            const vehicle =
              vehicleMap.get(order.vehicleId || '') ??
              vehicleMap.get(customer?.vehicleId || '');
            const timeIn = formatDateTime(order.checkInAt || order.occurredAt || order.createdAt);
            return (
              <button
                key={order.id}
                onClick={() => openOrder(order)}
                className="w-full text-left rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4 hover:border-blue-300 dark:hover:border-blue-600/50 transition-all active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                      {customer?.name || (t ? '未指定客戶' : 'No customer')}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                      {vehicle?.licensePlate || '-'}
                      {vehicle?.make ? ` · ${vehicle.make}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      <i className="fas fa-clock mr-1"></i>{timeIn}
                    </p>
                    {(order.status === CheckoutOrderStatus.COMMITTED || order.status === CheckoutOrderStatus.IN_PROGRESS || order.status === CheckoutOrderStatus.TASK_COMPLETED || order.status === CheckoutOrderStatus.CHECKED_OUT) && (
                      <p className="text-[10px] font-bold mt-0.5 flex items-center gap-1 flex-wrap">
                        <span className={`w-2 h-2 rounded-full inline-block ${order.status === CheckoutOrderStatus.COMMITTED && !order.preInspectionCompleted ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                        <span className={order.status === CheckoutOrderStatus.COMMITTED && !order.preInspectionCompleted ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}>
                          {order.status === CheckoutOrderStatus.COMMITTED && !order.preInspectionCompleted ? (t ? '待驗車' : 'Pre-check pending') : (t ? '已驗車' : 'Pre-check done')}
                        </span>
                        {order.preInspectionCompleted && order.preInspectionCompletedAt && (
                          <span className="text-slate-400 dark:text-slate-500 font-semibold">
                            {t ? `(${formatDateTime(order.preInspectionCompletedAt)})` : `(${formatDateTime(order.preInspectionCompletedAt)})`}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${STATUS_COLOR[order.status]}`}>
                      {t ? STATUS_LABEL_ZH[order.status] : STATUS_LABEL_EN[order.status]}
                    </span>
                    <span className="text-[11px] font-black text-slate-500 dark:text-slate-300 whitespace-nowrap">
                      <i className="fas fa-stopwatch mr-1 text-blue-600 dark:text-blue-400"></i>
                      {getStatusDuration(order, order.status, nowMs)}
                    </span>
                    <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                      {formatCurrency(order.netAmount)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ServiceLifeCyclePage;
