-- Migration: Create transaction_items table for multi-service support

CREATE TABLE transaction_items (
    id text PRIMARY KEY,
    transaction_id text NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    category_id text NOT NULL,
    name text NOT NULL,
    price numeric(12,2) NOT NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transaction_items_transaction_id ON transaction_items(transaction_id);
CREATE INDEX idx_transaction_items_category_id ON transaction_items(category_id);
