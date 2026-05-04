
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CloudConfig, CategoryItem, TransactionType, EmployeePageKey, EmployeePagePermission, EmployeeUser } from '../types';
import { translations } from '../translations';
import { reserveNextCategoryId, testConnection } from '../services/database';

interface SettingsPageProps {
  language: 'zh' | 'en';
  setLanguage: (lang: 'zh' | 'en') => void;
  cloudConfig: CloudConfig | null;
  onSaveConfig: (config: CloudConfig) => void;
  syncStatus: string;
  lastError: string | null;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  onSync: () => void;
  onNavigateToAudit: () => void;
  onNavigateToOverview: () => void;
  onClearTransactions: () => Promise<void>;
  categories: CategoryItem[];
  onSaveCategories: (cats: CategoryItem[]) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  isReadOnly?: boolean;
  isAdmin?: boolean;
  employeeUsers?: EmployeeUser[];
  employeePermissions?: EmployeePagePermission[];
  onSaveEmployeeUser?: (params: {
    username: string;
    password?: string;
    isActive: boolean;
    hideFinancialData: boolean;
  }) => Promise<void>;
  onSaveEmployeePermissions?: (username: string, pageKeys: EmployeePageKey[]) => Promise<void>;
  allPageOptions?: EmployeePageKey[];
}

