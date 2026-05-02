
import { createClient } from '@supabase/supabase-js';
import { Transaction, TransactionType, CloudConfig, AuditAction, AuditLog, Note, CategoryItem, Customer, CustomerGroup, Vehicle, BankBalanceTransaction, Account, AccountType, CurrencyExchangeRate, DiscountItem, CheckoutOrder, CheckoutOrderLine, CheckoutOrderStatus, MembershipTier, CustomerMembership, VehicleType, VehicleSize, PaymentCurrency, PaymentMethod, PaymentStatus, EmployeePageKey, EmployeePagePermission, EmployeeUser, ChargingRateConfig, ChargingSession, ChargingStatus, Appointment, AppointmentStatus } from '../types';
import { getPrimaryCategoryId, getTransactionAmount, getTransactionDescription, normalizeTransactionItems, parseItemsFromNotes, serializeItemsIntoNotes } from '../utils/transactionItems';
import { getSplitDisplayLabel, getTransactionSplit } from '../utils/transactionSplit';

let supabase: any = null;
let supabaseUrl: string | null = null;

export type SyncRemoteTransactionsResult = {
  success: boolean;
  error?: string;
  details?: string;
  code?: 'VALIDATION_ERROR' | 'DUPLICATE_ID' | 'UPSERT_ERROR' | 'SUPABASE_NOT_INITIALIZED' | 'EXCEPTION';
  failedTransactionIds?: string[];
  failedChunkIndex?: number;
  attemptedCount?: number;
  completedChunks?: number;
};

export type VehicleModelCatalogEntry = {
  id: string;
  makeEn: string;
  makeZh?: string;
  modelEn: string;
  modelZh?: string;
  vehicleTypeEn: string;
  vehicleTypeZh?: string;
  marketScope?: string;
  isActive: boolean;
};

type SyncedTransactionRow = {
  id: string;
  receipt_number: string;
  occurred_at: string;
  type: TransactionType;
  category_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  amount: number;
  description: string;
  contributed_by: string;
  updated_at: string;
  image_url: string | null;
  is_initial_investment: boolean;
  notes: string;
  customer_id: string | null;
  split_mode: string | null;
  split_ratio_a: number | null;
  split_ratio_b: number | null;
  checkout_order_id: string | null;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  payment_currency: PaymentCurrency | null;
};

const VALID_TRANSACTION_TYPES = new Set(Object.values(TransactionType));
const VALID_ACCOUNT_TYPES = new Set(Object.values(AccountType));
const VALID_CHECKOUT_ORDER_STATUSES = new Set(Object.values(CheckoutOrderStatus));
const VALID_PAYMENT_STATUSES = new Set<PaymentStatus>(['pending', 'paid']);
const VALID_PAYMENT_METHODS = new Set<PaymentMethod>(Object.values(PaymentMethod));
const VALID_PAYMENT_CURRENCIES = new Set<PaymentCurrency>(Object.values(PaymentCurrency));
const VALID_CHARGING_STATUSES = new Set<ChargingStatus>(['IDLE', 'CHARGING', 'COMPLETED']);
const FIXED_MEMBERSHIP_TIER_NAME_BY_ID: Record<string, string> = {
  tier_guest: 'Guest',
  tier_plus: 'Plus',
  tier_priority: 'Priority',
  tier_platinum: 'Platinum',
  tier_sapphire: 'Sapphire',
};
const REGULAR_VEHICLE_TYPES = new Set<string>([
  VehicleType.SEDAN,
  VehicleType.HATCHBACK,
  VehicleType.WAGON,
  VehicleType.COUPE,
  VehicleType.SPORTS,
]);
const LARGE_VEHICLE_TYPES = new Set<string>([
  VehicleType.CROSSOVER,
  VehicleType.SUV,
  VehicleType.OFFROAD,
  VehicleType.PICKUP,
  VehicleType.MPV,
  VehicleType.VAN,
  VehicleType.LIMOUSINE,
]);

export const DEFAULT_EMPLOYEE_PAGE_KEYS: EmployeePageKey[] = ['transactions', 'input', 'settings', 'vehicles', 'customers', 'completed_checkout', 'service_lifecycle', 'charging', 'appointments'];

const normalizeChargingStatus = (value: unknown): ChargingStatus => {
  if (typeof value !== 'string') return 'IDLE';
  const normalized = value.trim().toUpperCase();
  return VALID_CHARGING_STATUSES.has(normalized as ChargingStatus)
    ? (normalized as ChargingStatus)
    : 'IDLE';
};

const normalizeMeterValue = (value: unknown, fallback = 0): number => {
  const parsed = normalizeNumber(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed * 10) / 10;
};

const normalizeCheckoutOrderStatus = (value: unknown): CheckoutOrderStatus => {
  if (typeof value !== 'string') return CheckoutOrderStatus.DRAFT;
  const trimmed = value.trim().toLowerCase();
  return VALID_CHECKOUT_ORDER_STATUSES.has(trimmed as CheckoutOrderStatus)
    ? (trimmed as CheckoutOrderStatus)
    : CheckoutOrderStatus.DRAFT;
};

const normalizePaymentStatus = (value: unknown, fallback: PaymentStatus = 'pending'): PaymentStatus => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().toLowerCase();
  return VALID_PAYMENT_STATUSES.has(trimmed as PaymentStatus)
    ? (trimmed as PaymentStatus)
    : fallback;
};

const normalizePaymentMethod = (value: unknown): PaymentMethod | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return VALID_PAYMENT_METHODS.has(trimmed as PaymentMethod)
    ? (trimmed as PaymentMethod)
    : null;
};

const normalizePaymentCurrency = (value: unknown): PaymentCurrency | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  return VALID_PAYMENT_CURRENCIES.has(trimmed as PaymentCurrency)
    ? (trimmed as PaymentCurrency)
    : null;
};

const isPaymentMethodCurrencyCompatible = (
  method: PaymentMethod | null,
  currency: PaymentCurrency | null
): boolean => {
  if (!method || !currency) return true;
  if (method === PaymentMethod.FPS) return currency === PaymentCurrency.HKD;
  if (method === PaymentMethod.PAYME) return currency === PaymentCurrency.HKD;
  if (method === PaymentMethod.HKD_CASH) return currency === PaymentCurrency.HKD;
  if (method === PaymentMethod.RMB_CASH) return currency === PaymentCurrency.RMB;
  if (method === PaymentMethod.MOP_CASH) return currency === PaymentCurrency.MOP;
  if (method === PaymentMethod.MPAY) return currency === PaymentCurrency.MOP;
  return true;
};

const normalizeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeAccountType = (value: unknown): AccountType => {
  if (typeof value !== 'string') return AccountType.OTHER;

  const trimmed = value.trim();
  if (!trimmed) return AccountType.OTHER;

  const lowered = trimmed.toLowerCase();
  // Legacy alias support: map Owner to partner_personal.
  if (lowered === 'owner') {
    return AccountType.PARTNER_PERSONAL;
  }

  return VALID_ACCOUNT_TYPES.has(lowered as AccountType)
    ? (lowered as AccountType)
    : AccountType.OTHER;
};

const normalizeNullableText = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeRequiredText = (value?: string): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeUsername = (value?: string): string => normalizeRequiredText(value).toLowerCase();

const hashPassword = async (password: string): Promise<string> => {
  const source = normalizeRequiredText(password);
  if (!source) return '';

  const encoded = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
};

const normalizeOccurredAt = (value?: string): string | null => {
  const raw = normalizeRequiredText(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // Combine chosen date with the current wall-clock time so occurred_at
    // carries a real timestamp rather than midnight UTC.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const withTime = `${raw}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const d = new Date(withTime);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizeIsoTimestamp = (value?: string): string => {
  const raw = normalizeRequiredText(value);
  if (!raw) return new Date().toISOString();

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const normalizeVehicleType = (value: unknown): VehicleType | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (REGULAR_VEHICLE_TYPES.has(normalized) || LARGE_VEHICLE_TYPES.has(normalized)) {
    return normalized as VehicleType;
  }
  if (normalized === 'pick-up') return VehicleType.PICKUP;
  return undefined;
};

const deriveVehicleSizeFromType = (type?: VehicleType): VehicleSize | undefined => {
  if (!type) return undefined;
  if (LARGE_VEHICLE_TYPES.has(type)) return VehicleSize.LARGE;
  if (REGULAR_VEHICLE_TYPES.has(type)) return VehicleSize.REGULAR;
  return undefined;
};

const normalizeVehicleSize = (value: unknown, type?: VehicleType): VehicleSize | undefined => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === VehicleSize.LARGE || normalized === VehicleSize.REGULAR) {
      return normalized as VehicleSize;
    }
  }
  return deriveVehicleSizeFromType(type);
};

const isMissingCustomersWhatsappEnabledColumn = (error: any): boolean => {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    error?.code === '42703' ||
    (error?.code === 'PGRST204' && message.includes('whatsapp_enabled')) ||
    (message.includes('whatsapp_enabled') && message.includes('customers'))
  );
};

const isMissingCheckoutPreInspectionColumn = (error: any): boolean => {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    error?.code === '42703' ||
    (error?.code === 'PGRST204' && (
      message.includes('attention_details') ||
      message.includes('customer_additional_comments') ||
      message.includes('pre_inspection_completed') ||
      message.includes('pre_inspection_completed_at')
    )) ||
    (message.includes('checkout_sales') && (
      message.includes('attention_details') ||
      message.includes('customer_additional_comments') ||
      message.includes('pre_inspection_completed') ||
      message.includes('pre_inspection_completed_at')
    ))
  );
};

const buildReceiptNumber = (transaction: Transaction): string => {
  const existing = normalizeRequiredText(transaction.receiptNumber);
  if (existing) return existing;

  const normalizedId = normalizeRequiredText(transaction.id).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const suffix = (normalizedId.slice(-6) || Date.now().toString().slice(-6)).padStart(6, '0');
  return `REC-${suffix}`;
};

const buildTransactionItemId = (transactionId: string, item: Partial<Transaction['items'][number]>, index: number): string => {
  const rawSeed = normalizeRequiredText(item.id) || normalizeRequiredText(item.categoryId) || normalizeRequiredText(item.name);
  const normalizedSeed = rawSeed.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || `item_${index + 1}`;
  return `${transactionId}_item_${index + 1}_${normalizedSeed}`;
};

const isValidTransactionId = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(id);

