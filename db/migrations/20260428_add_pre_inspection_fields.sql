-- Migration: add pre-inspection fields to checkout_sales
-- New fields: pre_inspection_completed, attention_details (jsonb array), customer_additional_comments (jsonb array)

alter table if exists checkout_sales
  add column if not exists pre_inspection_completed boolean not null default false;

alter table if exists checkout_sales
  add column if not exists attention_details jsonb not null default '[]'::jsonb;

alter table if exists checkout_sales
  add column if not exists customer_additional_comments jsonb not null default '[]'::jsonb;
