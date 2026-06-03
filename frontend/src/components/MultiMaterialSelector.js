export function MultiMaterialSelector({ materials = [], selectedIds = [], excludeId = null } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'multi-material-selector';
  let selected = new Set(selectedIds.map(id => String(id)));

  function render() {
    const available = materials.filter(material => String(material.id) !== String(excludeId || ''));
    wrapper.innerHTML = available.length
      ? available.map(material => `
          <label class="checkbox-line material-option">
            <input type="checkbox" value="${material.id}" ${selected.has(String(material.id)) ? 'checked' : ''} />
            ${material.name}
          </label>
        `).join('')
      : '<div class="empty-state compact">Nenhum material cadastrado.</div>';
  }

  wrapper.addEventListener('change', event => {
    if (event.target.type !== 'checkbox') return;
    if (event.target.checked) selected.add(String(event.target.value));
    else selected.delete(String(event.target.value));
  });

  function setOptions({ materials: nextMaterials = materials, selectedIds: nextSelectedIds = [], excludeId: nextExcludeId = null } = {}) {
    materials = nextMaterials;
    selected = new Set(nextSelectedIds.map(id => String(id)));
    excludeId = nextExcludeId;
    render();
  }

  render();

  return {
    element: wrapper,
    getSelectedIds: () => [...selected].map(Number),
    setOptions
  };
}