const normalizeTransactionForSync = (transaction: Transaction): { row?: SyncedTransactionRow; errors: string[] } => {
  const errors: string[] = [];
  const id = normalizeRequiredText(transaction.id);
  const occurredAt = normalizeOccurredAt(transaction.date);
  const items = normalizeTransactionItems(transaction);
  const categoryId = normalizeRequiredText(getPrimaryCategoryId({ ...transaction, items }));
  const split = getTransactionSplit(transaction);
  const contributedBy = normalizeRequiredText(transaction.contributedBy) || normalizeRequiredText(getSplitDisplayLabel(transaction, 'en'));
  const type = transaction.type;
  const amount = Number(getTransactionAmount({ ...transaction, items }));
  const description = normalizeRequiredText(getTransactionDescription({ ...transaction, items }));
  const paymentMethod = normalizePaymentMethod(transaction.paymentMethod);
  const paymentCurrency = normalizePaymentCurrency(transaction.paymentCurrency);

  if (!id) {
    errors.push('Missing id');
  } else if (!isValidTransactionId(id)) {
    errors.push('Invalid id format');
  }

  if (!VALID_TRANSACTION_TYPES.has(type)) {
    errors.push(`Invalid type: ${String(type)}`);
  }

  if (!occurredAt) {
    errors.push('Invalid occurred_at/date value');
  }

  if (!categoryId) {
    errors.push('Missing category_id');
  }

  if (!contributedBy) {
    errors.push('Missing contributed_by');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push('Amount must be a number greater than 0');
  }

  if (!isPaymentMethodCurrencyCompatible(paymentMethod, paymentCurrency)) {
    errors.push('Invalid payment method/currency combination');
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    row: {
      id,
      receipt_number: buildReceiptNumber(transaction),
      occurred_at: occurredAt!,
      type,
      category_id: categoryId,
      from_account_id: normalizeNullableText(transaction.fromAccountId),
      to_account_id: normalizeNullableText(transaction.toAccountId),
      amount,
      description,
      contributed_by: contributedBy,
      updated_at: normalizeIsoTimestamp(transaction.updatedAt),
      image_url: normalizeNullableText(transaction.imageUrl),
      is_initial_investment: Boolean(transaction.isInitialInvestment),
      notes: serializeItemsIntoNotes(items, transaction.notes),
      customer_id: normalizeNullableText(transaction.customerId),
      split_mode: split.isSplit ? split.splitMode : null,
      split_ratio_a: split.isSplit ? Number(split.splitRatioA.toFixed(4)) : null,
      split_ratio_b: split.isSplit ? Number(split.splitRatioB.toFixed(4)) : null,
      checkout_order_id: normalizeNullableText(transaction.checkoutOrderId),
      payment_status: normalizePaymentStatus(transaction.paymentStatus, 'paid'),
      payment_method: paymentMethod,
      payment_currency: paymentCurrency,
      currency: transaction.currency || PaymentCurrency.RMB,
      payment_amount: transaction.paymentAmount == null ? null : Math.max(0, normalizeNumber(transaction.paymentAmount, 0)),
    },
    errors
  };
};

export const initSupabase = (config: CloudConfig) => {
  console.log("initSupabase called with config:", { ...config, key: config.key ? "PRESENT" : "MISSING" });
  if (!config.url || !config.key) {
    console.warn("Supabase URL or Key missing in config!");
    return null;
  }
  try {
    const url = config.url.trim().replace(/\/$/, "");
    const key = config.key.trim();
    supabaseUrl = url;
    supabase = createClient(url, key);
    console.log("Supabase client created successfully.");
    return supabase;
  } catch (error) {
    console.error("Error creating Supabase client:", error);
    return null;
  }
};

// Internal retry wrapper for stability
const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isNetworkError = err instanceof Error && 
        (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('timeout'));
      
      if (!isNetworkError || i === maxRetries - 1) throw err;
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
};

export const logAuditEvent = async (
  action: AuditAction, 
  tableName: string, 
  recordId?: string, 
  changedBy?: string, 
  oldData?: any, 
  newData?: any
) => {
  if (!supabase) return;
  
  const log = {
    action,
    table_name: tableName,
    record_id: recordId,
    changed_by: changedBy,
    old_data: oldData,
    new_data: newData,
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('audit_logs').insert(log);
    if (error) console.error('Audit Log Error:', error);
  } catch (e) {
    console.error('Audit Log Exception:', e);
  }
};

