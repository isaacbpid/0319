import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckoutOrder,
  CheckoutOrderStatus,
  CurrencyExchangeRate,
  Customer,
  CustomerMembership,
  DiscountItem,
  PaymentCurrency,
  PaymentMethod,
  Vehicle,
} from '../types';
import { convertCurrencyAmount, getApplicableExchangeRate } from '../utils/currencyConversion';
import invoiceFieldsCsv from '../invoice_fields.csv?raw';
import invoiceTemplateA4Url from '../invoice_template.png';
import invoiceTemplateThermalUrl from '../invoice.png';

interface CompletedCheckoutPageProps {
  language: 'zh' | 'en';
  customers: Customer[];
  vehicles: Vehicle[];
  customerMemberships: CustomerMembership[];
  discounts: DiscountItem[];
  checkoutOrders: CheckoutOrder[];
  exchangeRates: CurrencyExchangeRate[];
  onMarkOrderPaid: (orderId: string, paymentMethod: PaymentMethod, paymentCurrency: PaymentCurrency) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  initialOpenOrderId?: string | null;
  onInitialOpenOrderHandled?: () => void;
  isReadOnly?: boolean;
}

interface InvoiceFieldDefinition {
  name: string;
  x: number;
  y: number;
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
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

const formatCurrency = (value: number): string => `¥${value.toFixed(2)}`;

const formatDateTime = (value?: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
};

type DateFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

const csvEscape = (value: unknown): string => {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

const htmlEscape = (value: unknown): string => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const normalizeInvoiceFieldName = (value: string): string => {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
};

const parseInvoiceFieldDefinitions = (csvText: string): Map<string, InvoiceFieldDefinition> => {
  const map = new Map<string, InvoiceFieldDefinition>();
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

    const normalizedName = normalizeInvoiceFieldName(nameRaw);
    map.set(normalizedName, {
      name: nameRaw.trim(),
      x,
      y,
      fontSize: Number.isFinite(parsedFont) ? parsedFont : 10,
      alignment: safeAlignment,
    });
  }

  return map;
};

const CompletedCheckoutPage: React.FC<CompletedCheckoutPageProps> = ({
  language,
  customers,
  vehicles,
  customerMemberships,
  discounts,
  checkoutOrders,
  exchangeRates,
  onMarkOrderPaid,
  onDeleteOrder,
  initialOpenOrderId,
  onInitialOpenOrderHandled,
  isReadOnly,
}) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [isPaymentPageOpen, setIsPaymentPageOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.FPS);
  const [paymentError, setPaymentError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState<{ currency: PaymentCurrency; amount: number } | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const invoiceFieldMap = useMemo(() => parseInvoiceFieldDefinitions(invoiceFieldsCsv), []);

  const customerMap = useMemo(() => new Map(customers.map(customer => [customer.id, customer])), [customers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map(vehicle => [vehicle.id, vehicle])), [vehicles]);

  const activeMembershipByCustomerId = useMemo(() => {
    const map = new Map<string, CustomerMembership>();
    const activeMemberships = customerMemberships
      .filter(membership => membership.isActive)
      .sort((a, b) => {
        const aTime = new Date(a.startAt || a.createdAt).getTime();
        const bTime = new Date(b.startAt || b.createdAt).getTime();
        return bTime - aTime;
      });

    for (const membership of activeMemberships) {
      if (!map.has(membership.customerId)) {
        map.set(membership.customerId, membership);
      }
    }

    return map;
  }, [customerMemberships]);

  const getMembershipDiscountRateForCustomer = (customerId?: string): number => {
    if (!customerId) return 0;
    const membership = activeMembershipByCustomerId.get(customerId);
    if (!membership) return 0;
    const rate = Number.isFinite(membership.discountedRateSnapshot)
      ? membership.discountedRateSnapshot
      : membership.discountRateSnapshot;
    return Math.max(0, Math.min(100, Number(rate || 0)));
  };

  const discountsByCode = useMemo(() => {
    const map = new Map<string, DiscountItem>();
    for (const discount of discounts) {
      const code = (discount.code || '').trim().toUpperCase();
      if (!code) continue;
      map.set(code, discount);
    }
    return map;
  }, [discounts]);

  const resolveDiscountByCode = (code: string, effectType: 'discount' | 'surcharge'): DiscountItem | undefined => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return undefined;
    const match = discountsByCode.get(normalizedCode);
    if (!match) return undefined;
    const matchEffectType = match.effectType === 'surcharge' ? 'surcharge' : 'discount';
    return matchEffectType === effectType ? match : undefined;
  };

