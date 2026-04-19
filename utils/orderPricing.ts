import { CheckoutOrderLine } from '../types';

const roundCurrency = (value: number): number => {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
};

export const calculateGrossAmount = (lines: CheckoutOrderLine[]): number => {
  const gross = lines.reduce((sum, line) => {
    if (line.isDiscount) return sum;
    const quantity = Math.max(0, Math.round(Number(line.quantity || 0)));
    const unitPrice = Number.isFinite(line.unitPrice) ? line.unitPrice : 0;
    const subtotal = Number.isFinite(line.lineSubtotal) ? line.lineSubtotal : quantity * unitPrice;
    return sum + Math.max(0, subtotal);
  }, 0);

  return roundCurrency(gross);
};

export const calculateCouponDiscountAmount = (lines: CheckoutOrderLine[]): number => {
  const discount = lines.reduce((sum, line) => {
    if (!line.isDiscount) return sum;
    const subtotal = Number.isFinite(line.lineSubtotal) ? line.lineSubtotal : 0;
    return sum + Math.max(0, subtotal);
  }, 0);

  return roundCurrency(discount);
};

export const calculateMembershipDiscountAmount = (
  grossAmount: number,
  discountRatePercent: number
): number => {
  const normalizedGross = Math.max(0, Number.isFinite(grossAmount) ? grossAmount : 0);
  const normalizedRate = Math.max(0, Math.min(100, Number.isFinite(discountRatePercent) ? discountRatePercent : 0));
  return roundCurrency((normalizedGross * normalizedRate) / 100);
};

export const calculateLargeVehicleSurchargeAmount = (
  grossAmount: number,
  isLargeVehicleApplied: boolean,
  surchargeRatePercent = 20
): number => {
  if (!isLargeVehicleApplied) return 0;
  const normalizedGross = Math.max(0, Number.isFinite(grossAmount) ? grossAmount : 0);
  const normalizedRate = Math.max(0, Number.isFinite(surchargeRatePercent) ? surchargeRatePercent : 0);
  return roundCurrency((normalizedGross * normalizedRate) / 100);
};

export const calculateNetAmount = (
  grossAmount: number,
  largeVehicleSurchargeAmount: number,
  membershipDiscountAmount: number,
  couponDiscountAmount: number
): number => {
  const gross = Math.max(0, Number.isFinite(grossAmount) ? grossAmount : 0);
  const surcharge = Math.max(0, Number.isFinite(largeVehicleSurchargeAmount) ? largeVehicleSurchargeAmount : 0);
  const membershipDiscount = Math.max(0, Number.isFinite(membershipDiscountAmount) ? membershipDiscountAmount : 0);
  const couponDiscount = Math.max(0, Number.isFinite(couponDiscountAmount) ? couponDiscountAmount : 0);

  return roundCurrency(Math.max(0, gross + surcharge - membershipDiscount - couponDiscount));
};

export const calculateEstimatedDurationMinutes = (lines: CheckoutOrderLine[]): number => {
  return lines.reduce((sum, line) => {
    if (line.isDiscount) return sum;
    const quantity = Math.max(0, Math.round(Number(line.quantity || 0)));
    const duration = Math.max(0, Math.round(Number(line.estimatedDurationMinutes || 0)));
    return sum + quantity * duration;
  }, 0);
};

export const calculateEstimatedFinishAt = (checkInAt: string, durationMinutes: number): string => {
  const base = new Date(checkInAt);
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  const minutes = Math.max(0, Math.round(Number(durationMinutes || 0)));
  safeBase.setMinutes(safeBase.getMinutes() + minutes);
  return safeBase.toISOString();
};
