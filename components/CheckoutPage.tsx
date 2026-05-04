import React, { useEffect, useMemo, useState } from 'react';
import CustomerPromptSelect, { type CustomerStats } from './CustomerPromptSelect';
import LicensePlateField from './LicensePlateField';
import {
  CategoryItem,
  CheckoutOrder,
  CheckoutOrderLine,
  CheckoutOrderStatus,
  Customer,
  CustomerMembership,
  DiscountItem,
  MembershipBenefitType,
  MembershipBenefitServiceRule,
  TransactionType,
  Vehicle,
  VehicleSize,
} from '../types';
import {
  fetchMembershipBenefitServiceRules,
  findCustomerVehicleByLicensePlate,
  getMembershipBenefitRemaining,
  redeemMembershipBenefit,
} from '../services/database';
import {
  calculateEstimatedDurationMinutes,
  calculateEstimatedFinishAt,
  calculateGrossAmount,
  calculateMembershipDiscountAmount,
  calculateNetAmount,
} from '../utils/orderPricing';
import { normalizeLicensePlate } from '../utils/licensePlate';

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
  onDeleteOrder: (orderId: string) => Promise<void>;
  initialDraftOrderId?: string | null;
  onInitialDraftOrderHandled?: () => void;
  isReadOnly?: boolean;
  onNavigateToVehicles?: (licensePlate?: string, draftOrderId?: string | null) => void;
  onNavigateToCustomers?: () => void;
  onNavigateToAddCustomer?: (licensePlate?: string) => void;
  onNavigateToServiceLifeCycle?: () => void;
  prefillCustomerId?: string;
  prefillLicensePlate?: string;
  onPrefillConsumed?: () => void;
}

const formatCurrency = (value: number): string => `¥${value.toFixed(2)}`;

const formatDateTime = (value?: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
};

