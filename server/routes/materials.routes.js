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

function normalizeProductionModels(value, legacyInputs, materialId = null) {
  const sourceModels = Array.isArray(value) && value.length
    ? value
    : [{ name: 'Modelo padrão', inputMaterials: legacyInputs || [] }];
  return sourceModels.map((model, index) => ({
    name: String(model.name || `Modelo ${index + 1}`).trim() || `Modelo ${index + 1}`,
    inputMaterials: normalizeInputs(model.inputMaterials || model.inputs || [], materialId)
  })).filter(model => model.inputMaterials.length);
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

function materialResponse(row) {
  const grouped = new Map();
  for (const item of row.production_model_items || []) {
    const modelName = item.modelName || 'Modelo padrão';
    if (!grouped.has(modelName)) grouped.set(modelName, []);
    grouped.get(modelName).push({
      id: item.inputMaterialId,
      inputMaterialId: item.inputMaterialId,
      name: item.materialName,
      qtyPerOutput: item.qtyPerOutput || 1
    });
  }
  return {
    ...row,
    production_models: [...grouped.entries()].map(([name, inputMaterials]) => ({ name, inputMaterials }))
  };
}

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const search = `%${req.query.search || ''}%`;
    const rows = await db`
      SELECT m.*,
             COALESCE(
               json_agg(json_build_object('id', i.id, 'name', i.name, 'qtyPerOutput', mi.qty_per_output, 'modelName', COALESCE(mi.production_model_name, 'Modelo padrão')) ORDER BY COALESCE(mi.production_model_name, 'Modelo padrão'), i.name)
               FILTER (WHERE i.id IS NOT NULL),
               '[]'::json
             ) AS input_materials,
             COALESCE(
               json_agg(json_build_object('modelName', COALESCE(mi.production_model_name, 'Modelo padrão'), 'inputMaterialId', i.id, 'materialName', i.name, 'qtyPerOutput', mi.qty_per_output) ORDER BY COALESCE(mi.production_model_name, 'Modelo padrão'), i.name)
               FILTER (WHERE i.id IS NOT NULL),
               '[]'::json
             ) AS production_model_items
      FROM materials m
      LEFT JOIN material_inputs mi ON mi.material_id = m.id
      LEFT JOIN materials i ON i.id = mi.input_material_id
      WHERE (${req.query.search || ''} = ''
        OR m.name ILIKE ${search}
        OR array_to_string(COALESCE(m.codes, ARRAY[]::text[]), ', ') ILIKE ${search})
      GROUP BY m.id
      ORDER BY m.active DESC, m.name
    `;
    res.json(rows.map(materialResponse));
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
    const models = normalizeProductionModels(req.body.productionModels, req.body.inputMaterials || req.body.inputMaterialIds);
    const row = await db.begin(async tx => {
      const [created] = await tx`
        INSERT INTO materials (name, codes, primary_unit, secondary_unit, primary_to_secondary_factor, is_initial_raw_material, active)
        VALUES (${valid.name}, ${codes}, ${valid.primaryUnit}, ${valid.secondaryUnit}, ${valid.factor}, ${req.body.isInitialRawMaterial === true}, ${req.body.active !== false})
        RETURNING *
      `;
      for (const model of models) {
        for (const input of model.inputMaterials) {
          await tx`
            INSERT INTO material_inputs (material_id, input_material_id, qty_per_output, production_model_name)
            VALUES (${created.id}, ${input.inputMaterialId}, ${input.qtyPerOutput}, ${model.name})
            ON CONFLICT (material_id, production_model_name, input_material_id)
            DO UPDATE SET qty_per_output = EXCLUDED.qty_per_output
          `;
        }
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
    const models = normalizeProductionModels(req.body.productionModels, req.body.inputMaterials || req.body.inputMaterialIds, req.params.id);
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
      for (const model of models) {
        for (const input of model.inputMaterials) {
          await tx`
            INSERT INTO material_inputs (material_id, input_material_id, qty_per_output, production_model_name)
            VALUES (${req.params.id}, ${input.inputMaterialId}, ${input.qtyPerOutput}, ${model.name})
            ON CONFLICT (material_id, production_model_name, input_material_id)
            DO UPDATE SET qty_per_output = EXCLUDED.qty_per_output
          `;
        }
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
