import { api, getCurrentUser } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { CodeChipsInput } from '../shared/CodeChipsInput.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { canAccess } from '../shared/rbac.js';

const registrationTabs = [
  { id: 'locations', label: 'Locais' },
  { id: 'machines', label: 'Máquinas' },
  { id: 'materialTypes', label: 'Tipos de Material' },
  { id: 'materials', label: 'Materiais' },
  { id: 'norms', label: 'Normas' }
];

export function RegistrationsPage() {
  const canWriteRegistrations = canAccess(getCurrentUser(), 'registrations:write');
  const page = document.createElement('section');
  page.className = 'stack registrations-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Cadastros / Locais</h1>
      </div>
    </div>
    <div class="registrations-target"></div>
  `;

  const pageTitle = page.querySelector('.page-header h1');
  const target = page.querySelector('.registrations-target');
  let activeTab = sessionStorage.getItem('planejamento_registration_tab') || 'locations';
  let locations = [];
  let machines = [];
  let materials = [];

  function toast(error) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message || error }));
  }

  function updatePageTitle() {
    const tab = registrationTabs.find(item => item.id === activeTab) || registrationTabs[0];
    pageTitle.textContent = `Cadastros / ${tab.label}`;
  }

  async function refreshLookups() {
    [locations, materials] = await Promise.all([
      api('/locations'),
      api('/materials')
    ]);
  }

  async function render() {
    updatePageTitle();
    setInternalLoading(target, 'Carregando cadastros...');
    try {
      if (activeTab === 'locations') return await renderLocations();
      if (activeTab === 'machines') return await renderMachines();
      if (activeTab === 'materialTypes') return await renderMaterialTypes();
      if (activeTab === 'materials') return await renderMaterials();
      return await renderNorms();
    } catch (error) {
      setInternalError(target, error.message || 'Nao foi possivel carregar os cadastros.');
      throw error;
    }
  }

  async function renderLocations() {
    target.innerHTML = sectionShell('Locais', 'Cadastrar local', 'Buscar por código ou local');
    const search = target.querySelector('.search');
    const tableTarget = target.querySelector('.table-target');
    let rows = [];

    async function load() {
      rows = await api(`/locations?search=${encodeURIComponent(search.value)}`);
      tableTarget.innerHTML = '';
      tableTarget.appendChild(DataTable({
        columns: [
          { label: 'Código', key: 'code' },
          { label: 'Nome do local', key: 'name' },
          { label: 'Status', render: row => row.active ? 'Ativo' : 'Inativo' },
          { label: 'Ações', render: row => canWriteRegistrations ? `<button class="link-button" data-edit="${row.id}">Editar</button>` : '' }
        ],
        rows
      }));
    }

    function openModal(row = null) {
      const modal = createModal(row ? 'Editar local' : 'Cadastrar local', `
        <form class="grid-form registration-form">
          <label>Código do local<input name="code" required /></label>
          <label>Nome do local<input name="name" required /></label>
          <div class="form-actions">
            ${row ? '<button class="danger-button delete-registration" type="button">Excluir</button>' : '<span></span>'}
            <button class="primary-button" type="submit">Salvar</button>
            <button class="secondary-button close-modal" type="button">Cancelar</button>
                   </div>
        </form>
      `);

      const form = modal.querySelector('form');
      form.elements.code.value = row?.code || '';
      form.elements.name.value = row?.name || '';
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const body = { code: form.elements.code.value, name: form.elements.name.value, active: true };
        await api(row ? `/locations/${row.id}` : '/locations', { method: row ? 'PUT' : 'POST', body });
        closeModal(modal);
        await load();
      });
      modal.querySelector('.delete-registration')?.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (!confirm('Tem certeza que deseja excluir este cadastro?')) return;
        await api(`/locations/${row.id}`, { method: 'DELETE' });
        closeModal(modal);
        await load();
      });
      form.elements.code.focus();
    }

    bindListEvents(target, () => rows, openModal);
    search.addEventListener('input', () => load().catch(toast));
    await load();
  }

  async function renderMachines() {
    await refreshLookups();
    target.innerHTML = sectionShell('Máquinas', 'Cadastrar máquina', 'Buscar por máquina ou local');
    const search = target.querySelector('.search');
    const tableTarget = target.querySelector('.table-target');
    let rows = [];

    async function load() {
      rows = await api(`/machines?search=${encodeURIComponent(search.value)}`);
      machines = rows;
      tableTarget.innerHTML = '';
      tableTarget.appendChild(DataTable({
        columns: [
          { label: 'Nome da máquina', key: 'name' },
          { label: 'Local', key: 'location_name' },
          { label: 'Status', render: row => row.active ? 'Ativo' : 'Inativo' },
          { label: 'Ações', render: row => canWriteRegistrations ? `<button class="link-button" data-edit="${row.id}">Editar</button>` : '' }
        ],
        rows
      }));
    }

    function locationOptions(selectedId = '') {
      return locations.map(location => `<option value="${location.id}" ${String(location.id) === String(selectedId) ? 'selected' : ''}>${location.name}</option>`).join('');
    }

    function openModal(row = null) {
      const modal = createModal(row ? 'Editar máquina' : 'Cadastrar máquina', `
        <form class="grid-form registration-form">
          <label>Nome da máquina<input name="name" required /></label>
          <label>Local<select name="locationId" required><option value="">Selecione</option>${locationOptions(row?.location_id)}</select></label>
          <div class="form-actions">
            ${row ? '<button class="danger-button delete-registration" type="button">Excluir</button>' : '<span></span>'}
            <button class="primary-button" type="submit">Salvar</button>
            <button class="secondary-button close-modal" type="button">Cancelar</button>
          </div>
        </form>
      `);
      const form = modal.querySelector('form');
      form.elements.name.value = row?.name || '';
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const body = {
          name: form.elements.name.value,
          locationId: Number(form.elements.locationId.value),
          active: true
        };
        await api(row ? `/machines/${row.id}` : '/machines', { method: row ? 'PUT' : 'POST', body });
        closeModal(modal);
        await load();
      });
      modal.querySelector('.delete-registration')?.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (!confirm('Tem certeza que deseja excluir este cadastro?')) return;
        await api(`/machines/${row.id}`, { method: 'DELETE' });
        closeModal(modal);
        await load();
      });
      form.elements.name.focus();
    }

    bindListEvents(target, () => rows, openModal);
    search.addEventListener('input', () => load().catch(toast));
    await load();
  }

  async function renderMaterialTypes() {
    target.innerHTML = sectionShell(
      'Tipos de Material',
      'Cadastrar tipo',
      'Buscar por tipo de material'
    );

    const search = target.querySelector('.search');
    const tableTarget = target.querySelector('.table-target');

    let rows = [];

    async function load() {
      rows = await api(
        `/material-types?search=${encodeURIComponent(search.value)}`
      );

      tableTarget.innerHTML = '';

      tableTarget.appendChild(
        DataTable({
          columns: [
            {
              label: 'Tipo de material',
              key: 'name'
            },
            {
              label: 'Exige comprimento',
              render: row =>
                row.requires_length
                  ? 'Sim'
                  : 'Não'
            },
            {
              label: 'Status',
              render: row =>
                row.active
                  ? 'Ativo'
                  : 'Inativo'
            },
            {
              label: 'Ações',
              render: row =>
                canWriteRegistrations
                  ? `<button class="link-button" data-edit="${row.id}">Editar</button>`
                  : ''
            }
          ],
          rows
        })
      );
    }

    function openModal(row = null) {
      const modal = createModal(
        row
          ? 'Editar tipo de material'
          : 'Cadastrar tipo de material',

        `
          <form class="grid-form registration-form">

            <label>
              Nome do tipo

              <input
                name="name"
                required
                placeholder="Ex.: Vareta"
              />
            </label>

            <label class="checkbox-line">
              <input
                name="requiresLength"
                type="checkbox"
              />

              Exige comprimento em metros
            </label>

            <label class="checkbox-line">
              <input
                name="active"
                type="checkbox"
              />

              Tipo ativo
            </label>

            <div class="form-actions">

              ${
                row
                  ? `
                    <button
                      class="danger-button delete-registration"
                      type="button"
                    >
                      Excluir
                    </button>
                  `
                  : '<span></span>'
              }

              <button
                class="primary-button"
                type="submit"
              >
                Salvar
              </button>

              <button
                class="secondary-button close-modal"
                type="button"
              >
                Cancelar
              </button>

            </div>

          </form>
        `
      );

      const form = modal.querySelector('form');

      form.elements.name.value =
        row?.name || '';

      form.elements.requiresLength.checked =
        row?.requires_length === true;

      form.elements.active.checked =
        row?.active !== false;

      form.addEventListener(
        'submit',
        async event => {
          event.preventDefault();

          const body = {
            name:
              form.elements.name.value,

            requiresLength:
              form.elements.requiresLength.checked,

            active:
              form.elements.active.checked
          };

          await api(
            row
              ? `/material-types/${row.id}`
              : '/material-types',

            {
              method:
                row
                  ? 'PUT'
                  : 'POST',

              body
            }
          );

          closeModal(modal);

          await load();
        }
      );

      modal
        .querySelector(
          '.delete-registration'
        )
        ?.addEventListener(
          'click',
          async event => {
            event.preventDefault();
            event.stopPropagation();

            if (
              !confirm(
                'Tem certeza que deseja excluir este tipo de material?'
              )
            ) {
              return;
            }

            try {
              await api(
                `/material-types/${row.id}`,
                {
                  method: 'DELETE'
                }
              );

              closeModal(modal);

              await load();

            } catch (error) {
              toast(
                error?.message
                || String(error)
              );
            }
          }
        );

      form.elements.name.focus();
    }

    bindListEvents(
      target,
      () => rows,
      openModal
    );

    search.addEventListener(
      'input',
      () =>
        load()
          .catch(error =>
            toast(
              error?.message
              || String(error)
            )
          )
    );

    await load();
  }

  async function renderMaterials() {
    await refreshLookups();
    const materialTypes = await api('/material-types');
    target.innerHTML = sectionShell('Materiais', 'Cadastrar material', 'Buscar por material ou código');
    const search = target.querySelector('.search');
    const tableTarget = target.querySelector('.table-target');
    let rows = [];

    async function load() {
      const searchValue = search.value;
      if (searchValue) {
        [materials, rows] = await Promise.all([
          api('/materials'),
          api(`/materials?search=${encodeURIComponent(searchValue)}`)
        ]);
      } else {
        rows = await api('/materials');
        materials = rows;
      }
      tableTarget.innerHTML = '';
      tableTarget.appendChild(DataTable({
        columns: [
          { label: 'Nome', key: 'name' },
          { label: 'Códigos', render: row => formatCodes(row.codes) },
          { label: 'Tipo', render: row => row.material_type_name || '-' },
          {
            label: 'Comprimento',
            render: row =>
              row.length_m !== null && row.length_m !== undefined
                ? `${Number(row.length_m).toLocaleString('pt-BR')} m`
                : '-'
          },
          { label: 'Unidade principal', key: 'primary_unit' },
          { label: 'Unidade secundária', key: 'secondary_unit' },
          { label: 'Fator', key: 'primary_to_secondary_factor' },

{
  label: 'Estoque mínimo',

  render: row =>
    row.minimum_quantity === null
    ||
    row.minimum_quantity === undefined

      ? '-'

      : `${row.minimum_quantity} ${row.primary_unit || ''}`
},

{
  label: 'Estoque máximo',

  render: row =>
    row.maximum_quantity === null
    ||
    row.maximum_quantity === undefined

      ? '-'

      : `${row.maximum_quantity} ${row.primary_unit || ''}`
},

{ label: 'Matéria-prima inicial', render: row => row.is_initial_raw_material ? 'Sim' : 'Não' },
          { label: 'Permite vendas', render: row => row.permits_sales === false ? 'Não' : 'Sim' },
          { label: 'Modelos de produção', render: row => formatProductionModels(row.production_models || row.input_materials) },
          { label: 'Status', render: row => row.active ? 'Ativo' : 'Inativo' },
          { label: 'Ações', render: row => canWriteRegistrations ? `<button class="link-button" data-edit="${row.id}">Editar</button>` : '' }
        ],
        rows
      }));
    }

    function materialTypeOptions(selectedId = '') {
      return materialTypes
        .filter(type =>
          type.active
          || String(type.id) === String(selectedId)
        )
        .map(type => `
          <option
            value="${type.id}"
            data-requires-length="${type.requires_length ? 'true' : 'false'}"
            ${String(type.id) === String(selectedId) ? 'selected' : ''}
          >
            ${type.name}${type.active ? '' : ' (Inativo)'}
          </option>
        `)
        .join('');
    }

    function openModal(row = null) {
      const selectedModels = normalizeProductionModels(row);
      const codeInput = CodeChipsInput({ initialCodes: row?.codes || [] });
      const modal = createModal(row ? 'Editar material' : 'Cadastrar material', `
        <form class="grid-form registration-form material-form">
          <label>Nome do material<input name="name" required /></label>

          <label>
            Tipo de material
            <select name="materialTypeId" required>
              <option value="">Selecione</option>
              ${materialTypeOptions(row?.material_type_id)}
            </select>
          </label>

          <label class="material-length-field" hidden>
            Comprimento (m)
            <input
              name="lengthM"
              type="number"
              min="0.001"
              step="0.001"
              inputmode="decimal"
            />
          </label>

          <label>Unidade principal<select name="primaryUnit" required><option value="un">un</option><option value="kg">kg</option></select></label>
          <label>Unidade secundária<select name="secondaryUnit" required><option value="un">un</option><option value="kg">kg</option></select></label>
          <label>
  Fator fixo
  <input
    name="primaryToSecondaryFactor"
    type="number"
    step="0.001"
    min="0.001"
    required
  />
</label>

<div class="material-stock-limits wide-field">

  <div class="material-stock-limit-card">
    <div class="material-stock-limit-heading">
      <strong>Estoque mínimo</strong>
      <span>Limite inferior desejado</span>
    </div>

    <div class="material-stock-limit-values">

      <label class="material-stock-limit-control">
        <span>Quantidade</span>

        <div class="material-stock-limit-input">
          <input
            name="minimumQuantity"
            type="number"
            step="0.001"
            min="0"
            placeholder="Sem limite"
          />

          <span
            class="material-stock-limit-unit"
            data-stock-limit-unit
          >
            un
          </span>
        </div>
      </label>

      <span
        class="material-stock-limit-conversion"
        aria-hidden="true"
      >
        ↔
      </span>

      <label class="material-stock-limit-control">
        <span>Peso equivalente</span>

        <div class="material-stock-limit-input">
          <input
            name="minimumWeightKg"
            type="number"
            step="0.001"
            min="0"
            placeholder="Peso"
          />

          <span class="material-stock-limit-unit">
            kg
          </span>
        </div>
      </label>

    </div>
  </div>

  <div class="material-stock-limit-card">
    <div class="material-stock-limit-heading">
      <strong>Estoque máximo</strong>
      <span>Limite superior desejado</span>
    </div>

    <div class="material-stock-limit-values">

      <label class="material-stock-limit-control">
        <span>Quantidade</span>

        <div class="material-stock-limit-input">
          <input
            name="maximumQuantity"
            type="number"
            step="0.001"
            min="0"
            placeholder="Sem limite"
          />

          <span
            class="material-stock-limit-unit"
            data-stock-limit-unit
          >
            un
          </span>
        </div>
      </label>

      <span
        class="material-stock-limit-conversion"
        aria-hidden="true"
      >
        ↔
      </span>

      <label class="material-stock-limit-control">
        <span>Peso equivalente</span>

        <div class="material-stock-limit-input">
          <input
            name="maximumWeightKg"
            type="number"
            step="0.001"
            min="0"
            placeholder="Peso"
          />

          <span class="material-stock-limit-unit">
            kg
          </span>
        </div>
      </label>

    </div>
  </div>

</div>

<label class="checkbox-line wide-field">
  <input
    name="isInitialRawMaterial"
    type="checkbox"
  />
  Matéria-prima inicial
</label>
          <label class="checkbox-line wide-field"><input name="permitsSales" type="checkbox" /> Permite vendas</label>
          <label class="wide-field">Códigos atrelados<div class="codes-target"></div></label>
          <div class="wide-field consumed-selector-block">
            <div class="section-heading compact-heading">
              <h3>Modelos de Produção</h3>
              <button class="secondary-button new-production-model" type="button">Novo modelo</button>
            </div>
            <div class="production-models-target"></div>
          </div>
          <div class="form-actions">
            ${row ? '<button class="danger-button delete-registration" type="button">Excluir</button>' : '<span></span>'}
            <button class="primary-button" type="submit">Salvar</button>
            <button class="secondary-button close-modal" type="button">Cancelar</button>
          </div>
                </form>
      `);

      modal
        .querySelector('.modal')
        ?.classList.add('material-registration-modal');

      const form = modal.querySelector('form');
      modal.querySelector('.codes-target').appendChild(codeInput.element);
      renderProductionModels(modal, selectedModels, row?.id || null);

      form.elements.name.value = row?.name || '';
      form.elements.materialTypeId.value = row?.material_type_id || '';
      form.elements.lengthM.value = row?.length_m ?? '';

      const materialLengthField = modal.querySelector('.material-length-field');

      const syncMaterialLengthField = () => {
        const selectedOption =
          form.elements.materialTypeId.selectedOptions[0];

        const requiresLength =
          selectedOption?.dataset.requiresLength === 'true';

        materialLengthField.hidden = !requiresLength;
        form.elements.lengthM.required = requiresLength;

        if (!requiresLength) {
          form.elements.lengthM.value = '';
        }
      };

      form.elements.materialTypeId.addEventListener(
        'change',
        syncMaterialLengthField
      );

      syncMaterialLengthField();

      form.elements.primaryUnit.value = row?.primary_unit || 'un';
      form.elements.secondaryUnit.value = row?.secondary_unit || 'kg';
      form.elements.primaryToSecondaryFactor.value =
  row?.primary_to_secondary_factor
  || '';

form.elements.minimumQuantity.value =
  row?.minimum_quantity
  ?? '';

form.elements.maximumQuantity.value =
  row?.maximum_quantity
  ?? '';

form.elements.isInitialRawMaterial.checked =
  row?.is_initial_raw_material
  === true;

const stockLimitFieldValue =
  value => {

    const number =
      Number(value);

    if (
      !Number.isFinite(number)
    ) {
      return '';
    }

    return String(
      Number(
        number.toFixed(3)
      )
    );
  };

const stockLimitCanConvertToKg =
  () => {

    const primaryUnit =
      form.elements
        .primaryUnit
        .value;

    const secondaryUnit =
      form.elements
        .secondaryUnit
        .value;

    const factor =
      Number(
        form.elements
          .primaryToSecondaryFactor
          .value
      );

    if (
      primaryUnit === 'kg'
    ) {
      return true;
    }

    return (
      secondaryUnit === 'kg'
      &&
      Number.isFinite(factor)
      &&
      factor > 0
    );
  };

const stockLimitPrimaryToKg =
  value => {

    if (
      value === ''
      ||
      value === null
      ||
      value === undefined
    ) {
      return '';
    }

    const quantity =
      Number(value);

    if (
      !Number.isFinite(quantity)
    ) {
      return '';
    }

    const primaryUnit =
      form.elements
        .primaryUnit
        .value;

    if (
      primaryUnit === 'kg'
    ) {
      return quantity;
    }

    const secondaryUnit =
      form.elements
        .secondaryUnit
        .value;

    const factor =
      Number(
        form.elements
          .primaryToSecondaryFactor
          .value
      );

    if (
      secondaryUnit !== 'kg'
      ||
      !Number.isFinite(factor)
      ||
      !(factor > 0)
    ) {
      return '';
    }

    return quantity * factor;
  };

const stockLimitKgToPrimary =
  value => {

    if (
      value === ''
      ||
      value === null
      ||
      value === undefined
    ) {
      return '';
    }

    const weight =
      Number(value);

    if (
      !Number.isFinite(weight)
    ) {
      return '';
    }

    const primaryUnit =
      form.elements
        .primaryUnit
        .value;

    if (
      primaryUnit === 'kg'
    ) {
      return weight;
    }

    const secondaryUnit =
      form.elements
        .secondaryUnit
        .value;

    const factor =
      Number(
        form.elements
          .primaryToSecondaryFactor
          .value
      );

    if (
      secondaryUnit !== 'kg'
      ||
      !Number.isFinite(factor)
      ||
      !(factor > 0)
    ) {
      return '';
    }

    return weight / factor;
  };

const syncStockLimitUnits =
  () => {

    const primaryUnit =
      form.elements
        .primaryUnit
        .value
      || '';

    modal
      .querySelectorAll(
        '[data-stock-limit-unit]'
      )
      .forEach(
        target => {

          target.textContent =
            primaryUnit;

        }
      );

  };

const syncStockLimitWeightAvailability =
  () => {

    const available =
      stockLimitCanConvertToKg();

    [
      form.elements.minimumWeightKg,
      form.elements.maximumWeightKg
    ]
      .forEach(
        input => {

          input.disabled =
            !available;

          input.placeholder =
            available
              ? 'Peso'
              : 'Sem conversão';

        }
      );

  };

const syncMinimumWeightFromQuantity =
  () => {

    const weight =
      stockLimitPrimaryToKg(
        form.elements
          .minimumQuantity
          .value
      );

    form.elements
      .minimumWeightKg
      .value =
        weight === ''
          ? ''
          : stockLimitFieldValue(
              weight
            );

  };

const syncMaximumWeightFromQuantity =
  () => {

    const weight =
      stockLimitPrimaryToKg(
        form.elements
          .maximumQuantity
          .value
      );

    form.elements
      .maximumWeightKg
      .value =
        weight === ''
          ? ''
          : stockLimitFieldValue(
              weight
            );

  };

const syncMinimumQuantityFromWeight =
  () => {

    const quantity =
      stockLimitKgToPrimary(
        form.elements
          .minimumWeightKg
          .value
      );

    form.elements
      .minimumQuantity
      .value =
        quantity === ''
          ? ''
          : stockLimitFieldValue(
              quantity
            );

  };

const syncMaximumQuantityFromWeight =
  () => {

    const quantity =
      stockLimitKgToPrimary(
        form.elements
          .maximumWeightKg
          .value
      );

    form.elements
      .maximumQuantity
      .value =
        quantity === ''
          ? ''
          : stockLimitFieldValue(
              quantity
            );

  };

const syncAllStockLimitWeights =
  () => {

    syncStockLimitUnits();

    syncStockLimitWeightAvailability();

    syncMinimumWeightFromQuantity();

    syncMaximumWeightFromQuantity();

  };

syncAllStockLimitWeights();

form.elements
  .minimumQuantity
  .addEventListener(
    'input',
    syncMinimumWeightFromQuantity
  );

form.elements
  .minimumWeightKg
  .addEventListener(
    'input',
    syncMinimumQuantityFromWeight
  );

form.elements
  .maximumQuantity
  .addEventListener(
    'input',
    syncMaximumWeightFromQuantity
  );

form.elements
  .maximumWeightKg
  .addEventListener(
    'input',
    syncMaximumQuantityFromWeight
  );

form.elements
  .primaryUnit
  .addEventListener(
    'change',
    syncAllStockLimitWeights
  );

form.elements
  .secondaryUnit
  .addEventListener(
    'change',
    syncAllStockLimitWeights
  );

form.elements
  .primaryToSecondaryFactor
  .addEventListener(
    'input',
    syncAllStockLimitWeights
  );

      form.elements.permitsSales.checked = row?.permits_sales !== false;

      form.addEventListener('submit', async event => {
        event.preventDefault();

        const body = {
          name: form.elements.name.value,
          codes: codeInput.getCodes(),
          materialTypeId: Number(form.elements.materialTypeId.value),
          lengthM:
            form.elements.lengthM.value === ''
              ? null
              : Number(form.elements.lengthM.value),
          primaryUnit: form.elements.primaryUnit.value,
          secondaryUnit: form.elements.secondaryUnit.value,
          primaryToSecondaryFactor:
  Number(
    form.elements
      .primaryToSecondaryFactor
      .value
  ),

minimumQuantity:
  form.elements
    .minimumQuantity
    .value === ''

    ? null

    : Number(
        form.elements
          .minimumQuantity
          .value
      ),

maximumQuantity:
  form.elements
    .maximumQuantity
    .value === ''

    ? null

    : Number(
        form.elements
          .maximumQuantity
          .value
      ),

isInitialRawMaterial:
  form.elements
    .isInitialRawMaterial
    .checked,
          permitsSales: form.elements.permitsSales.checked,
          productionModels: getProductionModels(modal),
          active: true
        };

        await api(row ? `/materials/${row.id}` : '/materials', { method: row ? 'PUT' : 'POST', body });
        closeModal(modal);
        await load();
      });

      modal.querySelector('.delete-registration')?.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (!confirm('Tem certeza que deseja excluir este cadastro?')) return;

        try {
          await api(`/materials/${row.id}`, { method: 'DELETE' });
          closeModal(modal);
          await load();
        } catch (error) {
          toast(error);
        }
      });

      form.elements.name.focus();
    }

    bindListEvents(target, () => rows, openModal);
    search.addEventListener('input', () => load().catch(toast));
    await load();
  }

  async function renderNorms() {
    await refreshLookups();

    target.innerHTML =
      sectionShell(
        'Normas',
        'Cadastrar norma',
        'Buscar por norma ou material'
      );

    const search =
      target.querySelector(
        '.search'
      );

    const tableTarget =
      target.querySelector(
        '.table-target'
      );

    let rows = [];

    function escapeNormHtml(value) {
      return String(
        value ?? ''
      )
        .replaceAll(
          '&',
          '&amp;'
        )
        .replaceAll(
          '<',
          '&lt;'
        )
        .replaceAll(
          '>',
          '&gt;'
        )
        .replaceAll(
          '"',
          '&quot;'
        )
        .replaceAll(
          "'",
          '&#039;'
        );
    }

    async function load() {
      rows =
        await api(
          `/norms?search=${encodeURIComponent(search.value)}`
        );

      tableTarget.innerHTML =
        '';

      tableTarget.appendChild(
        DataTable({
          columns: [
            {
              label:
                'Norma',

              key:
                'name'
            },

            {
              label:
                'Descrição',

              render:
                row =>
                  escapeNormHtml(
                    row.description
                    || '-'
                  )
            },

            {
              label:
                'Materiais configurados',

              render:
                row =>
                  String(
                    (
                      row.materials
                      || []
                    ).length
                  )
            },

            {
              label:
                'Status',

              render:
                row =>
                  row.active
                    ? 'Ativa'
                    : 'Inativa'
            },

            {
              label:
                'Ações',

              render:
                row =>
                  canWriteRegistrations
                    ? `<button class="link-button" data-edit="${row.id}">Editar</button>`
                    : ''
            }
          ],

          rows
        })
      );
    }

    function openModal(
      row = null
    ) {
      const modal =
        createModal(
          row
            ? 'Editar norma'
            : 'Cadastrar norma',

          `
            <form class="grid-form registration-form norm-registration-form">

              <label>
                Nome da norma

                <input
                  name="name"
                  required
                  placeholder="Ex.: NBR 7480:2024"
                />
              </label>

              <label class="checkbox-line">
                <input
                  name="active"
                  type="checkbox"
                />

                Norma ativa
              </label>

              <label class="wide-field">
                Descrição

                <textarea
                  name="description"
                  rows="3"
                  placeholder="Descrição opcional da norma"
                ></textarea>
              </label>

              <div class="wide-field norm-materials-editor">

                <div class="section-heading compact-heading">

                  <div>
                    <h3>
                      Parâmetros por material
                    </h3>

                    <p class="muted-text">
                      Informe os pesos de 1 metro em kg/m.
                    </p>
                  </div>

                  ${
                    canWriteRegistrations
                      ? `
                        <button
                          class="secondary-button add-norm-material"
                          type="button"
                        >
                          Adicionar material
                        </button>
                      `
                      : ''
                  }

                </div>

                <div class="norm-materials-target"></div>

              </div>

              <div class="form-actions wide-field">

                ${
                  row
                    ? `
                      <button
                        class="danger-button delete-registration"
                        type="button"
                      >
                        Excluir
                      </button>
                    `
                    : '<span></span>'
                }

                <button
                  class="primary-button"
                  type="submit"
                >
                  Salvar
                </button>

                <button
                  class="secondary-button close-modal"
                  type="button"
                >
                  Cancelar
                </button>

              </div>

            </form>
          `
        );

      modal
        .querySelector(
          '.modal'
        )
        ?.classList.add(
          'wide-modal',
          'norm-registration-modal'
        );

      const form =
        modal.querySelector(
          'form'
        );

      const materialsTarget =
        modal.querySelector(
          '.norm-materials-target'
        );

      const activeMaterials =
        materials.filter(
          material =>
            material.active
            !== false
        );

      let normMaterials =
        (
          row?.materials
          || []
        ).map(
          item => ({
            materialId:
              Number(
                item.materialId
              ),

            nominalWeightPerMeter:
              item.nominalWeightPerMeter,

            minimumWeightPerMeter:
              item.minimumWeightPerMeter,

            maximumWeightPerMeter:
              item.maximumWeightPerMeter
          })
        );

      function materialOptions(
        selectedId
      ) {
        return activeMaterials
          .map(
            material => `
              <option
                value="${material.id}"
                ${
                  String(material.id)
                  ===
                  String(selectedId)

                    ? 'selected'
                    : ''
                }
              >
                ${
                  escapeNormHtml(
                    material.name
                  )
                }${
                  material.codes?.length
                    ? ` — ${
                        escapeNormHtml(
                          material.codes.join(', ')
                        )
                      }`
                    : ''
                }
              </option>
            `
          )
          .join('');
      }

      function renderMaterialRows() {
        materialsTarget.innerHTML =
          normMaterials.length

            ? normMaterials
                .map(
                  (item, index) => `
                    <article
                      class="norm-material-row"
                      data-norm-material-index="${index}"
                    >

                      <label>
                        Material

                        <select
                          name="materialId"
                          required
                        >
                          <option value="">
                            Selecione
                          </option>

                          ${
                            materialOptions(
                              item.materialId
                            )
                          }
                        </select>
                      </label>

                      <label>
                        Peso nominal (kg/m)

                        <input
                          name="nominalWeightPerMeter"
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          value="${
                            escapeNormHtml(
                              item.nominalWeightPerMeter
                              ?? ''
                            )
                          }"
                          required
                        />
                      </label>

                      <label>
                        Peso mínimo (kg/m)

                        <input
                          name="minimumWeightPerMeter"
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          value="${
                            escapeNormHtml(
                              item.minimumWeightPerMeter
                              ?? ''
                            )
                          }"
                          required
                        />
                      </label>

                      <label>
                        Peso máximo (kg/m)

                        <input
                          name="maximumWeightPerMeter"
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          value="${
                            escapeNormHtml(
                              item.maximumWeightPerMeter
                              ?? ''
                            )
                          }"
                          required
                        />
                      </label>

                      ${
                        canWriteRegistrations
                          ? `
                            <button
                              class="link-button danger remove-norm-material"
                              type="button"
                            >
                              Remover
                            </button>
                          `
                          : ''
                      }

                    </article>
                  `
                )
                .join('')

            : `
                <div class="empty-state compact">
                  Nenhum material configurado nesta norma.
                </div>
              `;
      }

      form.elements
        .name
        .value =
          row?.name
          || '';

      form.elements
        .description
        .value =
          row?.description
          || '';

      form.elements
        .active
        .checked =
          row?.active
          !== false;

      renderMaterialRows();

      modal
        .querySelector(
          '.add-norm-material'
        )
        ?.addEventListener(
          'click',
          () => {
            const used =
              new Set(
                normMaterials.map(
                  item =>
                    String(
                      item.materialId
                      || ''
                    )
                )
              );

            const available =
              activeMaterials.find(
                material =>
                  !used.has(
                    String(
                      material.id
                    )
                  )
              );

            normMaterials.push({
              materialId:
                available?.id
                || '',

              nominalWeightPerMeter:
                '',

              minimumWeightPerMeter:
                '',

              maximumWeightPerMeter:
                ''
            });

            renderMaterialRows();
          }
        );

      function syncNormMaterialField(
        event
      ) {
        const card =
          event.target.closest(
            '[data-norm-material-index]'
          );

        if (
          !card
          ||
          !event.target.name
        ) {
          return;
        }

        const item =
          normMaterials[
            Number(
              card.dataset
                .normMaterialIndex
            )
          ];

        if (!item) {
          return;
        }

        if (
          event.target.name
          === 'materialId'
        ) {
          item.materialId =
            Number(
              event.target.value
            )
            || '';

          return;
        }

        if (
          [
            'nominalWeightPerMeter',
            'minimumWeightPerMeter',
            'maximumWeightPerMeter'
          ].includes(
            event.target.name
          )
        ) {
          item[
            event.target.name
          ] =
            event.target.value;
        }
      }

      materialsTarget
        .addEventListener(
          'input',
          syncNormMaterialField
        );

      materialsTarget
        .addEventListener(
          'change',
          syncNormMaterialField
        );

      materialsTarget
        .addEventListener(
          'click',
          event => {
            const button =
              event.target.closest(
                '.remove-norm-material'
              );

            if (!button) {
              return;
            }

            const card =
              button.closest(
                '[data-norm-material-index]'
              );

            normMaterials.splice(
              Number(
                card.dataset
                  .normMaterialIndex
              ),
              1
            );

            renderMaterialRows();
          }
        );

      form.addEventListener(
        'submit',
        async event => {
          event.preventDefault();

          const materialRows =
            [
              ...materialsTarget
                .querySelectorAll(
                  '.norm-material-row'
                )
            ].map(
              card => ({
                materialId:
                  Number(
                    card
                      .querySelector(
                        '[name="materialId"]'
                      )
                      .value
                  ),

                nominalWeightPerMeter:
                  Number(
                    card
                      .querySelector(
                        '[name="nominalWeightPerMeter"]'
                      )
                      .value
                  ),

                minimumWeightPerMeter:
                  Number(
                    card
                      .querySelector(
                        '[name="minimumWeightPerMeter"]'
                      )
                      .value
                  ),

                maximumWeightPerMeter:
                  Number(
                    card
                      .querySelector(
                        '[name="maximumWeightPerMeter"]'
                      )
                      .value
                  )
              })
            );

          if (!materialRows.length) {
            toast(
              'Adicione pelo menos um material à norma.'
            );

            return;
          }

          const ids =
            materialRows.map(
              item =>
                item.materialId
            );

          if (
            new Set(ids).size
            !==
            ids.length
          ) {
            toast(
              'O mesmo material não pode aparecer duas vezes na mesma norma.'
            );

            return;
          }

          const invalid =
            materialRows.some(
              item =>
                !item.materialId

                ||

                !(
                  item.minimumWeightPerMeter
                  > 0
                )

                ||

                !(
                  item.nominalWeightPerMeter
                  > 0
                )

                ||

                !(
                  item.maximumWeightPerMeter
                  > 0
                )

                ||

                item.minimumWeightPerMeter
                  >
                item.nominalWeightPerMeter

                ||

                item.nominalWeightPerMeter
                  >
                item.maximumWeightPerMeter
            );

          if (invalid) {
            toast(
              'Confira os parâmetros. Deve ser: mínimo ≤ nominal ≤ máximo, todos maiores que zero.'
            );

            return;
          }

          const body = {
            name:
              form.elements
                .name
                .value,

            description:
              form.elements
                .description
                .value,

            active:
              form.elements
                .active
                .checked,

            materials:
              materialRows
          };

          await api(
            row
              ? `/norms/${row.id}`
              : '/norms',

            {
              method:
                row
                  ? 'PUT'
                  : 'POST',

              body
            }
          );

          closeModal(modal);

          await load();
        }
      );

      modal
        .querySelector(
          '.delete-registration'
        )
        ?.addEventListener(
          'click',
          async event => {
            event.preventDefault();
            event.stopPropagation();

            if (
              !confirm(
                'Tem certeza que deseja excluir esta norma?'
              )
            ) {
              return;
            }

            await api(
              `/norms/${row.id}`,
              {
                method:
                  'DELETE'
              }
            );

            closeModal(modal);

            await load();
          }
        );

      form.elements
        .name
        .focus();
    }

    bindListEvents(
      target,
      () => rows,
      openModal
    );

    search.addEventListener(
      'input',
      () =>
        load()
          .catch(toast)
    );

    await load();
  }

  function sectionShell(title, buttonLabel, searchPlaceholder) {
    return `
      <div class="panel">
        <div class="section-heading">
          <h2>${title}</h2>
          ${canWriteRegistrations ? `<button class="primary-button add-registration" type="button">${buttonLabel}</button>` : ''}
        </div>
        <div class="toolbar list-actions registration-actions">
          <input class="search" placeholder="${searchPlaceholder}" />
        </div>
        <div class="table-target"></div>
      </div>
    `;
  }

  function bindListEvents(container, getRows, openModal) {
    if (!canWriteRegistrations) return;
    container.querySelector('.add-registration').addEventListener('click', () => openModal());
    container.querySelector('.table-target').addEventListener('click', event => {
      const id = event.target.dataset.edit;
      if (!id) return;
      const row = getRows().find(item => String(item.id) === String(id));
      if (row) openModal(row);
    });
  }

  function createModal(title, body) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="registration-modal-title">
        <div class="modal-header">
          <h2 id="registration-modal-title">${title}</h2>
          <button class="link-button close-modal" type="button" aria-label="Fechar">Fechar</button>
        </div>
        ${body}
      </div>
    `;
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) closeModal(backdrop);
    });
    page.appendChild(backdrop);
    return backdrop;
  }

  function closeModal(modal) {
    modal.remove();
  }

  function formatCodes(codes = []) {
    return Array.isArray(codes) ? codes.join(', ') : '';
  }

  function normalizeProductionModels(row = null) {
    const sourceModels = Array.isArray(row?.production_models) && row.production_models.length
      ? row.production_models
      : [{ name: 'Modelo padrão', inputMaterials: row?.input_materials || [] }];
    return sourceModels.map((model, index) => ({
      name: model.name || model.modelName || `Modelo ${index + 1}`,
      inputs: new Map((model.inputMaterials || model.inputs || []).map(input => [
        String(input.inputMaterialId || input.id),
        input.qtyPerOutput || 1
      ]))
    }));
  }

  function formatProductionModels(models = []) {
    const normalized = Array.isArray(models) && models[0]?.inputMaterials
      ? models
      : [{ name: 'Modelo padrão', inputMaterials: models }];
    return normalized
      .filter(model => (model.inputMaterials || []).length)
      .map(model => `${model.name || model.modelName || 'Modelo padrão'}: ${(model.inputMaterials || []).map(input => `${input.name} (${input.qtyPerOutput || 1})`).join(', ')}`)
      .join(' | ');
  }

  function renderProductionModels(modal, selectedModels, excludeId) {
    const target = modal.querySelector('.production-models-target');
    const available = materials.filter(material => String(material.id) !== String(excludeId || ''));
    const render = () => {
      target.innerHTML = selectedModels.map((model, modelIndex) => `
        <article class="production-model-card" data-model-index="${modelIndex}">
          <div class="production-model-card-header">
            <label>Nome do modelo<input class="production-model-name" value="${model.name}" required /></label>
            ${selectedModels.length > 1 ? `<button class="link-button danger remove-production-model" type="button">Remover</button>` : ''}
          </div>
          <div class="material-selector-list">
            ${available.length
              ? available.map(material => `
                  <label class="checkbox-line material-option">
                    <input class="model-material-check" type="checkbox" value="${material.id}" ${model.inputs.has(String(material.id)) ? 'checked' : ''} />
                    ${material.name}
                  </label>
                `).join('')
              : '<div class="empty-state compact">Nenhum material cadastrado.</div>'}
          </div>
          <h3>Materiais consumidos</h3>
          <div class="consumed-materials-target">
            ${consumedRowsHtml(model)}
          </div>
        </article>
      `).join('');
    };

    target.addEventListener('input', event => {
      const card = event.target.closest('[data-model-index]');
      if (!card) return;
      const model = selectedModels[Number(card.dataset.modelIndex)];
      if (event.target.classList.contains('production-model-name')) model.name = event.target.value;
      if (event.target.classList.contains('usage-qty')) model.inputs.set(String(event.target.dataset.materialId), Number(event.target.value || 1));
    });

    target.addEventListener('change', event => {
      if (!event.target.classList.contains('model-material-check')) return;
      const card = event.target.closest('[data-model-index]');
      const model = selectedModels[Number(card.dataset.modelIndex)];
      if (event.target.checked) model.inputs.set(String(event.target.value), 1);
      else model.inputs.delete(String(event.target.value));
      render();
    });

    target.addEventListener('click', event => {
      if (!event.target.classList.contains('remove-production-model')) return;
      const card = event.target.closest('[data-model-index]');
      selectedModels.splice(Number(card.dataset.modelIndex), 1);
      render();
    });

    modal.querySelector('.new-production-model').addEventListener('click', () => {
      selectedModels.push({ name: `Modelo ${selectedModels.length + 1}`, inputs: new Map() });
      render();
    });

    render();
  }

  function consumedRowsHtml(model) {
    const selectedRows = [...model.inputs.entries()]
      .map(([id, qty]) => ({ material: materials.find(item => String(item.id) === id), qty }))
      .filter(row => row.material);

    return selectedRows.length
      ? `
        <div class="consumed-material-header">
          <strong>Material consumido</strong>
          <strong>Quantidade utilizada</strong>
        </div>
        ${selectedRows.map(row => `
          <div class="consumed-material-row" data-material-id="${row.material.id}">
            <span>${row.material.name}</span>
            <input class="usage-qty" data-material-id="${row.material.id}" type="number" step="0.001" min="0.001" value="${row.qty || 1}" />
          </div>
        `).join('')}
      `
      : '<div class="empty-state compact">Nenhum material consumido selecionado.</div>';
  }

  function getProductionModels(modal) {
    return [...modal.querySelectorAll('.production-model-card')].map(card => ({
      name: card.querySelector('.production-model-name').value || 'Modelo padrão',
      inputMaterials: [...card.querySelectorAll('.consumed-material-row')].map(row => ({
        inputMaterialId: Number(row.dataset.materialId),
        qtyPerOutput: Number(row.querySelector('.usage-qty').value || 1)
      }))
    })).filter(model => model.inputMaterials.length);
  }

  render().catch(toast);
  return page;
}
