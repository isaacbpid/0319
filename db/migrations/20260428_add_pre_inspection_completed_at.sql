-- Migration: add pre-inspection completion timestamp to checkout_sales

alter table if exists checkout_sales
  add column if not exists pre_inspection_completed_at timestamptz;
