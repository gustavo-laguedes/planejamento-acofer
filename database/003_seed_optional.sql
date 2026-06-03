INSERT INTO productivity_matrix (
  material_name,
  material_code,
  machine_name,
  people_count,
  output_qty,
  output_unit,
  time_minutes,
  notes,
  active
)
SELECT
  'Material de exemplo',
  'EXEMPLO',
  'MT200',
  3,
  1,
  'un',
  60,
  'Registro opcional para testar a simulacao inicial.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM productivity_matrix
  WHERE material_name = 'Material de exemplo'
    AND material_code = 'EXEMPLO'
    AND machine_name = 'MT200'
);
