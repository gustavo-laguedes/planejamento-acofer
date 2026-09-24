ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS minimum_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS maximum_quantity NUMERIC;


ALTER TABLE materials
  DROP CONSTRAINT IF EXISTS materials_minimum_quantity_nonnegative;

ALTER TABLE materials
  ADD CONSTRAINT materials_minimum_quantity_nonnegative
  CHECK (
    minimum_quantity IS NULL
    OR minimum_quantity >= 0
  );


ALTER TABLE materials
  DROP CONSTRAINT IF EXISTS materials_maximum_quantity_nonnegative;

ALTER TABLE materials
  ADD CONSTRAINT materials_maximum_quantity_nonnegative
  CHECK (
    maximum_quantity IS NULL
    OR maximum_quantity >= 0
  );


ALTER TABLE materials
  DROP CONSTRAINT IF EXISTS materials_stock_limits_order;

ALTER TABLE materials
  ADD CONSTRAINT materials_stock_limits_order
  CHECK (
    minimum_quantity IS NULL
    OR maximum_quantity IS NULL
    OR maximum_quantity > minimum_quantity
  );