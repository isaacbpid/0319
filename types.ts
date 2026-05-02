
export enum TransactionType {
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
  STARTUP = 'STARTUP',
  WITHDRAWAL = 'WITHDRAWAL',
  OWNER_INVESTMENT = 'ADD_RMB',
  OWNER_WITHDRAWAL = 'CASH_OUT',
  TRANSFER = 'TRANSFER'
}

export enum Category {
  // Revenue Categories
  WASH = '洗車 (Wash)',
  DETAIL = '美容 (Detailing)',
  COATING = '鍍晶 (Coating)',
  INTERIOR = '內飾清潔 (Interior)',
  WINDOW = '玻璃撥水 (Window)',
  
  // Expense Categories
  RENT = '租金 (Rent)',
  UTILITY = '水電 (Utilities)',
  SALARY = '薪金 (Salary)',
  SUPPLIES = '耗材 (Supplies)',
  MARKETING = '營銷 (Marketing)',
  RENOVATION = '裝修 (Renovation)',
  EQUIPMENT = '設備 (Equipment)',
  
  // Other
  OTHER = '其他 (Other)',
  OWNER_INVESTMENT = 'Add RMB',
  OWNER_WITHDRAWAL = 'Cash Out'
}

export enum Owner {
  OWNER_A = 'User 1',
  OWNER_B = 'User 2'
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT'
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  tableName: string;
  recordId?: string;
  changedBy?: string;
  oldData?: any;
  newData?: any;
  createdAt: string;
}


export interface TransactionItem {
  id: string;
  transactionId: string;
  categoryId: string;
  name: string;
  price: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type TransactionSplitMode = 'NONE' | 'EQUAL';

export interface Transaction {
  id: string;
  receiptNumber: string;
  date: string;
  type: TransactionType;
  items: TransactionItem[];
  // Legacy summary fields stay populated for compatibility.
  categoryId: string;
  amount: number;
  fromAccountId?: string;
  toAccountId?: string;
  description: string;
  contributedBy: string;
  imageUrl?: string;
  updatedAt?: string;
  isInitialInvestment?: boolean;
  notes?: string;
  customerId?: string;
  splitMode?: TransactionSplitMode;
  splitRatioA?: number;
  splitRatioB?: number;
  checkoutOrderId?: string;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paymentCurrency?: PaymentCurrency;
  currency?: PaymentCurrency;
  paymentAmount?: number;
}

export interface Customer {
  id: string;
  name: string;
  chineseName?: string;
  whatsappEnabled?: boolean;
  firstName?: string;
  lastName?: string;
  group?: string;
  phone?: string;
  countryCode?: string;
  vehicleId?: string;
  email?: string;
  company?: string;
  companyCode?: string;
  birthday?: string;
  referenceId?: string;
  timeZone?: string;
  appointmentNotifications?: string;
  country?: string;
  addressLine1?: string;
  birthMonth?: string;
  birthDay?: string;
  birthYear?: string;
  subscribeToEmailMarketing?: boolean;
  creditDays?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  customerId: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  color?: string;
  vehicleType?: VehicleType;
  vehicleSize?: VehicleSize;
  year?: string;
  vin?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export enum VehicleType {
  SEDAN = 'sedan',
  HATCHBACK = 'hatchback',
  WAGON = 'wagon',
  COUPE = 'coupe',
  SPORTS = 'sports',
  CROSSOVER = 'crossover',
  SUV = 'suv',
  OFFROAD = 'offroad',
  PICKUP = 'pickup',
  MPV = 'mpv',
  VAN = 'van',
  LIMOUSINE = 'limousine',
}

export enum VehicleSize {
  REGULAR = 'regular',
  LARGE = 'large',
}

export interface MembershipTier {
  id: string;
  name: string;
  statusPointsThreshold: number;
  discountRate: number;
  discountEligibleCarLimit: number;
  upgradeThreshold: number;
  priorityLevel: number;
  exclusiveEvents: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;