const formatVehicleSummary = (vehicle?: Vehicle): string | undefined => {
  if (!vehicle) return undefined;

  const licensePlate = vehicle.licensePlate?.trim();
  const descriptor = [vehicle.make, vehicle.model, vehicle.color]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' ');

  if (licensePlate && descriptor) return `${licensePlate} - ${descriptor}`;
  return licensePlate || descriptor || undefined;
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
  onDeleteOrder,
  initialDraftOrderId,
  onInitialDraftOrderHandled,
  isReadOnly,
  onNavigateToVehicles,
  onNavigateToCustomers,
  onNavigateToAddCustomer,
  onNavigateToServiceLifeCycle,
  prefillCustomerId,
  prefillLicensePlate,
  onPrefillConsumed,
}) => {
  const [licensePlateInput, setLicensePlateInput] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [vehicleSearchInput, setVehicleSearchInput] = useState('');
  const [selectedLines, setSelectedLines] = useState<CheckoutOrderLine[]>([]);
  const [couponAmountInput, setCouponAmountInput] = useState('0');
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [membershipRateInput, setMembershipRateInput] = useState('0');
  const [surchargeCodeInput, setSurchargeCodeInput] = useState('');
  const [notes, setNotes] = useState('');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [addedServiceId, setAddedServiceId] = useState<string | null>(null);
  const [vehicleLookupStatus, setVehicleLookupStatus] = useState<'idle' | 'found' | 'not_found'>('idle');
  const [isDraftPickerOpen, setIsDraftPickerOpen] = useState(false);
  const [expandedServiceGroup, setExpandedServiceGroup] = useState<string | null>(null);
  const [detailService, setDetailService] = useState<CategoryItem | null>(null);
  const [draftSearchTerm, setDraftSearchTerm] = useState('');
  const [lineBenefits, setLineBenefits] = useState<Record<string, MembershipBenefitType>>({});
  const [benefitRemaining, setBenefitRemaining] = useState<Record<MembershipBenefitType, number>>({ car_care_upgrade: 0, hzmb_shuttle: 0 });
  const [benefitRulesByKey, setBenefitRulesByKey] = useState<Record<string, MembershipBenefitServiceRule>>({});

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

  useEffect(() => {
    let cancelled = false;
    fetchMembershipBenefitServiceRules().then(result => {
      if (cancelled || !result.data) return;
      const map: Record<string, MembershipBenefitServiceRule> = {};
      for (const rule of result.data) {
        map[`${rule.categoryId}::${rule.benefitType}`] = rule;
      }
      setBenefitRulesByKey(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load live remaining counts whenever the selected customer (and their membership) changes.
  useEffect(() => {
    const membership = selectedCustomerId ? activeMembershipByCustomerId.get(selectedCustomerId) : undefined;
    if (!membership) {
      setBenefitRemaining({ car_care_upgrade: 0, hzmb_shuttle: 0 });
      return;
    }
    let cancelled = false;
    Promise.all([
      getMembershipBenefitRemaining(membership.id, 'car_care_upgrade'),
      getMembershipBenefitRemaining(membership.id, 'hzmb_shuttle'),
    ]).then(([carCare, hzmb]) => {
      if (!cancelled) {
        setBenefitRemaining({
          car_care_upgrade: carCare.remaining ?? 0,
          hzmb_shuttle: hzmb.remaining ?? 0,
        });
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId, activeMembershipByCustomerId]);

  const getMembershipDiscountRateForCustomer = (customerId?: string): number => {
    if (!customerId) return 0;
    const membership = activeMembershipByCustomerId.get(customerId);
    if (!membership) return 0;
    const rate = membership.discountedRateSnapshot;
    return Math.max(0, Math.min(100, Number(rate || 0)));
  };

  const selectableVehicles = useMemo(() => {
    if (!selectedCustomerId) {
      return vehicles;
    }
    return vehicles.filter(vehicle => vehicle.customerId === selectedCustomerId);
  }, [vehicles, selectedCustomerId]);

  const selectableVehicleSearchOptions = useMemo(() => {
    return [...selectableVehicles].sort((a, b) => (a.licensePlate || '').localeCompare(b.licensePlate || ''));
  }, [selectableVehicles]);

  const preferredVehicleByCustomerId = useMemo(() => {
    const map = new Map<string, Vehicle>();

    for (const customer of customers) {
      if (!customer.vehicleId) continue;
      const linkedVehicle = vehicleMap.get(customer.vehicleId);
      if (linkedVehicle?.customerId === customer.id) {
        map.set(customer.id, linkedVehicle);
      }
    }

    for (const vehicle of vehicles) {
      if (!map.has(vehicle.customerId)) {
        map.set(vehicle.customerId, vehicle);
      }
    }

    return map;
  }, [customers, vehicles, vehicleMap]);

  const customerStats = useMemo(() => {
    const stats: Record<string, CustomerStats> = {};

    for (const customer of customers) {
      stats[customer.id] = {
        visitCount: 0,
        totalSpent: 0,
        vehicleSummary: formatVehicleSummary(preferredVehicleByCustomerId.get(customer.id)),
      };
    }

    for (const order of checkoutOrders) {
      if (!order.customerId || order.status !== CheckoutOrderStatus.CHECKED_OUT) continue;
      if (!stats[order.customerId]) {
        stats[order.customerId] = {
          visitCount: 0,
          totalSpent: 0,
          vehicleSummary: formatVehicleSummary(preferredVehicleByCustomerId.get(order.customerId)),
        };
      }
      const s = stats[order.customerId];
      s.visitCount += 1;
      s.totalSpent += order.netAmount;
      if (!s.lastVisitDate || (order.checkedOutAt && order.checkedOutAt > s.lastVisitDate)) {
        s.lastVisitDate = order.checkedOutAt;
        const serviceLine = order.lines.find(l => !l.isDiscount);
        s.lastServiceName = serviceLine?.name;
      }
    }
    return stats;
  }, [checkoutOrders, customers, preferredVehicleByCustomerId]);

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

  const getBenefitDiscountAmountForLine = (line: CheckoutOrderLine, benefitType: MembershipBenefitType): number => {
    const lineSubtotal = Math.max(0, Number(line.lineSubtotal || 0));
    if (lineSubtotal <= 0) return 0;

    const categoryId = line.categoryId || '';
    const rule = categoryId ? benefitRulesByKey[`${categoryId}::${benefitType}`] : undefined;

    // Prefer discount table amount when coupon code is mapped; otherwise use rule mode/value.
    if (rule?.couponCodeTemplate) {
      const discountByCode = resolveDiscountByCode(rule.couponCodeTemplate, 'discount');
      if (discountByCode) {
        const amount = discountByCode.amountType === 'percent'
          ? (lineSubtotal * Math.max(0, discountByCode.amount)) / 100
          : Math.max(0, discountByCode.amount);
        return Number(Math.min(lineSubtotal, amount).toFixed(2));
      }
    }

    if (!rule) {
      return 0;
    }

    if (rule.discountMode === 'percent') {
      const amount = (lineSubtotal * Math.max(0, rule.discountValue)) / 100;
      return Number(Math.min(lineSubtotal, amount).toFixed(2));
    }

    if (rule.discountMode === 'fixed_amount') {
      return Number(Math.min(lineSubtotal, Math.max(0, rule.discountValue)).toFixed(2));
    }

    return Number(Math.min(lineSubtotal, Math.max(0, rule.discountValue)).toFixed(2));
  };

  const getLineCouponEligibility = (line: CheckoutOrderLine): { allowsCarCareCoupon: boolean; allowsHzmbCoupon: boolean } => {
    const categoryId = (line.categoryId || '').trim();
    if (categoryId) {
      return {
        allowsCarCareCoupon: Boolean(benefitRulesByKey[`${categoryId}::car_care_upgrade`]),
        allowsHzmbCoupon: Boolean(benefitRulesByKey[`${categoryId}::hzmb_shuttle`]),
      };
    }

    // Fallback for legacy lines that may not carry categoryId.
    const lineName = line.name || '';
    const normalizedLineName = lineName.toLowerCase();
    const isHzmbLine = normalizedLineName.includes('hzmb') || normalizedLineName.includes('shuttle') || lineName.includes('港珠澳');
    const isCarCareLine =
      normalizedLineName.includes('car care') ||
      normalizedLineName.includes('carcare') ||
      normalizedLineName.includes('upgrade') ||
      normalizedLineName.includes('lombart') ||
      lineName.includes('升級') ||
      lineName.includes('护理') ||
      lineName.includes('護理');
    return {
      allowsCarCareCoupon: !isHzmbLine,
      allowsHzmbCoupon: !isCarCareLine,
    };
  };

  const getUpgradeCouponName = (line: CheckoutOrderLine): string => {
    const base = (line.name || 'SERVICE').trim().replace(/\s+/g, '_');
    return `${base}_Upgrade_discount`;
  };

  const isBenefitEligibleForLine = (line: CheckoutOrderLine, benefitType: MembershipBenefitType): boolean => {
    const eligibility = getLineCouponEligibility(line);
    return benefitType === 'car_care_upgrade' ? eligibility.allowsCarCareCoupon : eligibility.allowsHzmbCoupon;
  };

  const drafts = useMemo(() => {
    return checkoutOrders.filter(order => order.status === CheckoutOrderStatus.DRAFT);
  }, [checkoutOrders]);

  const filteredDrafts = useMemo(() => {
    const keyword = draftSearchTerm.trim().toLowerCase();
    const sorted = [...drafts].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });

    if (!keyword) return sorted;

    return sorted.filter(order => {
      const customerName = (customerMap.get(order.customerId || '')?.name || '').toLowerCase();
      const plate = (vehicleMap.get(order.vehicleId || '')?.licensePlate || '').toLowerCase();
      const shortId = order.id.slice(0, 8).toLowerCase();
      return customerName.includes(keyword) || plate.includes(keyword) || shortId.includes(keyword);
    });
  }, [draftSearchTerm, drafts, customerMap, vehicleMap]);

  const couponAmount = Math.max(0, Number(couponAmountInput) || 0);
  const membershipRate = Math.max(0, Math.min(100, Number(membershipRateInput) || 0));
  const couponLineSubtotal = couponAmount > 0 ? couponAmount : 0;
  const resolvedDiscount = resolveDiscountByCode(discountCodeInput, 'discount');
  const resolvedSurcharge = resolveDiscountByCode(surchargeCodeInput, 'surcharge');
  const selectedBenefitDiscountLines: CheckoutOrderLine[] = selectedLines
    .filter(line => !line.isDiscount && Boolean(lineBenefits[line.id]) && isBenefitEligibleForLine(line, lineBenefits[line.id] as MembershipBenefitType))
    .map(line => {
      const benefitType = lineBenefits[line.id] as MembershipBenefitType;
      const discountAmount = getBenefitDiscountAmountForLine(line, benefitType);
      return {
        id: `benefit-preview-${line.id}`,
        saleId: 'preview',
        name: benefitType === 'hzmb_shuttle'
          ? (language === 'zh' ? '港珠澳優惠券折扣' : 'HZMB Coupon Discount')
          : (language === 'zh' ? 'Car Care 升級券折扣' : 'Car Care Upgrade Coupon Discount'),
        quantity: 1,
        unitPrice: discountAmount,
        lineSubtotal: discountAmount,
        estimatedDurationMinutes: 0,
        isDiscount: true,
        createdAt: new Date().toISOString(),
      };
    })
    .filter(line => line.lineSubtotal > 0);

  const grossAmount = calculateGrossAmount(selectedLines);
  const selectedVehicle = selectedVehicleId ? vehicleMap.get(selectedVehicleId) : undefined;
  const selectedVehicleIsLarge = isLargeVehicle(selectedVehicle);
  // Benefit coupons discount specific items first; everything else is calculated on the post-benefit base
  const benefitDiscountTotal = selectedBenefitDiscountLines.reduce((sum, l) => sum + (Number.isFinite(l.lineSubtotal) ? l.lineSubtotal : 0), 0);
  const postBenefitGross = Math.max(0, grossAmount - benefitDiscountTotal);
  const largeVehicleSurchargeAmount = selectedVehicleIsLarge
    ? calculateCodeAmount(postBenefitGross, resolvedSurcharge)
    : 0;
  const couponDiscountAmount = couponLineSubtotal; // manual coupon only; benefit discounts are in benefitCouponLines
  const membershipDiscountAmount = calculateMembershipDiscountAmount(postBenefitGross, membershipRate);
  const codeDiscountAmount = calculateCodeAmount(postBenefitGross, resolvedDiscount);
  const netAmount = calculateNetAmount(postBenefitGross, largeVehicleSurchargeAmount, membershipDiscountAmount, couponDiscountAmount + codeDiscountAmount);
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
      setVehicleSearchInput('');
      return;
    }
    if (vehicle.licensePlate) {
      setLicensePlateInput(vehicle.licensePlate);
      setVehicleSearchInput(vehicle.licensePlate);
    }
  }, [selectedCustomerId, selectedVehicleId, vehicleMap]);

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setMembershipRateInput(String(getMembershipDiscountRateForCustomer(customerId)));

    if (customerId) {
      const preferred = preferredVehicleByCustomerId.get(customerId);
      if (preferred) {
        setSelectedVehicleId(preferred.id);
        if (preferred.licensePlate) {
          setLicensePlateInput(preferred.licensePlate);
          setVehicleSearchInput(preferred.licensePlate);
        }
      }
    }
  };

  const handleVehicleChange = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);

    if (!vehicleId) {
      setVehicleSearchInput('');
      return;
    }

    const vehicle = vehicleMap.get(vehicleId);
    if (!vehicle) return;

    setSelectedCustomerId(vehicle.customerId || '');
    setMembershipRateInput(String(getMembershipDiscountRateForCustomer(vehicle.customerId)));
    if (vehicle.licensePlate) {
      setLicensePlateInput(vehicle.licensePlate);
      setVehicleSearchInput(vehicle.licensePlate);
    }
  };

  const handleVehicleSearchChange = (nextValue: string) => {
    const normalizedPlate = normalizeLicensePlate(nextValue);
    setVehicleSearchInput(normalizedPlate);

    if (!normalizedPlate) {
      setSelectedVehicleId('');
      return;
    }

    const matchedVehicle = selectableVehicles.find(vehicle => normalizeLicensePlate(vehicle.licensePlate || '') === normalizedPlate);
    if (!matchedVehicle) {
      setSelectedVehicleId('');
      return;
    }

    handleVehicleChange(matchedVehicle.id);
  };

  const resetForm = () => {
    setLicensePlateInput('');
    setSelectedCustomerId('');
    setSelectedVehicleId('');
    setVehicleSearchInput('');
    setSelectedLines([]);
    setCouponAmountInput('0');
    setDiscountCodeInput('');
    setMembershipRateInput('0');
    setSurchargeCodeInput('');
    setNotes('');
    setEditingOrderId(null);
    setLineBenefits({});
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
    setAddedServiceId(service.id);
    setTimeout(() => setAddedServiceId(prev => (prev === service.id ? null : prev)), 1200);
  };

  const removeLine = (lineId: string) => {
    setSelectedLines(prev => prev.filter(line => line.id !== lineId));
    setLineBenefits(prev => { const next = { ...prev }; delete next[lineId]; return next; });
  };

  const toggleLineBenefit = (lineId: string, benefitType: MembershipBenefitType) => {
    setLineBenefits(prev => {
      const targetLine = selectedLines.find(line => line.id === lineId);
      if (!targetLine || !isBenefitEligibleForLine(targetLine, benefitType)) {
        return prev;
      }
      if (prev[lineId] === benefitType) {
        const next = { ...prev };
        delete next[lineId];
        return next;
      }
      return { ...prev, [lineId]: benefitType };
    });
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
    const membershipRateGuess = getMembershipDiscountRateForCustomer(order.customerId || '');

    setEditingOrderId(order.id);
    setSelectedCustomerId(order.customerId || '');
    setSelectedVehicleId(order.vehicleId || '');
    setVehicleSearchInput(order.vehicleId ? (vehicleMap.get(order.vehicleId)?.licensePlate || '') : '');
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

  useEffect(() => {
    if (!initialDraftOrderId) return;
    const targetOrder = checkoutOrders.find(order => order.id === initialDraftOrderId && order.status === CheckoutOrderStatus.DRAFT);
    if (!targetOrder) return;

    loadOrderForEdit(targetOrder);
    setIsDraftPickerOpen(false);
    setDraftSearchTerm('');
    onInitialDraftOrderHandled?.();
  }, [initialDraftOrderId, checkoutOrders, onInitialDraftOrderHandled, vehicleMap]);

  useEffect(() => {
    const hasCustomer = Boolean(prefillCustomerId && prefillCustomerId.trim());
    const hasPlate = Boolean(prefillLicensePlate && prefillLicensePlate.trim());
    if (!hasCustomer && !hasPlate) return;

    const normalizedCustomerId = (prefillCustomerId || '').trim();
    const normalizedPlate = normalizeLicensePlate(prefillLicensePlate || '');
    if (hasCustomer) {
      handleCustomerChange(normalizedCustomerId);
    }

    if (normalizedPlate) {
      setLicensePlateInput(normalizedPlate);
      setVehicleSearchInput(normalizedPlate);
      const matchedVehicle = vehicles.find(vehicle => {
        if (normalizeLicensePlate(vehicle.licensePlate || '') !== normalizedPlate) return false;
        if (!hasCustomer) return true;
        return (vehicle.customerId || '') === normalizedCustomerId;
      });

      // Keep prefill pending until the linked vehicle row is visible for this customer.
      if (hasCustomer && !matchedVehicle) {
        return;
      }

      if (matchedVehicle) {
        setSelectedVehicleId(matchedVehicle.id);
        if (!hasCustomer) {
          handleCustomerChange(matchedVehicle.customerId || '');
        }
      }
    }

    onPrefillConsumed?.();
  }, [prefillCustomerId, prefillLicensePlate, vehicles, onPrefillConsumed]);

  const openDraftPicker = () => {
    setDraftSearchTerm('');
    setIsDraftPickerOpen(true);
  };

  const closeDraftPicker = () => {
    setIsDraftPickerOpen(false);
  };

  const pickDraftOrder = (order: CheckoutOrder) => {
    loadOrderForEdit(order);
    closeDraftPicker();
  };

  const deleteDraftOrder = async (orderId: string) => {
    if (isReadOnly) return;
    const shouldDelete = window.confirm(
      language === 'zh' ? '確定刪除此草稿訂單？' : 'Delete this draft order?'
    );
    if (!shouldDelete) return;

    await onDeleteOrder(orderId);
    if (editingOrderId === orderId) {
      resetForm();
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
    const benefitCouponLines: CheckoutOrderLine[] = selectedLines
      .filter(line => !line.isDiscount && Boolean(lineBenefits[line.id]) && isBenefitEligibleForLine(line, lineBenefits[line.id] as MembershipBenefitType))
      .map(line => {
        const benefitType = lineBenefits[line.id] as MembershipBenefitType;
        const discountAmount = getBenefitDiscountAmountForLine(line, benefitType);
        return {
          id: crypto.randomUUID(),
          saleId: id,
          name: benefitType === 'hzmb_shuttle'
            ? (language === 'zh' ? '港珠澳優惠券折扣' : 'HZMB Coupon Discount')
            : (language === 'zh' ? 'Car Care 升級券折扣' : 'Car Care Upgrade Coupon Discount'),
          quantity: 1,
          unitPrice: discountAmount,
          lineSubtotal: discountAmount,
          estimatedDurationMinutes: 0,
          serviceNameSnapshot: line.name,
          isDiscount: true,
          createdAt: now,
          updatedAt: now,
        };
      })
      .filter(line => line.lineSubtotal > 0);

    const lines = [
      ...selectedLines.map(line => ({
        ...line,
        saleId: id,
        benefitType: lineBenefits[line.id],
        updatedAt: now,
      })),
      ...benefitCouponLines,
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
      // Validate benefit coupon entitlements before committing.
      const membership = selectedCustomerId ? activeMembershipByCustomerId.get(selectedCustomerId) : undefined;
      if (membership && Object.keys(lineBenefits).length > 0) {
        const usedCounts: Partial<Record<MembershipBenefitType, number>> = {};
        for (const [lineId, bt] of Object.entries(lineBenefits)) {
          const line = selectedLines.find(item => item.id === lineId);
          if (!line || !isBenefitEligibleForLine(line, bt as MembershipBenefitType)) continue;
          usedCounts[bt as MembershipBenefitType] = (usedCounts[bt as MembershipBenefitType] ?? 0) + 1;
        }
        for (const [bt, count] of Object.entries(usedCounts) as [MembershipBenefitType, number][]) {
          const available = benefitRemaining[bt] ?? 0;
          if (count > available) {
            const label = bt === 'car_care_upgrade'
              ? (language === 'zh' ? 'Car Care 升級' : 'Car Care Upgrade')
              : (language === 'zh' ? '港珠澳接送' : 'HZMB Shuttle');
            alert(language === 'zh'
              ? `${label} 優惠券餘量不足（剩餘 ${available}，本次使用 ${count}）`
              : `Insufficient ${label} coupons (${available} remaining, ${count} applied)`);
            return;
          }
        }
      }
    }

    const order = buildOrder(status);
    const nextOrders = checkoutOrders.some(existing => existing.id === order.id)
      ? checkoutOrders.map(existing => (existing.id === order.id ? order : existing))
      : [order, ...checkoutOrders];

    await onSaveOrders(nextOrders);

    // Persist benefit redemptions after order is saved.
    if (status === CheckoutOrderStatus.COMMITTED) {
      const membership = selectedCustomerId ? activeMembershipByCustomerId.get(selectedCustomerId) : undefined;
      if (membership) {
        for (const [lineId, benefitType] of Object.entries(lineBenefits)) {
          const line = selectedLines.find(item => item.id === lineId);
          if (!line || !isBenefitEligibleForLine(line, benefitType as MembershipBenefitType)) continue;
          await redeemMembershipBenefit({
            membershipId: membership.id,
            customerId: membership.customerId,
            benefitType: benefitType as MembershipBenefitType,
            checkoutSaleId: order.id,
            checkoutLineItemId: lineId,
          });
        }
      }
    }

    resetForm();
    if (status === CheckoutOrderStatus.COMMITTED) {
      onNavigateToServiceLifeCycle?.();
    }
  };

  const openAddVehicleFromCurrentDraft = async () => {
    if (!onNavigateToVehicles) return;

    const normalizedPlate = licensePlateInput.trim().toUpperCase();
    if (isReadOnly) {
      onNavigateToVehicles(normalizedPlate);
      return;
    }

    let draftOrderId: string | null = editingOrderId;
    if (editingOrderId || selectedLines.length > 0) {
      const draftOrder = buildOrder(CheckoutOrderStatus.DRAFT);
      const nextOrders = checkoutOrders.some(existing => existing.id === draftOrder.id)
        ? checkoutOrders.map(existing => (existing.id === draftOrder.id ? draftOrder : existing))
        : [draftOrder, ...checkoutOrders];
      await onSaveOrders(nextOrders);
      draftOrderId = draftOrder.id;
    }

    onNavigateToVehicles(normalizedPlate, draftOrderId);
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
    if (!result.data) {
      setVehicleLookupStatus('not_found');
      return;
    }
    const customerId = result.data.customer.id;
    setSelectedCustomerId(customerId);
    setSelectedVehicleId(result.data.vehicle.id);
    setMembershipRateInput(String(getMembershipDiscountRateForCustomer(customerId)));
    setVehicleLookupStatus('found');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {language === 'zh' ? '新銷售' : 'New Sale'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openDraftPicker}
              className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-black uppercase tracking-widest"
            >
              {language === 'zh' ? '搜尋草稿訂單' : 'Search Draft Order'}
            </button>
            {editingOrderId && (
              <button
                onClick={resetForm}
                className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 dark:text-slate-300"
              >
                {language === 'zh' ? '取消編輯' : 'Cancel Edit'}
              </button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            {vehicleLookupStatus === 'found' && selectedVehicle ? (
              <button
                type="button"
                onClick={() => setVehicleLookupStatus('idle')}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title={language === 'zh' ? '更改車牌' : 'Change license plate'}
              >
                <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm flex-shrink-0">
                  <i className="fas fa-check text-xl text-emerald-600 dark:text-emerald-400"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-black text-slate-900 dark:text-white truncate tracking-[0.08em]">
                    {(selectedVehicle.licensePlate || '').toUpperCase()}
                  </p>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate uppercase tracking-[0.06em] mt-0.5">
                    {[selectedVehicle.make, selectedVehicle.model, selectedVehicle.color].filter(Boolean).join(' ') || '-'}
                  </p>
                </div>
                <i className="fas fa-chevron-right text-slate-400 dark:text-slate-500"></i>
              </button>
            ) : (
              <LicensePlateField
                value={licensePlateInput}
                onChange={value => { setLicensePlateInput(value); setVehicleLookupStatus('idle'); }}
                language={language}
                label={language === 'zh' ? '請輸入車牌' : 'Enter License Plate'}
                placeholder={language === 'zh' ? '例如 AB1234' : 'e.g. AB1234'}
                disabled={isReadOnly}
                action={
                  <button
                    onClick={lookupVehicle}
                    disabled={isReadOnly}
                    className="px-4 h-14 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {language === 'zh' ? '查找' : 'Lookup'}
                  </button>
                }
              />
            )}
            {vehicleLookupStatus === 'not_found' && (
              <div className="mt-2 flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700">
                <i className="fas fa-triangle-exclamation text-amber-500"></i>
                <p className="flex-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  {language === 'zh' ? '未找到此車牌' : 'Plate not found'}
                </p>
                {onNavigateToVehicles && (
                  <button
                    type="button"
                    onClick={() => { void openAddVehicleFromCurrentDraft(); }}
                    className="text-sm font-black text-amber-700 dark:text-amber-300 underline underline-offset-2"
                  >
                    {language === 'zh' ? '新增車輛 →' : 'Add vehicle →'}
                  </button>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '客戶' : 'Customer'}</label>
            <div className="mt-1">
              <CustomerPromptSelect
                value={selectedCustomerId}
                onChange={handleCustomerChange}
                options={customers.map(customer => ({ id: customer.id, name: customer.name }))}
                language={language}
                promptText={language === 'zh' ? '新增客戶' : 'Add a customer'}
                emptyOptionText={language === 'zh' ? '未選擇' : 'Unassigned'}
                onViewProfile={onNavigateToCustomers ? () => onNavigateToCustomers() : undefined}
                onAddCustomer={onNavigateToAddCustomer ? () => onNavigateToAddCustomer(licensePlateInput) : undefined}
                customerStats={customerStats}
              />
            </div>
          </div>

        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">{language === 'zh' ? '服務項目' : 'Service Items'}</p>
          {(() => {
            const groups = new Map<string, typeof activeServices>();
            for (const svc of activeServices) {
              const key = svc.itemCategory?.trim() || 'other';
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(svc);
            }
            // Sort items within each group by numeric suffix of id
            groups.forEach((items, key) => groups.set(key, [...items].sort((a, b) => {
              const na = parseInt((a.id.match(/(\d+)$/) || ['0','0'])[1], 10);
              const nb = parseInt((b.id.match(/(\d+)$/) || ['0','0'])[1], 10);
              return na - nb;
            })));
            const groupKeys = [...groups.keys()].sort();
            // Palette: each group index gets a distinct colour set
            const palette = [
              { border: 'border-blue-200 dark:border-blue-900/40', header: 'bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/30', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconText: 'text-blue-500 dark:text-blue-400', label: 'text-blue-800 dark:text-blue-200', price: 'text-blue-600 dark:text-blue-400', hover: 'hover:bg-blue-50/60 dark:hover:bg-blue-900/10', addHover: 'group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 group-hover:text-blue-500' },
              { border: 'border-violet-200 dark:border-violet-900/40', header: 'bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/30', iconBg: 'bg-violet-100 dark:bg-violet-900/40', iconText: 'text-violet-500 dark:text-violet-400', label: 'text-violet-800 dark:text-violet-200', price: 'text-violet-600 dark:text-violet-400', hover: 'hover:bg-violet-50/60 dark:hover:bg-violet-900/10', addHover: 'group-hover:bg-violet-100 dark:group-hover:bg-violet-900/30 group-hover:text-violet-500' },
              { border: 'border-emerald-200 dark:border-emerald-900/40', header: 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/30', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconText: 'text-emerald-500 dark:text-emerald-400', label: 'text-emerald-800 dark:text-emerald-200', price: 'text-emerald-600 dark:text-emerald-400', hover: 'hover:bg-emerald-50/60 dark:hover:bg-emerald-900/10', addHover: 'group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30 group-hover:text-emerald-500' },
              { border: 'border-orange-200 dark:border-orange-900/40', header: 'bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/30', iconBg: 'bg-orange-100 dark:bg-orange-900/40', iconText: 'text-orange-500 dark:text-orange-400', label: 'text-orange-800 dark:text-orange-200', price: 'text-orange-600 dark:text-orange-400', hover: 'hover:bg-orange-50/60 dark:hover:bg-orange-900/10', addHover: 'group-hover:bg-orange-100 dark:group-hover:bg-orange-900/30 group-hover:text-orange-500' },
              { border: 'border-rose-200 dark:border-rose-900/40', header: 'bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/30', iconBg: 'bg-rose-100 dark:bg-rose-900/40', iconText: 'text-rose-500 dark:text-rose-400', label: 'text-rose-800 dark:text-rose-200', price: 'text-rose-600 dark:text-rose-400', hover: 'hover:bg-rose-50/60 dark:hover:bg-rose-900/10', addHover: 'group-hover:bg-rose-100 dark:group-hover:bg-rose-900/30 group-hover:text-rose-500' },
              { border: 'border-cyan-200 dark:border-cyan-900/40', header: 'bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/30', iconBg: 'bg-cyan-100 dark:bg-cyan-900/40', iconText: 'text-cyan-500 dark:text-cyan-400', label: 'text-cyan-800 dark:text-cyan-200', price: 'text-cyan-600 dark:text-cyan-400', hover: 'hover:bg-cyan-50/60 dark:hover:bg-cyan-900/10', addHover: 'group-hover:bg-cyan-100 dark:group-hover:bg-cyan-900/30 group-hover:text-cyan-500' },
            ];
            return groupKeys.map((key, idx) => {
              const items = groups.get(key)!;
              const isExpanded = expandedServiceGroup === key;
              const label = key.charAt(0).toUpperCase() + key.slice(1);
              const c = palette[idx % palette.length];
              // Per-item shade variants within the same hue (cycles through 4 shades)
              const itemShades = [
                ['bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-100', 'bg-blue-200 text-blue-900 dark:bg-blue-800/60 dark:text-blue-100', 'bg-blue-300 text-blue-900 dark:bg-blue-700/60 dark:text-blue-50', 'bg-blue-400/70 text-blue-950 dark:bg-blue-600/50 dark:text-blue-50'],
                ['bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100', 'bg-violet-200 text-violet-900 dark:bg-violet-800/60 dark:text-violet-100', 'bg-violet-300 text-violet-900 dark:bg-violet-700/60 dark:text-violet-50', 'bg-violet-400/70 text-violet-950 dark:bg-violet-600/50 dark:text-violet-50'],
                ['bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100', 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100', 'bg-emerald-300 text-emerald-900 dark:bg-emerald-700/60 dark:text-emerald-50', 'bg-emerald-400/70 text-emerald-950 dark:bg-emerald-600/50 dark:text-emerald-50'],
                ['bg-orange-100 text-orange-900 dark:bg-orange-900/50 dark:text-orange-100', 'bg-orange-200 text-orange-900 dark:bg-orange-800/60 dark:text-orange-100', 'bg-orange-300 text-orange-900 dark:bg-orange-700/60 dark:text-orange-50', 'bg-orange-400/70 text-orange-950 dark:bg-orange-600/50 dark:text-orange-50'],
                ['bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100', 'bg-rose-200 text-rose-900 dark:bg-rose-800/60 dark:text-rose-100', 'bg-rose-300 text-rose-900 dark:bg-rose-700/60 dark:text-rose-50', 'bg-rose-400/70 text-rose-950 dark:bg-rose-600/50 dark:text-rose-50'],
                ['bg-cyan-100 text-cyan-900 dark:bg-cyan-900/50 dark:text-cyan-100', 'bg-cyan-200 text-cyan-900 dark:bg-cyan-800/60 dark:text-cyan-100', 'bg-cyan-300 text-cyan-900 dark:bg-cyan-700/60 dark:text-cyan-50', 'bg-cyan-400/70 text-cyan-950 dark:bg-cyan-600/50 dark:text-cyan-50'],
              ];
              const shades = itemShades[idx % itemShades.length];
              return (
                <div key={key} className={`mb-2 last:mb-0 rounded-2xl border ${c.border} overflow-hidden`}>
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setExpandedServiceGroup(isExpanded ? null : key)}
                    className={`w-full flex items-center justify-between px-4 py-3 ${c.header} transition-all disabled:opacity-50`}
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
                      {items.map((service, sIdx) => {
                        const shade = shades[sIdx % shades.length];
                        const isAdded = addedServiceId === service.id;
                        const initials = service.name.trim().substring(0, 2).toUpperCase();
                        return (
                          <button
                            key={service.id}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => setDetailService(service)}
                            className="relative flex flex-col items-center gap-1.5 disabled:opacity-50 active:scale-95 transition-transform"
                            style={{ width: '112px' }}
                          >
                            {/* Square box */}
                            <div className={`w-28 h-28 rounded-2xl flex flex-col items-center justify-center gap-0.5 px-2 ${shade} ${isAdded ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}>
                              <span className="text-xl font-black leading-none">{initials}</span>
                              <span className="text-[11px] font-bold text-center leading-tight line-clamp-2 w-full px-1">{service.name}</span>
                              <span className="text-[10px] font-black opacity-70">{formatCurrency(Number(service.price || 0))}</span>
                            </div>
                            {isAdded && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
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
            });
          })()}

          {/* Service detail popup */}
          {detailService && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[28px] shadow-2xl flex flex-col max-h-[80vh]">
                {/* spacer */}
                <div className="h-1 shrink-0"></div>
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-white/10 shrink-0">
                  <p className="text-sm font-black text-slate-800 dark:text-white tracking-tight">
                    {language === 'zh' ? '服務詳情' : 'Service Detail'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDetailService(null)}
                    className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/20 transition-all"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>
                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">{language === 'zh' ? '名稱' : 'Name'}</p>
                    <p className="text-sm font-black text-slate-800 dark:text-white">{detailService.name}</p>
                  </div>
                  {detailService.description && (
                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">{language === 'zh' ? '說明' : 'Description'}</p>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed">{detailService.description}</p>
                    </div>
                  )}
                  <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{language === 'zh' ? '預計時間' : 'Est. Duration'}</p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <i className="fas fa-clock text-blue-400 text-xs"></i>
                      {detailService.estimatedDurationMinutes
                        ? `${detailService.estimatedDurationMinutes} ${language === 'zh' ? '分鐘' : 'min'}`
                        : (language === 'zh' ? '未知' : 'Unknown')}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{language === 'zh' ? '可單獨銷售' : 'Sold Separately'}</p>
                    {detailService.notSoldSeparately
                      ? <span className="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest">{language === 'zh' ? '否' : 'No'}</span>
                      : <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">{language === 'zh' ? '是' : 'Yes'}</span>
                    }
                  </div>
                  <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 dark:text-blue-400">{language === 'zh' ? '定價' : 'Price'}</p>
                    <p className="text-xl font-black text-blue-700 dark:text-blue-300">{formatCurrency(Number(detailService.price || 0))}</p>
                  </div>
                </div>
                {/* Select button */}
                <div className="px-5 py-4 border-t border-slate-100 dark:border-white/10 shrink-0">
                  <button
                    type="button"
                    onClick={() => { addServiceLine(detailService); setDetailService(null); }}
                    className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                  >
                    {language === 'zh' ? '選擇此服務' : 'Select This Service'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {selectedLines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/20 px-3 py-3 text-xs font-bold text-slate-400">
              {language === 'zh' ? '尚未加入服務項目' : 'No services selected'}
            </div>
          ) : (
            selectedLines.map(line => {
              const activeMembership = selectedCustomerId ? activeMembershipByCustomerId.get(selectedCustomerId) : undefined;
              const showBenefits = !line.isDiscount && !isReadOnly;
              const canUseBenefit = !!activeMembership && (activeMembership.complimentaryCarCareUpgradeSnapshot > 0 || activeMembership.hzmbServiceSnapshot > 0);
              const { allowsCarCareCoupon, allowsHzmbCoupon } = getLineCouponEligibility(line);
              const ccSelectedCount = Object.values(lineBenefits).filter(bt => bt === 'car_care_upgrade').length;
              const hzmbSelectedCount = Object.values(lineBenefits).filter(bt => bt === 'hzmb_shuttle').length;
              const ccRemainingAfterSelection = Math.max(0, benefitRemaining.car_care_upgrade - ccSelectedCount);
              const hzmbRemainingAfterSelection = Math.max(0, benefitRemaining.hzmb_shuttle - hzmbSelectedCount);
              return (
                <div key={line.id} className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
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
                  {showBenefits && (
                    <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 px-2 py-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                        {language === 'zh' ? '套用會員券' : 'Apply Membership Coupon'}
                      </p>
                      {canUseBenefit && activeMembership ? (
                        <div className="flex gap-1.5 flex-wrap">
                          {activeMembership.complimentaryCarCareUpgradeSnapshot > 0 && allowsCarCareCoupon && (
                            <button
                              onClick={() => toggleLineBenefit(line.id, 'car_care_upgrade')}
                              disabled={lineBenefits[line.id] !== 'car_care_upgrade' && ccRemainingAfterSelection <= 0}
                              title={language === 'zh' ? `${getUpgradeCouponName(line)}（升級券）` : `${getUpgradeCouponName(line)} (upgrade coupon)`}
                              className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border transition-all ${
                                lineBenefits[line.id] === 'car_care_upgrade'
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : ccRemainingAfterSelection > 0
                                    ? 'bg-transparent text-blue-600 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                                    : 'bg-transparent text-slate-400 border-slate-200 dark:border-white/10 opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <i className="fas fa-star text-[8px]"></i>
                              {getUpgradeCouponName(line)} ({ccRemainingAfterSelection})
                            </button>
                          )}
                          {activeMembership.hzmbServiceSnapshot > 0 && allowsHzmbCoupon && (
                            <button
                              onClick={() => toggleLineBenefit(line.id, 'hzmb_shuttle')}
                              disabled={lineBenefits[line.id] !== 'hzmb_shuttle' && hzmbRemainingAfterSelection <= 0}
                              title={language === 'zh' ? '港珠澳接送優惠券' : 'HZMB Shuttle Coupon'}
                              className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border transition-all ${
                                lineBenefits[line.id] === 'hzmb_shuttle'
                                  ? 'bg-violet-600 text-white border-violet-600'
                                  : hzmbRemainingAfterSelection > 0
                                    ? 'bg-transparent text-violet-600 border-violet-300 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                                    : 'bg-transparent text-slate-400 border-slate-200 dark:border-white/10 opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <i className="fas fa-ship text-[8px]"></i>
                              {language === 'zh' ? '港珠澳' : 'HZMB'} ({hzmbRemainingAfterSelection})
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          {activeMembership
                            ? (language === 'zh' ? '此會員級別沒有可用的 Car Care / HZMB 券。' : 'This membership has no Car Care / HZMB coupons configured.')
                            : (language === 'zh' ? '請先選擇有啟用會員的客戶。' : 'Select a customer with an active membership first.')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
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
        </div>

        <div>
          <label className="text-xs font-black uppercase tracking-widest text-slate-500">{language === 'zh' ? '備註' : 'Notes'}</label>
          <textarea
            value={notes}
            onChange={event => setNotes(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white resize-none"
          />
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
          {benefitDiscountTotal > 0 && <p className="text-rose-600 dark:text-rose-400">{language === 'zh' ? '會員優惠折扣' : 'Benefit Discount'}: -{formatCurrency(benefitDiscountTotal)}</p>}
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

      {isDraftPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={closeDraftPicker}
        >
          <div
            className="w-full max-w-5xl max-h-[85vh] overflow-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <button
                onClick={closeDraftPicker}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-black uppercase tracking-widest"
              >
                {language === 'zh' ? '返回' : 'Return'}
              </button>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {language === 'zh' ? '選擇草稿訂單' : 'Pick Draft Order'}
              </h3>
              <div className="w-[72px]" />
            </div>

            <div className="mb-3">
              <input
                value={draftSearchTerm}
                onChange={event => setDraftSearchTerm(event.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-white/10 bg-transparent px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
                placeholder={language === 'zh' ? '搜尋客戶、車牌、訂單號' : 'Search customer, plate, order id'}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                    <th className="px-3 py-2 font-black uppercase tracking-widest">{language === 'zh' ? '日期/時間' : 'Date/Time'}</th>
                    <th className="px-3 py-2 font-black uppercase tracking-widest">{language === 'zh' ? '客戶' : 'Customer'}</th>
                    <th className="px-3 py-2 font-black uppercase tracking-widest">{language === 'zh' ? '車牌' : 'Lic Plate'}</th>
                    <th className="px-3 py-2 font-black uppercase tracking-widest">{language === 'zh' ? '項目數' : 'Items'}</th>
                    <th className="px-3 py-2 font-black uppercase tracking-widest">{language === 'zh' ? '金額' : 'Amount'}</th>
                    <th className="px-3 py-2 font-black uppercase tracking-widest text-right">{language === 'zh' ? '操作' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrafts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-slate-400 font-semibold">
                        {language === 'zh' ? '沒有符合的草稿訂單' : 'No matching draft orders'}
                      </td>
                    </tr>
                  )}
                  {filteredDrafts.map(order => {
                    const customer = customerMap.get(order.customerId || '');
                    const vehicle = vehicleMap.get(order.vehicleId || '');
                    const itemCount = order.lines
                      .filter(line => !line.isDiscount)
                      .reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0)), 0);
                    return (
                      <tr
                        key={order.id}
                        onClick={() => pickDraftOrder(order)}
                        className="cursor-pointer border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5"
                      >
                        <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{formatDateTime(order.updatedAt || order.createdAt)}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{customer?.name || (language === 'zh' ? '未指定客戶' : 'No customer')}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{vehicle?.licensePlate || '-'}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{itemCount}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(order.netAmount)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation();
                              void deleteDraftOrder(order.id);
                            }}
                            disabled={isReadOnly}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                          >
                            {language === 'zh' ? '刪除' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckoutPage;
