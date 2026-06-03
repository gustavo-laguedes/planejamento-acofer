export function CodeChipsInput({ initialCodes = [] } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'code-chips-input';
  wrapper.innerHTML = `
    <div class="chip-entry">
      <input class="code-input" placeholder="Digite um codigo" />
      <button class="secondary-button add-code" type="button">+</button>
    </div>
    <div class="chip-list"></div>
  `;

  const input = wrapper.querySelector('.code-input');
  const list = wrapper.querySelector('.chip-list');
  let codes = [];

  function render() {
    list.innerHTML = codes.map(code => `
      <span class="chip">${code}<button type="button" data-code="${code}" aria-label="Remover codigo ${code}">x</button></span>
    `).join('');
  }

  function addCode(value) {
    const code = String(value || '').trim();
    if (!code || codes.includes(code)) return;
    codes = [...codes, code];
    input.value = '';
    render();
  }

  wrapper.querySelector('.add-code').addEventListener('click', () => addCode(input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCode(input.value);
    }
  });
  list.addEventListener('click', event => {
    const code = event.target.dataset.code;
    if (!code) return;
    codes = codes.filter(item => item !== code);
    render();
  });

  function setCodes(nextCodes = []) {
    codes = nextCodes.map(code => String(code).trim()).filter(Boolean);
    input.value = '';
    render();
  }

  setCodes(initialCodes);

  return {
    element: wrapper,
    getCodes: () => codes,
    setCodes
  };
}