export const fetchAuditLogs = async (): Promise<{ data: AuditLog[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })) as any;
    
    if (error) {
      return { data: null, error: error.message };
    }

    const mappedData = data?.map((l: any) => ({
      id: l.id,
      action: l.action,
      tableName: l.table_name,
      recordId: l.record_id,
      changedBy: l.changed_by,
      oldData: l.old_data,
      newData: l.new_data,
      createdAt: l.created_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
};

export const testConnection = async (config: CloudConfig): Promise<{ success: boolean; message: string; details?: string }> => {
  try {
    const tempClient = createClient(config.url.trim(), config.key.trim());
    
    // 1. Check Table Existence and Columns
    const { error: readError } = await tempClient.from('transactions').select('id, from_account_id, to_account_id, split_mode, split_ratio_a, split_ratio_b').limit(1);
    const { error: transactionItemsError } = await tempClient.from('transaction_items').select('id, transaction_id').limit(1);
    const { error: notesError } = await tempClient.from('notes').select('id').limit(1);
    const { error: accountsError } = await tempClient.from('accounts').select('id, name, type').limit(1);
    const { error: customersError } = await tempClient.from('customers').select('id').limit(1);
    const { error: employeeUsersError } = await tempClient.from('employee_users').select('id, username').limit(1);
    const { error: employeePermissionsError } = await tempClient.from('employee_page_permissions').select('id, username, page_key').limit(1);
    
    if (readError || transactionItemsError || notesError || accountsError || customersError || employeeUsersError || employeePermissionsError) {
      const missingTable = 
        (readError && readError.code === '42P01') ? 'transactions' :
        (transactionItemsError && transactionItemsError.code === '42P01') ? 'transaction_items' :
        (notesError && notesError.code === '42P01') ? 'notes' :
        (accountsError && accountsError.code === '42P01') ? 'accounts' :
        (customersError && customersError.code === '42P01') ? 'customers' :
        (employeeUsersError && (employeeUsersError.code === '42P01' || employeeUsersError.code === 'PGRST204')) ? 'employee_users' :
        (employeePermissionsError && (employeePermissionsError.code === '42P01' || employeePermissionsError.code === 'PGRST204')) ? 'employee_page_permissions' : null;

      if (missingTable) {
        return { 
          success: false, 
          message: `Table "${missingTable}" NOT FOUND`,
          details: `The "${missingTable}" table does not exist. Please run the SQL script in Supabase SQL Editor.`
        };
      }

      // Check for missing columns
      if (readError && (
        readError.message.includes('column "from_account_id" does not exist') ||
        readError.message.includes('column "to_account_id" does not exist') ||
        readError.message.includes('column "split_mode" does not exist') ||
        readError.message.includes('column "split_ratio_a" does not exist') ||
        readError.message.includes('column "split_ratio_b" does not exist')
      )) {
        return { success: false, message: 'Columns MISSING in "transactions"', details: 'The "transactions" table is missing account or split metadata columns. Please update your Supabase schema.' };
      }
      if (transactionItemsError && transactionItemsError.message.includes('column "transaction_id" does not exist')) {
        return { success: false, message: 'Columns MISSING in "transaction_items"', details: 'The "transaction_items" table is missing required columns. Please update your Supabase schema.' };
      }
      if (accountsError && (accountsError.message.includes('column "name" does not exist') || accountsError.message.includes('column "type" does not exist'))) {
        return { success: false, message: 'Column MISSING in "accounts"', details: 'The "accounts" table is missing required columns (name, type). Please update your Supabase schema.' };
      }

      return {
        success: false,
        message: `System Error: ${readError?.code || transactionItemsError?.code || notesError?.code || accountsError?.code || customersError?.code || employeeUsersError?.code || employeePermissionsError?.code}`,
        details: readError?.message || transactionItemsError?.message || notesError?.message || accountsError?.message || customersError?.message || employeeUsersError?.message || employeePermissionsError?.message
      };
    }

    // 2. Check Write Access (Permissions Check)
    const testId = "DIAGNOSTIC_" + Date.now();
    const { error: writeError } = await tempClient.from('transactions').upsert({
      id: testId,
      amount: 0,
      occurred_at: new Date().toISOString().substring(0, 10),
      type: 'EXPENSE',
      category_id: 'OTHER_ID',
      contributed_by: 'User 1',
      description: 'System Permissions Test',
      split_mode: null,
      split_ratio_a: null,
      split_ratio_b: null,
    });

    if (writeError) {
      if (writeError.message.includes('permission denied')) {
        return {
          success: false,
          message: 'WRITE DENIED',
          details: 'The table exists, but your API key is blocked. Run "ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;" in SQL Editor.'
        };
      }
      return {
        success: false,
        message: 'DATABASE REJECTED WRITE',
        details: writeError.message
      };
    }

    const { error: transactionItemWriteError } = await tempClient.from('transaction_items').upsert({
      id: `${testId}_ITEM`,
      transaction_id: testId,
      category_id: 'OTHER_ID',
      name: 'System Permissions Test Item',
      price: 0,
      notes: null,
    });

    if (transactionItemWriteError) {
      await tempClient.from('transactions').delete().eq('id', testId);
      if (transactionItemWriteError.message.includes('permission denied')) {
        return {
          success: false,
          message: 'WRITE DENIED',
          details: 'The "transaction_items" table exists, but your API key is blocked. Run "ALTER TABLE transaction_items DISABLE ROW LEVEL SECURITY;" in SQL Editor.'
        };
      }
      return {
        success: false,
        message: 'DATABASE REJECTED ITEM WRITE',
        details: transactionItemWriteError.message
      };
    }

    // Cleanup test record
    await tempClient.from('transaction_items').delete().eq('transaction_id', testId);
    await tempClient.from('transactions').delete().eq('id', testId);
    
    return { 
      success: true, 
      message: 'CONNECTION PERFECT', 
      details: 'Read and Write permissions are active. Your data will now sync safely.' 
    };
  } catch (e: any) {
    return { 
      success: false, 
      message: 'NETWORK ERROR', 
      details: e.message || 'Check your Supabase URL or internet connection.'
    };
  }
};

export const fetchTransactions = async (): Promise<{ data: Transaction[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    // Fetch all transactions
    const { data: txs, error } = await withRetry(() => supabase!
      .from('transactions')
      .select('*')
      .order('occurred_at', { ascending: false })) as any;
    if (error) {
      console.error('Supabase Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    // Fetch all items for these transactions
    const txIds = (txs || []).map((t: any) => t.id);
    let itemsByTx: Record<string, any[]> = {};
    if (txIds.length > 0) {
      const { data: items, error: itemsError } = await withRetry<any>(() => supabase!
        .from('transaction_items')
        .select('*')
        .in('transaction_id', txIds));
      if (itemsError) {
        console.error('Supabase Items Fetch Error:', itemsError);
        return { data: null, error: `[${itemsError.code}] ${itemsError.message}` };
      }
      for (const item of items) {
        if (!itemsByTx[item.transaction_id]) itemsByTx[item.transaction_id] = [];
        itemsByTx[item.transaction_id].push({
          id: item.id,
          transactionId: item.transaction_id,
          categoryId: item.category_id,
          name: item.name,
          price: Number(item.price),
          notes: item.notes,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        });
      }
    }

    const mappedData = (txs || []).map((t: any) => {
      const storedAmount = Number(t.amount) || 0;
      const parsedNotes = parseItemsFromNotes(t.notes, {
        items: itemsByTx[t.id] || [],
        categoryId: t.category_id,
        description: t.description,
        amount: storedAmount,
      });
      const items = parsedNotes.items;
      const resolvedAmount = items.length > 0
        ? items.reduce((sum, item) => sum + (Number(item.price) || 0), 0)
        : storedAmount;
      const transaction: Transaction = {
        id: t.id,
        receiptNumber: t.receipt_number,
        date: typeof t.occurred_at === 'string' ? t.occurred_at.slice(0, 10) : t.occurred_at,
        type: t.type,
        items,
        categoryId: t.category_id,
        fromAccountId: t.from_account_id,
        toAccountId: t.to_account_id,
        amount: resolvedAmount,
        description: t.description,
        contributedBy: t.contributed_by,
        updatedAt: t.updated_at,
        imageUrl: t.image_url,
        isInitialInvestment: t.is_initial_investment,
        notes: parsedNotes.notes,
        customerId: t.customer_id,
        splitMode: t.split_mode ?? undefined,
        splitRatioA: typeof t.split_ratio_a === 'number' ? Number(t.split_ratio_a) : undefined,
        splitRatioB: typeof t.split_ratio_b === 'number' ? Number(t.split_ratio_b) : undefined,
        checkoutOrderId: t.checkout_order_id || undefined,
        paymentStatus: normalizePaymentStatus(t.payment_status, 'paid'),
        paymentMethod: normalizePaymentMethod(t.payment_method) || undefined,
        paymentCurrency: normalizePaymentCurrency(t.payment_currency) || undefined,
        currency: normalizePaymentCurrency(t.currency) || PaymentCurrency.RMB,
        paymentAmount: t.payment_amount == null ? undefined : Math.max(0, normalizeNumber(t.payment_amount, 0)),
      };
      return {
        ...transaction,
        amount: transaction.amount,
        description: transaction.description,
        categoryId: transaction.categoryId,
      };
    });
    return { data: mappedData, error: undefined };
  } catch (e: any) {
    console.error('Fetch exception:', e);
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const subscribeToTransactions = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('any')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => onUpdate())
    .subscribe();
};

export const syncRemoteTransactions = async (transactions: Transaction[]): Promise<SyncRemoteTransactionsResult> => {
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase not initialized',
      code: 'SUPABASE_NOT_INITIALIZED',
      attemptedCount: transactions.length,
      completedChunks: 0
    };
  }
  if (transactions.length === 0) return { success: true };

  try {
    const validationFailures: string[] = [];
    const cleanTransactions: SyncedTransactionRow[] = [];
    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();

    for (const transaction of transactions) {
      const normalized = normalizeTransactionForSync(transaction);
      if (!normalized.row) {
        const idForError = normalizeRequiredText(transaction.id) || '(missing-id)';
        validationFailures.push(`${idForError}: ${normalized.errors.join(', ')}`);
        continue;
      }

      if (seenIds.has(normalized.row.id)) {
        duplicateIds.add(normalized.row.id);
      } else {
        seenIds.add(normalized.row.id);
      }

      cleanTransactions.push(normalized.row);
    }

    if (duplicateIds.size > 0) {
      const ids = Array.from(duplicateIds);
      return {
        success: false,
        error: `Duplicate transaction IDs in batch: ${ids.join(', ')}`,
        details: 'Each transaction in a sync batch must have a unique id.',
        code: 'DUPLICATE_ID',
        failedTransactionIds: ids,
        attemptedCount: transactions.length,
        completedChunks: 0
      };
    }

    if (validationFailures.length > 0) {
      const failedIds = validationFailures
        .map(f => f.split(':')[0])
        .filter(Boolean);

      return {
        success: false,
        error: `Transaction validation failed for ${validationFailures.length} row(s).`,
        details: validationFailures.slice(0, 5).join(' | '),
        code: 'VALIDATION_ERROR',
        failedTransactionIds: failedIds,
        attemptedCount: transactions.length,
        completedChunks: 0
      };
    }

    const chunkSize = 5; // Slightly larger chunks for speed
    let completedChunks = 0;
    for (let i = 0; i < cleanTransactions.length; i += chunkSize) {
      const chunk = cleanTransactions.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize);
      // Upsert transactions
      const { error } = await supabase
        .from('transactions')
        .upsert(chunk, { onConflict: 'id' });
      if (error) {
        const failedIds = chunk.map(row => row.id);
        console.error('Sync Chunk Error:', { chunkIndex, failedIds, error });
        return {
          success: false,
          error: `[chunk ${chunkIndex + 1}] ${error.message}`,
          details: `Failed transaction IDs: ${failedIds.join(', ')}`,
          code: 'UPSERT_ERROR',
          failedTransactionIds: failedIds,
          failedChunkIndex: chunkIndex,
          attemptedCount: cleanTransactions.length,
          completedChunks
        };
      }

      // Upsert transaction_items for each transaction in the chunk
      for (const tx of transactions.filter(t => chunk.some(row => row.id === t.id))) {
        // Remove all existing items for this transaction (for simplicity)
        const { error: deleteItemsError } = await supabase
          .from('transaction_items')
          .delete()
          .eq('transaction_id', tx.id);
        if (deleteItemsError) {
          console.error('Delete transaction_items error:', { transactionId: tx.id, error: deleteItemsError });
          return {
            success: false,
            error: `[transaction_items delete] ${deleteItemsError.message}`,
            details: `Failed transaction ID: ${tx.id}`,
            code: 'UPSERT_ERROR',
            failedTransactionIds: [tx.id],
            failedChunkIndex: chunkIndex,
            attemptedCount: cleanTransactions.length,
            completedChunks
          };
        }
        // Insert new items
        if (Array.isArray(tx.items) && tx.items.length > 0) {
          const itemsToInsert = tx.items.map((item, index) => ({
            id: normalizeRequiredText(item.id) || buildTransactionItemId(tx.id, item, index),
            transaction_id: tx.id,
            category_id: item.categoryId,
            name: item.name,
            price: item.price,
            notes: item.notes || null,
            created_at: item.createdAt || new Date().toISOString(),
            updated_at: item.updatedAt || new Date().toISOString(),
          }));
          if (itemsToInsert.length > 0) {
            const { error: itemsUpsertError } = await supabase
              .from('transaction_items')
              .upsert(itemsToInsert, { onConflict: 'id' });
            if (itemsUpsertError) {
              console.error('Upsert transaction_items error:', { transactionId: tx.id, error: itemsUpsertError, itemsToInsert });
              return {
                success: false,
                error: `[transaction_items upsert] ${itemsUpsertError.message}`,
                details: `Failed transaction ID: ${tx.id}`,
                code: 'UPSERT_ERROR',
                failedTransactionIds: [tx.id],
                failedChunkIndex: chunkIndex,
                attemptedCount: cleanTransactions.length,
                completedChunks
              };
            }
          }
        }
      }

      completedChunks += 1;
    }
    return {
      success: true,
      attemptedCount: cleanTransactions.length,
      completedChunks
    };
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || 'Unexpected sync exception',
      code: 'EXCEPTION',
      attemptedCount: transactions.length
    };
  }
};

export const deleteRemoteTransaction = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    // Delete items first (if not using ON DELETE CASCADE)
    await supabase.from('transaction_items').delete().eq('transaction_id', id);
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    return !error;
  } catch (e) {
    return false;
  }
};

