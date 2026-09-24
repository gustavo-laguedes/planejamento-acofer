import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { createHash } from 'crypto';

import { requireDb } from '../db.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});


function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .trim()
    .toLowerCase();
}

function text(value) {
  return String(value ?? '').trim();
}

function number(
  value,
  fallback = 0
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function round(
  value,
  digits = 6
) {
  const factor =
    10 ** digits;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) *
      factor
    ) /
    factor
  );
}

function codesOf(material) {
  return Array.isArray(
    material?.codes
  )
    ? material.codes
        .map(text)
        .filter(Boolean)
    : [];
}

function firstCode(material) {
  return (
    codesOf(material)[0] ||
    null
  );
}


function dateOnly(value) {
  if (!value) {
    return '';
  }

  if (
  value instanceof Date &&
  !Number.isNaN(
    value.getTime()
  )
) {
  /*
   * Datas vindas do Excel devem ser tratadas
   * como data de calendário, sem conversão
   * para o fuso local.
   *
   * Usar os getters UTC evita:
   * 11/09 -> 10/09 no Brasil (UTC-3).
   */
  return (
    `${value.getUTCFullYear()}-` +
    `${String(
      value.getUTCMonth() + 1
    ).padStart(2, '0')}-` +
    `${String(
      value.getUTCDate()
    ).padStart(2, '0')}`
  );
}

  const source =
    text(value);

  const iso =
    source.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (iso) {
    return (
      `${iso[1]}-` +
      `${iso[2]}-` +
      `${iso[3]}`
    );
  }

  const br =
    source.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

  if (br) {
    return (
      `${br[3]}-` +
      `${br[2].padStart(2, '0')}-` +
      `${br[1].padStart(2, '0')}`
    );
  }

  return '';
}


function cellValue(cell) {
  const value =
    cell?.value;

  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    if ('result' in value) {
      return (
        value.result ??
        ''
      );
    }

    if ('text' in value) {
      return (
        value.text ??
        ''
      );
    }
  }

  return value ?? '';
}


function todayBrazil() {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'America/Sao_Paulo',

        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }
    )
      .formatToParts(
        new Date()
      );

  const values =
    Object.fromEntries(
      parts.map(
        item => [
          item.type,
          item.value
        ]
      )
    );

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
}


