-- Employee login and page permission model

create table if not exists employee_users (
  id text primary key,
  username text not null,
  password_hash text not null,
  is_active boolean not null default true,
  hide_financial_data boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_username_lowercase check (username = lower(username))
);

do $$
begin
  begin
    alter table employee_users add constraint ux_employee_users_username unique (username);
  exception
    when duplicate_object then
      null;
    when others then
      null;
  end;
end $$;

create table if not exists employee_page_permissions (
  id text primary key,
  username text not null,
  page_key text not null,
  can_view boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_username_lowercase_perms check (username = lower(username))
);

create unique index if not exists ux_employee_permissions_username_page
on employee_page_permissions (lower(username), page_key);

do $$
begin
  begin
    alter table employee_page_permissions
      add constraint fk_employee_permissions_user
      foreign key (username) references employee_users (username)
      on update cascade
      on delete cascade;
  exception
    when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    alter table if exists employee_page_permissions
      drop constraint chk_employee_page_key;
  exception
    when undefined_object then null;
  end;
end $$;

do $$
begin
  begin
    alter table employee_page_permissions
      add constraint chk_employee_page_key
      check (page_key in (
        'overview',
        'transactions',
        'input',
        'startup',
        'balance',
        'settings',
        'audit',
        'notes',
        'customers',
        'vehicles',
        'checkout',
        'categories',
        'accounts',
        'memberships'
      ));
  exception
    when duplicate_object then null;
  end;
end $$;

alter table employee_users disable row level security;
alter table employee_page_permissions disable row level security;

grant all on table employee_users to anon;
grant all on table employee_users to authenticated;
grant all on table employee_page_permissions to anon;
grant all on table employee_page_permissions to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    begin
      alter publication supabase_realtime add table employee_users;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table employee_page_permissions;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;
