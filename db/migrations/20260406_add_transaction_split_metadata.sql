-- Migration: add canonical split metadata to transactions

alter table if exists transactions add column if not exists split_mode text;
alter table if exists transactions add column if not exists split_ratio_a numeric(8,4);
alter table if exists transactions add column if not exists split_ratio_b numeric(8,4);