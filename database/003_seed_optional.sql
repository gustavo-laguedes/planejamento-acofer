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
) VALUES (
  'Material de exemplo',
  'EXEMPLO',
  'MT200',
  3,
  1,
  'un',
  60,
  'Registro opcional para testar a simulacao inicial.',
  true
)
ON CONFLICT DO NOTHING;