  // Extended benefit model fields.
  statusPoints: number;
  birthdayGift: boolean;
  discountedRate: number;
  linkedLicensePlates: number;
  complimentaryCarCareUpgrade: number;
  priorityWash: number;
  exclusiveInvitation: boolean;
}

export interface CustomerMembership {
  id: string;
  customerId: string;
  tierId: string;
  discountRateSnapshot: number;
  discountEligibleCarLimitSnapshot: number;
  priorityLevelSnapshot: number;
  exclusiveEventsSnapshot: boolean;
  statusPoints: number;
  startAt: string;
  endAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;

  // Extended benefit model snapshots.
  statusPointsSnapshot: number;
  birthdayGiftSnapshot: boolean;
  discountedRateSnapshot: number;
  linkedLicensePlatesSnapshot: number;
  complimentaryCarCareUpgradeSnapshot: number;
  priorityWashSnapshot: number;
  exclusiveInvitationSnapshot: boolean;
}

export interface CustomerGroup {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminSession {
  id: string;
  partnerId: string;
  sessionToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface Note {
  id: string;
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  type: TransactionType;
  createdAt: string;
  updatedAt?: string;
  description?: string;
  price?: number;
  imageUrl?: string;
  estimatedDurationMinutes?: number;
  isActiveService?: boolean;
  itemCategory?: string;
  notSoldSeparately?: boolean;
}

export interface DiscountItem {
  id: string;
  name: string;
  code?: string;
  effectType?: 'discount' | 'surcharge';
  amountType: 'fixed' | 'percent';
  amount: number;
  category?: string;
  createdAt: string;
  updatedAt?: string;
}

export enum CheckoutOrderStatus {
  DRAFT = 'draft',
  COMMITTED = 'committed',
  IN_PROGRESS = 'in_progress',
  TASK_COMPLETED = 'task_completed',
  CHECKED_OUT = 'checked_out'
}

export type PaymentStatus = 'pending' | 'paid';

export enum PaymentMethod {
  FPS = 'FPS',
  PAYME = 'Payme',
  HKD_CASH = 'HKD_cash',
  RMB_CASH = 'RMB_cash',
  ALIPAY = 'Alipay',
  WECHAT = 'wechat',
  MOP_CASH = 'MOP_cash',
  MPAY = 'MPay'
}

export enum PaymentCurrency {
  HKD = 'HKD',
  RMB = 'RMB',
  MOP = 'MOP'
}

export interface CurrencyExchangeRate {
  id: string;
  fromCurrency: PaymentCurrency;
  toCurrency: PaymentCurrency;
  rate: number;
  effectiveDate: string;
  createdAt: string;
}

export interface CheckoutOrderLine {
  id: string;
  saleId: string;
  categoryId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  estimatedDurationMinutes?: number;
  serviceNameSnapshot?: string;
  isDiscount: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CheckoutOrder {
  id: string;
  customerId?: string;
  vehicleId?: string;
  status: CheckoutOrderStatus;
  occurredAt?: string;
  checkInAt?: string;
  committedAt?: string;
  checkedOutAt?: string;
  grossAmount: number;
  largeVehicleSurchargeApplied?: boolean;
  largeVehicleSurchargeRate?: number;
  largeVehicleSurchargeAmount?: number;
  discountCode?: string;
  surchargeCode?: string;
  membershipDiscountAmount: number;
  couponDiscountAmount: number;
  netAmount: number;
  estimatedDurationMinutes: number;
  estimatedFinishAt?: string;
  notes?: string;
  preWorkRequirement?: string;
  inProgressNote?: string;
  postWorkNote?: string;
  attentionDetails?: string[];
  customerAdditionalComments?: string[];
  preInspectionCompleted?: boolean;
  preInspectionCompletedAt?: string;
  inProgressAt?: string;
  taskCompletedAt?: string;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paymentCurrency?: PaymentCurrency;
  currency: PaymentCurrency;
  paymentAmount?: number;
  appliedRate?: number;
  paidAt?: string;
  linkedTransactionId?: string;
  invoiceNumber?: string;
  createdAt: string;
  updatedAt?: string;
  lines: CheckoutOrderLine[];
}

// New database schema types
export enum NewTransactionType {
  EXPENSE = 'expense',
  INCOME = 'income',
  TRANSFER = 'transfer',
  ADJUSTMENT = 'adjustment'
}

export enum AccountType {
  COMPANY_BANK = 'company_bank',
  PARTNER_PERSONAL = 'partner_personal',
  CASH = 'cash',
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
  OTHER = 'other'
}

export enum FundingSourceType {
  COMPANY_ACCOUNT = 'company_account',
  PARTNER_PERSONAL = 'partner_personal',
  CASH = 'cash'
}

export enum PartnerEntryType {
  CAPITAL_CONTRIBUTION = 'capital_contribution',
  EXPENSE_PAID_FOR_COMPANY = 'expense_paid_for_company',
  CAPITAL_WITHDRAWAL = 'capital_withdrawal',
  PROFIT_DISTRIBUTION = 'profit_distribution',
  OTHER_ADJUSTMENT = 'other_adjustment'
}

export interface Partner {
  id: string;
  nameEn: string;
  nameZh?: string;
  email?: string;
  phone?: string;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  createdAt: string;
}

export interface PartnerLedgerEntry {
  id: string;
  partnerId: string;
  relatedTxId?: string;
  entryType: PartnerEntryType;
  amount: number;
  description?: string;
  occurredAt: string;
  createdAt: string;
}

export interface CategoryRecord {
  id: string;
  nameEn: string;
  nameZh?: string;
  code?: string;
  isExpense: boolean;
  isIncome: boolean;
  sortOrder?: number;
  createdAt: string;
}

export interface NewTransaction {
  id: string;
  trackingNumber?: string;
  type: NewTransactionType;
  occurredAt: string;
  accountId: string;
  fundingSourceType: FundingSourceType;
  partnerId?: string;
  categoryId?: string;
  amount: number;
  currencyCode: string;
  description?: string;
  isRecurringInstance: boolean;
  recurringRuleId?: string;
  isForCustomerOrder: boolean;
  customerOrderId?: string;
  isInitialInvestment: boolean;
  createdAt: string;
}

export interface TransactionSplit {
  id: string;
  transactionId: string;
  partnerId?: string;
  shareAmount: number;
  isInitialInvestment: boolean;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  startupCosts: number;
  currentBalance: number;
  bankBalance: number;
  personalBalance: number;
  netProfit: number;
  roiPercentage: number;
  ownerA: {
    invested: number;
    revenueHandled: number;
    expensesHandled: number;
    withdrawals: number;
    settlement: number;
    startupCosts: number;
  };
  ownerB: {
    invested: number;
    revenueHandled: number;
    expensesHandled: number;
    withdrawals: number;
    settlement: number;
    startupCosts: number;
  };
}

export interface CloudConfig {
  url: string;
  key: string;
}

export interface BankBalanceTransaction {
  id: string;
  amount: number;
  type: TransactionType;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}

export type UserRole = 'admin' | 'employee';

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  customerId: string;
  vehicleId: string;
  scheduledAt: string;
  serviceCategoryIds: string[];
  notes?: string;
  cancelledReason?: string;
  linkedCheckoutOrderId?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export type EmployeePageKey =
  | 'overview'
  | 'transactions'
  | 'input'
  | 'startup'
  | 'balance'
  | 'settings'
  | 'audit'
  | 'notes'
  | 'customers'
  | 'vehicles'
  | 'checkout'
  | 'completed_checkout'
  | 'service_lifecycle'
  | 'categories'
  | 'accounts'
  | 'memberships'
  | 'charging'
  | 'appointments';

export interface EmployeeUser {
  id: string;
  username: string;
  isActive: boolean;
  hideFinancialData: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeePagePermission {
  id: string;
  username: string;
  pageKey: EmployeePageKey;
  canView: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ChargingStatus = 'IDLE' | 'CHARGING' | 'COMPLETED';

export interface ChargingRateConfig {
  id: string;
  name: string;
  costPerKwh: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ChargingSession {
  id: string;
  status: ChargingStatus;
  customerId: string;
  vehicleId: string;
  meterAtStart: number;
  meterAtEnd?: number;
  currentMeterSnapshot: number;
  consumedKwh?: number;
  ratePerKwh?: number;
  amount?: number;
  gapKwh?: number;
  gapTransactionId?: string;
  gapConfirmed?: boolean;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt?: string;
}