function sendXlsx(
  res,
  buffer,
  filename
) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`
  );

  res.send(buffer);
}

function styleHeaderRow(row) {
  row.height = 24;

  row.eachCell(
    {
      includeEmpty: true
    },
    cell => {
      cell.font = {
        bold: true,
        color: {
          argb: 'FF1F2937'
        }
      };

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: 'FFE9EEF3'
        }
      };

      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true
      };

      cell.border = {
        bottom: {
          style: 'thin',
          color: {
            argb: 'FFBFC7D1'
          }
        }
      };
    }
  );
}


function excelDate(value) {
  const iso =
    dateOnly(value);

  if (!iso) {
    return null;
  }

  const [
    year,
    month,
    day
  ] =
    iso
      .split('-')
      .map(Number);

  /*
   * Meio-dia evita qualquer virada de data
   * por timezone ao abrir/salvar o Excel.
   */
  return new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );
}


async function loadCatalog(db) {
  const [
    materials,
    inputs,
    machines,
    matrix
  ] =
    await Promise.all([

      db`
        SELECT *
        FROM materials
        WHERE active = true
        ORDER BY name
      `,

      db`
        SELECT
          mi.id,
          mi.material_id,
          mi.input_material_id,
          mi.production_model_name,
          mi.qty_per_output,

          i.name
            AS input_name,

          i.codes
            AS input_codes

        FROM material_inputs mi

        JOIN materials i
          ON i.id =
             mi.input_material_id

        ORDER BY
          mi.material_id,
          mi.production_model_name,
          mi.id
      `,

      db`
        SELECT
          m.id,
          m.name,
          m.location_id,
          l.name AS location_name

        FROM machines m

        JOIN locations l
          ON l.id =
             m.location_id

        WHERE m.active = true

        ORDER BY m.name
      `,

      db`
        SELECT *
        FROM productivity_matrix
        WHERE active = true

        ORDER BY
          material_name,
          machine_priority,
          machine_name
      `
    ]);


  const materialsByName =
    new Map();

  for (
    const material
    of materials
  ) {
    const key =
      normalize(
        material.name
      );

    if (
      !materialsByName.has(key)
    ) {
      materialsByName.set(
        key,
        []
      );
    }

    materialsByName
      .get(key)
      .push(material);
  }


  const inputsByModel =
    new Map();

  for (
    const input
    of inputs
  ) {
    const key =
      `${input.material_id}|` +
      normalize(
        input.production_model_name
      );

    if (
      !inputsByModel.has(key)
    ) {
      inputsByModel.set(
        key,
        []
      );
    }

    inputsByModel
      .get(key)
      .push(input);
  }


  return {
    materials,
    inputs,
    machines,
    matrix,

    materialsByName,
    inputsByModel,

    machinesByName:
      new Map(
        machines.map(
          machine => [
            normalize(
              machine.name
            ),
            machine
          ]
        )
      )
  };
}


function matrixMatches(
  material,
  row
) {
  if (
    normalize(
      row.material_name
    )
    ===
    normalize(
      material.name
    )
  ) {
    return true;
  }

  const materialCodes =
    new Set(
      codesOf(material)
        .map(normalize)
    );

  const rowCodes =
    Array.isArray(
      row.material_codes
    )
      ? row.material_codes
      : [
          row.material_code
        ];

  return rowCodes.some(
    code =>
      materialCodes.has(
        normalize(code)
      )
  );
}


function allowedMachines(
  catalog,
  material
) {
  return [
    ...new Set(
      catalog.matrix
        .filter(
          row =>
            matrixMatches(
              material,
              row
            )
        )
        .map(
          row =>
            text(
              row.machine_name
            )
        )
        .filter(Boolean)
    )
  ];
}


function modelInputs(
  catalog,
  materialId,
  modelName
) {
  return (
    catalog.inputsByModel.get(
      `${materialId}|` +
      normalize(modelName)
    ) ||
    []
  );
}


function materialByName(
  catalog,
  name
) {
  const matches =
    catalog.materialsByName
      .get(
        normalize(name)
      ) ||
    [];

  return (
    matches.length === 1
      ? matches[0]
      : null
  );
}


/* =========================================================
   PADRÃO DE PRODUÇÃO
   ========================================================= */

async function productionTemplate(
  db
) {
  const catalog =
    await loadCatalog(db);


  /*
   * Criamos o arquivo do zero.
   *
   * Além de ficar mais seguro, isso evita
   * o Excel abrir o arquivo como "Reparado".
   */
  const workbook =
    new ExcelJS.Workbook();


  workbook.creator =
    'Planejamento Aço-Fer';

  workbook.created =
    new Date();


  /*
   * J e K possuem fórmulas.
   * Ao abrir o arquivo, o Excel recalcula tudo.
   */
  workbook.calcProperties
    .fullCalcOnLoad =
      true;

  workbook.calcProperties
    .forceFullCalc =
      true;


  /* =======================================================
     ABAS
     ======================================================= */

  const launches =
    workbook.addWorksheet(
      'Lancamentos',
      {
        views: [
          {
            state: 'frozen',
            ySplit: 1
          }
        ]
      }
    );


  const bank =
    workbook.addWorksheet(
      'BancoDados',
      {
        views: [
          {
            state: 'frozen',
            ySplit: 1
          }
        ]
      }
    );


  const lists =
    workbook.addWorksheet(
      'Listas'
    );


  /* =======================================================
     CABEÇALHO - LANÇAMENTOS
     ======================================================= */

  launches.addRow([
    'Data',
    'Material produzido',
    'Modelo de producao',
    'Maquina',
    'Quantidade de pessoas',
    'Observacao',
    'Lote consumido 1',
    'Lote consumido 2',
    'Lote 1 quantidade',
    'Lote 1 unidade principal',
    'Lote 1 unidade secundaria',
    'Lote 1 peso real',
    'Lote 1 gerado'
  ]);


  /* =======================================================
     CABEÇALHO - BANCO DE DADOS
     ======================================================= */

  bank.addRow([
    'Material produzido',
    'Codigo',
    'Unidade principal',
    'Unidade secundaria',
    'Fator secundario',
    'Modelo de producao',
    'Maquina',
    'Insumo 1',
    'Insumo 2'
  ]);


  lists.addRow([
    'Material produzido',
    'Modelo de producao',
    'Maquina'
  ]);


  styleHeaderRow(
    launches.getRow(1)
  );

  styleHeaderRow(
    bank.getRow(1)
  );

  styleHeaderRow(
    lists.getRow(1)
  );


  /* =======================================================
     LARGURAS - LANÇAMENTOS
     ======================================================= */

  [
    14, // Data
    32, // Material
    40, // Modelo
    18, // Máquina
    22, // Pessoas
    28, // Observação
    25, // Lote consumido 1
    25, // Lote consumido 2
    20, // Quantidade
    22, // Unidade principal
    24, // Quantidade secundária
    18, // Peso real
    28  // Lote gerado
  ].forEach(
    (width, index) => {
      launches
        .getColumn(index + 1)
        .width =
          width;
    }
  );


  /* =======================================================
     LARGURAS - BANCO DE DADOS
     ======================================================= */

  [
    34,
    18,
    20,
    22,
    18,
    40,
    20,
    34,
    34
  ].forEach(
    (width, index) => {
      bank
        .getColumn(index + 1)
        .width =
          width;
    }
  );


  [
    34,
    40,
    20
  ].forEach(
    (width, index) => {
      lists
        .getColumn(index + 1)
        .width =
          width;
    }
  );


  /* =======================================================
     MONTA BANCO DE DADOS
     ======================================================= */

  const bankRows = [];


  for (
    const material
    of catalog.materials
  ) {

    /*
     * Todos os modelos cadastrados
     * para este material.
     */
    const models =
      [
        ...catalog
          .inputsByModel
          .entries()
      ]
        .filter(
          ([key]) =>
            key.startsWith(
              `${material.id}|`
            )
        )
        .map(
          ([, rows]) => ({
            name:
              rows[0]
                ?.production_model_name
              || '',

            rows
          })
        );


    /*
     * Material sem modelo de produção
     * não precisa entrar no lançamento.
     */
    if (!models.length) {
      continue;
    }


    /*
     * Mesma regra da tela de Produção:
     * máquinas disponíveis pela Matriz
     * de Produtividade daquele material.
     */
    const machines =
      allowedMachines(
        catalog,
        material
      );


    for (
      const model
      of models
    ) {

      const modelMachines =
        machines.length
          ? machines
          : [''];


      for (
        const machineName
        of modelMachines
      ) {

        bankRows.push([
          material.name,

          firstCode(material)
            || '',

          material.primary_unit
            || '',

          material.secondary_unit
            || '',

          number(
            material
              .primary_to_secondary_factor,
            1
          ),

          model.name,

          machineName,

          model.rows[0]
            ?.input_name
            || '',

          model.rows[1]
            ?.input_name
            || ''
        ]);
      }
    }
  }


  for (
    const values
    of bankRows
  ) {
    bank.addRow(values);
  }


  /*
   * Código como texto.
   * Importantíssimo para não perder 0 à esquerda.
   */
  bank
    .getColumn(2)
    .numFmt =
      '@';


  bank
    .getColumn(5)
    .numFmt =
      '#,##0.000000';


  /* =======================================================
     LISTAS AUXILIARES
     ======================================================= */

  const materialNames =
    [
      ...new Set(
        bankRows
          .map(
            values =>
              text(values[0])
          )
          .filter(Boolean)
      )
    ];


  const modelNames =
    [
      ...new Set(
        bankRows
          .map(
            values =>
              text(values[5])
          )
          .filter(Boolean)
      )
    ];


  const machineNames =
    [
      ...new Set(
        bankRows
          .map(
            values =>
              text(values[6])
          )
          .filter(Boolean)
      )
    ];


  const listLength =
    Math.max(
      materialNames.length,
      modelNames.length,
      machineNames.length
    );


  for (
    let index = 0;
    index < listLength;
    index += 1
  ) {

    lists.addRow([
      materialNames[index]
        || '',

      modelNames[index]
        || '',

      machineNames[index]
        || ''
    ]);
  }


  /*
   * Igual ao sistema antigo:
   * existe no Excel, mas usuário não precisa ver.
   */
  lists.state =
    'hidden';


  const bankEnd =
    Math.max(
      bank.rowCount,
      2
    );


  const materialListEnd =
    Math.max(
      materialNames.length + 1,
      2
    );


  /* =======================================================
     500 LINHAS PRONTAS PARA LANÇAMENTO
     ======================================================= */

  for (
    let row = 2;
    row <= 501;
    row += 1
  ) {

    const dateCell =
      launches.getCell(
        `A${row}`
      );


    const materialCell =
      launches.getCell(
        `B${row}`
      );


    const modelCell =
      launches.getCell(
        `C${row}`
      );


    const machineCell =
      launches.getCell(
        `D${row}`
      );


    /* -------------------------------
       A - DATA
       ------------------------------- */

    dateCell.numFmt =
      'dd/mm/yyyy';


    /* -------------------------------
       B - MATERIAL

       Puxa os materiais de Listas,
       que foram gerados pelo BancoDados.
       ------------------------------- */

    materialCell.dataValidation = {
      type: 'list',

      allowBlank: true,

      showErrorMessage: true,

      errorTitle:
        'Material inválido',

      error:
        'Selecione um material da lista.',

      formulae: [
        `'Listas'!$A$2:$A$${materialListEnd}`
      ]
    };


    /* -------------------------------
       C - MODELO

       Filtrado conforme o material
       escolhido na coluna B.
       ------------------------------- */

    modelCell.dataValidation = {
      type: 'list',

      allowBlank: true,

      showErrorMessage: true,

      errorTitle:
        'Modelo inválido',

      error:
        'Selecione um modelo disponível para o material.',

      formulae: [
        `OFFSET(BancoDados!$F$2,MATCH($B${row},BancoDados!$A$2:$A$${bankEnd},0)-1,0,COUNTIF(BancoDados!$A$2:$A$${bankEnd},$B${row}),1)`
      ]
    };


    /* -------------------------------
       D - MÁQUINA

       Filtrada pelo material + modelo.
       ------------------------------- */

    machineCell.dataValidation = {
      type: 'list',

      allowBlank: true,

      showErrorMessage: true,

      errorTitle:
        'Máquina inválida',

      error:
        'Selecione uma máquina disponível para o material e modelo.',

      formulae: [
        `OFFSET(BancoDados!$G$2,MATCH(1,INDEX((BancoDados!$A$2:$A$${bankEnd}=$B${row})*(BancoDados!$F$2:$F$${bankEnd}=$C${row}),0),0)-1,0,COUNTIFS(BancoDados!$A$2:$A$${bankEnd},$B${row},BancoDados!$F$2:$F$${bankEnd},$C${row}),1)`
      ]
    };


    /* -------------------------------
       J - UNIDADE PRINCIPAL

       PROCV/VLOOKUP do material
       no BancoDados.
       ------------------------------- */

    launches
      .getCell(
        `J${row}`
      )
      .value =
      {
        formula:
          `IFERROR(VLOOKUP($B${row},BancoDados!$A$2:$E$${bankEnd},3,FALSE),"")`
      };


    /* -------------------------------
       K - QUANTIDADE SECUNDÁRIA

       Quantidade produzida ×
       fator secundário.
       ------------------------------- */

    launches
      .getCell(
        `K${row}`
      )
      .value =
      {
        formula:
          `IF(OR($B${row}="",I${row}=""),"",IFERROR(I${row}*INDEX(BancoDados!$E$2:$E$${bankEnd},MATCH($B${row},BancoDados!$A$2:$A$${bankEnd},0)),""))`
      };


    launches
      .getCell(
        `I${row}`
      )
      .numFmt =
        '#,##0.###';


    launches
      .getCell(
        `K${row}`
      )
      .numFmt =
        '#,##0.000';


    launches
      .getCell(
        `L${row}`
      )
      .numFmt =
        '#,##0.###';
  }


  return Buffer.from(
    await workbook.xlsx.writeBuffer()
  );
}


/* =========================================================
   LEITURA DO EXCEL
   ========================================================= */

async function workbookFrom(
  buffer
) {
  const workbook =
    new ExcelJS.Workbook();

  await workbook.xlsx.load(
    buffer
  );

  return workbook;
}


function parseProductionRows(
  workbook
) {
  const sheet =
    workbook.getWorksheet(
      'Lancamentos'
    );

  if (!sheet) {
    const error =
      new Error(
        'A aba Lancamentos não foi encontrada.'
      );

    error.status = 400;

    throw error;
  }


  const rows = [];


  for (
    let n = 2;
    n <= sheet.rowCount;
    n += 1
  ) {
    const row =
      sheet.getRow(n);


    const item = {
      rowNumber:
        n,

      productionDate:
        dateOnly(
          cellValue(
            row.getCell(1)
          )
        ),

      materialName:
        text(
          cellValue(
            row.getCell(2)
          )
        ),

      modelName:
        text(
          cellValue(
            row.getCell(3)
          )
        ),

      machineName:
        text(
          cellValue(
            row.getCell(4)
          )
        ),

      peopleCount:
        number(
          cellValue(
            row.getCell(5)
          )
        ),

      notes:
        text(
          cellValue(
            row.getCell(6)
          )
        ),

      consumedLot1:
        text(
          cellValue(
            row.getCell(7)
          )
        ),

      consumedLot2:
        text(
          cellValue(
            row.getCell(8)
          )
        ),

      quantity:
        number(
          cellValue(
            row.getCell(9)
          )
        ),

      realWeight:
        number(
          cellValue(
            row.getCell(12)
          )
        ),

      generatedLot:
        text(
          cellValue(
            row.getCell(13)
          )
        )
    };


    const hasContent =
  Boolean(
    item.productionDate
    ||
    item.materialName
    ||
    item.modelName
    ||
    item.machineName
    ||
    item.notes
    ||
    item.consumedLot1
    ||
    item.consumedLot2
    ||
    item.generatedLot
    ||
    item.peopleCount > 0
    ||
    item.quantity > 0
    ||
    item.realWeight > 0
  );


if (hasContent) {
  rows.push(item);
}
  }


  return rows;
}


async function currentLots(db) {
  const rows =
    await db`
      SELECT
        lot->>'lot'
          AS lot

      FROM production_launches p

      CROSS JOIN LATERAL
        jsonb_array_elements(
          COALESCE(
            p.produced_lots,
            '[]'::jsonb
          )
        )
        lot

      WHERE NULLIF(
        TRIM(
          lot->>'lot'
        ),
        ''
      )
      IS NOT NULL
    `;


  return new Set(
    rows
      .map(
        row =>
          normalize(
            row.lot
          )
      )
      .filter(Boolean)
  );
}


function reviewRow(
  row,
  statusKey,
  status,
  message,
  payload = null
) {
  return {
    rowNumber:
      row.rowNumber,

    productionDate:
      row.productionDate
      || '-',

    materialName:
      row.materialName
      || '-',

    productionModelName:
      row.modelName
      || '-',

    machineName:
      row.machineName
      || '-',

    generatedLot:
      row.generatedLot
      || '-',

    statusKey,
    status,
    message,
    payload
  };
}


/* =========================================================
   REVISÃO DA PRODUÇÃO
   ========================================================= */

async function reviewProduction(
  db,
  buffer
) {
  const workbook =
    await workbookFrom(
      buffer
    );

  const source =
    parseProductionRows(
      workbook
    );


  if (!source.length) {
    const error =
      new Error(
        'Nenhuma produção preenchida foi encontrada.'
      );

    error.status = 400;

    throw error;
  }


  const catalog =
    await loadCatalog(db);

  const existingLots =
    await currentLots(db);


  /*
   * Também impede lote duplicado
   * dentro do próprio Excel.
   */
  const lotCount =
    new Map();


  for (
    const row
    of source
  ) {
    const key =
      normalize(
        row.generatedLot
      );

    if (key) {
      lotCount.set(
        key,
        (
          lotCount.get(key)
          || 0
        ) +
        1
      );
    }
  }


  const rows = [];


  for (
    const row
    of source
  ) {

    if (!row.productionDate) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'DATA INVÁLIDA',
          'Informe uma data válida.'
        )
      );

      continue;
    }


    const material =
      materialByName(
        catalog,
        row.materialName
      );


    if (!material) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'MATERIAL INVÁLIDO',
          'Material não encontrado.'
        )
      );

      continue;
    }


    const inputs =
      modelInputs(
        catalog,
        material.id,
        row.modelName
      );


    if (!inputs.length) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'MODELO INVÁLIDO',
          'O modelo não pertence ao material.'
        )
      );

      continue;
    }


    if (
      inputs.length > 2
    ) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'MODELO NÃO SUPORTADO',
          'O padrão atual suporta até 2 insumos.'
        )
      );

      continue;
    }


    const machine =
      catalog
        .machinesByName
        .get(
          normalize(
            row.machineName
          )
        );


    const allowed =
      new Set(
        allowedMachines(
          catalog,
          material
        )
          .map(normalize)
      );


    if (
      !machine ||
      !allowed.has(
        normalize(
          row.machineName
        )
      )
    ) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'MÁQUINA INVÁLIDA',
          'Máquina não cadastrada para este material.'
        )
      );

      continue;
    }


    if (
      !(row.peopleCount > 0)
    ) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'PESSOAS INVÁLIDO',
          'Quantidade de pessoas deve ser maior que zero.'
        )
      );

      continue;
    }


    if (
      !(row.quantity > 0)
    ) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'QUANTIDADE INVÁLIDA',
          'Quantidade produzida deve ser maior que zero.'
        )
      );

      continue;
    }


    if (
      !(row.realWeight > 0)
    ) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'PESO INVÁLIDO',
          'Peso real deve ser maior que zero.'
        )
      );

      continue;
    }


    if (!row.generatedLot) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'LOTE AUSENTE',
          'Informe o lote gerado.'
        )
      );

      continue;
    }


    const lotKey =
      normalize(
        row.generatedLot
      );


    if (
      existingLots.has(
        lotKey
      )
      ||
      (
        lotCount.get(
          lotKey
        ) || 0
      ) > 1
    ) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'LOTE DUPLICADO',
          'O lote já existe ou está repetido no arquivo.'
        )
      );

      continue;
    }


    const suppliedLots = [
      row.consumedLot1,
      row.consumedLot2
    ];


    if (
      inputs.some(
        (
          input,
          index
        ) =>
          !suppliedLots[
            index
          ]
      )
    ) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'LOTE CONSUMIDO AUSENTE',
          'Preencha o lote consumido de todos os insumos.'
        )
      );

      continue;
    }


    /*
     * Aqui está a regra nova:
     *
     * Excel informa somente o lote.
     * Quantidade consumida vem do cadastro.
     */
    const consumedInputs =
      inputs.map(
        (
          input,
          index
        ) => ({
          materialId:
            Number(
              input.input_material_id
            ),

          materialName:
            input.input_name,

          materialCode:
            Array.isArray(
              input.input_codes
            )
              ? (
                  input
                    .input_codes[0]
                  || null
                )
              : null,

          lot:
            suppliedLots[
              index
            ],

          qtyPerOutput:
            number(
              input.qty_per_output
            ),

          consumedQty:
            round(
              row.quantity *
              number(
                input.qty_per_output
              )
            )
        })
      );


    if (
      consumedInputs.some(
        input =>
          !(
            input.qtyPerOutput > 0
          )
          ||
          !(
            input.consumedQty > 0
          )
      )
    ) {
      rows.push(
        reviewRow(
          row,
          'invalid',
          'CONSUMO INVÁLIDO',
          'O cadastro do modelo possui consumo inválido.'
        )
      );

      continue;
    }


    const secondaryQty =
      round(
        row.quantity *
        number(
          material
            .primary_to_secondary_factor,
          1
        ),
        3
      );


    rows.push(
      reviewRow(
        row,
        'applicable',
        'APLICÁVEL',
        'Pronto para lançar.',
        {
          row,
          material,
          machine,
          consumedInputs,
          secondaryQty,

          producedLot: {
            quantity:
              row.quantity,

            secondaryQty,

            primaryUnit:
              material
                .primary_unit,

            secondaryUnit:
              material
                .secondary_unit,

            realWeight:
              row.realWeight,

            realWeightUnit:
              material
                .secondary_unit,

            lot:
              row.generatedLot,

            benefitNumber:
              null
          }
        }
      )
    );
  }


  return {
    rows,

    applicableCount:
      rows.filter(
        row =>
          row.statusKey ===
          'applicable'
      ).length,

    blockedCount:
      rows.filter(
        row =>
          row.statusKey !==
          'applicable'
      ).length
  };
}


/* =========================================================
   APLICAR PRODUÇÕES
   ========================================================= */

async function applyProduction(
  db,
  buffer,
  user
) {
  /*
   * Revalida tudo novamente no momento
   * da gravação.
   */
  const review =
    await reviewProduction(
      db,
      buffer
    );


  const applicable =
    review.rows.filter(
      row =>
        row.statusKey ===
          'applicable'
        &&
        row.payload
    );


  if (!applicable.length) {
    const error =
      new Error(
        'Nenhuma produção aplicável foi encontrada.'
      );

    error.status = 400;

    throw error;
  }


  const inserted =
    await db.begin(
      async tx => {
        const result = [];


        for (
          const item
          of applicable
        ) {
          const {
            row,
            material,
            machine,
            consumedInputs,
            secondaryQty,
            producedLot
          } =
            item.payload;


          const firstInput =
            consumedInputs[0]
            || null;


          /*
           * Local vem da máquina automaticamente.
           *
           * Consumos já chegam calculados
           * pelo cadastro do modelo.
           */
          const [launch] =
            await tx`
              INSERT INTO production_launches (
                production_date,
                material_id,
                material_name,
                material_code,

                quantity,
                primary_unit,

                secondary_qty,
                secondary_unit,

                machine_name,

                location_id,
                location_name,

                people_count,
                planning_code,
                notes,
                user_id,

                production_model_name,
                consumed_inputs,

                input_material_name,
                input_material_code,
                consumed_lot,

                produced_lots,
                status
              )
              VALUES (
                ${row.productionDate},
                ${material.id},
                ${material.name},
                ${firstCode(material)},

                ${row.quantity},
                ${material.primary_unit},

                ${secondaryQty},
                ${material.secondary_unit},

                ${machine.name},

                ${machine.location_id},
                ${machine.location_name},

                ${row.peopleCount},
                NULL,
                ${row.notes || null},
                ${user?.id || null},

                ${row.modelName},
                ${tx.json(
                  consumedInputs
                )},

                ${firstInput
                    ?.materialName
                  || null},

                ${firstInput
                    ?.materialCode
                  || null},

                ${
                  consumedInputs
                    .length === 1
                    ? (
                        firstInput
                          ?.lot
                        || null
                      )
                    : null
                },

                ${tx.json([
                  producedLot
                ])},

                'launched'
              )

              RETURNING *
            `;


          await tx`
            INSERT INTO production_actuals (
              production_date,
              material_name,
              material_code,
              machine_name,
              actual_qty,
              actual_unit,
              notes
            )
            VALUES (
              ${row.productionDate},
              ${material.name},
              ${firstCode(material)},
              ${machine.name},
              ${row.quantity},
              ${material.primary_unit},
              ${row.notes || null}
            )
          `;


          result.push(
            launch
          );
        }


        return result;
      }
    );


  return {
    appliedCount:
      inserted.length,

    skippedCount:
      review.blockedCount
  };
}


/* =========================================================
   BENEFICIAMENTOS
   ========================================================= */

function snapshot(
  launch,
  lotIndex
) {
  const lots =
    Array.isArray(
      launch?.produced_lots
    )
      ? launch.produced_lots
      : [];


  const lot =
    lots[lotIndex];


  if (!lot) {
    return null;
  }


  return {
    productionId:
      Number(
        launch.id
      ),

    lotIndex:
      Number(
        lotIndex
      ),

    productionDate:
      dateOnly(
        launch.production_date
      ),

    materialName:
      text(
        launch.material_name
      ),

    modelName:
      text(
        launch
          .production_model_name
      ),

    machineName:
      text(
        launch.machine_name
      ),

    generatedLot:
      text(
        lot.lot
      ),

    quantity:
      number(
        lot.quantity ??
        launch.quantity
      ),

    primaryUnit:
      text(
        lot.primaryUnit ||
        lot.primary_unit ||
        launch.primary_unit
      ),

    secondaryQty:
      number(
        lot.secondaryQty ??
        lot.secondary_qty ??
        launch.secondary_qty
      ),

    realWeight:
      number(
        lot.realWeight ??
        lot.real_weight
      ),

    benefitNumber:
      text(
        lot.benefitNumber ||
        lot.benefit_number
      )
  };
}


function snapshotToken(
  value
) {
  return createHash(
    'sha256'
  )
    .update(
      JSON.stringify([
        value.productionId,
        value.lotIndex,
        value.productionDate,
        value.materialName,
        value.modelName,
        value.machineName,
        value.generatedLot,
        round(
          value.quantity
        ),
        value.primaryUnit,
        round(
          value.secondaryQty
        ),
        round(
          value.realWeight
        )
      ])
    )
    .digest('hex');
}


/* =========================================================
   GERAR PENDENTES DE BENEFICIAMENTO
   ========================================================= */

async function benefitTemplate(
  db
) {
  /*
   * O arquivo é sempre montado novamente
   * consultando tudo que está pendente AGORA.
   */
  const workbook =
    new ExcelJS.Workbook();


  workbook.creator =
    'Planejamento Aço-Fer';

  workbook.created =
    new Date();


  const sheet =
    workbook.addWorksheet(
      'Beneficiamentos',
      {
        views: [
          {
            state: 'frozen',
            ySplit: 1
          }
        ]
      }
    );


  /* =======================================================
     CABEÇALHO
     ======================================================= */

  sheet.addRow([
    'Data',
    'Material',
    'Modelo de produção',
    'Máquina',
    'Lote gerado',
    'Quantidade',
    'Unidade principal',
    'Quantidade secundária',
    'Peso real',
    'Beneficiamento',

    /*
     * Campos internos.
     * Usuário não vê.
     */
    'ProductionId',
    'LotIndex',
    'SnapshotToken'
  ]);


  styleHeaderRow(
    sheet.getRow(1)
  );


  [
    14, // Data
    34, // Material
    40, // Modelo
    18, // Máquina
    28, // Lote
    16, // Quantidade
    18, // Unidade
    22, // Qtd secundária
    16, // Peso
    20, // Beneficiamento
    14,
    12,
    68
  ].forEach(
    (width, index) => {
      sheet
        .getColumn(index + 1)
        .width =
          width;
    }
  );


  /* =======================================================
     BUSCA TODAS AS PRODUÇÕES
     ======================================================= */

  const launches =
    await db`
      SELECT *
      FROM production_launches

      WHERE
        LOWER(
          TRIM(
            COALESCE(
              status,
              'launched'
            )
          )
        )
        NOT IN (
          'canceled',
          'cancelled',
          'cancelado',
          'cancelada'
        )

      ORDER BY
        production_date ASC,
        created_at ASC,
        id ASC
    `;


  /* =======================================================
     UM LOTE PENDENTE = UMA LINHA
     ======================================================= */

  for (
    const launch
    of launches
  ) {

    const lots =
      Array.isArray(
        launch.produced_lots
      )
        ? launch.produced_lots
        : [];


    for (
      let index = 0;
      index < lots.length;
      index += 1
    ) {

      const snap =
        snapshot(
          launch,
          index
        );


      /*
       * Não existe lote ou já tem beneficiamento:
       * NÃO aparece nos pendentes.
       */
      if (
        !snap ||
        snap.benefitNumber
      ) {
        continue;
      }


      const excelRow =
        sheet.addRow([
          /*
           * A - Data da própria produção.
           */
          excelDate(
            snap.productionDate
          ),

          /*
           * B até I vêm preenchidos.
           */
          snap.materialName,
          snap.modelName,
          snap.machineName,
          snap.generatedLot,
          snap.quantity,
          snap.primaryUnit,
          snap.secondaryQty,
          snap.realWeight,

          /*
           * J fica propositalmente vazio.
           * É o único campo que você preenche.
           */
          '',

          /*
           * K/L/M internos.
           */
          snap.productionId,
          snap.lotIndex,

          snapshotToken(
            snap
          )
        ]);


      excelRow
        .getCell(1)
        .numFmt =
          'dd/mm/yyyy';


      excelRow
        .getCell(6)
        .numFmt =
          '#,##0.###';


      excelRow
        .getCell(8)
        .numFmt =
          '#,##0.###';


      excelRow
        .getCell(9)
        .numFmt =
          '#,##0.###';


      /*
       * Destaca justamente a coluna que deve
       * ser preenchida pelo usuário.
       */
      excelRow
        .getCell(10)
        .fill =
        {
          type: 'pattern',

          pattern: 'solid',

          fgColor: {
            argb:
              'FFFFF4CC'
          }
        };
    }
  }


  /* =======================================================
     COLUNAS INTERNAS ESCONDIDAS
     ======================================================= */

  sheet
    .getColumn(11)
    .hidden =
      true;


  sheet
    .getColumn(12)
    .hidden =
      true;


  sheet
    .getColumn(13)
    .hidden =
      true;


  /*
   * Facilita trabalhar quando tiver
   * muitos pendentes.
   */
  sheet.autoFilter = {
    from: 'A1',
    to: 'J1'
  };


  return Buffer.from(
    await workbook.xlsx.writeBuffer()
  );
}


function parseBenefits(
  workbook
) {
  const sheet =
    workbook.getWorksheet(
      'Beneficiamentos'
    );


  if (!sheet) {
    const error =
      new Error(
        'A aba Beneficiamentos não foi encontrada.'
      );

    error.status = 400;

    throw error;
  }


  const rows = [];


  for (
    let n = 2;
    n <= sheet.rowCount;
    n += 1
  ) {
    const row =
      sheet.getRow(n);


    const benefitNumber =
      text(
        cellValue(
          row.getCell(10)
        )
      );


    /*
     * Só revisa linhas onde o usuário
     * realmente informou um beneficiamento.
     */
    if (!benefitNumber) {
      continue;
    }


    rows.push({
      rowNumber:
        n,

      productionDate:
        dateOnly(
          cellValue(
            row.getCell(1)
          )
        ),

      materialName:
        text(
          cellValue(
            row.getCell(2)
          )
        ),

      modelName:
        text(
          cellValue(
            row.getCell(3)
          )
        ),

      machineName:
        text(
          cellValue(
            row.getCell(4)
          )
        ),

      generatedLot:
        text(
          cellValue(
            row.getCell(5)
          )
        ),

      quantity:
        number(
          cellValue(
            row.getCell(6)
          )
        ),

      primaryUnit:
        text(
          cellValue(
            row.getCell(7)
          )
        ),

      secondaryQty:
        number(
          cellValue(
            row.getCell(8)
          )
        ),

      realWeight:
        number(
          cellValue(
            row.getCell(9)
          )
        ),

      benefitNumber,

      productionId:
        Number(
          cellValue(
            row.getCell(11)
          )
          || 0
        ),

      lotIndex:
        Number(
          cellValue(
            row.getCell(12)
          )
          || 0
        ),

      token:
        text(
          cellValue(
            row.getCell(13)
          )
        )
    });
  }


  return rows;
}


function benefitMatches(
  row,
  snap
) {
  return (
    row.productionDate ===
      snap.productionDate

    &&

    normalize(
      row.materialName
    ) ===
      normalize(
        snap.materialName
      )

    &&

    normalize(
      row.modelName
    ) ===
      normalize(
        snap.modelName
      )

    &&

    normalize(
      row.machineName
    ) ===
      normalize(
        snap.machineName
      )

    &&

    normalize(
      row.generatedLot
    ) ===
      normalize(
        snap.generatedLot
      )

    &&

    Math.abs(
      row.quantity -
      snap.quantity
    ) < 0.000001

    &&

    normalize(
      row.primaryUnit
    ) ===
      normalize(
        snap.primaryUnit
      )

    &&

    Math.abs(
      row.secondaryQty -
      snap.secondaryQty
    ) < 0.000001

    &&

    Math.abs(
      row.realWeight -
      snap.realWeight
    ) < 0.000001
  );
}


function benefitReviewRow(
  row,
  statusKey,
  status,
  message,
  payload = null
) {
  return {
    rowNumber:
      row.rowNumber,

    productionDate:
      row.productionDate
      || '-',

    materialName:
      row.materialName
      || '-',

    generatedLot:
      row.generatedLot
      || '-',

    benefitNumber:
      row.benefitNumber
      || '-',

    statusKey,
    status,
    message,
    payload
  };
}


/* =========================================================
   REVISÃO DOS BENEFICIAMENTOS
   ========================================================= */

async function reviewBenefits(
  db,
  buffer
) {
  const workbook =
    await workbookFrom(
      buffer
    );


  const source =
    parseBenefits(
      workbook
    );


  if (!source.length) {
    const error =
      new Error(
        'Nenhum beneficiamento preenchido foi encontrado.'
      );

    error.status = 400;

    throw error;
  }


  const ids =
    [
      ...new Set(
        source
          .map(
            row =>
              row.productionId
          )
          .filter(
            id =>
              id > 0
          )
      )
    ];


  const launches =
    ids.length
      ? await db.unsafe(
          `
            SELECT *
            FROM production_launches
            WHERE id =
              ANY($1::bigint[])
          `,
          [
            ids
          ]
        )
      : [];


  const byId =
    new Map(
      launches.map(
        row => [
          Number(row.id),
          row
        ]
      )
    );


  const rows = [];


  for (
    const row
    of source
  ) {
    const launch =
      byId.get(
        row.productionId
      );


    if (!launch) {
      rows.push(
        benefitReviewRow(
          row,
          'invalid',
          'PRODUÇÃO NÃO ENCONTRADA',
          'A produção informada não existe mais.'
        )
      );

      continue;
    }


    const snap =
      snapshot(
        launch,
        row.lotIndex
      );


    if (!snap) {
      rows.push(
        benefitReviewRow(
          row,
          'invalid',
          'LOTE NÃO ENCONTRADO',
          'O lote não existe mais nesta produção.'
        )
      );

      continue;
    }


    const currentToken =
      snapshotToken(
        snap
      );


    /*
     * O registro mudou no sistema
     * depois que o Excel foi baixado.
     */
    if (
      row.token &&
      row.token !==
        currentToken
    ) {
      rows.push(
        benefitReviewRow(
          row,
          'changed',
          'REGISTRO ALTERADO',
          'A produção foi alterada no sistema depois que o arquivo foi baixado.'
        )
      );

      continue;
    }


    /*
     * Usuário mexeu em informações do lote
     * dentro do Excel.
     *
     * É exatamente o LOTE ALTERADO
     * que aparecia no sistema antigo.
     */
    if (
      !benefitMatches(
        row,
        snap
      )
    ) {
      rows.push(
        benefitReviewRow(
          row,
          'changed',
          'LOTE ALTERADO',
          'Dados informativos do lote foram alterados no arquivo.'
        )
      );

      continue;
    }


    if (
      snap.benefitNumber
    ) {
      const same =
        snap.benefitNumber ===
        row.benefitNumber;


      rows.push(
        benefitReviewRow(
          row,
          'already_done',

          same
            ? 'SEM ALTERAÇÃO'
            : 'JÁ BENEFICIADO',

          same
            ? 'Este beneficiamento já está aplicado.'
            : `O lote já possui beneficiamento ${snap.benefitNumber}.`
        )
      );

      continue;
    }


    rows.push(
      benefitReviewRow(
        row,
        'applicable',
        'APLICÁVEL',
        'Pronto para aplicar.',
        {
          productionId:
            row.productionId,

          lotIndex:
            row.lotIndex,

          benefitNumber:
            row.benefitNumber,

          expectedToken:
            currentToken
        }
      )
    );
  }


  return {
    rows,

    applicableCount:
      rows.filter(
        row =>
          row.statusKey ===
          'applicable'
      ).length,

    blockedCount:
      rows.filter(
        row =>
          row.statusKey !==
          'applicable'
      ).length
  };
}


/* =========================================================
   APLICAR BENEFICIAMENTOS
   ========================================================= */

async function applyBenefits(
  db,
  buffer
) {
  const review =
    await reviewBenefits(
      db,
      buffer
    );


  const applicable =
    review.rows.filter(
      row =>
        row.statusKey ===
          'applicable'
        &&
        row.payload
    );


  if (!applicable.length) {
    const error =
      new Error(
        'Nenhum beneficiamento aplicável foi encontrado.'
      );

    error.status = 400;

    throw error;
  }


  let appliedCount = 0;


  await db.begin(
    async tx => {

      for (
        const item
        of applicable
      ) {
        const payload =
          item.payload;


        const [launch] =
          await tx`
            SELECT *
            FROM production_launches

            WHERE id =
              ${payload.productionId}

            FOR UPDATE
          `;


        if (!launch) {
          continue;
        }


        const snap =
          snapshot(
            launch,
            payload.lotIndex
          );


        /*
         * Revalidação final antes
         * da gravação.
         */
        if (
          !snap
          ||
          snapshotToken(
            snap
          ) !==
            payload.expectedToken
          ||
          snap.benefitNumber
        ) {
          continue;
        }


        const lots =
          launch.produced_lots
            .map(
              lot => ({
                ...lot
              })
            );


        lots[
          payload.lotIndex
        ].benefitNumber =
          payload.benefitNumber;


        delete (
          lots[
            payload.lotIndex
          ].benefit_number
        );


        const firstBenefit =
          lots.find(
            lot =>
              text(
                lot.benefitNumber ||
                lot.benefit_number
              )
          )
            ?.benefitNumber
          || null;


        await tx`
          UPDATE production_launches

          SET
            produced_lots =
              ${tx.json(lots)},

            benefit_number =
              ${firstBenefit}

          WHERE id =
            ${payload.productionId}
        `;


        appliedCount +=
          1;
      }
    }
  );


  return {
    appliedCount,

    skippedCount:
      review.rows.length -
      appliedCount
  };
}


function publicReview(
  review
) {
  return {
    ...review,

    rows:
      review.rows.map(
        ({
          payload,
          ...row
        }) =>
          row
      )
  };
}


/* =========================================================
   ROTAS
   ========================================================= */

router.get(
  '/production-template',

  requirePermission(
    'launches:read'
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      sendXlsx(
        res,

        await productionTemplate(
          requireDb()
        ),

        `padrao-importacao-producao-${todayBrazil()}.xlsx`
      );
    } catch (error) {
      next(error);
    }
  }
);


router.post(
  '/production-review',

  requirePermission(
    'launches:write'
  ),

  upload.single('file'),

  async (
    req,
    res,
    next
  ) => {
    try {
      if (!req.file?.buffer) {
        return res
          .status(400)
          .json({
            error:
              'Selecione o arquivo de produção.'
          });
      }


      res.json(
        publicReview(
          await reviewProduction(
            requireDb(),
            req.file.buffer
          )
        )
      );

    } catch (error) {
      next(error);
    }
  }
);


router.post(
  '/production-apply',

  requirePermission(
    'launches:write'
  ),

  upload.single('file'),

  async (
    req,
    res,
    next
  ) => {
    try {
      if (!req.file?.buffer) {
        return res
          .status(400)
          .json({
            error:
              'Selecione o arquivo de produção.'
          });
      }


      const db =
        requireDb();


      const result =
        await applyProduction(
          db,
          req.file.buffer,
          req.user
        );


      await recordAuditLog(
        db,
        {
          user:
            req.user,

          action:
            'Importação de produção',

          module:
            'Produção',

          description:
            `Importou ${result.appliedCount} produção(ões) via Excel.`,

          recordRef:
            null
        }
      );


      res
        .status(201)
        .json(result);

    } catch (error) {
      next(error);
    }
  }
);


router.get(
  '/benefit-template',

  requirePermission(
    'launches:read'
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      sendXlsx(
        res,

        await benefitTemplate(
          requireDb()
        ),

        `beneficiamentos-pendentes-${todayBrazil()}.xlsx`
      );
    } catch (error) {
      next(error);
    }
  }
);


router.post(
  '/benefit-review',

  requirePermission(
    'launches:write'
  ),

  upload.single('file'),

  async (
    req,
    res,
    next
  ) => {
    try {
      if (!req.file?.buffer) {
        return res
          .status(400)
          .json({
            error:
              'Selecione o arquivo de beneficiamentos.'
          });
      }


      res.json(
        publicReview(
          await reviewBenefits(
            requireDb(),
            req.file.buffer
          )
        )
      );

    } catch (error) {
      next(error);
    }
  }
);


router.post(
  '/benefit-apply',

  requirePermission(
    'launches:write'
  ),

  upload.single('file'),

  async (
    req,
    res,
    next
  ) => {
    try {
      if (!req.file?.buffer) {
        return res
          .status(400)
          .json({
            error:
              'Selecione o arquivo de beneficiamentos.'
          });
      }


      const db =
        requireDb();


      const result =
        await applyBenefits(
          db,
          req.file.buffer
        );


      await recordAuditLog(
        db,
        {
          user:
            req.user,

          action:
            'Importação de beneficiamentos',

          module:
            'Produção',

          description:
            `Aplicou ${result.appliedCount} beneficiamento(s) via Excel.`,

          recordRef:
            null
        }
      );


      res.json(result);

    } catch (error) {
      next(error);
    }
  }
);


export default router;