export const fetchRemoteNotes = async (): Promise<{ data: Note[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })) as any;
    
    if (error) {
      console.error('Supabase Notes Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((n: any) => ({
      id: n.id,
      content: n.content,
      createdBy: n.created_by,
      createdAt: n.created_at,
      updatedAt: n.updated_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteNotes = async (notes: Note[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (notes.length === 0) return { success: true };

  try {
    const cleanNotes = notes.map(n => ({
      id: n.id,
      content: n.content || '',
      created_by: n.createdBy,
      created_at: n.createdAt || new Date().toISOString(),
      updated_at: n.updatedAt || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('notes')
      .upsert(cleanNotes, { onConflict: 'id' });
    
    if (error) {
      console.error('Notes Sync Error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteRemoteNote = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('notes').delete().eq('id', id);
    return !error;
  } catch (e) {
    return false;
  }
};

export const clearAllRemoteData = async (): Promise<boolean> => {
  if (!supabase) return false;
  try {
    // Delete all rows by using a filter that matches everything
    const { error: trError } = await supabase.from('transactions').delete().neq('id', '_RESET_');
    const { error: notesError } = await supabase.from('notes').delete().neq('id', '_RESET_');
    return !trError && !notesError;
  } catch (e) {
    console.error('Clear data error:', e);
    return false;
  }
};

export const subscribeToNotes = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('notes_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => onUpdate())
    .subscribe();
};

export const fetchRemoteCategories = async (): Promise<{ data: CategoryItem[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true })) as any;
    
    if (error) {
      console.error('Supabase Categories Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      description: c.description,
      price: typeof c.price === 'number' ? c.price : Number(c.price || 0),
      imageUrl: c.image_url,
      estimatedDurationMinutes: Math.max(0, Math.round(normalizeNumber(c.estimated_duration_minutes, 30))),
      isActiveService: c.is_active_service !== false,
      itemCategory: c.item_category ?? undefined,
      notSoldSeparately: c.not_sold_separately === true,
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteCategories = async (categories: CategoryItem[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (categories.length === 0) return { success: true };

  try {
    const cleanCategories = categories.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      created_at: c.createdAt || new Date().toISOString(),
      updated_at: c.updatedAt || new Date().toISOString(),
      description: c.description || null,
      price: Number.isFinite(c.price as number) ? Number(c.price) : 0,
      image_url: c.imageUrl || null,
      estimated_duration_minutes: Number.isFinite(c.estimatedDurationMinutes as number)
        ? Math.max(0, Math.round(Number(c.estimatedDurationMinutes)))
        : 30,
      is_active_service: c.isActiveService !== false,
      item_category: c.itemCategory ?? null,
      not_sold_separately: c.notSoldSeparately === true,
    }));

    const { error } = await supabase
      .from('categories')
      .upsert(cleanCategories, { onConflict: 'id' });
    
    if (error) {
      console.error('Categories Sync Error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const reserveNextCategoryId = async (prefix: 'rev' | 'exp'): Promise<{ id?: string; error?: string }> => {
  if (!supabase) return { error: 'Supabase not initialized' };

  try {
    const { data, error } = await supabase.rpc('reserve_next_category_id', { p_prefix: prefix });
    if (error) {
      return { error: error.message };
    }

    const reserved = typeof data === 'string' ? data.trim() : '';
    if (!reserved) {
      return { error: 'Empty ID returned by reserve_next_category_id' };
    }

    return { id: reserved };
  } catch (e: any) {
    return { error: e?.message || 'Failed to reserve category ID' };
  }
};

export const deleteRemoteCategory = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    return !error;
  } catch (e) {
    return false;
  }
};

export const fetchRemoteBankBalanceTransactions = async (): Promise<{ data: BankBalanceTransaction[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('bank_balance_transactions')
      .select('*')
      .order('created_at', { ascending: false })) as any;
    
    if (error) {
      console.error('Supabase Bank Balance Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((t: any) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceBefore: t.balance_before,
      balanceAfter: t.balance_after,
      createdAt: t.created_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteBankBalanceTransactions = async (transactions: BankBalanceTransaction[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (transactions.length === 0) return { success: true };

  try {
    const cleanTransactions = transactions.map(t => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balance_before: t.balanceBefore,
      balance_after: t.balanceAfter,
      created_at: t.createdAt || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('bank_balance_transactions')
      .upsert(cleanTransactions, { onConflict: 'id' });
    
    if (error) {
      console.error('Bank Balance Sync Error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const subscribeToBankBalanceTransactions = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('bank_balance_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_balance_transactions' }, () => onUpdate())
    .subscribe();
};

export const subscribeToCategories = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('categories_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => onUpdate())
    .subscribe();
};

export const fetchRemoteDiscounts = async (): Promise<{ data: DiscountItem[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('discounts')
      .select('*')
      .order('created_at', { ascending: true })) as any;

    if (error) {
      console.error('Supabase Discounts Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      code: d.code || undefined,
      effectType: d.effect_type === 'surcharge' ? 'surcharge' : 'discount',
      amountType: d.amount_type === 'percent' ? 'percent' : 'fixed',
      amount: typeof d.amount === 'number' ? d.amount : Number(d.amount || 0),
      category: d.category || '',
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteDiscounts = async (discounts: DiscountItem[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (discounts.length === 0) return { success: true };

  try {
    const cleanDiscounts = discounts.map(d => ({
      id: d.id,
      name: d.name,
      code: d.code || null,
      effect_type: d.effectType === 'surcharge' ? 'surcharge' : 'discount',
      amount_type: d.amountType,
      amount: Number.isFinite(d.amount) ? d.amount : 0,
      category: d.category || null,
      created_at: d.createdAt || new Date().toISOString(),
      updated_at: d.updatedAt || new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('discounts')
      .upsert(cleanDiscounts, { onConflict: 'id' });

    if (error) {
      console.error('Discounts Sync Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteRemoteDiscount = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('discounts').delete().eq('id', id);
    return !error;
  } catch (e) {
    return false;
  }
};

export const subscribeToDiscounts = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('discounts_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'discounts' }, () => onUpdate())
    .subscribe();
};

export const fetchRemoteCheckoutOrders = async (): Promise<{ data: CheckoutOrder[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data: salesRows, error: salesError } = await withRetry(() => supabase!
      .from('checkout_sales')
      .select('*')
      .order('check_in_at', { ascending: false })) as any;

    if (salesError) {
      return { data: null, error: `[${salesError.code}] ${salesError.message}` };
    }

    const saleIds: string[] = (salesRows || []).map((row: any) => row.id);
    let lineRows: any[] = [];

    if (saleIds.length > 0) {
      const { data, error } = await withRetry(() => supabase!
        .from('checkout_line_items')
        .select('*')
        .in('sale_id', saleIds)
        .order('created_at', { ascending: true })) as any;

      if (error) {
        return { data: null, error: `[${error.code}] ${error.message}` };
      }
      lineRows = data || [];
    }

    const linesBySale = new Map<string, CheckoutOrderLine[]>();
    for (const row of lineRows) {
      const list = linesBySale.get(row.sale_id) || [];
      list.push({
        id: row.id,
        saleId: row.sale_id,
        categoryId: row.category_id || undefined,
        name: row.name,
        quantity: Math.max(0, Math.round(normalizeNumber(row.quantity, 1))),
        unitPrice: normalizeNumber(row.unit_price, normalizeNumber(row.price, 0)),
        lineSubtotal: normalizeNumber(row.line_subtotal, normalizeNumber(row.price, 0)),
        estimatedDurationMinutes: Math.max(0, Math.round(normalizeNumber(row.estimated_duration_minutes, 0))),
        serviceNameSnapshot: row.service_name_snapshot || undefined,
        isDiscount: row.is_discount === true,
        createdAt: row.created_at,
        updatedAt: row.updated_at || undefined,
      });
      linesBySale.set(row.sale_id, list);
    }

    const orders: CheckoutOrder[] = (salesRows || []).map((row: any) => ({
      id: row.id,
      customerId: row.customer_id || undefined,
      vehicleId: row.vehicle_id || undefined,
      status: normalizeCheckoutOrderStatus(row.status),
      occurredAt: row.occurred_at || undefined,
      checkInAt: row.check_in_at || undefined,
      committedAt: row.committed_at || undefined,
      checkedOutAt: row.checked_out_at || undefined,
      preWorkRequirement: row.pre_work_requirement || undefined,
      inProgressNote: row.in_progress_note || undefined,
      postWorkNote: row.post_work_note || undefined,
      inProgressAt: row.in_progress_at || undefined,
      taskCompletedAt: row.task_completed_at || undefined,
      preInspectionCompleted: row.pre_inspection_completed === true,
      preInspectionCompletedAt: row.pre_inspection_completed_at || undefined,
      attentionDetails: Array.isArray(row.attention_details) ? row.attention_details : [],
      customerAdditionalComments: Array.isArray(row.customer_additional_comments) ? row.customer_additional_comments : [],
      grossAmount: normalizeNumber(row.gross_amount, normalizeNumber(row.subtotal, 0)),
      largeVehicleSurchargeApplied: row.large_vehicle_surcharge_applied === true,
      largeVehicleSurchargeRate: normalizeNumber(row.large_vehicle_surcharge_rate, 0),
      largeVehicleSurchargeAmount: normalizeNumber(row.large_vehicle_surcharge_amount, 0),
      discountCode: row.discount_code || undefined,
      surchargeCode: row.surcharge_code || undefined,
      membershipDiscountAmount: normalizeNumber(row.membership_discount_amount, 0),
      couponDiscountAmount: normalizeNumber(row.coupon_discount_amount, 0),
      netAmount: normalizeNumber(row.net_amount, normalizeNumber(row.subtotal, 0)),
      estimatedDurationMinutes: Math.max(0, Math.round(normalizeNumber(row.estimated_duration_minutes, 0))),
      estimatedFinishAt: row.estimated_finish_at || undefined,
      notes: row.notes || undefined,
      paymentStatus: normalizePaymentStatus(row.payment_status, 'pending'),
      paymentMethod: normalizePaymentMethod(row.payment_method) || undefined,
      paymentCurrency: normalizePaymentCurrency(row.payment_currency) || undefined,
      currency: normalizePaymentCurrency(row.currency) || PaymentCurrency.RMB,
      paymentAmount: row.payment_amount == null ? undefined : Math.max(0, normalizeNumber(row.payment_amount, 0)),
      appliedRate: row.applied_rate == null ? undefined : normalizeNumber(row.applied_rate, 0),
      paidAt: row.paid_at || undefined,
      linkedTransactionId: row.linked_transaction_id || undefined,
      invoiceNumber: row.invoice_number || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
      lines: linesBySale.get(row.id) || [],
    }));

    return { data: orders };
  } catch (e: any) {
    return { data: null, error: e?.message || 'Unknown network error' };
  }
};


export const syncRemoteCheckoutOrders = async (orders: CheckoutOrder[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (orders.length === 0) return { success: true };

  try {
    const now = new Date().toISOString();
    // Helper to generate invoice number atomically for checked-out orders
    async function assignInvoiceNumberIfNeeded(order: CheckoutOrder): Promise<string | undefined> {
      if (order.status !== 'checked_out') return order.invoiceNumber;
      if (order.invoiceNumber) return order.invoiceNumber;
      // Get year YY
      const checkedOutAt = order.checkedOutAt || now;
      const year = new Date(checkedOutAt).getFullYear();
      const yy = String(year).slice(-2);
      // Retry logic for concurrent requests (handle race condition)
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: runRow, error: runError } = await supabase
          .from('invoice_run_numbers')
          .select('last_run_number')
          .eq('year', year)
          .single();
        if (runRow && !runError) {
          const runNumber = runRow.last_run_number + 1;
          const { error: updateError } = await supabase
            .from('invoice_run_numbers')
            .update({ last_run_number: runNumber, updated_at: now })
            .eq('year', year);
          if (!updateError) {
            return `${yy}${String(runNumber).padStart(4, '0')}`;
          }
        } else {
          const { error: insertError } = await supabase
            .from('invoice_run_numbers')
            .insert([{ year, last_run_number: 1, updated_at: now }]);
          if (!insertError) {
            return `${yy}0001`;
          }
        }
        // Exponential backoff on retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 50));
      }
      throw new Error('Failed to assign invoice number after retries');
    }

    // Assign invoice numbers serially to avoid race condition on duplicate numbers
    const ordersWithInvoice: CheckoutOrder[] = [];
    for (const order of orders) {
      let invoiceNumber = order.invoiceNumber;
      if (order.status === 'checked_out' && !invoiceNumber) {
        invoiceNumber = await assignInvoiceNumberIfNeeded(order);
      }
      ordersWithInvoice.push({ ...order, invoiceNumber });
    }

    const cleanSales = ordersWithInvoice.map(order => ({
      id: order.id,
      customer_id: order.customerId || null,
      vehicle_id: order.vehicleId || null,
      subtotal: normalizeNumber(order.grossAmount),
      status: normalizeCheckoutOrderStatus(order.status),
      check_in_at: order.checkInAt || order.occurredAt || now,
      committed_at: order.committedAt || null,
      checked_out_at: order.checkedOutAt || null,
      pre_work_requirement: normalizeNullableText(order.preWorkRequirement),
      in_progress_note: normalizeNullableText(order.inProgressNote),
      post_work_note: normalizeNullableText(order.postWorkNote),
      in_progress_at: order.inProgressAt || null,
      task_completed_at: order.taskCompletedAt || null,
      pre_inspection_completed: order.preInspectionCompleted === true,
      pre_inspection_completed_at: order.preInspectionCompletedAt || null,
      attention_details: Array.isArray(order.attentionDetails) ? order.attentionDetails : [],
      customer_additional_comments: Array.isArray(order.customerAdditionalComments) ? order.customerAdditionalComments : [],
      gross_amount: Math.max(0, normalizeNumber(order.grossAmount)),
      large_vehicle_surcharge_applied: order.largeVehicleSurchargeApplied === true,
      large_vehicle_surcharge_rate: Math.max(0, normalizeNumber(order.largeVehicleSurchargeRate, 0)),
      large_vehicle_surcharge_amount: Math.max(0, normalizeNumber(order.largeVehicleSurchargeAmount, 0)),
      discount_code: normalizeNullableText(order.discountCode),
      surcharge_code: normalizeNullableText(order.surchargeCode),
      membership_discount_amount: Math.max(0, normalizeNumber(order.membershipDiscountAmount)),
      coupon_discount_amount: Math.max(0, normalizeNumber(order.couponDiscountAmount)),
      net_amount: Math.max(0, normalizeNumber(order.netAmount)),
      payment_status: normalizePaymentStatus(order.paymentStatus, 'pending'),
      payment_method: normalizePaymentMethod(order.paymentMethod),
      payment_currency: normalizePaymentCurrency(order.paymentCurrency) || PaymentCurrency.RMB,
      currency: normalizePaymentCurrency(order.currency) || PaymentCurrency.RMB,
      payment_amount: order.paymentAmount == null ? null : Math.max(0, normalizeNumber(order.paymentAmount, 0)),
      applied_rate: order.appliedRate == null ? null : normalizeNumber(order.appliedRate, 0),
      paid_at: order.paidAt || null,
      linked_transaction_id: normalizeNullableText(order.linkedTransactionId),
      estimated_duration_minutes: Math.max(0, Math.round(normalizeNumber(order.estimatedDurationMinutes))),
      estimated_finish_at: order.estimatedFinishAt || null,
      notes: normalizeNullableText(order.notes),
      occurred_at: order.occurredAt || order.checkInAt || now,
      created_at: order.createdAt || now,
      updated_at: order.updatedAt || now,
      invoice_number: order.invoiceNumber || null,
    }));

    const { error: salesError } = await supabase
      .from('checkout_sales')
      .upsert(cleanSales, { onConflict: 'id' });

    if (salesError) {
      if (!isMissingCheckoutPreInspectionColumn(salesError)) {
        return { success: false, error: salesError.message };
      }

      // Retry without new pre-inspection columns if migration/cache is behind.
      const legacyCleanSales = cleanSales.map((row: any) => {
        const {
          pre_inspection_completed,
          pre_inspection_completed_at,
          attention_details,
          customer_additional_comments,
          ...legacyRow
        } = row;
        return legacyRow;
      });

      const { error: legacySalesError } = await supabase
        .from('checkout_sales')
        .upsert(legacyCleanSales, { onConflict: 'id' });

      if (legacySalesError) {
        return { success: false, error: legacySalesError.message };
      }
    }

    const saleIds = cleanSales.map(row => row.id);
    if (saleIds.length > 0) {
      const { error: deleteLinesError } = await supabase
        .from('checkout_line_items')
        .delete()
        .in('sale_id', saleIds);

      if (deleteLinesError) {
        return { success: false, error: deleteLinesError.message };
      }
    }

    const cleanLines = orders.flatMap(order => {
      const saleId = order.id;
      return (order.lines || []).map(line => {
        const quantity = Math.max(0, Math.round(normalizeNumber(line.quantity, 1)));
        const unitPrice = Math.max(0, normalizeNumber(line.unitPrice));
        const lineSubtotal = Math.max(0, normalizeNumber(line.lineSubtotal, unitPrice * quantity));
        const isDiscount = line.isDiscount === true;
        return {
          id: line.id,
          sale_id: saleId,
          category_id: line.categoryId || null,
          name: line.name,
          price: lineSubtotal,
          quantity,
          unit_price: unitPrice,
          line_subtotal: lineSubtotal,
          estimated_duration_minutes: Math.max(0, Math.round(normalizeNumber(line.estimatedDurationMinutes, 0))),
          service_name_snapshot: line.serviceNameSnapshot || line.name,
          is_discount: isDiscount,
          created_at: line.createdAt || now,
          updated_at: line.updatedAt || now,
        };
      });
    });

    if (cleanLines.length > 0) {
      const { error: linesError } = await supabase
        .from('checkout_line_items')
        .upsert(cleanLines, { onConflict: 'id' });

      if (linesError) {
        return { success: false, error: linesError.message };
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown sync error' };
  }
};

export const updateRemoteCheckoutOrderStatus = async (
  orderId: string,
  status: CheckoutOrderStatus,
  options?: {
    committedAt?: string;
    checkedOutAt?: string;
    inProgressAt?: string;
    taskCompletedAt?: string;
    notes?: string;
    preWorkRequirement?: string;
    inProgressNote?: string;
    postWorkNote?: string;
  }
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  try {
    const now = new Date().toISOString();
    const nextStatus = normalizeCheckoutOrderStatus(status);
    const patch: any = {
      status: nextStatus,
      updated_at: now,
    };

    if (nextStatus === CheckoutOrderStatus.COMMITTED) {
      patch.committed_at = options?.committedAt || now;
    }

    if (nextStatus === CheckoutOrderStatus.IN_PROGRESS) {
      patch.in_progress_at = options?.inProgressAt || now;
    }

    if (nextStatus === CheckoutOrderStatus.TASK_COMPLETED) {
      patch.task_completed_at = options?.taskCompletedAt || now;
    }

    if (nextStatus === CheckoutOrderStatus.CHECKED_OUT) {
      patch.checked_out_at = options?.checkedOutAt || now;
    }

    if (typeof options?.notes === 'string') {
      patch.notes = normalizeNullableText(options.notes);
    }

    if (typeof options?.preWorkRequirement === 'string') {
      patch.pre_work_requirement = normalizeNullableText(options.preWorkRequirement);
    }

    if (typeof options?.inProgressNote === 'string') {
      patch.in_progress_note = normalizeNullableText(options.inProgressNote);
    }

    if (typeof options?.postWorkNote === 'string') {
      patch.post_work_note = normalizeNullableText(options.postWorkNote);
    }

    const { error } = await supabase
      .from('checkout_sales')
      .update(patch)
      .eq('id', orderId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown status update error' };
  }
};

export const fetchRemoteExchangeRates = async (): Promise<{ data: CurrencyExchangeRate[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('currency_exchange_rates')
      .select('*')
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })) as any;

    if (error) {
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mapped: CurrencyExchangeRate[] = (data || []).map((row: any) => ({
      id: row.id,
      fromCurrency: normalizePaymentCurrency(row.from_currency) || PaymentCurrency.RMB,
      toCurrency: normalizePaymentCurrency(row.to_currency) || PaymentCurrency.RMB,
      rate: normalizeNumber(row.rate, 0),
      effectiveDate: row.effective_date,
      createdAt: row.created_at,
    }));

    return { data: mapped, error: undefined };
  } catch (e: any) {
    return { data: null, error: e?.message || 'Unknown network error' };
  }
};

export const syncRemoteExchangeRates = async (rates: CurrencyExchangeRate[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (rates.length === 0) return { success: true };

  try {
    const cleanRates = rates.map(rate => ({
      id: rate.id,
      from_currency: normalizePaymentCurrency(rate.fromCurrency) || PaymentCurrency.RMB,
      to_currency: normalizePaymentCurrency(rate.toCurrency) || PaymentCurrency.RMB,
      rate: normalizeNumber(rate.rate, 0),
      effective_date: rate.effectiveDate,
      created_at: rate.createdAt || new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('currency_exchange_rates')
      .upsert(cleanRates, { onConflict: 'id' });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown sync error' };
  }
};

export const deleteRemoteCheckoutOrder = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('checkout_sales').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
};

export const subscribeToCheckoutOrders = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('checkout_orders_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checkout_sales' }, () => onUpdate())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checkout_line_items' }, () => onUpdate())
    .subscribe();
};

export const findCustomerVehicleByLicensePlate = async (
  licensePlate: string
): Promise<{ data: { customer: Customer; vehicle: Vehicle } | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  const normalizedPlate = normalizeRequiredText(licensePlate).toUpperCase();
  if (!normalizedPlate) return { data: null, error: 'License plate is required' };

  try {
    const { data: vehicleRow, error: vehicleError } = await supabase
      .from('vehicles')
      .select('*')
      .ilike('license_plate', normalizedPlate)
      .limit(1)
      .maybeSingle();

    if (vehicleError) {
      return { data: null, error: vehicleError.message };
    }

    if (!vehicleRow) {
      return { data: null };
    }

    const vehicle: Vehicle = {
      id: vehicleRow.id,
      customerId: vehicleRow.customer_id,
      licensePlate: vehicleRow.license_plate,
      make: vehicleRow.make,
      model: vehicleRow.model,
      color: vehicleRow.color,
      vehicleType: normalizeVehicleType(vehicleRow.vehicle_type),
      vehicleSize: normalizeVehicleSize(vehicleRow.vehicle_size, normalizeVehicleType(vehicleRow.vehicle_type)),
      year: vehicleRow.year,
      vin: vehicleRow.vin,
      notes: vehicleRow.notes,
      createdAt: vehicleRow.created_at,
      updatedAt: vehicleRow.updated_at,
    };

    const { data: customerRow, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', vehicle.customerId)
      .limit(1)
      .maybeSingle();

    if (customerError) {
      return { data: null, error: customerError.message };
    }

    if (!customerRow) {
      return { data: null, error: 'Vehicle customer not found' };
    }

    const customer: Customer = {
      id: customerRow.id,
      name: customerRow.name,
      chineseName: customerRow.chinese_name,
      whatsappEnabled: Boolean(customerRow.whatsapp_enabled),
      group: customerRow.group_name,
      phone: customerRow.phone,
      countryCode: customerRow.country_code,
      vehicleId: customerRow.vehicle_id,
      companyCode: customerRow.company_code,
      birthday: customerRow.birthday,
      creditDays: Math.max(0, Math.round(normalizeNumber(customerRow.credit_days, 0))),
      notes: customerRow.notes,
      createdAt: customerRow.created_at,
      updatedAt: customerRow.updated_at,
    };

    return { data: { customer, vehicle } };
  } catch (e: any) {
    return { data: null, error: e?.message || 'Unknown license plate lookup error' };
  }
};

export const fetchRemoteCustomers = async (): Promise<{ data: Customer[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('customers')
      .select('*')
      .order('name', { ascending: true })) as any;
    
    if (error) {
      console.error('Supabase Customers Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      chineseName: c.chinese_name,
      whatsappEnabled: Boolean(c.whatsapp_enabled),
      group: c.group_name,
      phone: c.phone,
      countryCode: c.country_code,
      vehicleId: c.vehicle_id,
      companyCode: c.company_code,
      birthday: c.birthday,
      creditDays: Math.max(0, Math.round(normalizeNumber(c.credit_days, 0))),
      notes: c.notes,
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteCustomers = async (customers: Customer[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (customers.length === 0) return { success: true };

  try {
    const cleanCustomers = customers.map(c => ({
      id: c.id,
      name: c.name,
      chinese_name: c.chineseName || null,
      whatsapp_enabled: Boolean(c.whatsappEnabled),
      group_name: c.group || null,
      phone: c.phone || null,
      country_code: c.countryCode || null,
      vehicle_id: c.vehicleId || null,
      company_code: c.companyCode || null,
      birthday: c.birthday || null,
      credit_days: Math.max(0, Math.round(normalizeNumber(c.creditDays, 0))),
      notes: c.notes || null,
      created_at: c.createdAt || new Date().toISOString(),
      updated_at: c.updatedAt || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('customers')
      .upsert(cleanCustomers, { onConflict: 'id' });

    if (error && isMissingCustomersWhatsappEnabledColumn(error)) {
      const legacyCustomers = cleanCustomers.map(({ whatsapp_enabled, ...rest }) => rest);
      const { error: legacyError } = await supabase
        .from('customers')
        .upsert(legacyCustomers, { onConflict: 'id' });

      if (legacyError) {
        console.error('Customers Legacy Sync Error:', legacyError);
        return { success: false, error: legacyError.message };
      }

      return { success: true };
    }
    
    if (error) {
      console.error('Customers Sync Error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteRemoteCustomer = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) {
      console.error('Supabase Delete Customer Error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Delete Customer Exception:', e);
    return false;
  }
};

export const subscribeToCustomers = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('customers_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => onUpdate())
    .subscribe();
};

export const fetchRemoteCustomerGroups = async (): Promise<{ data: CustomerGroup[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('customer_groups')
      .select('*')
      .order('name', { ascending: true })) as any;

    if (error) {
      console.error('Supabase Customer Groups Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      createdAt: g.created_at,
      updatedAt: g.updated_at,
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteCustomerGroups = async (groups: CustomerGroup[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (groups.length === 0) return { success: true };

  try {
    const cleanGroups = groups.map(group => ({
      id: group.id,
      name: group.name,
      created_at: group.createdAt || new Date().toISOString(),
      updated_at: group.updatedAt || new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('customer_groups')
      .upsert(cleanGroups, { onConflict: 'id' });

    if (error) {
      console.error('Customer Groups Sync Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteRemoteCustomerGroup = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('customer_groups').delete().eq('id', id);
    if (error) {
      console.error('Supabase Delete Customer Group Error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Delete Customer Group Exception:', e);
    return false;
  }
};

export const subscribeToCustomerGroups = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('customer_groups_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_groups' }, () => onUpdate())
    .subscribe();
};

export const fetchRemoteVehicles = async (): Promise<{ data: Vehicle[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false })) as any;

    if (error) {
      console.error('Supabase Vehicles Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((v: any) => {
      const vehicleType = normalizeVehicleType(v.vehicle_type);
      return {
        id: v.id,
        customerId: v.customer_id,
        licensePlate: v.license_plate,
        make: v.make,
        model: v.model,
        color: v.color,
        vehicleType,
        vehicleSize: normalizeVehicleSize(v.vehicle_size, vehicleType),
        year: v.year,
        vin: v.vin,
        notes: v.notes,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      };
    });

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const fetchRemoteVehicleModelCatalog = async (): Promise<{ data: VehicleModelCatalogEntry[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const primaryQuery = () => supabase!
      .from('vehicle_model_catalog')
      .select('id,make_en,make_zh,model_en,model_zh,vehicle_type_en,vehicle_type_zh,market_scope,is_active')
      .order('make_en', { ascending: true })
      .order('model_en', { ascending: true });

    const fallbackQuery = () => supabase!
      .from('vehicle_model_catalog')
      .select('id,make_en,make_zh,model_en,model_zh,is_active');

    let data: any[] | null = null;
    let error: any = null;

    ({ data, error } = await withRetry(primaryQuery) as any);
    if (error) {
      // Retry with a minimal projection/order in case environment-specific constraints block the primary query.
      ({ data, error } = await withRetry(fallbackQuery) as any);
    }

    if (error) {
      return { data: null, error: error.message };
    }

    const mappedData: VehicleModelCatalogEntry[] = (data || []).map((row: any) => ({
      id: String(row.id || `${String(row.make_en || '').trim()}::${String(row.model_en || '').trim()}`),
      makeEn: String(row.make_en || '').trim(),
      makeZh: typeof row.make_zh === 'string' ? row.make_zh.trim() || undefined : undefined,
      modelEn: String(row.model_en || '').trim(),
      modelZh: typeof row.model_zh === 'string' ? row.model_zh.trim() || undefined : undefined,
      vehicleTypeEn: String(row.vehicle_type_en || '').trim(),
      vehicleTypeZh: typeof row.vehicle_type_zh === 'string' ? row.vehicle_type_zh.trim() || undefined : undefined,
      marketScope: typeof row.market_scope === 'string' ? row.market_scope.trim() || undefined : undefined,
      // Treat null/undefined is_active as active for backward compatibility.
      isActive: row?.is_active !== false,
    })).filter(entry => entry.makeEn && entry.modelEn && entry.isActive);

    return { data: mappedData };
  } catch (e: any) {
    return { data: null, error: e?.message || 'Unknown fetchRemoteVehicleModelCatalog error' };
  }
};

export const syncRemoteVehicles = async (vehicles: Vehicle[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (vehicles.length === 0) return { success: true };

  try {
    const cleanVehicles = vehicles.map(vehicle => {
      const vehicleType = normalizeVehicleType(vehicle.vehicleType);
      const vehicleSize = normalizeVehicleSize(vehicle.vehicleSize, vehicleType);
      return {
        id: vehicle.id,
        customer_id: vehicle.customerId,
        license_plate: vehicle.licensePlate || null,
        make: vehicle.make || null,
        model: vehicle.model || null,
        color: vehicle.color || null,
        vehicle_type: vehicleType || null,
        vehicle_size: vehicleSize || null,
        year: vehicle.year || null,
        vin: vehicle.vin || null,
        notes: vehicle.notes || null,
        created_at: vehicle.createdAt || new Date().toISOString(),
        updated_at: vehicle.updatedAt || new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('vehicles')
      .upsert(cleanVehicles, { onConflict: 'id' });

    if (error) {
      console.error('Vehicles Sync Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteRemoteVehicle = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) {
      console.error('Supabase Delete Vehicle Error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Delete Vehicle Exception:', e);
    return false;
  }
};

export const subscribeToVehicles = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('vehicles_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => onUpdate())
    .subscribe();
};

export const fetchRemoteChargingRates = async (): Promise<{ data: ChargingRateConfig[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('charging_rate_configs')
      .select('*')
      .order('created_at', { ascending: true })) as any;

    if (error) {
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mapped: ChargingRateConfig[] = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      costPerKwh: Math.max(0, normalizeNumber(row.cost_per_kwh, 0)),
      isActive: row.is_active === true,
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
    }));

    return { data: mapped };
  } catch (e: any) {
    return { data: null, error: e?.message || 'Unknown network error' };
  }
};

export const syncRemoteChargingRates = async (rates: ChargingRateConfig[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (rates.length === 0) return { success: true };

  try {
    const cleanRows = rates.map((rate) => ({
      id: rate.id,
      name: normalizeRequiredText(rate.name) || 'EV Charging',
      cost_per_kwh: Math.max(0, normalizeNumber(rate.costPerKwh, 0)),
      is_active: rate.isActive === true,
      created_at: rate.createdAt || new Date().toISOString(),
      updated_at: rate.updatedAt || new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('charging_rate_configs')
      .upsert(cleanRows, { onConflict: 'id' });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown sync error' };
  }
};

export const fetchRemoteChargingSessions = async (): Promise<{ data: ChargingSession[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('charging_sessions')
      .select('*')
      .order('started_at', { ascending: false })) as any;

    if (error) {
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mapped: ChargingSession[] = (data || []).map((row: any) => ({
      id: row.id,
      status: normalizeChargingStatus(row.status),
      customerId: row.customer_id,
      vehicleId: row.vehicle_id,
      meterAtStart: normalizeMeterValue(row.meter_at_start, 0),
      meterAtEnd: row.meter_at_end == null ? undefined : normalizeMeterValue(row.meter_at_end, 0),
      currentMeterSnapshot: normalizeMeterValue(row.current_meter_snapshot, 0),
      consumedKwh: row.consumed_kwh == null ? undefined : normalizeMeterValue(row.consumed_kwh, 0),
      ratePerKwh: row.rate_per_kwh == null ? undefined : Math.max(0, normalizeNumber(row.rate_per_kwh, 0)),
      amount: row.amount == null ? undefined : Math.max(0, normalizeNumber(row.amount, 0)),
      gapKwh: row.gap_kwh == null ? undefined : normalizeMeterValue(row.gap_kwh, 0),
      gapTransactionId: row.gap_transaction_id || undefined,
      gapConfirmed: row.gap_confirmed === true,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
    }));

    return { data: mapped };
  } catch (e: any) {
    return { data: null, error: e?.message || 'Unknown network error' };
  }
};

export const syncRemoteChargingSessions = async (sessions: ChargingSession[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (sessions.length === 0) return { success: true };

  try {
    const rows = sessions.map((session) => ({
      id: session.id,
      status: normalizeChargingStatus(session.status),
      customer_id: session.customerId,
      vehicle_id: session.vehicleId,
      meter_at_start: normalizeMeterValue(session.meterAtStart, 0),
      meter_at_end: session.meterAtEnd == null ? null : normalizeMeterValue(session.meterAtEnd, 0),
      current_meter_snapshot: normalizeMeterValue(session.currentMeterSnapshot, 0),
      consumed_kwh: session.consumedKwh == null ? null : normalizeMeterValue(session.consumedKwh, 0),
      rate_per_kwh: session.ratePerKwh == null ? null : Math.max(0, normalizeNumber(session.ratePerKwh, 0)),
      amount: session.amount == null ? null : Math.max(0, normalizeNumber(session.amount, 0)),
      gap_kwh: session.gapKwh == null ? null : normalizeMeterValue(session.gapKwh, 0),
      gap_transaction_id: normalizeNullableText(session.gapTransactionId),
      gap_confirmed: session.gapConfirmed === true,
      started_at: session.startedAt,
      completed_at: session.completedAt || null,
      created_at: session.createdAt || new Date().toISOString(),
      updated_at: session.updatedAt || new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('charging_sessions')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown sync error' };
  }
};

export const subscribeToChargingRates = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('charging_rates_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'charging_rate_configs' }, () => onUpdate())
    .subscribe();
};

export const subscribeToChargingSessions = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('charging_sessions_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'charging_sessions' }, () => onUpdate())
    .subscribe();
};

const VALID_APPOINTMENT_STATUSES = new Set<AppointmentStatus>(['PENDING', 'CONFIRMED', 'CANCELLED']);

const normalizeAppointmentStatus = (value: unknown): AppointmentStatus => {
  if (typeof value !== 'string') return 'PENDING';
  const normalized = value.trim().toUpperCase();
  return VALID_APPOINTMENT_STATUSES.has(normalized as AppointmentStatus)
    ? (normalized as AppointmentStatus)
    : 'PENDING';
};

export const fetchRemoteAppointments = async (): Promise<{ data: Appointment[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('appointments')
      .select('*')
      .order('scheduled_at', { ascending: false })) as any;
    if (error) return { data: null, error: `[${error.code}] ${error.message}` };
    const mapped: Appointment[] = (data || []).map((row: any) => ({
      id: row.id,
      status: normalizeAppointmentStatus(row.status),
      customerId: row.customer_id,
      vehicleId: row.vehicle_id,
      scheduledAt: row.scheduled_at,
      serviceCategoryIds: Array.isArray(row.service_category_ids) ? row.service_category_ids : [],
      notes: row.notes ?? undefined,
      cancelledReason: row.cancelled_reason ?? undefined,
      linkedCheckoutOrderId: row.linked_checkout_order_id ?? undefined,
      convertedAt: row.converted_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
    }));
    return { data: mapped };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
};

export const syncRemoteAppointments = async (appointments: Appointment[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  try {
    const rows = appointments.map(a => ({
      id: a.id,
      status: a.status,
      customer_id: a.customerId,
      vehicle_id: a.vehicleId,
      scheduled_at: a.scheduledAt,
      service_category_ids: a.serviceCategoryIds,
      notes: a.notes ?? null,
      cancelled_reason: a.cancelledReason ?? null,
      linked_checkout_order_id: a.linkedCheckoutOrderId ?? null,
      converted_at: a.convertedAt ?? null,
      created_at: a.createdAt,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('appointments').upsert(rows, { onConflict: 'id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const subscribeToAppointments = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('appointments_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => onUpdate())
    .subscribe();
};

export const checkActiveSessions = async (): Promise<{ active: boolean; error?: string }> => {
  if (!supabase) return { active: false, error: 'Supabase not initialized' };
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('admin_sessions')
      .select('*')
      .gt('expires_at', now);
    
    if (error) return { active: false, error: error.message };
    return { active: data && data.length > 0 };
  } catch (e: any) {
    return { active: false, error: e.message };
  }
};

export const createAdminSession = async (partnerId: string, sessionToken: string, expiresAt: string): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  try {
    const { error } = await supabase
      .from('admin_sessions')
      .upsert({ partner_id: partnerId, session_token: sessionToken, expires_at: expiresAt });
    
    return { success: !error, error: error?.message };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const updateAdminSession = async (sessionToken: string, expiresAt: string): Promise<void> => {
  if (!supabase) return;
  try {
    await supabase
      .from('admin_sessions')
      .update({ expires_at: expiresAt })
      .eq('session_token', sessionToken);
  } catch (e) {
    console.error('Session update error:', e);
  }
};

export const clearAdminSession = async (sessionToken: string): Promise<void> => {
  if (!supabase) return;
  try {
    await supabase
      .from('admin_sessions')
      .delete()
      .eq('session_token', sessionToken);
  } catch (e) {
    console.error('Session clear error:', e);
  }
};

export const clearAllAdminSessions = async (): Promise<void> => {
  if (!supabase) return;
  try {
    await supabase
      .from('admin_sessions')
      .delete()
      .neq('id', '_RESET_');
  } catch (e) {
    console.error('Clear all sessions error:', e);
  }
};

const isEmployeeTableMissing = (error: any): boolean =>
  error?.code === 'PGRST204' ||
  error?.code === '42P01' ||
  (typeof error?.message === 'string' && error.message.toLowerCase().includes('schema cache'));

const EMPLOYEE_TABLE_MISSING_MSG =
  `Employee tables are not set up in the database yet. Please run the employee setup SQL script in Supabase SQL Editor (Settings page -> copy SQL script). Current project: ${supabaseUrl || 'unknown'}`;

export const fetchEmployeeUsers = async (): Promise<{ data: EmployeeUser[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };

  try {
    const { data, error } = await withRetry(() => supabase!
      .from('employee_users')
      .select('id, username, is_active, hide_financial_data, created_at, updated_at')
      .order('username', { ascending: true })) as any;

    if (error) {
      if (isEmployeeTableMissing(error)) return { data: null, error: EMPLOYEE_TABLE_MISSING_MSG };
      return { data: null, error: error.message };
    }

    const mapped: EmployeeUser[] = (data || []).map((row: any) => ({
      id: row.id,
      username: row.username,
      isActive: row.is_active !== false,
      hideFinancialData: row.hide_financial_data !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { data: mapped };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const fetchEmployeePagePermissions = async (): Promise<{ data: EmployeePagePermission[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };

  try {
    const { data, error } = await withRetry(() => supabase!
      .from('employee_page_permissions')
      .select('id, username, page_key, can_view, created_at, updated_at')
      .order('username', { ascending: true })) as any;

    if (error) {
      if (isEmployeeTableMissing(error)) return { data: null, error: EMPLOYEE_TABLE_MISSING_MSG };
      return { data: null, error: error.message };
    }

    const mapped: EmployeePagePermission[] = (data || []).map((row: any) => ({
      id: row.id,
      username: row.username,
      pageKey: row.page_key,
      canView: row.can_view !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { data: mapped };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const saveEmployeeUser = async (params: {
  username: string;
  password?: string;
  isActive?: boolean;
  hideFinancialData?: boolean;
}): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };

  const username = normalizeUsername(params.username);
  if (!username) return { success: false, error: 'Username is required' };

  try {
    const { data: existing, error: existingError } = await supabase
      .from('employee_users')
      .select('id, username')
      .ilike('username', username)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      if (isEmployeeTableMissing(existingError)) return { success: false, error: EMPLOYEE_TABLE_MISSING_MSG };
      return { success: false, error: existingError.message };
    }

    const updates: any = {
      username,
      is_active: params.isActive !== false,
      hide_financial_data: params.hideFinancialData !== false,
      updated_at: new Date().toISOString(),
    };

    const normalizedPassword = normalizeRequiredText(params.password);
    if (normalizedPassword) {
      updates.password_hash = await hashPassword(normalizedPassword);
    }

    if (existing?.id) {
      const { error } = await supabase
        .from('employee_users')
        .update(updates)
        .eq('id', existing.id);
      return { success: !error, error: error?.message };
    }

    if (!normalizedPassword) {
      return { success: false, error: 'Password is required for new users' };
    }

    const row = {
      id: `emp_${crypto.randomUUID()}`,
      ...updates,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('employee_users')
      .insert(row);

    if (error) {
      if (isEmployeeTableMissing(error)) return { success: false, error: EMPLOYEE_TABLE_MISSING_MSG };
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const saveEmployeePagePermissions = async (
  usernameRaw: string,
  pageKeys: EmployeePageKey[]
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };

  const username = normalizeUsername(usernameRaw);
  if (!username) return { success: false, error: 'Username is required' };

  try {
    const { data: existingUser, error: userError } = await supabase
      .from('employee_users')
      .select('username')
      .ilike('username', username)
      .limit(1)
      .maybeSingle();

    if (userError) {
      return { success: false, error: userError.message };
    }

    if (!existingUser?.username) {
      return { success: false, error: 'Employee user not found' };
    }

    const canonicalUsername = normalizeUsername(existingUser.username);

    const { error: deleteError } = await supabase
      .from('employee_page_permissions')
      .delete()
      .ilike('username', canonicalUsername);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    const uniqueKeys = Array.from(new Set(pageKeys));
    if (uniqueKeys.length === 0) {
      return { success: true };
    }

    const now = new Date().toISOString();
    const rows = uniqueKeys.map((pageKey) => ({
      id: `epp_${crypto.randomUUID()}`,
      username: canonicalUsername,
      page_key: pageKey,
      can_view: true,
      created_at: now,
      updated_at: now,
    }));

    const { error } = await supabase
      .from('employee_page_permissions')
      .insert(rows);

    return { success: !error, error: error?.message };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const verifyEmployeeCredentials = async (
  usernameInput: string,
  passwordInput: string
): Promise<{
  success: boolean;
  error?: string;
  user?: EmployeeUser;
  allowedPageKeys?: EmployeePageKey[];
}> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };

  const username = normalizeUsername(usernameInput);
  const password = normalizeRequiredText(passwordInput);
  if (!username || !password) {
    return { success: false, error: 'Username and password are required' };
  }

  try {
    const { data: row, error } = await supabase
      .from('employee_users')
      .select('id, username, password_hash, is_active, hide_financial_data, created_at, updated_at')
      .ilike('username', username)
      .limit(1)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!row || row.is_active === false) {
      return { success: false, error: 'Invalid username or password' };
    }

    const providedHash = await hashPassword(password);
    if (!providedHash || row.password_hash !== providedHash) {
      return { success: false, error: 'Invalid username or password' };
    }

    const { data: permissionRows, error: permissionError } = await supabase
      .from('employee_page_permissions')
      .select('page_key, can_view')
      .ilike('username', row.username);

    if (permissionError) {
      return { success: false, error: permissionError.message };
    }

    const allowedPageKeys = (permissionRows || [])
      .filter((entry: any) => entry.can_view !== false)
      .map((entry: any) => entry.page_key as EmployeePageKey);

    const user: EmployeeUser = {
      id: row.id,
      username: row.username,
      isActive: row.is_active !== false,
      hideFinancialData: row.hide_financial_data !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return {
      success: true,
      user,
      allowedPageKeys: allowedPageKeys.length > 0 ? allowedPageKeys : [...DEFAULT_EMPLOYEE_PAGE_KEYS],
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const fetchRemoteAccounts = async (): Promise<{ data: Account[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('accounts')
      .select('*')
      .order('name', { ascending: true })) as any;
    
    if (error) {
      console.error('Supabase Accounts Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      type: normalizeAccountType(a.type),
      createdAt: a.created_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteAccounts = async (accounts: Account[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (accounts.length === 0) return { success: true };

  try {
    const cleanAccounts = accounts.map(a => ({
      id: a.id,
      name: a.name,
      type: normalizeAccountType(a.type),
      created_at: a.createdAt || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('accounts')
      .upsert(cleanAccounts, { onConflict: 'id' });
    
    if (error) {
      console.error('Accounts Sync Error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteRemoteAccount = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    return !error;
  } catch (e) {
    return false;
  }
};

export const subscribeToAccounts = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('accounts_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => onUpdate())
    .subscribe();
};

export const fetchRemoteMembershipTiers = async (): Promise<{ data: MembershipTier[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('membership_tiers')
      .select('*')
      .order('name', { ascending: true })) as any;

    if (error) {
      console.error('Supabase Membership Tiers Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      statusPointsThreshold: Math.max(0, Math.round(normalizeNumber(row.status_points_threshold, 0))),
      discountRate: normalizeNumber(row.discount_rate, 0),
      discountEligibleCarLimit: Math.max(0, Math.round(normalizeNumber(row.discount_eligible_car_limit, 0))),
      upgradeThreshold: Math.max(0, normalizeNumber(row.upgrade_threshold, 0)),
      priorityLevel: Math.max(0, Math.round(normalizeNumber(row.priority_level, 0))),
      exclusiveEvents: row.exclusive_events === true,
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      statusPoints: Math.max(0, Math.round(normalizeNumber(row.status_points, normalizeNumber(row.status_points_threshold, 0)))),
      birthdayGift: row.birthday_gift === true,
      discountedRate: normalizeNumber(row.discounted_rate, normalizeNumber(row.discount_rate, 0)),
      linkedLicensePlates: Math.max(0, Math.round(normalizeNumber(row.linked_license_plates, normalizeNumber(row.discount_eligible_car_limit, 0)))),
      complimentaryCarCareUpgrade: Math.max(0, Math.round(normalizeNumber(row.complimentary_car_care_upgrade, 0))),
      priorityWash: Math.max(0, Math.round(normalizeNumber(row.priority_wash, normalizeNumber(row.priority_level, 0)))),
      exclusiveInvitation: row.exclusive_invitation === true,
    }));

    return { data: mappedData };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteMembershipTiers = async (tiers: MembershipTier[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (tiers.length === 0) return { success: true };

  try {
    const rows = tiers
      .filter(tier => Object.prototype.hasOwnProperty.call(FIXED_MEMBERSHIP_TIER_NAME_BY_ID, tier.id))
      .map(tier => ({
      id: tier.id,
      // Keep DB-compatible fixed names even if stale local data differs.
      name: FIXED_MEMBERSHIP_TIER_NAME_BY_ID[tier.id] || tier.name,
      status_points_threshold: Math.max(0, Math.round(normalizeNumber(tier.statusPointsThreshold, tier.statusPoints))),
      discount_rate: Math.max(0, normalizeNumber(tier.discountRate, tier.discountedRate)),
      discount_eligible_car_limit: Math.max(0, Math.round(normalizeNumber(tier.discountEligibleCarLimit, tier.linkedLicensePlates))),
      upgrade_threshold: Math.max(0, normalizeNumber(tier.upgradeThreshold, 0)),
      priority_level: Math.max(0, Math.round(normalizeNumber(tier.priorityLevel, tier.priorityWash))),
      exclusive_events: tier.exclusiveEvents === true,
      is_active: tier.isActive !== false,
      created_at: tier.createdAt || new Date().toISOString(),
      updated_at: tier.updatedAt || new Date().toISOString(),
      status_points: Math.max(0, Math.round(normalizeNumber(tier.statusPoints, tier.statusPointsThreshold))),
      birthday_gift: tier.birthdayGift === true,
      discounted_rate: Math.max(0, normalizeNumber(tier.discountedRate, tier.discountRate)),
      linked_license_plates: Math.max(0, Math.round(normalizeNumber(tier.linkedLicensePlates, tier.discountEligibleCarLimit))),
      complimentary_car_care_upgrade: Math.max(0, Math.round(normalizeNumber(tier.complimentaryCarCareUpgrade, 0))),
      priority_wash: Math.max(0, Math.round(normalizeNumber(tier.priorityWash, tier.priorityLevel))),
      exclusive_invitation: tier.exclusiveInvitation === true,
    }));

    if (rows.length === 0) {
      return { success: false, error: 'No valid fixed membership tiers to sync (expected tier_guest/tier_plus/tier_priority/tier_platinum/tier_sapphire).' };
    }

    const { error } = await supabase
      .from('membership_tiers')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      console.error('Membership Tiers Sync Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const fetchRemoteCustomerMemberships = async (): Promise<{ data: CustomerMembership[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('customer_memberships')
      .select('*')
      .order('start_at', { ascending: false })) as any;

    if (error) {
      console.error('Supabase Customer Memberships Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((row: any) => ({
      id: row.id,
      customerId: row.customer_id,
      tierId: row.tier_id,
      discountRateSnapshot: normalizeNumber(row.discount_rate_snapshot, 0),
      discountEligibleCarLimitSnapshot: Math.max(0, Math.round(normalizeNumber(row.discount_eligible_car_limit_snapshot, 0))),
      priorityLevelSnapshot: Math.max(0, Math.round(normalizeNumber(row.priority_level_snapshot, 0))),
      exclusiveEventsSnapshot: row.exclusive_events_snapshot === true,
      statusPoints: Math.max(0, Math.round(normalizeNumber(row.status_points, 0))),
      startAt: row.start_at,
      endAt: row.end_at || undefined,
      isActive: row.is_active === true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      statusPointsSnapshot: Math.max(0, Math.round(normalizeNumber(row.status_points_snapshot, normalizeNumber(row.status_points, 0)))),
      birthdayGiftSnapshot: row.birthday_gift_snapshot === true,
      discountedRateSnapshot: normalizeNumber(row.discounted_rate_snapshot, normalizeNumber(row.discount_rate_snapshot, 0)),
      linkedLicensePlatesSnapshot: Math.max(0, Math.round(normalizeNumber(row.linked_license_plates_snapshot, normalizeNumber(row.discount_eligible_car_limit_snapshot, 0)))),
      complimentaryCarCareUpgradeSnapshot: Math.max(0, Math.round(normalizeNumber(row.complimentary_car_care_upgrade_snapshot, 0))),
      priorityWashSnapshot: Math.max(0, Math.round(normalizeNumber(row.priority_wash_snapshot, normalizeNumber(row.priority_level_snapshot, 0)))),
      exclusiveInvitationSnapshot: row.exclusive_invitation_snapshot === true,
    }));

    return { data: mappedData };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteCustomerMemberships = async (memberships: CustomerMembership[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (memberships.length === 0) return { success: true };

  try {
    const rows = memberships.map(membership => ({
      id: membership.id,
      customer_id: membership.customerId,
      tier_id: membership.tierId,
      discount_rate_snapshot: normalizeNumber(membership.discountRateSnapshot, membership.discountedRateSnapshot),
      discount_eligible_car_limit_snapshot: Math.max(0, Math.round(normalizeNumber(membership.discountEligibleCarLimitSnapshot, membership.linkedLicensePlatesSnapshot))),
      priority_level_snapshot: Math.max(0, Math.round(normalizeNumber(membership.priorityLevelSnapshot, membership.priorityWashSnapshot))),
      exclusive_events_snapshot: membership.exclusiveEventsSnapshot === true,
      status_points: Math.max(0, Math.round(normalizeNumber(membership.statusPoints, 0))),
      start_at: membership.startAt || new Date().toISOString(),
      end_at: membership.endAt || null,
      is_active: membership.isActive === true,
      created_at: membership.createdAt || new Date().toISOString(),
      updated_at: membership.updatedAt || new Date().toISOString(),
      status_points_snapshot: Math.max(0, Math.round(normalizeNumber(membership.statusPointsSnapshot, membership.statusPoints))),
      birthday_gift_snapshot: membership.birthdayGiftSnapshot === true,
      discounted_rate_snapshot: normalizeNumber(membership.discountedRateSnapshot, membership.discountRateSnapshot),
      linked_license_plates_snapshot: Math.max(0, Math.round(normalizeNumber(membership.linkedLicensePlatesSnapshot, membership.discountEligibleCarLimitSnapshot))),
      complimentary_car_care_upgrade_snapshot: Math.max(0, Math.round(normalizeNumber(membership.complimentaryCarCareUpgradeSnapshot, 0))),
      priority_wash_snapshot: Math.max(0, Math.round(normalizeNumber(membership.priorityWashSnapshot, membership.priorityLevelSnapshot))),
      exclusive_invitation_snapshot: membership.exclusiveInvitationSnapshot === true,
    }));

    const { error } = await supabase
      .from('customer_memberships')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      console.error('Customer Memberships Sync Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const subscribeToMembershipTiers = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('membership_tiers_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_tiers' }, () => onUpdate())
    .subscribe();
};

export const subscribeToCustomerMemberships = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('customer_memberships_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_memberships' }, () => onUpdate())
    .subscribe();
};

export const getServerTime = async (): Promise<string | null> => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('get_server_time');
    if (error) {
      // Fallback if RPC doesn't exist: use a simple query
      const { data: timeData } = await supabase.from('admin_sessions').select('last_active').limit(1);
      return new Date().toISOString(); // Default fallback
    }
    return data;
  } catch (e) {
    return new Date().toISOString();
  }
};