  const calculateCodeAmount = (gross: number, item?: DiscountItem): number => {
    if (!item) return 0;
    const safeGross = Math.max(0, gross);
    if (item.amountType === 'percent') {
      return Number(((safeGross * Math.max(0, item.amount)) / 100).toFixed(2));
    }
    return Number(Math.max(0, item.amount).toFixed(2));
  };

  const checkedOut = useMemo(() => {
    return checkoutOrders
      .filter(order => order.status === CheckoutOrderStatus.CHECKED_OUT)
      .sort((a, b) => {
        const aTime = new Date(a.checkInAt || a.occurredAt || a.createdAt).getTime();
        const bTime = new Date(b.checkInAt || b.occurredAt || b.createdAt).getTime();
        return bTime - aTime;
      });
  }, [checkoutOrders]);

  const filteredCheckedOut = useMemo(() => {
    if (dateFilter === 'ALL') return checkedOut;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return checkedOut.filter(order => {
      const orderDate = new Date(order.checkInAt || order.occurredAt || order.createdAt);
      orderDate.setHours(0, 0, 0, 0);

      if (dateFilter === 'TODAY') {
        return orderDate.getTime() === today.getTime();
      }

      if (dateFilter === 'WEEK') {
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        return orderDate >= weekAgo;
      }

      if (dateFilter === 'MONTH') {
        const monthAgo = new Date(today);
        monthAgo.setDate(today.getDate() - 30);
        return orderDate >= monthAgo;
      }

      if (dateFilter === 'CUSTOM') {
        if (startDate && endDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          return orderDate >= start && orderDate <= end;
        }

        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          return orderDate >= start;
        }

        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          return orderDate <= end;
        }
      }

      return true;
    });
  }, [checkedOut, dateFilter, startDate, endDate]);

  useEffect(() => {
    if (filteredCheckedOut.length === 0) {
      setSelectedOrderId('');
      return;
    }
    if (!filteredCheckedOut.some(order => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredCheckedOut[0].id);
    }
  }, [filteredCheckedOut, selectedOrderId]);

  useEffect(() => {
    if (!initialOpenOrderId) return;
    const target = filteredCheckedOut.find(order => order.id === initialOpenOrderId);
    if (target) {
      setSelectedOrderId(target.id);
    }
    onInitialOpenOrderHandled?.();
  }, [initialOpenOrderId, filteredCheckedOut, onInitialOpenOrderHandled]);

  const selectedOrder = useMemo(() => filteredCheckedOut.find(order => order.id === selectedOrderId), [filteredCheckedOut, selectedOrderId]);

  const selectedPaymentCurrency = useMemo(() => {
    if (!selectedOrder) return PaymentCurrency.RMB;
    const forced = getForcedCurrencyForMethod(paymentMethod);
    return forced || selectedOrder.paymentCurrency || PaymentCurrency.RMB;
  }, [selectedOrder, paymentMethod]);

  const selectedPaymentAmount = useMemo(() => {
    if (!selectedOrder) return null;
    return convertCurrencyAmount(selectedOrder.netAmount, exchangeRates, PaymentCurrency.RMB, selectedPaymentCurrency);
  }, [selectedOrder, exchangeRates, selectedPaymentCurrency]);

  const openPaymentPage = () => {
    if (!selectedOrder) return;
    setPaymentMethod(selectedOrder.paymentMethod || PaymentMethod.FPS);
    setPaymentError('');
    setPaymentSuccess(null);
    setIsPaymentPageOpen(true);
  };

  const confirmTransaction = async () => {
    if (!selectedOrder || isReadOnly) return;

    if (selectedPaymentAmount == null && selectedPaymentCurrency !== PaymentCurrency.RMB) {
      setPaymentError(language === 'zh' ? `缺少 RMB 至 ${selectedPaymentCurrency} 的匯率設定` : `Missing exchange rate from RMB to ${selectedPaymentCurrency}`);
      return;
    }

    const displayAmount = selectedPaymentAmount ?? selectedOrder.netAmount;

    setPaymentError('');
    await onMarkOrderPaid(selectedOrder.id, paymentMethod, selectedPaymentCurrency);
    setPaymentSuccess({ currency: selectedPaymentCurrency, amount: displayAmount });
  };

  const downloadReceiptSummary = (order: CheckoutOrder) => {
    const customer = customerMap.get(order.customerId || '');
    const vehicle = vehicleMap.get(order.vehicleId || '');
    const orderCodeDiscount = calculateCodeAmount(order.grossAmount, resolveDiscountByCode(order.discountCode || '', 'discount'));
    const serviceLines = order.lines.filter(line => !line.isDiscount);
    const lineText = serviceLines.length === 0
      ? (language === 'zh' ? '無服務項目' : 'No service items')
      : serviceLines
          .map(line => `- ${line.name} x${line.quantity} @ ${formatCurrency(line.unitPrice)} = ${formatCurrency(line.lineSubtotal)}`)
          .join('\n');

    const content = [
      language === 'zh' ? '結帳收據摘要' : 'Checkout Receipt Summary',
      '----------------------------------------',
      `${language === 'zh' ? '訂單 ID' : 'Order ID'}: ${order.id}`,
      `${language === 'zh' ? '狀態' : 'Status'}: ${order.status}`,
      `${language === 'zh' ? '客戶' : 'Customer'}: ${customer?.name || '-'}`,
      `${language === 'zh' ? '車牌' : 'License Plate'}: ${vehicle?.licensePlate || '-'}`,
      `${language === 'zh' ? 'Check-In' : 'Check-In'}: ${formatDateTime(order.checkInAt)}`,
      `${language === 'zh' ? '完成結帳' : 'Checked Out'}: ${formatDateTime(order.checkedOutAt)}`,
      '',
      language === 'zh' ? '服務明細:' : 'Service Lines:',
      lineText,
      '',
      `${language === 'zh' ? '毛額' : 'Gross'}: ${formatCurrency(order.grossAmount)}`,
      `${language === 'zh' ? '大型車加收' : 'Large Vehicle Surcharge'}: +${formatCurrency(order.largeVehicleSurchargeAmount || 0)}`,
      `${language === 'zh' ? '會員折扣' : 'Membership Discount'}: -${formatCurrency(order.membershipDiscountAmount)}`,
      `${language === 'zh' ? '優惠券折扣' : 'Coupon Discount'}: -${formatCurrency(order.couponDiscountAmount)}`,
      `${language === 'zh' ? '代碼折扣' : 'Code Discount'}: -${formatCurrency(orderCodeDiscount)}`,
      `${language === 'zh' ? '淨額' : 'Net'}: ${formatCurrency(order.netAmount)}`,
      `${language === 'zh' ? '支付狀態' : 'Payment Status'}: ${order.paymentStatus || 'pending'}`,
      `${language === 'zh' ? '支付方式' : 'Payment Method'}: ${order.paymentMethod || '-'}`,
      `${language === 'zh' ? '支付幣別' : 'Payment Currency'}: ${order.paymentCurrency || 'RMB'}`,
      `${language === 'zh' ? '折扣代碼' : 'Discount Code'}: ${order.discountCode || '-'}`,
      `${language === 'zh' ? '加收代碼' : 'Surcharge Code'}: ${order.surchargeCode || '-'}`,
      `${language === 'zh' ? '備註' : 'Notes'}: ${order.notes || '-'}`,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt_${order.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReceiptWithTemplate = async (order: CheckoutOrder, mode: 'a4' | 'thermal', direct = false) => {
    const customer = customerMap.get(order.customerId || '');
    const vehicle = vehicleMap.get(order.vehicleId || '');
    const orderCodeDiscount = calculateCodeAmount(order.grossAmount, resolveDiscountByCode(order.discountCode || '', 'discount'));
    const templateUrl = mode === 'a4' ? invoiceTemplateA4Url : invoiceTemplateThermalUrl;
    let templateSrc = templateUrl;
    try {
      const templateResponse = await fetch(templateUrl);
      if (!templateResponse.ok) throw new Error(`HTTP ${templateResponse.status}`);
      const templateBlob = await templateResponse.blob();
      templateSrc = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(templateBlob);
      });
    } catch {
      // Fallback to direct URL if conversion fails.
      templateSrc = templateUrl;
    }
    const serviceLines = order.lines.filter(line => !line.isDiscount);
    const createdAtText = formatDateTime(order.checkInAt || order.createdAt);
    const checkedOutText = formatDateTime(order.checkedOutAt || order.updatedAt);

    const buildA4Html = () => {
      const activeMembership = activeMembershipByCustomerId.get(order.customerId || '');
      const membershipTierText = activeMembership
        ? `${Number(getMembershipDiscountRateForCustomer(order.customerId)).toFixed(0)}%`
        : 'GUEST';
      const contactThruText = customer?.phone || customer?.name || '-';
      const contactMethodText = customer?.phone ? (language === 'zh' ? '電話' : 'Phone') : '-';
      const carMakeModelText = [vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || '-';

      const virtualWidth = 230;
      const virtualHeight = 160;
      const toXPercent = (value: number) => ((value / virtualWidth) * 100).toFixed(4);
      const toYPercent = (value: number) => ((value / virtualHeight) * 100).toFixed(4);

      const resolveField = (
        fieldName: string,
        fallback: { x: number; y: number; fontSize: number; alignment: 'left' | 'center' | 'right' }
      ) => {
        const match = invoiceFieldMap.get(normalizeInvoiceFieldName(fieldName));
        if (!match) return fallback;
        return {
          x: match.x,
          y: match.y,
          fontSize: match.fontSize,
          alignment: match.alignment,
        };
      };

      const field = (
        value: string,
        x: number,
        y: number,
        fontSize = 10,
        widthUnits = 26,
        align: 'left' | 'center' | 'right' = 'center'
      ) => {
        const transform = align === 'center' ? 'translate(-50%, -50%)' : 'translate(0, -50%)';
        const left = align === 'center' ? `${toXPercent(x)}%` : `${toXPercent(x - (widthUnits / 2))}%`;
        return `<div class="invoice-field" style="left:${left};top:${toYPercent(y)}%;width:${toXPercent(widthUnits)}%;font-size:${fontSize}pt;text-align:${align};transform:${transform};">${htmlEscape(value)}</div>`;
      };

      const fieldFromCsv = (
        fieldName: string,
        value: string,
        widthUnits = 24,
        fallback: { x: number; y: number; fontSize: number; alignment: 'left' | 'center' | 'right' }
      ) => {
        const def = resolveField(fieldName, fallback);
        return field(value, def.x, def.y, def.fontSize, widthUnits, def.alignment);
      };

      const expectedPickupText = order.estimatedFinishAt
        ? formatDateTime(order.estimatedFinishAt)
        : checkedOutText;

      const metadataFields = [
        fieldFromCsv('Date', new Date(order.checkedOutAt || order.updatedAt || order.createdAt).toLocaleDateString(), 24, { x: 215, y: 25, fontSize: 10, alignment: 'center' }),
        fieldFromCsv('Invoice number', order.invoiceNumber || order.id.slice(0, 8), 22, { x: 40, y: 40, fontSize: 10, alignment: 'center' }),
        fieldFromCsv('Drop off time', createdAtText, 30, { x: 60, y: 40, fontSize: 9, alignment: 'center' }),
        fieldFromCsv('License plate', vehicle?.licensePlate || '-', 28, { x: 100, y: 40, fontSize: 10, alignment: 'center' }),
        fieldFromCsv('Customer name', customer?.name || '-', 28, { x: 140, y: 40, fontSize: 10, alignment: 'center' }),
        fieldFromCsv('Payment Currency', order.paymentCurrency || PaymentCurrency.RMB, 22, { x: 180, y: 40, fontSize: 10, alignment: 'center' }),
        fieldFromCsv('membership tier', membershipTierText, 20, { x: 215, y: 40, fontSize: 10, alignment: 'center' }),
        fieldFromCsv('contact thru', contactThruText, 22, { x: 40, y: 55, fontSize: 9, alignment: 'center' }),
        fieldFromCsv('expected pick up time', expectedPickupText, 30, { x: 60, y: 55, fontSize: 9, alignment: 'center' }),
        fieldFromCsv('Car Make', carMakeModelText, 30, { x: 100, y: 55, fontSize: 9, alignment: 'center' }),
        fieldFromCsv('contact method', contactMethodText, 22, { x: 140, y: 55, fontSize: 9, alignment: 'center' }),
        fieldFromCsv('Payment Method', order.paymentMethod || '-', 22, { x: 180, y: 55, fontSize: 10, alignment: 'center' }),
        fieldFromCsv('Reward Balance', '-', 20, { x: 215, y: 55, fontSize: 10, alignment: 'center' }),
      ].join('');

      const maxRows = 5;
      const lineAnchor = resolveField('Line item description', { x: 10, y: 75, fontSize: 10, alignment: 'left' });
      const qtyAnchor = resolveField('Qty', { x: 120, y: 75, fontSize: 10, alignment: 'center' });
      const unitPriceAnchor = resolveField('Unit price', { x: 110, y: 75, fontSize: 10, alignment: 'center' });
      const amountAnchor = resolveField('Amount', { x: 140, y: 75, fontSize: 10, alignment: 'center' });
      const rowStartY = lineAnchor.y;
      const rowStep = 10;
      const printableRows = serviceLines.slice(0, maxRows);
      const lineRows = (printableRows.length > 0 ? printableRows : [{ name: '-', quantity: 0, unitPrice: 0, lineSubtotal: 0 } as any])
        .map((line: any, index: number) => {
          const y = rowStartY + (index * rowStep);
          return [
            field(line.name, lineAnchor.x, y, lineAnchor.fontSize, 118, lineAnchor.alignment),
            field(line.quantity > 0 ? String(line.quantity) : '-', qtyAnchor.x, y, qtyAnchor.fontSize, 14, qtyAnchor.alignment),
            field(line.unitPrice > 0 ? formatCurrency(line.unitPrice) : '-', unitPriceAnchor.x, y, unitPriceAnchor.fontSize, 20, unitPriceAnchor.alignment),
            field(line.lineSubtotal > 0 ? formatCurrency(line.lineSubtotal) : '-', amountAnchor.x, y, amountAnchor.fontSize, 24, amountAnchor.alignment),
          ].join('');
        })
        .join('');

      const totalAnchor = resolveField('Total', { x: 170, y: 125, fontSize: 10, alignment: 'center' });
      const notesAnchor = resolveField('Notes', { x: 20, y: 145, fontSize: 9, alignment: 'left' });
      const totalsAndNotes = [
        field(formatCurrency(order.netAmount), totalAnchor.x, totalAnchor.y, totalAnchor.fontSize, 24, totalAnchor.alignment),
        field(order.notes || '-', notesAnchor.x, notesAnchor.y, notesAnchor.fontSize, 150, notesAnchor.alignment),
      ].join('');

      const autoScript = direct
        ? ''
        : `<script>(function(){const img=document.getElementById('invoice-template-image');let printed=false;const triggerPrint=()=>{if(printed)return;printed=true;setTimeout(()=>window.print(),350);};window.addEventListener('load',()=>{if(img&&img.complete){triggerPrint();return;}if(img){img.addEventListener('load',triggerPrint,{once:true});img.addEventListener('error',triggerPrint,{once:true});}setTimeout(triggerPrint,1800);});})();<\/script>`;
      return `<!doctype html><html><head><meta charset="UTF-8" /><title>${htmlEscape(language === 'zh' ? '收據列印' : 'Receipt Print')}</title><style>* { box-sizing: border-box; } @page { size: A4 landscape; margin: 0; } html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body { margin: 0; font-family: Arial, sans-serif; color: #111; background: #fff; } .sheet { width: 297mm; height: 210mm; margin: 0 auto; } .invoice-shell { position: relative; width: 297mm; height: 210mm; overflow: hidden; } .invoice-template { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; } .invoice-content { position: absolute; inset: 0; z-index: 1; } .invoice-field { position: absolute; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }</style></head><body><div class="sheet"><div class="invoice-shell"><img id="invoice-template-image" class="invoice-template" src="${htmlEscape(templateSrc)}" alt="invoice template" /><div class="invoice-content">${metadataFields}${lineRows}${totalsAndNotes}</div></div></div>${autoScript}</body></html>`;
    };

    const buildThermalHtml = () => {
      const rowsHtml = serviceLines.length > 0
        ? serviceLines.map(line => `<tr><td>${htmlEscape(line.name)}</td><td>${htmlEscape(formatCurrency(line.unitPrice))}</td><td>${htmlEscape(line.quantity)}</td><td>${htmlEscape(formatCurrency(line.lineSubtotal))}</td></tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center;">${htmlEscape(language === 'zh' ? '無服務項目' : 'No service items')}</td></tr>`;

      return `<!doctype html><html><head><meta charset="UTF-8" /><title>${htmlEscape(language === 'zh' ? '收據列印' : 'Receipt Print')}</title><style>* { box-sizing: border-box; } html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body { font-family: Arial, sans-serif; color: #111; background: #fff; } .sheet { margin: 0 auto; width: 74mm; } .invoice-shell { position: relative; width: 74mm; min-height: 120mm; padding: 74px 28px 20px; border: 1px solid #e5e7eb; overflow: hidden; } .invoice-template { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; } .invoice-content { position: relative; z-index: 1; } .hero { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 7px; margin-bottom: 12px; } .table { width: 100%; border-collapse: collapse; margin-top: 8px; } .table th, .table td { border: 1px solid #d1d5db; padding: 2px 3px; font-size: 6px; text-align: left; } .totals p { margin: 0; font-size: 6px; } @page { size: 80mm auto; margin: 3mm; }</style></head><body><div class="sheet"><div class="invoice-shell"><img id="invoice-template-image" class="invoice-template" src="${htmlEscape(templateSrc)}" alt="invoice template" /><div class="invoice-content"><div class="hero"><div><p><strong>${htmlEscape(language === 'zh' ? 'Invoice #' : 'Invoice #')}:</strong> ${htmlEscape(order.invoiceNumber || order.id.slice(0, 8))}</p><p><strong>${htmlEscape(language === 'zh' ? '車牌' : 'License Plate')}:</strong> ${htmlEscape(vehicle?.licensePlate || '-')}</p></div><div><p><strong>${htmlEscape(language === 'zh' ? '客戶' : 'Client')}:</strong> ${htmlEscape(customer?.name || '-')}</p><p><strong>${htmlEscape(language === 'zh' ? '幣別' : 'Currency')}:</strong> ${htmlEscape(order.paymentCurrency || 'RMB')}</p></div><div><p><strong>${htmlEscape(language === 'zh' ? 'Check-In' : 'Drop Off')}:</strong> ${htmlEscape(createdAtText)}</p><p><strong>${htmlEscape(language === 'zh' ? '完成結帳' : 'Checked Out')}:</strong> ${htmlEscape(checkedOutText)}</p></div></div><table class="table"><thead><tr><th>${htmlEscape(language === 'zh' ? '項目' : 'Description')}</th><th>${htmlEscape(language === 'zh' ? '單價' : 'Rate')}</th><th>${htmlEscape(language === 'zh' ? '數量' : 'Qty.')}</th><th>${htmlEscape(language === 'zh' ? '金額' : 'Amount')}</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="totals"><p><strong>${htmlEscape(language === 'zh' ? '毛額' : 'Gross')}:</strong> ${htmlEscape(formatCurrency(order.grossAmount))}</p><p><strong>${htmlEscape(language === 'zh' ? '大型車加收' : 'Large Vehicle Surcharge')}:</strong> +${htmlEscape(formatCurrency(order.largeVehicleSurchargeAmount || 0))}</p><p><strong>${htmlEscape(language === 'zh' ? '會員折扣' : 'Membership Discount')}:</strong> -${htmlEscape(formatCurrency(order.membershipDiscountAmount))}</p><p><strong>${htmlEscape(language === 'zh' ? '優惠券折扣' : 'Coupon Discount')}:</strong> -${htmlEscape(formatCurrency(order.couponDiscountAmount))}</p><p><strong>${htmlEscape(language === 'zh' ? '代碼折扣' : 'Code Discount')}:</strong> -${htmlEscape(formatCurrency(orderCodeDiscount))}</p><p><strong>${htmlEscape(language === 'zh' ? '淨額' : 'Net')}:</strong> ${htmlEscape(formatCurrency(order.netAmount))}</p></div></div></div></div><script>(function(){const img=document.getElementById('invoice-template-image');let printed=false;const triggerPrint=()=>{if(printed)return;printed=true;setTimeout(()=>window.print(),350);};window.addEventListener('load',()=>{if(img&&img.complete){triggerPrint();return;}if(img){img.addEventListener('load',triggerPrint,{once:true});img.addEventListener('error',triggerPrint,{once:true});}setTimeout(triggerPrint,1800);});})();</script></body></html>`;
    };

    const html = mode === 'a4' ? buildA4Html() : buildThermalHtml();
    const printBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const printUrl = URL.createObjectURL(printBlob);

    if (direct && mode === 'a4') {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(iframe);
      const cleanup = () => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        URL.revokeObjectURL(printUrl);
      };
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(cleanup, 60000);
        }
      };
      iframe.src = printUrl;
      return;
    }

    const printWindow = window.open(printUrl, '_blank', 'noopener,noreferrer,width=960,height=1280');
    if (!printWindow) {
      URL.revokeObjectURL(printUrl);
      alert(language === 'zh'
        ? '彈出視窗被瀏覽器封鎖，請允許本網站的彈出視窗後再試。'
        : 'Popup blocked. Please allow popups for this site and try again.');
      return;
    }
    setTimeout(() => URL.revokeObjectURL(printUrl), 60000);
  };

  if (isPaymentPageOpen && selectedOrder) {
    const customer = customerMap.get(selectedOrder.customerId || '');
    const vehicle = vehicleMap.get(selectedOrder.vehicleId || '');
    const exchangeRate = getApplicableExchangeRate(exchangeRates, PaymentCurrency.RMB, selectedPaymentCurrency);

    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-900 dark:text-white">{language === 'zh' ? '確認收款' : 'Confirm Payment'}</h2>
            <button
              onClick={() => {
                setIsPaymentPageOpen(false);
                setPaymentError('');
                setPaymentSuccess(null);
              }}
              className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-black uppercase tracking-widest"
            >
              {language === 'zh' ? '返回' : 'Back'}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4 space-y-2">
            <p className="text-sm font-black text-slate-900 dark:text-white">{language === 'zh' ? 'Order' : 'Order'}: {selectedOrder.invoiceNumber || selectedOrder.id.slice(0, 8)}</p>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-300">{customer?.name || '-'} • {vehicle?.licensePlate || '-'}</p>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-300">{language === 'zh' ? '到達時間' : 'Arrived At'}: {formatDateTime(selectedOrder.checkInAt || selectedOrder.occurredAt || selectedOrder.createdAt)}</p>
            <p className="text-sm font-black text-blue-600 dark:text-blue-400">
              {language === 'zh' ? '幣別與金額' : 'Currency & Amount'}: {selectedPaymentCurrency} {selectedPaymentAmount == null ? '-' : selectedPaymentAmount.toFixed(2)}
            </p>
            {selectedPaymentCurrency !== PaymentCurrency.RMB && exchangeRate && (
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">rate {exchangeRate}</p>
            )}
          </div>

          <div className="grid gap-2">
            {PAYMENT_METHOD_OPTIONS.map(method => {
              const isSelected = paymentMethod === method;
              return (
                <button
                  key={method}
                  onClick={() => {
                    setPaymentMethod(method);
                    setPaymentError('');
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-black ${isSelected ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
                >
                  <span>{method}</span>
                  <i className={`fas ${isSelected ? 'fa-check-circle' : 'fa-circle'} text-sm`}></i>
                </button>
              );
            })}
          </div>

          {paymentError && <p className="text-sm font-bold text-rose-600">{paymentError}</p>}

          {paymentSuccess && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 p-4 space-y-1">
              <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">{language === 'zh' ? 'Payment completed' : 'Payment completed'}</p>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{language === 'zh' ? '支付幣別' : 'Payment currency'}: {paymentSuccess.currency}</p>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{language === 'zh' ? '支付金額' : 'Payment Amount'}: {paymentSuccess.amount.toFixed(2)}</p>
            </div>
          )}

          <button
            onClick={confirmTransaction}
            disabled={isReadOnly}
            className="w-full px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black uppercase tracking-widest disabled:opacity-50"
          >
            {language === 'zh' ? '確認交易' : 'Confirm transaction'}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h2 className="text-xl font-black text-slate-900 dark:text-white">{language === 'zh' ? '已完成訂單' : 'Completed Checkout'}</h2>

        {selectedOrder ? (
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4 space-y-3">
            <div className="grid md:grid-cols-2 gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <p>{language === 'zh' ? '客戶' : 'Customer'}: {customerMap.get(selectedOrder.customerId || '')?.name || '-'}</p>
              <p>{language === 'zh' ? '車牌' : 'License Plate'}: {vehicleMap.get(selectedOrder.vehicleId || '')?.licensePlate || '-'}</p>
              <p>{language === 'zh' ? '到達時間' : 'Arrived At'}: {formatDateTime(selectedOrder.checkInAt || selectedOrder.occurredAt || selectedOrder.createdAt)}</p>
              <p>{language === 'zh' ? '完成時間' : 'Completion Time'}: {formatDateTime(selectedOrder.checkedOutAt)}</p>
              <p>{language === 'zh' ? '幣別與金額' : 'Currency & Amount'}: {(selectedOrder.paymentCurrency || PaymentCurrency.RMB)} {((selectedOrder.paymentAmount ?? selectedOrder.netAmount) || 0).toFixed(2)}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={openPaymentPage}
                disabled={isReadOnly || (selectedOrder.paymentStatus || 'pending') === 'paid'}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {(selectedOrder.paymentStatus || 'pending') === 'paid'
                  ? (language === 'zh' ? '已收款' : 'Payment Completed')
                  : (language === 'zh' ? '確認收款' : 'Confirm Payment')}
              </button>
              <button
                onClick={() => printReceiptWithTemplate(selectedOrder, 'a4')}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-black uppercase tracking-widest"
              >
                {language === 'zh' ? '列印 A4' : 'Print A4'}
              </button>
              <button
                onClick={() => printReceiptWithTemplate(selectedOrder, 'a4', true)}
                className="px-3 py-2 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-black uppercase tracking-widest"
              >
                {language === 'zh' ? 'PDF / 直接列印' : 'PDF / Direct Print'}
              </button>
              <button
                onClick={() => downloadReceiptSummary(selectedOrder)}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-black uppercase tracking-widest"
              >
                {language === 'zh' ? '下載摘要' : 'Download Summary'}
              </button>
              <button
                onClick={() => onDeleteOrder(selectedOrder.id)}
                disabled={isReadOnly}
                className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {language === 'zh' ? '刪除' : 'Delete'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold text-slate-400">{language === 'zh' ? '尚無已完成訂單' : 'No completed orders yet'}</p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-lg font-black text-slate-900 dark:text-white">{language === 'zh' ? '已完成清單' : 'Completed List'}</h3>
          <div className="relative flex items-center shrink-0">
            <i className={`fas fa-calendar-alt absolute left-3 text-xs z-10 transition-colors ${dateFilter !== 'ALL' ? 'text-emerald-600' : 'text-slate-400'}`}></i>
            <select
              value={dateFilter}
              onChange={e => {
                const nextFilter = e.target.value as DateFilter;
                setDateFilter(nextFilter);
                if (nextFilter !== 'CUSTOM') {
                  setStartDate('');
                  setEndDate('');
                }
              }}
              className={`pl-9 pr-8 py-2 rounded-2xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm appearance-none border transition-all ${
                dateFilter !== 'ALL'
                  ? 'bg-emerald-50 border-emerald-200 shadow-emerald-500/10 dark:bg-emerald-900/20 dark:border-emerald-900/40 dark:text-emerald-400'
                  : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-white/10'
              }`}
            >
              <option value="ALL">{language === 'zh' ? '時間' : 'Range'}</option>
              <option value="TODAY">{language === 'zh' ? '今天' : 'Today'}</option>
              <option value="WEEK">{language === 'zh' ? '7天內' : '7 Days'}</option>
              <option value="MONTH">{language === 'zh' ? '30天內' : '30 Days'}</option>
              <option value="CUSTOM">{language === 'zh' ? '自定義範圍' : 'Custom Range'}</option>
            </select>
          </div>
        </div>

        {dateFilter === 'CUSTOM' && (
          <div className="flex flex-col sm:flex-row items-center gap-3 p-4 mb-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10">
            <div className="flex-1 w-full grid grid-cols-2 gap-3">
              <div className="relative">
                <label className="absolute -top-2 left-3 px-1 bg-slate-50 dark:bg-slate-900 text-[8px] font-black text-slate-400 uppercase tracking-widest z-10">
                  {language === 'zh' ? '開始日期' : 'Start Date'}
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
                  {language === 'zh' ? '結束日期' : 'End Date'}
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
              onClick={() => {
                setDateFilter('ALL');
                setStartDate('');
                setEndDate('');
              }}
              className="h-10 px-4 rounded-xl bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/20 transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
            >
              <i className="fas fa-times"></i>
              {language === 'zh' ? '清除' : 'Clear'}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {filteredCheckedOut.length === 0 && (
            <p className="text-xs font-semibold text-slate-400">{language === 'zh' ? '尚無已完成訂單' : 'No completed orders yet'}</p>
          )}
          {filteredCheckedOut.map(order => {
            const customer = customerMap.get(order.customerId || '');
            const vehicle = vehicleMap.get(order.vehicleId || '');
            const paymentCurrency = order.paymentCurrency || PaymentCurrency.RMB;
            const paymentAmount = order.paymentAmount ?? order.netAmount;
            const isSelected = order.id === selectedOrderId;
            return (
              <button
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <div className="grid md:grid-cols-5 gap-2 text-sm">
                  <p className="font-black text-slate-900 dark:text-white">{customer?.name || '-'}</p>
                  <p className="font-bold text-slate-700 dark:text-slate-200">{vehicle?.licensePlate || '-'}</p>
                  <p className="font-semibold text-slate-500 dark:text-slate-300">{formatDateTime(order.checkInAt || order.occurredAt || order.createdAt)}</p>
                  <p className="font-semibold text-slate-500 dark:text-slate-300">{paymentCurrency}</p>
                  <p className="font-black text-blue-600 dark:text-blue-400">{paymentAmount.toFixed(2)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default CompletedCheckoutPage;
