export function InstitutionalFooter() {
  const footer = document.createElement('footer');
  footer.className = 'institutional-footer';
  footer.innerHTML = `
    <span>Powered by Catrion</span>
    <img src="/assets/logo-catrion.png" alt="Catrion" loading="lazy" />
  `;
  return footer;
}
