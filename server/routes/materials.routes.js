import { Router } from 'express';
import { requireDb } from '../db.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';

const router = Router();
const units = new Set(['un', 'kg']);
const MATERIAL_LINKED_MESSAGE = 'Este material possui vínculos e não pode ser excluído.';

function auditDeleteDescription(row, user) {
  const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const userName = String(user?.name || user?.email || 'Sistema');
  const codes = Array.isArray(row.codes) && row.codes.length ? row.codes.join(', ') : row.id;
  return `Material excluído. Usuário: ${userName}. Data/hora: ${when}. Código: ${codes}. Nome: ${row.name}.`;
}

function normalizeCodes(value) {
  const codes = Array.isArray(value) ? value : String(value || '').split(',');
  return codes.map(code => String(code).trim()).filter(Boolean);
}

function materialCodes(row) {
  return Array.isArray(row.codes) ? row.codes.map(code => String(code).trim()).filter(Boolean) : [];
}

async function tableExists(db, tableName) {
  const [row] = await db`SELECT to_regclass(${`public.${tableName}`}) IS NOT NULL AS exists`;
  return row?.exists === true;
}

async function countIfTableExists(db, tableName, whereSql, params) {
  if (!await tableExists(db, tableName)) return 0;
  const [row] = await db.unsafe(`SELECT COUNT(*)::int AS count FROM ${tableName} WHERE ${whereSql}`, params);
  return Number(row?.count || 0);
}

async function materialHasLinks(db, row) {
  const id = Number(row.id);
  const codes = materialCodes(row);
  const name = String(row.name || '').trim();
  const textMatchWhere = `
    material_name = $1
    OR material_code = ANY($2::text[])
  `;

  const checks = [
    countIfTableExists(db, 'productivity_matrix', `
      material_name = $1
      OR material_code = ANY($2::text[])
      OR material_codes && $2::text[]
    `, [name, codes]),
    countIfTableExists(db, 'material_inputs', 'material_id = $1 OR input_material_id = $1', [id]),
    countIfTableExists(db, 'production_plans', textMatchWhere, [name, codes]),
    countIfTableExists(db, 'production_plan_days', textMatchWhere, [name, codes]),
    countIfTableExists(db, 'production_actuals', textMatchWhere, [name, codes]),
    countIfTableExists(db, 'production_launches', `
      material_id = $1
      OR input_material_id = $1
      OR material_name = $2
      OR input_material_name = $2
      OR material_code = ANY($3::text[])
      OR input_material_code = ANY($3::text[])
    `, [id, name, codes]),
    countIfTableExists(db, 'stock_material_corrections', 'material_id = $1', [id]),
    countIfTableExists(db, 'stock_import_material_balances', 'material_id = $1', [id]),
    countIfTableExists(db, 'stock_location_adjustments', 'material_id = $1', [id]),
    countIfTableExists(db, 'inventory_count_items', 'material_id = $1', [id]),
    countIfTableExists(db, 'stock_transport_records', 'material_id = $1', [id]),
    countIfTableExists(db, 'material_purchase_records', 'material_id = $1', [id])
  ];

  const counts = await Promise.all(checks);
  return counts.some(count => count > 0);
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

router.post('/', requirePermission('registrations:write'), async (req, res, next) => {
  try {
    const valid = validateMaterial(req.body);
    if (valid.error) return res.status(400).json({ error: valid.error });

    const db = requireDb();
    const codes = normalizeCodes(req.body.codes);
    const models = normalizeProductionModels(req.body.productionModels, req.body.inputMaterials || req.body.inputMaterialIds);
    const row = await db.begin(async tx => {
      const [created] = await tx`
        INSERT INTO materials (name, codes, primary_unit, secondary_unit, primary_to_secondary_factor, is_initial_raw_material, permits_sales, active)
        VALUES (${valid.name}, ${codes}, ${valid.primaryUnit}, ${valid.secondaryUnit}, ${valid.factor}, ${req.body.isInitialRawMaterial === true}, ${req.body.permitsSales !== false}, ${req.body.active !== false})
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
    await recordAuditLog(db, {
      user: req.user,
      action: 'Cadastro de material',
      module: 'Cadastros',
      description: `Cadastrou material ${row.name}${codes.length ? ` (${codes.join(', ')})` : ''}`,
      recordRef: row.id
    });
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermission('registrations:write'), async (req, res, next) => {
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
            permits_sales = ${req.body.permitsSales !== false},
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
    if (!row) return res.status(404).json({ error: 'Material não encontrado.' });
    await recordAuditLog(db, {
      user: req.user,
      action: 'Edição de material',
      module: 'Cadastros',
      description: `Editou material ${row.name}${codes.length ? ` (${codes.join(', ')})` : ''}`,
      recordRef: row.id
    });
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermission('registrations:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const result = await db.begin(async tx => {
      const [row] = await tx`
        SELECT *
        FROM materials
        WHERE id = ${req.params.id}
        FOR UPDATE
      `;
      if (!row) return { notFound: true };
      if (await materialHasLinks(tx, row)) return { blocked: true };

      const [deleted] = await tx`
        DELETE FROM materials
        WHERE id = ${req.params.id}
        RETURNING *
      `;
      return { deleted };
    });

    if (result.notFound) return res.status(404).json({ error: 'Material nao encontrado.' });
    if (result.blocked) return res.status(409).json({ error: MATERIAL_LINKED_MESSAGE });

    await recordAuditLog(db, {
      user: req.user,
      action: 'Material excluído',
      module: 'Cadastros',
      description: auditDeleteDescription(result.deleted, req.user),
      recordRef: result.deleted.id
    });
    res.json({ deleted: true, id: result.deleted.id });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ error: MATERIAL_LINKED_MESSAGE });
    }
    next(error);
  }
});

export default router;