const SettingsPage: React.FC<SettingsPageProps> = ({ 
  language, 
  setLanguage, 
  cloudConfig, 
  onSaveConfig,
  syncStatus,
  lastError,
  theme,
  setTheme,
  onSync,
  onNavigateToAudit,
  onNavigateToOverview,
  onClearTransactions,
  categories,
  onSaveCategories,
  onDeleteCategory,
  isReadOnly,
  isAdmin,
  employeeUsers = [],
  employeePermissions = [],
  onSaveEmployeeUser,
  onSaveEmployeePermissions,
  allPageOptions = []
}) => {
  const t = translations[language];
  const [tempConfig, setTempConfig] = useState<CloudConfig>(cloudConfig || { url: '', key: '' });
  const [testStatus, setTestStatus] = useState<{ status: 'idle' | 'testing' | 'success' | 'fail'; message?: string; details?: string }>({ status: 'idle' });
  const [copyFeedback, setCopyFeedback] = useState(false);
  
  // Secret Menu State
  const [clickCount, setClickCount] = useState(0);
  const [showPasswordBox, setShowPasswordBox] = useState(false);
  const [password, setPassword] = useState('');
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleBannerClick = () => {
    if (!isAdmin) return;
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 5) {
      setShowPasswordBox(true);
      setClickCount(0);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '0000') {
      setShowSecretMenu(true);
      setShowPasswordBox(false);
      setPassword('');
    } else {
      alert(language === 'zh' ? '密碼錯誤' : 'Incorrect Password');
      setPassword('');
    }
  };

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<TransactionType>(TransactionType.REVENUE);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [selectedEmployeeUsername, setSelectedEmployeeUsername] = useState('');
  const [employeeDraftUsername, setEmployeeDraftUsername] = useState('');
  const [employeeDraftPassword, setEmployeeDraftPassword] = useState('');
  const [employeeDraftIsActive, setEmployeeDraftIsActive] = useState(true);
  const [employeeDraftHideFinancialData, setEmployeeDraftHideFinancialData] = useState(true);
  const [selectedPages, setSelectedPages] = useState<EmployeePageKey[]>([]);

  const permissionByUser = useMemo(() => {
    const map = new Map<string, EmployeePagePermission[]>();
    for (const permission of employeePermissions) {
      const key = permission.username.toLowerCase();
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(permission);
    }
    return map;
  }, [employeePermissions]);

  const sortedEmployeeUsers = useMemo(() => {
    return [...employeeUsers].sort((a, b) => a.username.localeCompare(b.username));
  }, [employeeUsers]);

  const getVisiblePageCount = (username: string): number => {
    const entries = permissionByUser.get(username.toLowerCase()) || [];
    return entries.filter((entry) => entry.canView).length;
  };

  const formatUpdatedAt = (value?: string): string => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString(language === 'zh' ? 'zh-HK' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    if (!selectedEmployeeUsername) {
      setSelectedPages([]);
      return;
    }

    const normalized = selectedEmployeeUsername.toLowerCase();
    const selectedUser = employeeUsers.find((user) => user.username.toLowerCase() === normalized);
    const existingPermissions = permissionByUser.get(normalized) || [];

    setEmployeeDraftUsername(selectedUser?.username || selectedEmployeeUsername);
    setEmployeeDraftPassword('');
    setEmployeeDraftIsActive(selectedUser?.isActive ?? true);
    setEmployeeDraftHideFinancialData(selectedUser?.hideFinancialData ?? true);
    setSelectedPages(existingPermissions.filter((item) => item.canView).map((item) => item.pageKey));
  }, [selectedEmployeeUsername, employeeUsers, permissionByUser]);

  const handleSaveEmployee = async () => {
    if (!onSaveEmployeeUser) return;
    if (!employeeDraftUsername.trim()) return;

    const normalizedUsername = employeeDraftUsername.trim().toLowerCase();

    await onSaveEmployeeUser({
      username: normalizedUsername,
      password: employeeDraftPassword.trim() || undefined,
      isActive: employeeDraftIsActive,
      hideFinancialData: employeeDraftHideFinancialData,
    });

    // Keep permission changes in sync with the main save action.
    if (onSaveEmployeePermissions) {
      await onSaveEmployeePermissions(normalizedUsername, selectedPages);
    }

    setEmployeeDraftPassword('');
    setSelectedEmployeeUsername(normalizedUsername);
  };

  const handleSavePermissions = async () => {
    if (!onSaveEmployeePermissions) return;
    if (!selectedEmployeeUsername) return;

    await onSaveEmployeePermissions(selectedEmployeeUsername, selectedPages);
  };

  const togglePagePermission = (pageKey: EmployeePageKey) => {
    setSelectedPages((current) => {
      if (current.includes(pageKey)) {
        return current.filter((value) => value !== pageKey);
      }
      return [...current, pageKey];
    });
  };

  const getNextCategoryIdLocal = (type: TransactionType): string => {
    const prefix = type === TransactionType.REVENUE ? 'rev' : 'exp';
    const storageKey = `gardiner_category_seq_${prefix}`;

    const maxExisting = categories
      .map(category => {
        const match = category.id.match(new RegExp(`^${prefix}-(\\d+)$`));
        return match ? Number(match[1]) : 0;
      })
      .reduce((max, value) => Math.max(max, value), 0);

    const storedValue = Number(localStorage.getItem(storageKey) || '0');
    const nextValue = Math.max(maxExisting, Number.isFinite(storedValue) ? storedValue : 0) + 1;

    localStorage.setItem(storageKey, String(nextValue));
    return `${prefix}-${nextValue}`;
  };

  const getNextCategoryId = async (type: TransactionType): Promise<string> => {
    const prefix = type === TransactionType.REVENUE ? 'rev' : 'exp';

    const reserved = await reserveNextCategoryId(prefix);
    if (reserved.id) {
      const match = reserved.id.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (match) {
        localStorage.setItem(`gardiner_category_seq_${prefix}`, match[1]);
      }
      return reserved.id;
    }

    return getNextCategoryIdLocal(type);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    const newId = await getNextCategoryId(newCategoryType);
    
    const newCat: CategoryItem = {
      id: newId,
      name: newCategoryName.trim(),
      type: newCategoryType,
      createdAt: new Date().toISOString()
    };
    
    setIsSavingCategories(true);
    await onSaveCategories([...categories, newCat]);
    setNewCategoryName('');
    setIsSavingCategories(false);
  };

  const handleQuickConnect = () => {
    const quickConfig = {
      url: "https://zuxftlycmpudmdutwxkl.supabase.co",
      key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1eGZ0bHljbXB1ZG1kdXR3eGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMjQ3MzQsImV4cCI6MjA4ODgwMDczNH0.t3G_9JqfVr7DZKxug8uY3bfbu0vJX4vTLZYZPGjJbj0"
    };
    setTempConfig(quickConfig);
    setTestStatus({ status: 'idle' });
  };

  const handleRunDiagnostics = async () => {
    setTestStatus({ status: 'testing', message: 'Testing Permissions...' });
    const result = await testConnection(tempConfig);
    setTestStatus({ status: result.success ? 'success' : 'fail', message: result.message, details: result.details });
  };

  const handleSave = () => {
    onSaveConfig(tempConfig);
  };

  const sqlScript = `-- 1. Create the Transactions table
create table if not exists transactions (
  id text primary key,
  receipt_number text,
  occurred_at timestamp with time zone not null,
  type text not null,
  category_id text not null,
  amount numeric not null,
  description text,
  contributed_by text not null,
  image_url text,
  updated_at timestamp with time zone default now(),
  is_initial_investment boolean default false,
  notes text,
  customer_id text,
  from_account_id text,
  to_account_id text,
  split_mode text,
  split_ratio_a numeric(8,4),
  split_ratio_b numeric(8,4)
);

alter table if exists transactions add column if not exists split_mode text;
alter table if exists transactions add column if not exists split_ratio_a numeric(8,4);
alter table if exists transactions add column if not exists split_ratio_b numeric(8,4);

-- 2. Create the Audit Logs table
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  table_name text not null,
  record_id text,
  changed_by text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone default now()
);

-- 3. Create the Notes table
create table if not exists notes (
  id text primary key,
  content text,
  created_by text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 4. Create the Categories table
create table if not exists categories (
  id text primary key,
  name text not null,
  type text not null,
  description text,
  price numeric default 0,
  image_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table if exists categories add column if not exists description text;
alter table if exists categories add column if not exists price numeric default 0;
alter table if exists categories add column if not exists image_url text;
alter table if exists categories add column if not exists updated_at timestamp with time zone default now();

-- 4.1 Create server-side monotonic category ID allocator
create table if not exists id_sequences (
  key text primary key,
  value bigint not null default 0
);

create or replace function reserve_next_category_id(p_prefix text)
returns text
language plpgsql
security definer
as $$
declare
  seq_key text;
  max_existing bigint;
  next_val bigint;
begin
  if p_prefix not in ('rev', 'exp') then
    raise exception 'Invalid category prefix: %', p_prefix;
  end if;

  seq_key := 'category_' || p_prefix;

  select coalesce(max(((regexp_match(id, ('^' || p_prefix || '-([0-9]+)$')))[1])::bigint), 0)
  into max_existing
  from categories;

  insert into id_sequences (key, value)
  values (seq_key, max_existing)
  on conflict (key)
  do update set value = greatest(id_sequences.value, excluded.value);

  update id_sequences
  set value = value + 1
  where key = seq_key
  returning value into next_val;

  return p_prefix || '-' || next_val::text;
end;
$$;

-- 5. Create the Customers table
create table if not exists customers (
  id text primary key,
  name text not null,
  chinese_name text,
  group_name text,
  country_code text,
  phone text,
  vehicle_id text,
  company_code text,
  birthday date,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table if exists customers add column if not exists group_name text;
alter table if exists customers add column if not exists chinese_name text;
alter table if exists customers add column if not exists country_code text;
alter table if exists customers add column if not exists vehicle_id text;
alter table if exists customers add column if not exists company_code text;
alter table if exists customers add column if not exists birthday date;

-- 5.1 Create the Customer Groups table
create table if not exists customer_groups (
  id text primary key,
  name text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 5.2 Create the Vehicles table
create table if not exists vehicles (
  id text primary key,
  customer_id text not null,
  license_plate text,
  make text,
  model text,
  color text,
  year text,
  vin text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 6. Create Admin Sessions table
create table if not exists admin_sessions (
  session_token text primary key,
  partner_id text not null,
  expires_at timestamp with time zone not null,
  last_active timestamp with time zone default now()
);

-- 7. Create Bank Balance Transactions table
create table if not exists bank_balance_transactions (
  id text primary key,
  type text not null,
  amount numeric not null,
  balance_before numeric not null,
  balance_after numeric not null,
  created_at timestamp with time zone default now()
);

-- 8. Create Accounts table
create table if not exists accounts (
  id text primary key,
  name text not null,
  type text not null,
  created_at timestamp with time zone default now()
);

-- 9. Create Checkout Sales table
create table if not exists checkout_sales (
  id text primary key,
  customer_id text,
  subtotal numeric not null default 0,
  occurred_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

-- 10. Create Checkout Line Items table
create table if not exists checkout_line_items (
  id text primary key,
  sale_id text not null references checkout_sales(id) on delete cascade,
  name text not null,
  service_name_snapshot text not null default '',
  item_description text,
  price numeric not null,
  not_sold_separately boolean not null default false,
  is_discount boolean not null default false,
  created_at timestamp with time zone default now()
);

create or replace function normalize_checkout_line_item_row()
returns trigger
language plpgsql
as $$
begin
  if new.sale_id is not null then
    insert into checkout_sales (id)
    values (new.sale_id)
    on conflict (id) do nothing;
  end if;

  new.service_name_snapshot := coalesce(new.service_name_snapshot, new.name, '');
  new.not_sold_separately := coalesce(new.not_sold_separately, false);
  return new;
end;
$$;

drop trigger if exists trg_checkout_line_items_normalize on checkout_line_items;
create trigger trg_checkout_line_items_normalize
before insert or update on checkout_line_items
for each row execute function normalize_checkout_line_item_row();

-- 11. Create Discounts table
create table if not exists discounts (
  id text primary key,
  name text not null,
  code text,
  effect_type text not null default 'discount',
  amount_type text not null,
  amount numeric not null default 0,
  category text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists transaction_items (
  id text primary key,
  transaction_id text not null references transactions(id) on delete cascade,
  category_id text not null,
  name text not null,
  price numeric(12,2) not null,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_transaction_items_transaction_id on transaction_items(transaction_id);
create index if not exists idx_transaction_items_category_id on transaction_items(category_id);

alter table if exists discounts add column if not exists category text;
alter table if exists discounts add column if not exists updated_at timestamp with time zone default now();
alter table if exists discounts add column if not exists code text;
alter table if exists discounts add column if not exists effect_type text not null default 'discount';

-- 12. DISABLE SECURITY (Fixes the Write Error)
alter table transactions disable row level security;
alter table audit_logs disable row level security;
alter table notes disable row level security;
alter table categories disable row level security;
alter table customers disable row level security;
alter table customer_groups disable row level security;
alter table vehicles disable row level security;
alter table admin_sessions disable row level security;
alter table bank_balance_transactions disable row level security;
alter table accounts disable row level security;
alter table checkout_sales disable row level security;
alter table checkout_line_items disable row level security;
alter table discounts disable row level security;
alter table transaction_items disable row level security;
alter table if exists currency_exchange_rates disable row level security;

-- 13. GRANT FULL ACCESS
grant all on table transactions to anon;
grant all on table transactions to authenticated;
grant all on table audit_logs to anon;
grant all on table audit_logs to authenticated;
grant all on table notes to anon;
grant all on table notes to authenticated;
grant all on table categories to anon;
grant all on table categories to authenticated;
grant all on table id_sequences to anon;
grant all on table id_sequences to authenticated;
grant all on table customers to anon;
grant all on table customers to authenticated;
grant all on table customer_groups to anon;
grant all on table customer_groups to authenticated;
grant all on table vehicles to anon;
grant all on table vehicles to authenticated;
grant all on table admin_sessions to anon;
grant all on table admin_sessions to authenticated;
grant all on table bank_balance_transactions to anon;
grant all on table bank_balance_transactions to authenticated;
grant all on table accounts to anon;
grant all on table accounts to authenticated;
grant all on table checkout_sales to anon;
grant all on table checkout_sales to authenticated;
grant all on table checkout_line_items to anon;
grant all on table checkout_line_items to authenticated;
grant all on table discounts to anon;
grant all on table discounts to authenticated;
grant all on table transaction_items to anon;
grant all on table transaction_items to authenticated;
grant all on table currency_exchange_rates to anon;
grant all on table currency_exchange_rates to authenticated;

-- 14. Enable Realtime Sync
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table transactions, transaction_items, notes, categories, customers, customer_groups, vehicles, admin_sessions, bank_balance_transactions, accounts, checkout_sales, checkout_line_items, discounts;
commit;

grant execute on function reserve_next_category_id(text) to anon;
grant execute on function reserve_next_category_id(text) to authenticated;

-- 15. Server Time Function
create or replace function get_server_time() returns timestamp with time zone as $$
  select now();
$$ language sql stable;

-- 16. Employee Access Control
create table if not exists public.employee_users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  hide_financial_data boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint employee_users_username_lowercase
    check (username = lower(trim(username)))
);

create table if not exists public.employee_page_permissions (
  id text primary key,
  username text not null
    references public.employee_users(username)
    on update cascade
    on delete cascade,
  page_key text not null,
  can_view boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint employee_page_permissions_username_page_unique
    unique (username, page_key),
  constraint employee_page_permissions_username_lowercase
    check (username = lower(trim(username))),
  constraint employee_page_permissions_page_key_chk
    check (page_key in (
      'overview', 'transactions', 'input', 'startup', 'balance',
      'settings', 'audit', 'notes', 'customers', 'vehicles',
      'checkout', 'locker_deposit', 'locker_pickup', 'categories', 'accounts', 'memberships', 'charging', 'appointments'
    ))
);

alter table public.employee_users disable row level security;
alter table public.employee_page_permissions disable row level security;

grant all on table public.employee_users to anon;
grant all on table public.employee_users to authenticated;
grant all on table public.employee_page_permissions to anon;
grant all on table public.employee_page_permissions to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.employee_users;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.employee_page_permissions;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';

-- 17. Seed default employee account
-- username: staff
-- password: 1234
insert into public.employee_users (id, username, password_hash, is_active, hide_financial_data)
values (
  'emp_default_staff',
  'staff',
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  true,
  false
)
on conflict (username) do nothing;

insert into public.employee_page_permissions (id, username, page_key, can_view)
values
  ('epp_staff_transactions', 'staff', 'transactions', true),
  ('epp_staff_input', 'staff', 'input', true),
  ('epp_staff_customers', 'staff', 'customers', true),
  ('epp_staff_vehicles', 'staff', 'vehicles', true),
  ('epp_staff_checkout', 'staff', 'checkout', true),
  ('epp_staff_settings', 'staff', 'settings', true)
on conflict (username, page_key) do nothing;`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlScript).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {isReadOnly && (
        <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/20 rounded-2xl p-4 flex items-center gap-3 text-rose-600 dark:text-rose-400">
          <i className="fas fa-lock text-sm"></i>
          <span className="text-xs font-bold uppercase tracking-widest">
            {language === 'zh' ? '連接不穩定，目前處於唯讀模式。' : 'Network unstable. Read-only mode.'}
          </span>
        </div>
      )}
      <div 
        onClick={handleBannerClick}
        className="bg-slate-900 text-white p-8 rounded-[32px] shadow-2xl relative overflow-hidden cursor-pointer select-none active:bg-slate-800 transition-colors"
      >
        <div className="relative z-10">
          <h2 className="text-2xl font-black mb-2 tracking-tight">{t.settings}</h2>
          <p className="text-slate-400 dark:text-slate-300 text-sm font-bold uppercase tracking-widest">{t.cloudSyncDesc}</p>
        </div>
        <i className="fas fa-cog absolute -right-4 -bottom-4 text-9xl text-white/5 transform rotate-45"></i>
      </div>

      <AnimatePresence>
        {showPasswordBox && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-xs rounded-[32px] p-8 shadow-2xl border border-slate-100 dark:border-white/10"
            >
              <h3 className="text-sm font-black uppercase tracking-widest text-center mb-6 dark:text-white">Admin Access</h3>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={language === 'zh' ? '密碼' : 'Enter Password'}
                  autoFocus
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-4 text-center text-xl font-black tracking-[0.5em] outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setShowPasswordBox(false)}
                    className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-transform"
                  >
                    Unlock
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSecretMenu && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-rose-600 text-white p-8 rounded-[32px] shadow-xl space-y-6 mb-8">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center">
                  <i className="fas fa-user-shield mr-3"></i>
                  Secret Admin Menu
                </h3>
                <button onClick={() => setShowSecretMenu(false)} className="text-white/60 hover:text-white transition-colors">
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="p-6 bg-black/20 rounded-2xl space-y-4">
                <p className="text-xs font-bold">DANGER ZONE: This action will permanently delete all transaction records and audit logs from both local and cloud storage.</p>
                <button 
                  onClick={() => setShowClearConfirm(true)}
                  className="w-full py-4 bg-white text-rose-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-50 transition-all shadow-lg active:scale-[0.98]"
                >
                  <i className="fas fa-trash-alt mr-2"></i>
                  Clear All Transactions
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-8 space-y-6 dark:bg-slate-900"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500 dark:bg-rose-900/20">
                  <i className="fas fa-exclamation-triangle text-2xl"></i>
                </div>
                <h3 className="text-lg font-black text-slate-900 mb-2 dark:text-white">
                  {language === 'zh' ? '確定要清除所有交易記錄嗎？' : 'Clear All Transactions?'}
                </h3>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-300">
                  {language === 'zh' ? '此操作將永久刪除所有數據，且無法撤銷。' : 'This action will permanently delete all data and cannot be undone.'}
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)} 
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button 
                  onClick={async () => {
                    await onClearTransactions();
                    setShowClearConfirm(false);
                    setShowSecretMenu(false);
                  }} 
                  className="flex-1 py-4 bg-rose-700 hover:bg-rose-800 text-white dark:text-white border border-rose-800 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-700/30 active:scale-95"
                >
                  {language === 'zh' ? '確定清除' : 'Confirm Clear'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 space-y-6 dark:bg-slate-900 dark:border-white/10">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 flex items-center dark:text-white">
              <i className="fas fa-globe text-blue-500 mr-2"></i>
              {t.languageSelect}
            </h3>
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  setLanguage('zh');
                  localStorage.setItem('gardiner_lang', 'zh');
                }}
                className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border ${language === 'zh' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-blue-300 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'}`}
              >繁體中文</button>
              <button 
                onClick={() => {
                  setLanguage('en');
                  localStorage.setItem('gardiner_lang', 'en');
                }}
                className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border ${language === 'en' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-blue-300 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'}`}
              >English</button>
            </div>
        </div>

        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 space-y-6 dark:bg-slate-900 dark:border-white/10">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 flex items-center dark:text-white">
              <i className="fas fa-moon text-indigo-500 mr-2"></i>
              {t.themeMode}
            </h3>
            <div className="flex gap-2">
              <button 
                onClick={() => setTheme('light')}
                className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border ${theme === 'light' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'}`}
              >
                <i className="fas fa-sun mr-1"></i> {t.light}
              </button>
              <button 
                onClick={() => setTheme('dark')}
                className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border ${theme === 'dark' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'}`}
              >
                <i className="fas fa-moon mr-1"></i> {t.dark}
              </button>
              <button 
                onClick={() => setTheme('system')}
                className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border ${theme === 'system' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300 dark:bg-slate-800 dark:border-white/5 dark:text-slate-400'}`}
              >
                <i className="fas fa-desktop mr-1"></i> {t.auto}
              </button>
            </div>
        </div>

        {isAdmin && <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 space-y-6 dark:bg-slate-900 dark:border-white/10">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 flex items-center dark:text-white">
              <i className="fas fa-history text-slate-500 mr-2"></i>
              {language === 'zh' ? '系統日誌' : 'System Logs'}
            </h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider dark:text-slate-500">
              {language === 'zh' ? '查看所有數據變更的審計記錄' : 'View audit records of all data changes'}
            </p>
            <button 
              onClick={onNavigateToAudit}
              className="w-full py-4 bg-slate-50 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-slate-200 hover:bg-slate-100 shadow-sm dark:bg-white/5 dark:border-white/10 dark:text-slate-400"
            >
              <i className="fas fa-history mr-2"></i> {t.auditLogs}
            </button>
        </div>}

        {/* Category Management Section */}
        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 space-y-6 md:col-span-2 dark:bg-slate-900 dark:border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 flex items-center dark:text-white">
                <i className="fas fa-tags text-emerald-500 mr-2"></i>
                {t.manageCategories}
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Revenue Categories */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">{t.revenueOptions}</h4>
                <div className="grid grid-cols-1 gap-2">
                  {categories.filter(c => c.type === TransactionType.REVENUE).map(cat => (
                    <div key={cat.id} className="flex items-center justify-between bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/20">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{cat.name}</span>
                      <button 
                        onClick={() => {
                          if (isReadOnly) return;
                          onDeleteCategory(cat.id);
                        }} 
                        disabled={isReadOnly}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-rose-500 hover:bg-rose-50 transition-all dark:hover:bg-rose-900/20"
                      >
                        <i className="fas fa-trash-alt text-xs"></i>
                      </button>
                    </div>
                  ))}
                  {categories.filter(c => c.type === TransactionType.REVENUE).length === 0 && (
                    <p className="text-[10px] text-slate-400 italic p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 dark:bg-white/5 dark:border-white/10">
                      {language === 'zh' ? '尚無收入分類' : 'No revenue categories'}
                    </p>
                  )}
                </div>
              </div>

              {/* Expense Categories */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">{t.expenseOptions}</h4>
                <div className="grid grid-cols-1 gap-2">
                  {categories.filter(c => c.type === TransactionType.EXPENSE).map(cat => (
                    <div key={cat.id} className="flex items-center justify-between bg-rose-50/50 p-3 rounded-2xl border border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/20">
                      <span className="text-xs font-bold text-rose-700 dark:text-rose-400">{cat.name}</span>
                      <button 
                        onClick={() => {
                          if (isReadOnly) return;
                          onDeleteCategory(cat.id);
                        }} 
                        disabled={isReadOnly}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-rose-500 hover:bg-rose-50 transition-all dark:hover:bg-rose-900/20"
                      >
                        <i className="fas fa-trash-alt text-xs"></i>
                      </button>
                    </div>
                  ))}
                  {categories.filter(c => c.type === TransactionType.EXPENSE).length === 0 && (
                    <p className="text-[10px] text-slate-400 italic p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 dark:bg-white/5 dark:border-white/10">
                      {language === 'zh' ? '尚無支出分類' : 'No expense categories'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 dark:border-white/5">
              <div className="bg-slate-50 p-6 rounded-[24px] dark:bg-white/5 border border-slate-100 dark:border-white/10">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 flex flex-col sm:flex-row gap-3">
                    <div className="sm:w-40">
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 ml-2">{t.type}</label>
                      <select 
                        value={newCategoryType}
                        onChange={e => setNewCategoryType(e.target.value as TransactionType)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                      >
                        <option value={TransactionType.REVENUE}>{t.revenue}</option>
                        <option value={TransactionType.EXPENSE}>{t.expense}</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 ml-2">{t.category}</label>
                      <input 
                        type="text"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        placeholder={language === 'zh' ? '輸入新分類名稱...' : 'Enter category name...'}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <button 
                      onClick={handleAddCategory}
                      disabled={isReadOnly || isSavingCategories || !newCategoryName.trim()}
                      className="w-full md:w-auto bg-blue-600 text-white px-8 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSavingCategories ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-plus"></i> {t.addCategory}</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </div>

      {isAdmin && (
        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 space-y-6 dark:bg-slate-900 dark:border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 flex items-center dark:text-white">
              <i className="fas fa-user-shield text-violet-500 mr-2"></i>
              {language === 'zh' ? '員工帳號與頁面權限' : 'Employee Accounts And Page Access'}
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {language === 'zh' ? '員工完整列表' : 'Full Employee List'}
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-white/5 text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest">{language === 'zh' ? '用戶名' : 'Username'}</th>
                        <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest">{language === 'zh' ? '狀態' : 'Status'}</th>
                        <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest">{language === 'zh' ? '隱藏財務' : 'Hide Financial'}</th>
                        <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest">{language === 'zh' ? '頁面數' : 'Pages'}</th>
                        <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest">{language === 'zh' ? '更新時間' : 'Updated'}</th>
                        <th className="text-right px-3 py-2 text-[10px] font-black uppercase tracking-widest">{language === 'zh' ? '操作' : 'Action'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEmployeeUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-4 text-xs font-bold text-slate-400 text-center">
                            {language === 'zh' ? '尚無員工帳號' : 'No employee accounts yet'}
                          </td>
                        </tr>
                      ) : (
                        sortedEmployeeUsers.map((user) => (
                          <tr key={user.id} className="border-t border-slate-100 dark:border-white/5">
                            <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100">{user.username}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${user.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}>
                                {user.isActive
                                  ? (language === 'zh' ? '啟用' : 'Active')
                                  : (language === 'zh' ? '停用' : 'Inactive')}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                              {user.hideFinancialData ? (language === 'zh' ? '是' : 'Yes') : (language === 'zh' ? '否' : 'No')}
                            </td>
                            <td className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">{getVisiblePageCount(user.username)}</td>
                            <td className="px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">{formatUpdatedAt(user.updatedAt)}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => setSelectedEmployeeUsername(user.username)}
                                className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest dark:bg-white dark:text-slate-900"
                              >
                                {language === 'zh' ? '編輯' : 'Edit'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                {language === 'zh' ? '選擇員工' : 'Select Employee'}
              </label>
              <select
                value={selectedEmployeeUsername}
                onChange={(e) => setSelectedEmployeeUsername(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:bg-slate-800 dark:border-white/5 dark:text-white"
              >
                <option value="">{language === 'zh' ? '新增員工帳號' : 'Create New Employee'}</option>
                {sortedEmployeeUsers.map((user) => (
                  <option key={user.id} value={user.username}>
                    {user.username}{user.isActive ? '' : ` (${language === 'zh' ? '停用' : 'inactive'})`}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={employeeDraftUsername}
                onChange={(e) => setEmployeeDraftUsername(e.target.value)}
                placeholder={language === 'zh' ? '員工用戶名' : 'Employee username'}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:bg-slate-800 dark:border-white/5 dark:text-white"
              />

              <input
                type="password"
                value={employeeDraftPassword}
                onChange={(e) => setEmployeeDraftPassword(e.target.value)}
                placeholder={selectedEmployeeUsername
                  ? (language === 'zh' ? '重設密碼（可留空）' : 'Reset password (optional)')
                  : (language === 'zh' ? '設定初始密碼' : 'Set initial password')}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:bg-slate-800 dark:border-white/5 dark:text-white"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={employeeDraftIsActive}
                    onChange={(e) => setEmployeeDraftIsActive(e.target.checked)}
                  />
                  {language === 'zh' ? '帳號啟用' : 'Account Active'}
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={employeeDraftHideFinancialData}
                    onChange={(e) => setEmployeeDraftHideFinancialData(e.target.checked)}
                  />
                  {language === 'zh' ? '隱藏財務數字' : 'Hide Financial Numbers'}
                </label>
              </div>

              <button
                onClick={handleSaveEmployee}
                disabled={(!isAdmin && isReadOnly) || !employeeDraftUsername.trim() || (!selectedEmployeeUsername && !employeeDraftPassword.trim())}
                className="w-full py-3 bg-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50"
              >
                {language === 'zh' ? '儲存員工帳號' : 'Save Employee Account'}
              </button>
            </div>

            <div className="space-y-4">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                {language === 'zh' ? '可見頁面權限' : 'Visible Page Permissions'}
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {allPageOptions.map((pageKey) => (
                  <label key={pageKey} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-white/5 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedPages.includes(pageKey)}
                      onChange={() => togglePagePermission(pageKey)}
                      disabled={!selectedEmployeeUsername}
                    />
                    <span>{pageKey}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={handleSavePermissions}
                disabled={(!isAdmin && isReadOnly) || !selectedEmployeeUsername}
                className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50"
              >
                {language === 'zh' ? '儲存頁面權限' : 'Save Page Permissions'}
              </button>

              <p className="text-[11px] font-bold text-slate-400">
                {language === 'zh'
                  ? '建議員工預設頁面：transactions、input、settings、vehicles、customers'
                  : 'Recommended default pages for employees: transactions, input, settings, vehicles, customers'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Security Advice */}
        <div className="bg-blue-600 text-white p-8 rounded-[32px] shadow-xl space-y-6">
          <h3 className="text-sm font-black uppercase tracking-widest flex items-center">
            <i className="fas fa-shield-alt mr-3"></i>
            {language === 'zh' ? '安全建議' : 'Security Advice'}
          </h3>
          <div className="space-y-4">
            <p className="text-xs font-bold leading-relaxed">
              {language === 'zh' 
                ? '關閉 RLS 會使數據表對外公開。雖然對於私人工具來說很方便，但我們建議：' 
                : 'Disabling RLS makes your tables public. While convenient for private tools, we recommend:'}
            </p>
            <ul className="text-[10px] list-disc list-inside space-y-2 opacity-90 font-bold">
              <li>{language === 'zh' ? '不要在公共網絡分享您的 Supabase URL/Key' : 'Do not share your Supabase URL/Key on public networks'}</li>
              <li>{language === 'zh' ? '定期備份數據到本地' : 'Regularly backup data locally'}</li>
              <li>{language === 'zh' ? '如需更高安全性，請在 Supabase 啟用 Auth 並設置 RLS 策略' : 'For higher security, enable Auth in Supabase and set RLS policies'}</li>
            </ul>
          </div>
        </div>

        {/* Troubleshooting Step */}
        <div className="bg-rose-600 text-white p-8 rounded-[32px] shadow-xl space-y-6">
          <h3 className="text-sm font-black uppercase tracking-widest flex items-center">
            <i className="fas fa-exclamation-circle mr-3"></i>
            {language === 'zh' ? '數據無法寫入？' : 'Cannot write data?'}
          </h3>
          <div className="space-y-4">
            <p className="text-xs font-bold leading-relaxed">
              {language === 'zh' ? '這通常是因為 Supabase 的安全規則 (RLS) 鎖住了數據表。' : 'This is usually because Supabase Security Rules (RLS) are locking the table.'}
            </p>
            <div className="p-4 bg-black/20 rounded-xl space-y-2">
              <p className="text-[11px] font-black uppercase tracking-tighter">{language === 'zh' ? '解決方案：' : 'SOLUTION:'}</p>
              <ol className="text-[10px] list-decimal list-inside space-y-1 opacity-90">
                <li>{language === 'zh' ? '進入 Supabase SQL Editor' : 'Go to Supabase SQL Editor'}</li>
                <li>{language === 'zh' ? '複製下方的 SQL 腳本' : 'Copy the SQL script below'}</li>
                <li>{language === 'zh' ? '粘貼並點擊「Run」' : 'Paste it and click "Run"'}</li>
              </ol>
            </div>
          </div>
          <p className="text-[10px] font-bold italic opacity-80">
            {language === 'zh' ? '* 這將關閉 RLS 權限校驗，讓您的 API Key 可以直接保存數據。' : '* This disables RLS validation, allowing your API Key to save data directly.'}
          </p>
        </div>

        {/* Sync Settings */}
        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 space-y-6 flex flex-col justify-between dark:bg-slate-900 dark:border-white/10">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 flex items-center dark:text-white">
                <i className="fas fa-cloud-upload-alt text-blue-500 mr-2"></i>
                {t.cloudSyncTitle}
              </h3>
              <button 
                onClick={handleQuickConnect} 
                disabled={isReadOnly}
                className="px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all dark:bg-blue-900/20 dark:text-blue-400 disabled:opacity-50"
              >
                <i className="fas fa-bolt mr-1"></i> {t.quickConnect}
              </button>
            </div>
            
            <div className="space-y-4">
              <input 
                type="text" 
                value={tempConfig.url} 
                onChange={e => setTempConfig({...tempConfig, url: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white" 
                placeholder="Supabase URL" 
              />
              <input 
                type="password" 
                value={tempConfig.key} 
                onChange={e => setTempConfig({...tempConfig, key: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-white/5 dark:text-white" 
                placeholder="Anon Key" 
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={handleRunDiagnostics} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10">
                {t.testConnection}
              </button>
              <button 
                onClick={handleSave} 
                disabled={isReadOnly}
                className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all dark:shadow-none disabled:opacity-50"
              >
                {t.saveAndSync}
              </button>
            </div>

            {cloudConfig && (
              <div className="space-y-3">
                <button 
                  onClick={onSync} 
                  disabled={isReadOnly || syncStatus === 'syncing'}
                  className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border flex items-center justify-center gap-2 ${syncStatus === 'syncing' || isReadOnly ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30 dark:text-emerald-400'}`}
                >
                  <i className={`fas fa-sync-alt ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}></i>
                  {t.syncNow}
                </button>

                <button 
                  onClick={() => {
                    if (window.confirm(language === 'zh' ? '確定要重置配置嗎？這將清除您的 Supabase 連接設置。' : 'Are you sure you want to reset the configuration? This will clear your Supabase connection settings.')) {
                      localStorage.removeItem('gardiner_cloud_config');
                      window.location.reload();
                    }
                  }}
                  disabled={isReadOnly}
                  className="w-full py-4 bg-white text-rose-600 border border-rose-200 rounded-2xl font-black text-xs uppercase tracking-widest transition-all hover:bg-rose-50 active:scale-95 dark:bg-slate-900 dark:border-rose-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <i className="fas fa-trash-alt"></i>
                  {language === 'zh' ? '重置連接配置' : 'Reset Connection Config'}
                </button>
              </div>
            )}

            {testStatus.status !== 'idle' && (
              <div className={`p-4 rounded-2xl border text-xs font-bold ${testStatus.status === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-900/30 dark:text-emerald-400' : testStatus.status === 'fail' ? 'bg-rose-50 border-rose-100 text-rose-700 dark:bg-rose-900/20 dark:border-rose-900/30 dark:text-rose-400' : 'bg-blue-50 border-blue-100 text-blue-700 dark:bg-blue-900/20 dark:border-blue-900/30 dark:text-blue-400'}`}>
                <p className="flex items-center gap-2 mb-1">
                  <i className={`fas ${testStatus.status === 'success' ? 'fa-check-circle' : testStatus.status === 'fail' ? 'fa-exclamation-circle' : 'fa-spinner fa-spin'}`}></i>
                  {testStatus.message}
                </p>
                {testStatus.details && <p className="opacity-70 font-normal mt-1 leading-relaxed">{testStatus.details}</p>}
              </div>
            )}

            {lastError && (
              <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold animate-pulse dark:bg-rose-900/20 dark:border-rose-900/30 dark:text-rose-400">
                <p className="flex items-center gap-2 mb-1">
                  <i className="fas fa-exclamation-triangle"></i>
                  {language === 'zh' ? '同步錯誤' : 'Sync Error'}
                </p>
                <p className="opacity-70 font-normal mt-1 leading-relaxed">{lastError}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SQL Script Section */}
      <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-white/10">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 flex items-center mb-6 dark:text-white">
          <i className="fas fa-database text-amber-500 mr-2"></i>
          {t.sqlTitle}
        </h3>
        <p className="text-xs font-bold text-slate-500 dark:text-slate-300 mb-4 dark:text-slate-400">{language === 'zh' ? '請完整複製此腳本並在 SQL Editor 執行：' : 'Copy this script entirely and run it in SQL Editor:'}</p>
        <div className="bg-slate-900 p-6 rounded-2xl relative">
          <pre className="text-[10px] text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
{sqlScript}
          </pre>
          <button 
            onClick={handleCopy}
            className={`absolute top-4 right-4 p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold ${copyFeedback ? 'bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
          >
            <i className={`fas ${copyFeedback ? 'fa-check' : 'fa-copy'}`}></i>
            {copyFeedback ? (language === 'zh' ? '已複製' : 'Copied!') : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
