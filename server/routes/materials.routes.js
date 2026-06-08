import { Router } from 'express';
import { requireDb } from '../db.js';

const router = Router();
const units = new Set(['un', 'kg']);

function normalizeCodes(value) {
  const codes = Array.isArray(value) ? value : String(value || '').split(',');
  return codes.map(code => String(code).trim()).filter(Boolean);
}

function normalizeInputs(value, materialId = null) {
  const items = Array.isArray(value) ? value : [];
  const byId = new Map();
  for (const item of items) {
    const inputMaterialId = Number(typeof item === 'object' ? item.inputMaterialId || item.id : item);
    const qtyPerOutput = Number(typeof item === 'object' ? item.qtyPerOutput : 1);
    if (!inputMaterialId || String(inputMaterialId) === String(materialId)) continue;
    byId.set(inputMaterialId, {
      inputMaterialId,
      qtyPerOutput: qtyPerOutput > 0 ? qtyPerOutput : 1
    });
  }
  return [...byId.values()];
}

function validateMaterial(body) {
  const name = String(body.name || '').trim();
  const primaryUnit = String(body.primaryUnit || '').trim();
  const secondaryUnit = String(body.secondaryUnit || '').trim();
  const factor = Number(body.primaryToSecondaryFactor);

  if (!name) return { error: 'Nome do material e obrigatorio.' };
  if (!units.has(primaryUnit)) return { error: 'Unidade principal invalida.' };
  if (!units.has(secondaryUnit)) return { error: 'Unidade secundaria invalida.' };
  if (!factor || factor <= 0) return { error: 'Fator entre unidades e obrigatorio.' };

  return { name, primaryUnit, secondaryUnit, factor };
}

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const search = `%${req.query.search || ''}%`;
    const rows = await db`
      SELECT m.*,
             COALESCE(
               json_agg(json_build_object('id', i.id, 'name', i.name, 'qtyPerOutput', mi.qty_per_output) ORDER BY i.name)
               FILTER (WHERE i.id IS NOT NULL),
               '[]'::json
             ) AS input_materials
      FROM materials m
      LEFT JOIN material_inputs mi ON mi.material_id = m.id
      LEFT JOIN materials i ON i.id = mi.input_material_id
      WHERE (${req.query.search || ''} = ''
        OR m.name ILIKE ${search}
        OR array_to_string(COALESCE(m.codes, ARRAY[]::text[]), ', ') ILIKE ${search})
      GROUP BY m.id
      ORDER BY m.active DESC, m.name
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const valid = validateMaterial(req.body);
    if (valid.error) return res.status(400).json({ error: valid.error });

    const db = requireDb();
    const codes = normalizeCodes(req.body.codes);
    const inputItems = normalizeInputs(req.body.inputMaterials || req.body.inputMaterialIds);
    const row = await db.begin(async tx => {
      const [created] = await tx`
        INSERT INTO materials (name, codes, primary_unit, secondary_unit, primary_to_secondary_factor, is_initial_raw_material, active)
        VALUES (${valid.name}, ${codes}, ${valid.primaryUnit}, ${valid.secondaryUnit}, ${valid.factor}, ${req.body.isInitialRawMaterial === true}, ${req.body.active !== false})
        RETURNING *
      `;
      for (const input of inputItems) {
        await tx`
          INSERT INTO material_inputs (material_id, input_material_id, qty_per_output)
          VALUES (${created.id}, ${input.inputMaterialId}, ${input.qtyPerOutput})
          ON CONFLICT (material_id, input_material_id)
          DO UPDATE SET qty_per_output = EXCLUDED.qty_per_output
        `;
      }
      return created;
    });
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const valid = validateMaterial(req.body);
    if (valid.error) return res.status(400).json({ error: valid.error });

    const db = requireDb();
    const codes = normalizeCodes(req.body.codes);
    const inputItems = normalizeInputs(req.body.inputMaterials || req.body.inputMaterialIds, req.params.id);
    const row = await db.begin(async tx => {
      const [updated] = await tx`
        UPDATE materials
        SET name = ${valid.name},
            codes = ${codes},
            primary_unit = ${valid.primaryUnit},
            secondary_unit = ${valid.secondaryUnit},
            primary_to_secondary_factor = ${valid.factor},
            is_initial_raw_material = ${req.body.isInitialRawMaterial === true},
            active = ${req.body.active !== false},
            updated_at = now()
        WHERE id = ${req.params.id}
        RETURNING *
      `;
      if (!updated) return null;

      await tx`DELETE FROM material_inputs WHERE material_id = ${req.params.id}`;
      for (const input of inputItems) {
        await tx`
          INSERT INTO material_inputs (material_id, input_material_id, qty_per_output)
          VALUES (${req.params.id}, ${input.inputMaterialId}, ${input.qtyPerOutput})
          ON CONFLICT (material_id, input_material_id)
          DO UPDATE SET qty_per_output = EXCLUDED.qty_per_output
        `;
      }
      return updated;
    });
    if (!row) return res.status(404).json({ error: 'Material nao encontrado.' });
    res.json(row);
  } catch (error) {
    next(error);
  }
});

export default router;
