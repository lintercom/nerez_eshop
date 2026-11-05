'use strict';
const Basket = (() => {
  const storageKey = 'nerez-inquiry-basket-v1';
  const maxQuantity = 9999;
  let products = new Map(), lines = new Map(), notify = () => {}, openPanel, closePanel;
  const quantity = value => Math.min(maxQuantity, Math.max(1, Math.floor(Number(value) || 1)));
  const product = id => products.get(String(id)) || products.get(Number(id));
  const entries = () => [...lines].map(([id, qty]) => ({ id, qty, product: product(id) })).filter(line => line.product);
  const price = item => Number.isFinite(Number(item.price)) ? Math.max(0, Number(item.price)) : 0;
  const total = () => entries().reduce((sum, line) => sum + price(line.product) * line.qty, 0);
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify([...lines])); } catch (_) { /* A basket also works without browser storage. */ }
    const count = document.getElementById('cart-count');
    if (count) count.textContent = [...lines.values()].reduce((sum, qty) => sum + qty, 0);
  }
  function inquiryText() {
    return ['Dobrý den,', '', 'prosím o ověření dostupnosti a cen následujících náhradních dílů:', '',
      ...entries().map(({ product: item, qty }) => `${qty} ${item.unit || 'ks'} × ${item.name}\nKód: ${item.code || item.id}\nOrientačně: ${money(price(item))} / ${item.unit || 'ks'} vč. DPH`),
      '', `Orientační součet vč. DPH: ${money(total())}`, '', 'Prosím o potvrzení aktuální ceny, dostupnosti a podmínek dodání.', '', 'Jméno / firma:', 'Telefon:', 'Poznámka:', '', 'Děkuji.'].join('\n');
  }
  function emailUrl() { return 'mailto:nerez@nerez.com?subject=' + encodeURIComponent('Poptávka náhradních dílů') + '&body=' + encodeURIComponent(inquiryText()); }
  function download() {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + inquiryText()], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'nerez-poptavka.txt'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Seznam poptávky byl stažen');
  }
  function open() {
    const items = entries();
    const html = dialogHeader('Poptávkový košík') + (items.length ? `
      <div class="basket-intro"><p class="muted">Vybrané díly můžete nezávazně poptat u NEREZu.</p></div>
      <div class="basket-list">${items.map(({ id, qty, product: item }) => `
        <article class="basket-line" data-basket-line="${esc(id)}">
          <img class="basket-image" src="${esc(item.image || '')}" alt="" loading="lazy">
          <div class="basket-detail"><span class="basket-code">${esc(item.code || '')}</span><h3>${esc(item.name)}</h3>
            <div class="basket-line-bottom"><div class="quantity basket-quantity"><button type="button" data-basket-action="decrease" data-basket-id="${esc(id)}" aria-label="Snížit množství: ${esc(item.name)}" ${qty === 1 ? 'disabled' : ''}>${icon('minus')}</button><input type="number" min="1" max="${maxQuantity}" step="1" value="${qty}" data-basket-quantity="${esc(id)}" aria-label="Množství: ${esc(item.name)}"><button type="button" data-basket-action="increase" data-basket-id="${esc(id)}" aria-label="Zvýšit množství: ${esc(item.name)}" ${qty === maxQuantity ? 'disabled' : ''}>${icon('plus')}</button></div><strong>${money(price(item) * qty)}</strong></div>
            <span class="basket-unit-price muted">${money(price(item))} / ${esc(item.unit || 'ks')} vč. DPH</span>
          </div><button class="basket-remove" type="button" data-basket-action="remove" data-basket-id="${esc(id)}" aria-label="Odebrat: ${esc(item.name)}">${icon('trash')}</button>
        </article>`).join('')}</div>
      <div class="basket-summary"><div><span>Orientační součet</span><strong>${money(total())}</strong></div><p class="muted">Částka zahrnuje DPH. Cenu a dostupnost potvrdí NEREZ.</p></div>
      <div class="basket-actions"><button type="button" class="button primary" data-basket-action="email">${icon('mail')} ${emailUrl().length > 1800 ? 'Připravit poptávku v souboru' : 'Připravit e-mailovou poptávku'}</button><button type="button" class="button secondary" data-basket-action="download">${icon('download')} Stáhnout seznam dílů</button></div>
      <p class="basket-help muted">${emailUrl().length > 1800 ? 'Seznam je delší. Stáhněte soubor a přiložte jej k e-mailu na nerez@nerez.com.' : 'Tlačítko otevře váš e-mailový program s připraveným textem. Doplňte kontakt a e-mail sami odešlete na nerez@nerez.com. Pokud se program neotevře, stáhněte seznam a přiložte jej k e-mailu.'} </p>
    ` : `<div class="basket-empty">${icon('cart')}<h3>Váš košík je prázdný</h3><p class="muted">Vyberte díly a přidejte je do nezávazné poptávky.</p><button type="button" class="button primary" data-basket-action="continue">Prohlédnout nabídku ${icon('arrow-right')}</button></div>`);
    openPanel('cart', html);
  }
  function init(options) {
    products = options.products; notify = options.notify; openPanel = options.openPanel; closePanel = options.closePanel;
    lines = new Map();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) saved.forEach(line => {
        if (Array.isArray(line) && product(line[0]) && Number.isFinite(Number(line[1])) && Number(line[1]) > 0) lines.set(String(line[0]), quantity(line[1]));
      });
    } catch (_) { /* Ignore unavailable storage or malformed saved data. */ }
    persist();
    if (init.bound) return;
    init.bound = true;
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-basket-action]');
      if (!target) return;
      const action = target.dataset.basketAction, id = target.dataset.basketId;
      if (action === 'continue') { closePanel(); return; }
      if (!entries().length) return;
      if (action === 'download') { download(); return; }
      if (action === 'email') {
        const url = emailUrl();
        if (url.length > 1800) { download(); notify('Přiložte stažený seznam k e-mailu na nerez@nerez.com'); }
        else window.location.href = url;
        return;
      }
      if (!lines.has(id)) return;
      if (action === 'remove') lines.delete(id);
      else if (action === 'increase' || action === 'decrease') lines.set(id, quantity(lines.get(id) + (action === 'increase' ? 1 : -1)));
      else return;
      persist(); open();
    });
    document.addEventListener('change', event => {
      const input = event.target.closest('[data-basket-quantity]');
      if (!input || !lines.has(input.dataset.basketQuantity)) return;
      lines.set(input.dataset.basketQuantity, quantity(input.value)); persist(); open();
    });
  }
  function add(id, qty = 1) {
    id = String(id);
    if (!product(id)) return;
    lines.set(id, quantity((lines.get(id) || 0) + quantity(qty))); persist(); notify('Přidáno do košíku');
  }
  return { init, add, open };
})();
