alter table if exists customers
  add column if not exists whatsapp_enabled boolean not null default false;

update customers
set whatsapp_enabled = false
where whatsapp_enabled is null;
