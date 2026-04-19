import React, { useEffect, useMemo, useState } from 'react';
import {
  CategoryItem,
  CheckoutOrder,
  CheckoutOrderLine,
  CheckoutOrderStatus,
  Customer,
  CustomerMembership,
  DiscountItem,
  PaymentCurrency,
  PaymentMethod,
  TransactionType,
  Vehicle,
  VehicleSize,
} from '../types';
import { findCustomerVehicleByLicensePlate } from '../services/database';
import {
  calculateCouponDiscountAmount,
  calculateEstimatedDurationMinutes,
  calculateEstimatedFinishAt,
  calculateGrossAmount,
  calculateMembershipDiscountAmount,
  calculateNetAmount,
} from '../utils/orderPricing';
import invoiceFieldsCsv from '../invoice_fields.csv?raw';

const isLargeVehicle = (vehicle?: Vehicle): boolean => {
  return vehicle?.vehicleSize === VehicleSize.LARGE;
};

interface CheckoutPageProps {
  language: 'zh' | 'en';
  categories: CategoryItem[];
  customers: Customer[];
  vehicles: Vehicle[];
  customerMemberships: CustomerMembership[];
  discounts: DiscountItem[];
  checkoutOrders: CheckoutOrder[];
  onSaveOrders: (orders: CheckoutOrder[]) => Promise<void>;
  onMarkOrderPaid: (orderId: string, paymentMethod: PaymentMethod, paymentCurrency: PaymentCurrency) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
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

const PAYMENT_CURRENCY_OPTIONS: PaymentCurrency[] = [
  PaymentCurrency.HKD,
  PaymentCurrency.RMB,
  PaymentCurrency.MOP,
];

const getForcedCurrencyForMethod = (method: PaymentMethod): PaymentCurrency | null => {
  if (method === PaymentMethod.HKD_CASH) return PaymentCurrency.HKD;
  if (method === PaymentMethod.RMB_CASH) return PaymentCurrency.RMB;
  if (method === PaymentMethod.MOP_CASH) return PaymentCurrency.MOP;
  return null;
};

const formatCurrency = (value: number): string => `¥${value.toFixed(2)}`;

const formatDateTime = (value?: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
};

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

interface InvoiceFieldDefinition {
  name: string;
  x: number;
  y: number;
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
}

const normalizeInvoiceFieldName = (value: string): string => {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
};

const parseInvoiceFieldDefinitions = (csvText: string): Map<string, InvoiceFieldDefinition> => {
  const map = new Map<string, InvoiceFieldDefinition>();
  const lines = csvText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  // Skip header row.
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

const CheckoutPage: React.FC<CheckoutPageProps> = ({
  language,
  categories,
  customers,
  vehicles,
  customerMemberships,
  discounts,
  checkoutOrders,
  onSaveOrders,
  onMarkOrderPaid,
  onDeleteOrder,
  isReadOnly,
}) => {
  const [licensePlateInput, setLicensePlateInput] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedLines, setSelectedLines] = useState<CheckoutOrderLine[]>([]);
  const [couponAmountInput, setCouponAmountInput] = useState('0');
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [membershipRateInput, setMembershipRateInput] = useState('0');
  const [surchargeCodeInput, setSurchargeCodeInput] = useState('');
  const [notes, setNotes] = useState('');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [queueEditingOrderId, setQueueEditingOrderId] = useState<string | null>(null);
  const [queueEditingLines, setQueueEditingLines] = useState<CheckoutOrderLine[]>([]);
  const [queueEditingCouponAmountInput, setQueueEditingCouponAmountInput] = useState('0');
  const [queueEditingDiscountCodeInput, setQueueEditingDiscountCodeInput] = useState('');
  const [queueEditingMembershipRateInput, setQueueEditingMembershipRateInput] = useState('0');
  const [queueEditingSurchargeCodeInput, setQueueEditingSurchargeCodeInput] = useState('');
  const [queueEditingNotes, setQueueEditingNotes] = useState('');
  const [paymentMethodByOrderId, setPaymentMethodByOrderId] = useState<Record<string, PaymentMethod>>({});
  const [paymentCurrencyByOrderId, setPaymentCurrencyByOrderId] = useState<Record<string, PaymentCurrency>>({});
  const [paymentErrorByOrderId, setPaymentErrorByOrderId] = useState<Record<string, string>>({});

  const invoiceFieldMap = useMemo(() => {
    return parseInvoiceFieldDefinitions(invoiceFieldsCsv);
  }, []);

  const activeServices = useMemo(() => {
    return categories
      .filter(item => item.type === TransactionType.REVENUE)
      .filter(item => item.isActiveService !== false)
      .filter(item => Number.isFinite(item.price as number) && Number(item.price) >= 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const customerMap = useMemo(() => {
    return new Map(customers.map(customer => [customer.id, customer]));
  }, [customers]);

  const vehicleMap = useMemo(() => {
    return new Map(vehicles.map(vehicle => [vehicle.id, vehicle]));
  }, [vehicles]);

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

  const selectableVehicles = useMemo(() => {
    if (!selectedCustomerId) {
      return vehicles;
    }
    return vehicles.filter(vehicle => vehicle.customerId === selectedCustomerId);
  }, [vehicles, selectedCustomerId]);

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

  const drafts = useMemo(() => {
    return checkoutOrders.filter(order => order.status === CheckoutOrderStatus.DRAFT);
  }, [checkoutOrders]);

  const queue = useMemo(() => {
    return checkoutOrders.filter(order => order.status === CheckoutOrderStatus.COMMITTED);
  }, [checkoutOrders]);

  const checkedOut = useMemo(() => {
    return checkoutOrders
      .filter(order => order.status === CheckoutOrderStatus.CHECKED_OUT)
      .sort((a, b) => {
        const aTime = new Date(a.checkedOutAt || a.updatedAt || a.createdAt).getTime();
        const bTime = new Date(b.checkedOutAt || b.updatedAt || b.createdAt).getTime();
        return bTime - aTime;
      })
      .slice(0, 20);
  }, [checkoutOrders]);

  const getPaymentMethodForOrder = (order: CheckoutOrder): PaymentMethod => {
    return order.paymentMethod || paymentMethodByOrderId[order.id] || PaymentMethod.FPS;
  };

  const getPaymentCurrencyForOrder = (order: CheckoutOrder): PaymentCurrency => {
    return order.paymentCurrency || paymentCurrencyByOrderId[order.id] || PaymentCurrency.RMB;
  };

  const queueEditingCouponAmount = Math.max(0, Number(queueEditingCouponAmountInput) || 0);
  const queueEditingMembershipRate = Math.max(0, Math.min(100, Number(queueEditingMembershipRateInput) || 0));
  const queueEditingOrder = queueEditingOrderId ? checkoutOrders.find(order => order.id === queueEditingOrderId) : undefined;
  const queueEditingVehicle = queueEditingOrder?.vehicleId ? vehicleMap.get(queueEditingOrder.vehicleId) : undefined;
  const queueEditingVehicleIsLarge = isLargeVehicle(queueEditingVehicle);
  const queueEditingResolvedDiscount = resolveDiscountByCode(queueEditingDiscountCodeInput, 'discount');
  const queueEditingResolvedSurcharge = resolveDiscountByCode(queueEditingSurchargeCodeInput, 'surcharge');
  const queueEditingGrossAmount = calculateGrossAmount(queueEditingLines);
  const queueEditingLargeVehicleSurchargeAmount = queueEditingVehicleIsLarge
    ? calculateCodeAmount(queueEditingGrossAmount, queueEditingResolvedSurcharge)
    : 0;
  const queueEditingCouponDiscountAmount = calculateCouponDiscountAmount([
    ...queueEditingLines,
    ...(queueEditingCouponAmount > 0
      ? [{
          id: 'queue-coupon-preview',
          saleId: queueEditingOrderId || 'queue-preview',
          name: language === 'zh' ? '優惠券折扣' : 'Coupon Discount',
          quantity: 1,
          unitPrice: queueEditingCouponAmount,
          lineSubtotal: queueEditingCouponAmount,
          estimatedDurationMinutes: 0,
          isDiscount: true,
          createdAt: new Date().toISOString(),
        }]
      : []),
  ]);
  const queueEditingMembershipDiscountAmount = calculateMembershipDiscountAmount(queueEditingGrossAmount, queueEditingMembershipRate);
  const queueEditingCodeDiscountAmount = calculateCodeAmount(queueEditingGrossAmount, queueEditingResolvedDiscount);
  const queueEditingNetAmount = calculateNetAmount(
    queueEditingGrossAmount,
    queueEditingLargeVehicleSurchargeAmount,
    queueEditingMembershipDiscountAmount,
    queueEditingCouponDiscountAmount + queueEditingCodeDiscountAmount
  );
  const queueEditingEstimatedDurationMinutes = calculateEstimatedDurationMinutes(queueEditingLines);

  const couponAmount = Math.max(0, Number(couponAmountInput) || 0);
  const membershipRate = Math.max(0, Math.min(100, Number(membershipRateInput) || 0));
  const couponLineSubtotal = couponAmount > 0 ? couponAmount : 0;
  const resolvedDiscount = resolveDiscountByCode(discountCodeInput, 'discount');
  const resolvedSurcharge = resolveDiscountByCode(surchargeCodeInput, 'surcharge');

  const grossAmount = calculateGrossAmount(selectedLines);
  const selectedVehicle = selectedVehicleId ? vehicleMap.get(selectedVehicleId) : undefined;
  const selectedVehicleIsLarge = isLargeVehicle(selectedVehicle);
  const largeVehicleSurchargeAmount = selectedVehicleIsLarge
    ? calculateCodeAmount(grossAmount, resolvedSurcharge)
    : 0;
  const couponDiscountAmount = calculateCouponDiscountAmount([
    ...selectedLines,
    ...(couponLineSubtotal > 0
      ? [{
          id: 'coupon-preview',
          saleId: 'preview',
          name: language === 'zh' ? '優惠券折扣' : 'Coupon Discount',
          quantity: 1,
          unitPrice: couponLineSubtotal,
          lineSubtotal: couponLineSubtotal,
          estimatedDurationMinutes: 0,
          isDiscount: true,
          createdAt: new Date().toISOString(),
        }]
      : []),
  ]);
  const membershipDiscountAmount = calculateMembershipDiscountAmount(grossAmount, membershipRate);
  const codeDiscountAmount = calculateCodeAmount(grossAmount, resolvedDiscount);
  const netAmount = calculateNetAmount(grossAmount, largeVehicleSurchargeAmount, membershipDiscountAmount, couponDiscountAmount + codeDiscountAmount);
  const estimatedDurationMinutes = calculateEstimatedDurationMinutes(selectedLines);

  useEffect(() => {
    if (!selectedVehicleIsLarge) return;
    if (surchargeCodeInput.trim()) return;
    setSurchargeCodeInput('LARGE_CAR_SURCHARGE');
  }, [selectedVehicleIsLarge, surchargeCodeInput]);

  useEffect(() => {
    if (!selectedCustomerId || !selectedVehicleId) return;
    const vehicle = vehicleMap.get(selectedVehicleId);
    if (!vehicle || vehicle.customerId !== selectedCustomerId) {
      setSelectedVehicleId('');
      return;
    }
    if (vehicle.licensePlate) {
      setLicensePlateInput(vehicle.licensePlate);
    }
  }, [selectedCustomerId, selectedVehicleId, vehicleMap]);

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setMembershipRateInput(String(getMembershipDiscountRateForCustomer(customerId)));
  };

  const handleVehicleChange = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);

    if (!vehicleId) return;

    const vehicle = vehicleMap.get(vehicleId);
    if (!vehicle) return;

    setSelectedCustomerId(vehicle.customerId || '');
    setMembershipRateInput(String(getMembershipDiscountRateForCustomer(vehicle.customerId)));
    if (vehicle.licensePlate) {
      setLicensePlateInput(vehicle.licensePlate);
    }
  };

  const resetForm = () => {
    setLicensePlateInput('');
    setSelectedCustomerId('');
    setSelectedVehicleId('');
    setSelectedLines([]);
    setCouponAmountInput('0');
    setDiscountCodeInput('');
    setMembershipRateInput('0');
    setSurchargeCodeInput('');
    setNotes('');
    setEditingOrderId(null);
  };

  const getCommitValidationMessage = (customerId?: string, vehicleId?: string): string | null => {
    const hasCustomer = Boolean(customerId && customerId.trim());
    const hasVehicle = Boolean(vehicleId && vehicleId.trim());

    if (hasCustomer && hasVehicle) return null;
    if (!hasCustomer && !hasVehicle) {
      return language === 'zh'
        ? '提交前必須同時選擇客戶和車輛。'
        : 'Customer and vehicle are both required before commit.';
    }
    if (!hasCustomer) {
      return language === 'zh'
        ? '提交前必須選擇客戶。'
        : 'Customer is required before commit.';
    }
    return language === 'zh'
      ? '提交前必須選擇車輛。'
      : 'Vehicle is required before commit.';
  };

  const canCommitCurrentForm = !getCommitValidationMessage(selectedCustomerId, selectedVehicleId);

  const addServiceLine = (service: CategoryItem) => {
    const now = new Date().toISOString();
    const price = Number(service.price || 0);
    const duration = Math.max(0, Math.round(Number(service.estimatedDurationMinutes || 0)));
    setSelectedLines(prev => {
      const existingIndex = prev.findIndex(line => !line.isDiscount && line.categoryId === service.id && line.unitPrice === price);
      if (existingIndex >= 0) {
        return prev.map((line, index) => {
          if (index !== existingIndex) return line;
          const nextQuantity = line.quantity + 1;
          return {
            ...line,
            quantity: nextQuantity,
            lineSubtotal: Number((nextQuantity * line.unitPrice).toFixed(2)),
            estimatedDurationMinutes: duration,
            updatedAt: now,
          };
        });
      }

      const line: CheckoutOrderLine = {
        id: crypto.randomUUID(),
        saleId: editingOrderId || 'draft',
        categoryId: service.id,
        name: service.name,
        quantity: 1,
        unitPrice: price,
        lineSubtotal: price,
        estimatedDurationMinutes: duration,
        serviceNameSnapshot: service.name,
        isDiscount: false,
        createdAt: now,
        updatedAt: now,
      };
      return [...prev, line];
    });
  };

  const removeLine = (lineId: string) => {
    setSelectedLines(prev => prev.filter(line => line.id !== lineId));
  };

  const updateLineQuantity = (lineId: string, nextQuantity: number) => {
    setSelectedLines(prev => {
      const safeQuantity = Math.max(1, Math.round(nextQuantity));
      return prev.map(line => {
        if (line.id !== lineId) return line;
        return {
          ...line,
          quantity: safeQuantity,
          lineSubtotal: Number((safeQuantity * line.unitPrice).toFixed(2)),
          updatedAt: new Date().toISOString(),
        };
      });
    });
  };

  const loadOrderForEdit = (order: CheckoutOrder) => {
    const serviceLines = order.lines.filter(line => !line.isDiscount);
    const couponDiscount = order.couponDiscountAmount || 0;
    const membershipRateGuess = order.grossAmount > 0
      ? (order.membershipDiscountAmount / order.grossAmount) * 100
      : 0;

    setEditingOrderId(order.id);
    setSelectedCustomerId(order.customerId || '');
    setSelectedVehicleId(order.vehicleId || '');
    setSelectedLines(serviceLines);
    setCouponAmountInput(String(couponDiscount));
    setDiscountCodeInput(order.discountCode || '');
    setMembershipRateInput(String(Number(membershipRateGuess.toFixed(2))));
    setSurchargeCodeInput(order.surchargeCode || '');
    setNotes(order.notes || '');

    const vehicle = order.vehicleId ? vehicleMap.get(order.vehicleId) : undefined;
    if (vehicle?.licensePlate) {
      setLicensePlateInput(vehicle.licensePlate);
    }
  };

  const buildOrder = (status: CheckoutOrderStatus): CheckoutOrder => {
    const now = new Date().toISOString();
    const id = editingOrderId || crypto.randomUUID();
    const checkInAt = now;
    const committedAt = status === CheckoutOrderStatus.COMMITTED ? now : undefined;
    const checkedOutAt = status === CheckoutOrderStatus.CHECKED_OUT ? now : undefined;
    const couponLine: CheckoutOrderLine[] = couponAmount > 0
      ? [{
          id: crypto.randomUUID(),
          saleId: id,
          name: language === 'zh' ? '優惠券折扣' : 'Coupon Discount',
          quantity: 1,
          unitPrice: couponAmount,
          lineSubtotal: couponAmount,
          estimatedDurationMinutes: 0,
          serviceNameSnapshot: language === 'zh' ? '優惠券折扣' : 'Coupon Discount',
          isDiscount: true,
          createdAt: now,
          updatedAt: now,
        }]
      : [];

    const lines = [
      ...selectedLines.map(line => ({
        ...line,
        saleId: id,
        updatedAt: now,
      })),
      ...couponLine,
    ];

    return {
      id,
      customerId: selectedCustomerId || undefined,
      vehicleId: selectedVehicleId || undefined,
      status,
      occurredAt: checkInAt,
      checkInAt,
      committedAt,
      checkedOutAt,
      grossAmount,
      largeVehicleSurchargeApplied: selectedVehicleIsLarge,
      largeVehicleSurchargeRate: selectedVehicleIsLarge && resolvedSurcharge?.amountType === 'percent' ? Math.max(0, resolvedSurcharge.amount) : 0,
      largeVehicleSurchargeAmount,
      discountCode: resolvedDiscount?.code || undefined,
      surchargeCode: selectedVehicleIsLarge ? (resolvedSurcharge?.code || undefined) : undefined,
      membershipDiscountAmount,
      couponDiscountAmount,
      netAmount,
      estimatedDurationMinutes,
      estimatedFinishAt: calculateEstimatedFinishAt(checkInAt, estimatedDurationMinutes),
      notes: notes.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      lines,
    };
  };

  const saveOrder = async (status: CheckoutOrderStatus) => {
    if (isReadOnly) return;
    if (selectedLines.length === 0) return;

    if (status === CheckoutOrderStatus.COMMITTED) {
      const validationMessage = getCommitValidationMessage(selectedCustomerId, selectedVehicleId);
      if (validationMessage) {
        alert(validationMessage);
        return;
      }
    }

    const order = buildOrder(status);
    const nextOrders = checkoutOrders.some(existing => existing.id === order.id)
      ? checkoutOrders.map(existing => (existing.id === order.id ? order : existing))
      : [order, ...checkoutOrders];

    await onSaveOrders(nextOrders);
    resetForm();
  };

  const moveOrderStatus = async (order: CheckoutOrder, status: CheckoutOrderStatus) => {
    if (isReadOnly) return;

    if (status === CheckoutOrderStatus.COMMITTED) {
      const validationMessage = getCommitValidationMessage(order.customerId, order.vehicleId);
      if (validationMessage) {
        alert(validationMessage);
        return;
      }
    }

    const now = new Date().toISOString();
    const updatedOrder: CheckoutOrder = {
      ...order,
      status,
      committedAt: status === CheckoutOrderStatus.COMMITTED ? now : order.committedAt,
      checkedOutAt: status === CheckoutOrderStatus.CHECKED_OUT ? now : order.checkedOutAt,
      updatedAt: now,
    };
    const nextOrders = checkoutOrders.map(existing => existing.id === order.id ? updatedOrder : existing);
    await onSaveOrders(nextOrders);
  };

  const lookupVehicle = async () => {
    const plate = licensePlateInput.trim();
    if (!plate) return;
    const result = await findCustomerVehicleByLicensePlate(plate);
    if (!result.data) return;
    const customerId = result.data.customer.id;
    setSelectedCustomerId(customerId);
    setSelectedVehicleId(result.data.vehicle.id);
    setMembershipRateInput(String(getMembershipDiscountRateForCustomer(customerId)));
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

  const exportCheckedOutSummaryCsv = () => {
    if (checkedOut.length === 0) return;
    const headers = [
      'order_id',
      'status',
      'customer',
      'license_plate',
      'check_in_at',
      'checked_out_at',
      'payment_status',
      'payment_method',
      'payment_currency',
      'paid_amount',
      'paid_at',
      'gross_amount',
      'discount_code',
      'surcharge_code',
      'code_discount_amount',
      'large_vehicle_surcharge_applied',
      'large_vehicle_surcharge_amount',
      'membership_discount_amount',
      'coupon_discount_amount',
      'net_amount',
      'notes',
    ];

    const rows = checkedOut.map(order => {
      const customer = customerMap.get(order.customerId || '');
      const vehicle = vehicleMap.get(order.vehicleId || '');
      const codeDiscountAmount = calculateCodeAmount(order.grossAmount, resolveDiscountByCode(order.discountCode || '', 'discount'));
      return [
        order.id,
        order.status,
        customer?.name || '',
        vehicle?.licensePlate || '',
        order.checkInAt || '',
        order.checkedOutAt || '',
        order.paymentStatus || 'pending',
        order.paymentMethod || '',
        order.paymentCurrency || PaymentCurrency.RMB,
        order.paidAmount || 0,
        order.paidAt || '',
        order.grossAmount,
        order.discountCode || '',
        order.surchargeCode || '',
        codeDiscountAmount,
        order.largeVehicleSurchargeApplied === true ? 'yes' : 'no',
        order.largeVehicleSurchargeAmount || 0,
        order.membershipDiscountAmount,
        order.couponDiscountAmount,
        order.netAmount,
        order.notes || '',
      ];
    });

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(value => csvEscape(value)).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `checked_out_receipts_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReceiptWithTemplate = (order: CheckoutOrder, mode: 'a4' | 'thermal') => {
    const customer = customerMap.get(order.customerId || '');
    const vehicle = vehicleMap.get(order.vehicleId || '');
    const orderCodeDiscount = calculateCodeAmount(order.grossAmount, resolveDiscountByCode(order.discountCode || '', 'discount'));
    const templateUrl = mode === 'a4'
      ? new URL('invoice_template.png', document.baseURI).toString()
      : new URL('invoice.png', document.baseURI).toString();
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
        const textAlign = align;
        const transform = align === 'center' ? 'translate(-50%, -50%)' : 'translate(0, -50%)';
        const left = align === 'center' ? `${toXPercent(x)}%` : `${toXPercent(x - (widthUnits / 2))}%`;
        return `<div class="invoice-field" style="left:${left};top:${toYPercent(y)}%;width:${toXPercent(widthUnits)}%;font-size:${fontSize}pt;text-align:${textAlign};transform:${transform};">${htmlEscape(value)}</div>`;
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
        fieldFromCsv('Invoice number', order.id.slice(0, 8), 22, { x: 40, y: 40, fontSize: 10, alignment: 'center' }),
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
      const lineRows = (printableRows.length > 0 ? printableRows : [{ name: '-', quantity: 0, unitPrice: 0, lineSubtotal: 0 } as CheckoutOrderLine])
        .map((line, index) => {
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

      return `
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${htmlEscape(language === 'zh' ? '收據列印' : 'Receipt Print')}</title>
          <style>
            * { box-sizing: border-box; }
            @page { size: A4 landscape; margin: 0; }
            body { margin: 0; font-family: Arial, sans-serif; color: #111; background: #fff; }
            .sheet { width: 297mm; height: 210mm; margin: 0 auto; }
            .invoice-shell { position: relative; width: 297mm; height: 210mm; overflow: hidden; }
            .invoice-template { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
            .invoice-content { position: absolute; inset: 0; z-index: 1; }
            .invoice-field {
              position: absolute;
              line-height: 1.2;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="invoice-shell">
              <img class="invoice-template" src="${htmlEscape(templateUrl)}" alt="invoice template" />
              <div class="invoice-content">${metadataFields}${lineRows}${totalsAndNotes}</div>
            </div>
          </div>
          <script>
            const runPrintWhenReady = () => {
              const images = Array.from(document.images || []);
              if (images.length === 0) {
                window.print();
                return;
              }

              let pending = images.filter(img => !img.complete).length;
              if (pending === 0) {
                window.print();
                return;
              }

              const done = () => {
                pending -= 1;
                if (pending <= 0) {
                  window.print();
                }
              };

              images.forEach(img => {
                if (img.complete) return;
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              });

              setTimeout(() => {
                window.print();
              }, 1800);
            };

            window.addEventListener('load', () => {
              setTimeout(() => {
                runPrintWhenReady();
              }, 180);
            });
          </script>
        </body>
      </html>
    `;
    };

    const buildThermalHtml = () => {
      const rowsHtml = serviceLines.length > 0
        ? serviceLines.map(line => {
            return `
              <tr>
                <td>${htmlEscape(line.name)}</td>
                <td>${htmlEscape(formatCurrency(line.unitPrice))}</td>
                <td>${htmlEscape(line.quantity)}</td>
                <td>${htmlEscape(formatCurrency(line.lineSubtotal))}</td>
              </tr>
            `;
          }).join('')
        : `
            <tr>
              <td colspan="4" style="text-align:center;">${htmlEscape(language === 'zh' ? '無服務項目' : 'No service items')}</td>
            </tr>
          `;

      return `
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${htmlEscape(language === 'zh' ? '收據列印' : 'Receipt Print')}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111; background: #fff; }
            .sheet { margin: 0 auto; width: 74mm; }
            .invoice-shell {
              position: relative;
              width: 74mm;
              min-height: 120mm;
              padding: 74px 28px 20px;
              border: 1px solid #e5e7eb;
              overflow: hidden;
            }
            .invoice-template {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              object-fit: cover;
              z-index: 0;
            }
            .invoice-content {
              position: relative;
              z-index: 1;
            }
            .hero { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 12px; margin-bottom: 12px; }
            .hero p { margin: 0 0 4px; }
            .meta { font-size: 11px; margin-bottom: 8px; }
            .table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            .table th, .table td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 11px; text-align: left; }
            .table th { background: #f8fafc; }
            .totals { margin-top: 10px; display: grid; gap: 3px; justify-items: end; }
            .totals p { margin: 0; font-size: 11px; }
            .notes { margin-top: 10px; border-top: 1px solid #d1d5db; padding-top: 6px; font-size: 10px; white-space: pre-wrap; }
            .print-actions { display: none; }
            @page { size: 80mm auto; margin: 3mm; }
            body { margin: 0; }
            .invoice-shell { background-size: contain; }
            .hero { font-size: 7px; }
            .meta { font-size: 6px; }
            .table th, .table td { font-size: 6px; padding: 2px 3px; }
            .totals p { font-size: 6px; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="invoice-shell">
              <img class="invoice-template" src="${htmlEscape(templateUrl)}" alt="invoice template" />
              <div class="invoice-content">
              <div class="hero">
                <div>
                  <p><strong>${htmlEscape(language === 'zh' ? 'Invoice #' : 'Invoice #')}:</strong> ${htmlEscape(order.id.slice(0, 8))}</p>
                  <p><strong>${htmlEscape(language === 'zh' ? '車牌' : 'License Plate')}:</strong> ${htmlEscape(vehicle?.licensePlate || '-')}</p>
                </div>
                <div>
                  <p><strong>${htmlEscape(language === 'zh' ? '客戶' : 'Client')}:</strong> ${htmlEscape(customer?.name || '-')}</p>
                  <p><strong>${htmlEscape(language === 'zh' ? '幣別' : 'Currency')}:</strong> ${htmlEscape(order.paymentCurrency || 'RMB')}</p>
                </div>
                <div>
                  <p><strong>${htmlEscape(language === 'zh' ? 'Check-In' : 'Drop Off')}:</strong> ${htmlEscape(createdAtText)}</p>
                  <p><strong>${htmlEscape(language === 'zh' ? '完成結帳' : 'Checked Out')}:</strong> ${htmlEscape(checkedOutText)}</p>
                </div>
              </div>

              <table class="table">
                <thead>
                  <tr>
                    <th>${htmlEscape(language === 'zh' ? '項目' : 'Description')}</th>
                    <th>${htmlEscape(language === 'zh' ? '單價' : 'Rate')}</th>
                    <th>${htmlEscape(language === 'zh' ? '數量' : 'Qty.')}</th>
                    <th>${htmlEscape(language === 'zh' ? '金額' : 'Amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>

              <div class="totals">
                <p><strong>${htmlEscape(language === 'zh' ? '毛額' : 'Gross')}:</strong> ${htmlEscape(formatCurrency(order.grossAmount))}</p>
                <p><strong>${htmlEscape(language === 'zh' ? '大型車加收' : 'Large Vehicle Surcharge')}:</strong> +${htmlEscape(formatCurrency(order.largeVehicleSurchargeAmount || 0))}</p>
                <p><strong>${htmlEscape(language === 'zh' ? '會員折扣' : 'Membership Discount')}:</strong> -${htmlEscape(formatCurrency(order.membershipDiscountAmount))}</p>
                <p><strong>${htmlEscape(language === 'zh' ? '優惠券折扣' : 'Coupon Discount')}:</strong> -${htmlEscape(formatCurrency(order.couponDiscountAmount))}</p>
                <p><strong>${htmlEscape(language === 'zh' ? '代碼折扣' : 'Code Discount')}:</strong> -${htmlEscape(formatCurrency(orderCodeDiscount))}</p>
                <p><strong>${htmlEscape(language === 'zh' ? '淨額' : 'Net')}:</strong> ${htmlEscape(formatCurrency(order.netAmount))}</p>
              </div>

              <div class="notes">
                <strong>${htmlEscape(language === 'zh' ? '備註' : 'Notes')}:</strong> ${htmlEscape(order.notes || '-')}
              </div>
              </div>
            </div>
          </div>
          <script>
            const runPrintWhenReady = () => {
              const images = Array.from(document.images || []);
              if (images.length === 0) {
                window.print();
                return;
              }

              let pending = images.filter(img => !img.complete).length;
              if (pending === 0) {
                window.print();
                return;
              }

              const done = () => {
                pending -= 1;
                if (pending <= 0) {
                  window.print();
                }
              };

              images.forEach(img => {
                if (img.complete) return;
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              });

              setTimeout(() => {
                window.print();
              }, 1800);
            };

            window.addEventListener('load', () => {
              setTimeout(() => {
                runPrintWhenReady();
              }, 180);
            });
          </script>
        </body>
      </html>
    `;
    };

    const html = mode === 'a4' ? buildA4Html() : buildThermalHtml();

    const printBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const printUrl = URL.createObjectURL(printBlob);
    const printWindow = window.open(printUrl, '_blank', 'noopener,noreferrer,width=960,height=1280');
    if (!printWindow) {
      URL.revokeObjectURL(printUrl);
      return;
    }

    // Release the temporary document URL after the print flow finishes.
    const cleanup = () => URL.revokeObjectURL(printUrl);
    setTimeout(cleanup, 60000);
  };

  const startQueueInlineEdit = (order: CheckoutOrder) => {
    const serviceLines = order.lines
      .filter(line => !line.isDiscount)
      .map(line => ({ ...line }));
    const membershipRateGuess = order.grossAmount > 0
      ? (order.membershipDiscountAmount / order.grossAmount) * 100
      : 0;

    setQueueEditingOrderId(order.id);
    setQueueEditingLines(serviceLines);
    setQueueEditingCouponAmountInput(String(order.couponDiscountAmount || 0));
    setQueueEditingDiscountCodeInput(order.discountCode || '');
    setQueueEditingMembershipRateInput(String(Number(membershipRateGuess.toFixed(2))));
    setQueueEditingSurchargeCodeInput(order.surchargeCode || '');
    setQueueEditingNotes(order.notes || '');
  };

  const cancelQueueInlineEdit = () => {
    setQueueEditingOrderId(null);
    setQueueEditingLines([]);
    setQueueEditingCouponAmountInput('0');
    setQueueEditingDiscountCodeInput('');
    setQueueEditingMembershipRateInput('0');
    setQueueEditingSurchargeCodeInput('');
    setQueueEditingNotes('');
  };

  const updateQueueLineQuantity = (lineId: string, nextQuantity: number) => {
    setQueueEditingLines(prev => {
      const safeQuantity = Math.max(1, Math.round(nextQuantity));
      return prev.map(line => {
        if (line.id !== lineId) return line;
        return {
          ...line,
          quantity: safeQuantity,
          lineSubtotal: Number((safeQuantity * line.unitPrice).toFixed(2)),
          updatedAt: new Date().toISOString(),
        };
      });
    });
  };

  const removeQueueLine = (lineId: string) => {
    setQueueEditingLines(prev => prev.filter(line => line.id !== lineId));
  };

  const saveQueueInlineEdit = async () => {
    if (isReadOnly) return;
    if (!queueEditingOrderId) return;

    const sourceOrder = checkoutOrders.find(order => order.id === queueEditingOrderId);
    if (!sourceOrder) {
      cancelQueueInlineEdit();
      return;
    }

    const now = new Date().toISOString();
    const couponLine: CheckoutOrderLine[] = queueEditingCouponAmount > 0
      ? [{
          id: crypto.randomUUID(),
          saleId: sourceOrder.id,
          name: language === 'zh' ? '優惠券折扣' : 'Coupon Discount',
          quantity: 1,
          unitPrice: queueEditingCouponAmount,
          lineSubtotal: queueEditingCouponAmount,
          estimatedDurationMinutes: 0,
          serviceNameSnapshot: language === 'zh' ? '優惠券折扣' : 'Coupon Discount',
          isDiscount: true,
          createdAt: now,
          updatedAt: now,
        }]
      : [];

    const nextLines: CheckoutOrderLine[] = [
      ...queueEditingLines.map(line => ({
        ...line,
        saleId: sourceOrder.id,
        updatedAt: now,
      })),
      ...couponLine,
    ];

    const queueEditingResolvedDiscount = resolveDiscountByCode(queueEditingDiscountCodeInput, 'discount');
    const queueEditingResolvedSurcharge = resolveDiscountByCode(queueEditingSurchargeCodeInput, 'surcharge');

    const updatedOrder: CheckoutOrder = {
      ...sourceOrder,
      lines: nextLines,
      grossAmount: queueEditingGrossAmount,
      largeVehicleSurchargeApplied: queueEditingVehicleIsLarge,
      largeVehicleSurchargeRate: queueEditingVehicleIsLarge && queueEditingResolvedSurcharge?.amountType === 'percent' ? Math.max(0, queueEditingResolvedSurcharge.amount) : 0,
      largeVehicleSurchargeAmount: queueEditingLargeVehicleSurchargeAmount,
      discountCode: queueEditingResolvedDiscount?.code || undefined,
      surchargeCode: queueEditingVehicleIsLarge ? (queueEditingResolvedSurcharge?.code || undefined) : undefined,
      membershipDiscountAmount: queueEditingMembershipDiscountAmount,
      couponDiscountAmount: queueEditingCouponDiscountAmount,
      netAmount: queueEditingNetAmount,
      estimatedDurationMinutes: queueEditingEstimatedDurationMinutes,
      estimatedFinishAt: calculateEstimatedFinishAt(
        sourceOrder.checkInAt || sourceOrder.occurredAt || now,
        queueEditingEstimatedDurationMinutes
      ),
      notes: queueEditingNotes.trim() || undefined,
      updatedAt: now,
    };

    const nextOrders = checkoutOrders.map(order =>
      order.id === sourceOrder.id ? updatedOrder : order
    );
    await onSaveOrders(nextOrders);
    cancelQueueInlineEdit();
  };

  const handlePaymentMethodChange = (order: CheckoutOrder, nextMethod: PaymentMethod) => {
    const forcedCurrency = getForcedCurrencyForMethod(nextMethod);
    setPaymentMethodByOrderId(prev => ({ ...prev, [order.id]: nextMethod }));
    if (forcedCurrency) {
      setPaymentCurrencyByOrderId(prev => ({ ...prev, [order.id]: forcedCurrency }));
    }
    setPaymentErrorByOrderId(prev => ({ ...prev, [order.id]: '' }));
  };

  const handleMarkPaid = async (order: CheckoutOrder) => {
    if (isReadOnly) return;

    const method = getPaymentMethodForOrder(order);
    const currency = getPaymentCurrencyForOrder(order);
    const forcedCurrency = getForcedCurrencyForMethod(method);

    if (forcedCurrency && forcedCurrency !== currency) {
      setPaymentErrorByOrderId(prev => ({
        ...prev,
        [order.id]: language === 'zh'
          ? `現金支付幣別必須為 ${forcedCurrency}`
          : `Cash method requires currency ${forcedCurrency}`,
      }));
      return;
    }

    setPaymentErrorByOrderId(prev => ({ ...prev, [order.id]: '' }));
    await onMarkOrderPaid(order.id, method, currency);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {language === 'zh' ? 'Check-In 與草稿訂單' : 'Check-In and Draft Builder'}
          </h2>
          {editingOrderId && (
            <button
              onClick={resetForm}
              className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 dark:text-slate-300"
            >
              {language === 'zh' ? '取消編輯' : 'Cancel Edit'}
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '車牌' : 'License Plate'}</label>
            <div className="mt-1 flex gap-2">
              <input
                value={licensePlateInput}
                onChange={event => setLicensePlateInput(event.target.value.toUpperCase())}
                className="flex-1 rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
                placeholder={language === 'zh' ? '例如 AB1234' : 'e.g. AB1234'}
              />
              <button
                onClick={lookupVehicle}
                disabled={isReadOnly}
                className="px-3 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {language === 'zh' ? '查找' : 'Lookup'}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '客戶' : 'Customer'}</label>
            <select
              value={selectedCustomerId}
              onChange={event => handleCustomerChange(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
            >
              <option value="">{language === 'zh' ? '未選擇' : 'Unassigned'}</option>
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '車輛' : 'Vehicle'}</label>
            <select
              value={selectedVehicleId}
              onChange={event => handleVehicleChange(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
            >
              <option value="">{language === 'zh' ? '未選擇' : 'Unassigned'}</option>
              {selectableVehicles.map(vehicle => (
                <option key={vehicle.id} value={vehicle.id}>
                  {(vehicle.licensePlate || vehicle.id)}
                  {vehicle.vehicleSize === VehicleSize.LARGE ? ' (Large)' : vehicle.vehicleSize === VehicleSize.REGULAR ? ' (Regular)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{language === 'zh' ? '服務項目' : 'Service Items'}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeServices.map(service => (
              <button
                key={service.id}
                onClick={() => addServiceLine(service)}
                disabled={isReadOnly}
                className="rounded-xl border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-3 text-left disabled:opacity-50"
              >
                <p className="font-black text-sm text-slate-900 dark:text-white">{service.name}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">{formatCurrency(Number(service.price || 0))}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {selectedLines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/20 px-3 py-3 text-xs font-bold text-slate-400">
              {language === 'zh' ? '尚未加入服務項目' : 'No services selected'}
            </div>
          ) : (
            selectedLines.map(line => (
              <div key={line.id} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2 gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{line.name}</p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">{formatCurrency(line.lineSubtotal)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateLineQuantity(line.id, line.quantity - 1)}
                    disabled={isReadOnly || line.quantity <= 1}
                    className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                  >
                    <i className="fas fa-minus text-[10px]"></i>
                  </button>
                  <span className="min-w-6 text-center text-xs font-black text-slate-700 dark:text-slate-200">{line.quantity}</span>
                  <button
                    onClick={() => updateLineQuantity(line.id, line.quantity + 1)}
                    disabled={isReadOnly}
                    className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                  >
                    <i className="fas fa-plus text-[10px]"></i>
                  </button>
                  <button
                    onClick={() => removeLine(line.id)}
                    disabled={isReadOnly}
                    className="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 disabled:opacity-50"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="grid md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '優惠券折扣金額' : 'Coupon Discount Amount'}</label>
            <input
              type="number"
              min="0"
              value={couponAmountInput}
              onChange={event => setCouponAmountInput(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '折扣代碼' : 'Discount Code'}</label>
            <input
              value={discountCodeInput}
              onChange={event => setDiscountCodeInput(event.target.value.toUpperCase())}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
              placeholder={language === 'zh' ? '例: WELCOME10' : 'e.g. WELCOME10'}
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '會員折扣率 (%)' : 'Membership Discount Rate (%)'}</label>
            <input
              type="number"
              min="0"
              max="100"
              value={membershipRateInput}
              onChange={event => setMembershipRateInput(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '大型車加收代碼' : 'Large Car Surcharge Code'}</label>
            <input
              value={surchargeCodeInput}
              onChange={event => setSurchargeCodeInput(event.target.value.toUpperCase())}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
              placeholder={language === 'zh' ? '例: LARGE_CAR_SURCHARGE' : 'e.g. LARGE_CAR_SURCHARGE'}
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '備註' : 'Notes'}</label>
            <input
              value={notes}
              onChange={event => setNotes(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 bg-slate-50 dark:bg-white/5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
            {selectedVehicleIsLarge
              ? (language === 'zh' ? '大型車：會依加收代碼套用 surcharge。' : 'Large vehicle: surcharge code will be applied.')
              : (language === 'zh' ? '非大型車：不會套用大型車加收。' : 'Non-large vehicle: no large-car surcharge applied.')}
          </p>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">
            {language === 'zh' ? '折扣代碼結果:' : 'Discount code result:'} {resolvedDiscount ? `${resolvedDiscount.name} (${resolvedDiscount.amountType === 'percent' ? `${resolvedDiscount.amount}%` : formatCurrency(resolvedDiscount.amount)})` : (language === 'zh' ? '未匹配' : 'No match')}
          </p>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">
            {language === 'zh' ? '加收代碼結果:' : 'Surcharge code result:'} {resolvedSurcharge ? `${resolvedSurcharge.name} (${resolvedSurcharge.amountType === 'percent' ? `${resolvedSurcharge.amount}%` : formatCurrency(resolvedSurcharge.amount)})` : (language === 'zh' ? '未匹配' : 'No match')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 bg-slate-50 dark:bg-white/5 grid md:grid-cols-6 gap-2 text-sm font-bold">
          <p>{language === 'zh' ? '毛額' : 'Gross'}: {formatCurrency(grossAmount)}</p>
          <p>{language === 'zh' ? '大型車加收' : 'Large Surcharge'}: +{formatCurrency(largeVehicleSurchargeAmount)}</p>
          <p>{language === 'zh' ? '會員折扣' : 'Membership'}: -{formatCurrency(membershipDiscountAmount)}</p>
          <p>{language === 'zh' ? '優惠券' : 'Coupon'}: -{formatCurrency(couponDiscountAmount)}</p>
          <p>{language === 'zh' ? '代碼折扣' : 'Code Discount'}: -{formatCurrency(codeDiscountAmount)}</p>
          <p className="text-blue-600 dark:text-blue-400">{language === 'zh' ? '應收' : 'Net'}: {formatCurrency(netAmount)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => saveOrder(CheckoutOrderStatus.DRAFT)}
            disabled={isReadOnly || selectedLines.length === 0}
            className="px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
          >
            {language === 'zh' ? '儲存草稿' : 'Save Draft'}
          </button>
          <button
            onClick={() => saveOrder(CheckoutOrderStatus.COMMITTED)}
            disabled={isReadOnly || selectedLines.length === 0 || !canCommitCurrentForm}
            className="px-4 py-3 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
          >
            {language === 'zh' ? '提交入列' : 'Commit to Queue'}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5">
          <h3 className="text-lg font-black text-slate-900 dark:text-white mb-3">{language === 'zh' ? '草稿訂單' : 'Draft Orders'}</h3>
          <div className="space-y-2">
            {drafts.length === 0 && (
              <p className="text-xs font-semibold text-slate-400">{language === 'zh' ? '暫無草稿' : 'No drafts yet'}</p>
            )}
            {drafts.map(order => (
              <div key={order.id} className="rounded-xl border border-slate-200 dark:border-white/10 p-3">
                <p className="text-sm font-black text-slate-900 dark:text-white">{customerMap.get(order.customerId || '')?.name || (language === 'zh' ? '未指定客戶' : 'No customer')}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">{formatCurrency(order.netAmount)} • {order.lines.filter(line => !line.isDiscount).length} {language === 'zh' ? '項' : 'items'}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => loadOrderForEdit(order)} className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-black uppercase tracking-widest">
                    {language === 'zh' ? '編輯' : 'Edit'}
                  </button>
                  <button onClick={() => moveOrderStatus(order, CheckoutOrderStatus.COMMITTED)} disabled={isReadOnly || Boolean(getCommitValidationMessage(order.customerId, order.vehicleId))} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50">
                    {language === 'zh' ? '提交' : 'Commit'}
                  </button>
                  <button onClick={() => onDeleteOrder(order.id)} disabled={isReadOnly} className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 text-xs font-black uppercase tracking-widest disabled:opacity-50">
                    {language === 'zh' ? '刪除' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5">
          <h3 className="text-lg font-black text-slate-900 dark:text-white mb-3">{language === 'zh' ? '待結帳隊列' : 'Checkout Queue'}</h3>
          <div className="space-y-2">
            {queue.length === 0 && (
              <p className="text-xs font-semibold text-slate-400">{language === 'zh' ? '暫無待結帳訂單' : 'No committed orders'}</p>
            )}
            {queue.map(order => {
              const customer = customerMap.get(order.customerId || '');
              const vehicle = vehicleMap.get(order.vehicleId || '');
              return (
                <div key={order.id} className="rounded-xl border border-slate-200 dark:border-white/10 p-3">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{customer?.name || (language === 'zh' ? '未指定客戶' : 'No customer')}</p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">{vehicle?.licensePlate || '-'} • {formatCurrency(order.netAmount)}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => startQueueInlineEdit(order)}
                      disabled={isReadOnly}
                      className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      {language === 'zh' ? 'Inline 編輯' : 'Inline Edit'}
                    </button>
                    <button
                      onClick={() => moveOrderStatus(order, CheckoutOrderStatus.CHECKED_OUT)}
                      disabled={isReadOnly}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      {language === 'zh' ? '完成結帳' : 'Check Out'}
                    </button>
                    <button
                      onClick={() => onDeleteOrder(order.id)}
                      disabled={isReadOnly}
                      className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 text-xs font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      {language === 'zh' ? '刪除' : 'Delete'}
                    </button>
                  </div>

                  {queueEditingOrderId === order.id && (
                    <div className="mt-3 rounded-xl border border-slate-200 dark:border-white/10 p-3 bg-slate-50 dark:bg-white/5 space-y-3">
                      <div className="space-y-2">
                        {queueEditingLines.length === 0 ? (
                          <p className="text-xs font-semibold text-slate-400">{language === 'zh' ? '無可編輯服務項目' : 'No service lines to edit'}</p>
                        ) : (
                          queueEditingLines.map(line => (
                            <div key={line.id} className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-slate-900 px-2 py-2">
                              <div>
                                <p className="text-xs font-black text-slate-900 dark:text-white">{line.name}</p>
                                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">{formatCurrency(line.lineSubtotal)}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => updateQueueLineQuantity(line.id, line.quantity - 1)}
                                  disabled={isReadOnly || line.quantity <= 1}
                                  className="w-7 h-7 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                                >
                                  <i className="fas fa-minus text-[10px]"></i>
                                </button>
                                <span className="min-w-5 text-center text-xs font-black text-slate-700 dark:text-slate-200">{line.quantity}</span>
                                <button
                                  onClick={() => updateQueueLineQuantity(line.id, line.quantity + 1)}
                                  disabled={isReadOnly}
                                  className="w-7 h-7 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                                >
                                  <i className="fas fa-plus text-[10px]"></i>
                                </button>
                                <button
                                  onClick={() => removeQueueLine(line.id)}
                                  disabled={isReadOnly}
                                  className="w-7 h-7 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 disabled:opacity-50"
                                >
                                  <i className="fas fa-times text-[10px]"></i>
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="grid md:grid-cols-5 gap-2">
                        <input
                          type="number"
                          min="0"
                          value={queueEditingCouponAmountInput}
                          onChange={event => setQueueEditingCouponAmountInput(event.target.value)}
                          className="rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-2 text-xs font-bold text-slate-900 dark:text-white"
                          placeholder={language === 'zh' ? '優惠券折扣' : 'Coupon discount'}
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={queueEditingMembershipRateInput}
                          onChange={event => setQueueEditingMembershipRateInput(event.target.value)}
                          className="rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-2 text-xs font-bold text-slate-900 dark:text-white"
                          placeholder={language === 'zh' ? '會員折扣率' : 'Membership rate'}
                        />
                        <input
                          value={queueEditingDiscountCodeInput}
                          onChange={event => setQueueEditingDiscountCodeInput(event.target.value.toUpperCase())}
                          className="rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-2 text-xs font-bold text-slate-900 dark:text-white"
                          placeholder={language === 'zh' ? '折扣代碼' : 'Discount code'}
                        />
                        <input
                          value={queueEditingSurchargeCodeInput}
                          onChange={event => setQueueEditingSurchargeCodeInput(event.target.value.toUpperCase())}
                          className="rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-2 text-xs font-bold text-slate-900 dark:text-white"
                          placeholder={language === 'zh' ? '大型車加收代碼' : 'Large surcharge code'}
                        />
                        <input
                          value={queueEditingNotes}
                          onChange={event => setQueueEditingNotes(event.target.value)}
                          className="rounded-lg border border-slate-300 dark:border-white/10 bg-transparent px-2 py-2 text-xs font-bold text-slate-900 dark:text-white"
                          placeholder={language === 'zh' ? '備註' : 'Notes'}
                        />
                      </div>

                      <div className="rounded-lg border border-slate-200 dark:border-white/10 px-2 py-2 bg-white dark:bg-slate-900">
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                          {queueEditingVehicleIsLarge
                            ? (language === 'zh' ? '大型車：會依加收代碼套用 surcharge。' : 'Large vehicle: surcharge code will be applied.')
                            : (language === 'zh' ? '非大型車：不會套用大型車加收。' : 'Non-large vehicle: no large-car surcharge applied.')}
                        </p>
                      </div>

                      <div className="text-xs font-black text-slate-600 dark:text-slate-300 grid md:grid-cols-6 gap-2">
                        <p>{language === 'zh' ? '毛額' : 'Gross'}: {formatCurrency(queueEditingGrossAmount)}</p>
                        <p>{language === 'zh' ? '大型車加收' : 'Large Surcharge'}: +{formatCurrency(queueEditingLargeVehicleSurchargeAmount)}</p>
                        <p>{language === 'zh' ? '會員折扣' : 'Membership'}: -{formatCurrency(queueEditingMembershipDiscountAmount)}</p>
                        <p>{language === 'zh' ? '優惠券' : 'Coupon'}: -{formatCurrency(queueEditingCouponDiscountAmount)}</p>
                        <p>{language === 'zh' ? '代碼折扣' : 'Code Discount'}: -{formatCurrency(queueEditingCodeDiscountAmount)}</p>
                        <p className="text-blue-600 dark:text-blue-400">{language === 'zh' ? '淨額' : 'Net'}: {formatCurrency(queueEditingNetAmount)}</p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={saveQueueInlineEdit}
                          disabled={isReadOnly}
                          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          {language === 'zh' ? '保存變更' : 'Save Changes'}
                        </button>
                        <button
                          onClick={cancelQueueInlineEdit}
                          className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10 text-xs font-black uppercase tracking-widest"
                        >
                          {language === 'zh' ? '取消' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-black text-slate-900 dark:text-white">{language === 'zh' ? '已完成結帳' : 'Checked-Out History'}</h3>
          <button
            onClick={exportCheckedOutSummaryCsv}
            disabled={checkedOut.length === 0}
            className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-black uppercase tracking-widest disabled:opacity-50"
          >
            {language === 'zh' ? '匯出 CSV' : 'Export CSV'}
          </button>
        </div>
        <div className="space-y-2">
          {checkedOut.length === 0 && (
            <p className="text-xs font-semibold text-slate-400">{language === 'zh' ? '尚無已完成訂單' : 'No checked-out orders yet'}</p>
          )}
          {checkedOut.map(order => {
            const customer = customerMap.get(order.customerId || '');
            const vehicle = vehicleMap.get(order.vehicleId || '');
            const isPaid = (order.paymentStatus || 'pending') === 'paid';
            const selectedMethod = getPaymentMethodForOrder(order);
            const selectedCurrency = getPaymentCurrencyForOrder(order);
            const forcedCurrency = getForcedCurrencyForMethod(selectedMethod);
            const errorMessage = paymentErrorByOrderId[order.id] || '';
            return (
              <div key={order.id} className="rounded-xl border border-slate-200 dark:border-white/10 p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{customer?.name || (language === 'zh' ? '未指定客戶' : 'No customer')}</p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">{vehicle?.licensePlate || '-'} • {formatCurrency(order.netAmount)}</p>
                  <p className="text-[11px] font-semibold text-slate-400 mt-1">{language === 'zh' ? '完成時間' : 'Checked Out At'}: {formatDateTime(order.checkedOutAt)}</p>
                  <p className="text-[11px] font-semibold text-slate-400 mt-1">
                    {language === 'zh' ? '支付狀態' : 'Payment'}: {isPaid ? (language === 'zh' ? '已支付' : 'Paid') : (language === 'zh' ? '待支付' : 'Pending')}
                    {order.paymentMethod ? ` • ${order.paymentMethod}` : ''}
                    {order.paymentCurrency ? ` • ${order.paymentCurrency}` : ''}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {!isPaid && (
                    <>
                      <select
                        value={selectedMethod}
                        onChange={event => handlePaymentMethodChange(order, event.target.value as PaymentMethod)}
                        disabled={isReadOnly}
                        className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-black"
                      >
                        {PAYMENT_METHOD_OPTIONS.map(method => (
                          <option key={method} value={method}>{method}</option>
                        ))}
                      </select>
                      <select
                        value={forcedCurrency || selectedCurrency}
                        onChange={event => setPaymentCurrencyByOrderId(prev => ({ ...prev, [order.id]: event.target.value as PaymentCurrency }))}
                        disabled={isReadOnly || Boolean(forcedCurrency)}
                        className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-black"
                      >
                        {PAYMENT_CURRENCY_OPTIONS.map(currency => (
                          <option key={currency} value={currency}>{currency}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleMarkPaid(order)}
                        disabled={isReadOnly}
                        className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        {language === 'zh' ? '確認收款並入賬' : 'Mark Paid & Post'}
                      </button>
                      {errorMessage && (
                        <p className="text-[11px] font-bold text-rose-600">{errorMessage}</p>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => printReceiptWithTemplate(order, 'a4')}
                    className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-widest"
                  >
                    {language === 'zh' ? '列印 A4' : 'Print A4'}
                  </button>
                  <button
                    onClick={() => printReceiptWithTemplate(order, 'thermal')}
                    className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-widest"
                  >
                    {language === 'zh' ? '列印 熱敏' : 'Print Thermal'}
                  </button>
                  <button
                    onClick={() => downloadReceiptSummary(order)}
                    className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-widest"
                  >
                    {language === 'zh' ? '下載摘要' : 'Download'}
                  </button>
                  <button
                    onClick={() => onDeleteOrder(order.id)}
                    disabled={isReadOnly}
                    className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 text-xs font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {language === 'zh' ? '刪除' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default CheckoutPage;
