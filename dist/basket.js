'use strict';
const Basket = (() => {
  const storageKey = 'nerez-inquiry-basket-v1';
  let products = new Map(), lines = new Map();
  const get = id => products.get(String(id));
  const entries = () => [...lines].filter(([id]) => get(id)).map(([id,qty])=>({id,qty,product:get(id)}));
  const total = () => entries().reduce((sum,line)=>sum+Math.round(Number(line.product.price)*100)*line.qty,0)/100;
  const max = id => Math.max(0,Number(get(id)?.stock)||0);
  function persist() {
    try { localStorage.setItem(storageKey,JSON.stringify([...lines])); } catch {}
    document.querySelector('#cart-count').textContent = entries().reduce((sum,l)=>sum+l.qty,0);
  }
  function render() {
    const items = entries();
    renderPage('cart', pageHeading('Košík')+Checkout.steps(1)+(items.length ? `<div class="checkout-layout"><section class="checkout-card"><h2>Vybrané zboží</h2>${items.map(({id,qty,product:p})=>`<article class="order-line"><img src="${esc(p.image)}" alt=""><div><a data-product="${esc(id)}" href="${esc(urlWith({stranka:null,dil:id}))}"><strong>${esc(displayName(p))}</strong></a><p class="muted">Kód ${esc(p.code)} · ${money(p.price)} / ks s DPH</p><p class="muted">Ukázkový stav: ${max(id)} ks</p><div class="quantity"><button type="button" data-cart="minus" data-id="${esc(id)}" aria-label="Snížit množství" ${qty<=1?'disabled':''}>${icon('minus')}</button><input data-cart-qty="${esc(id)}" type="number" min="1" max="${max(id)}" value="${qty}" aria-label="Množství ${esc(displayName(p))}"><button type="button" data-cart="plus" data-id="${esc(id)}" aria-label="Zvýšit množství" ${qty>=max(id)?'disabled':''}>${icon('plus')}</button></div></div><div class="order-line-end"><strong>${money(p.price*qty)}</strong><button type="button" class="text-button" data-cart="remove" data-id="${esc(id)}">Odebrat</button></div></article>`).join('')}<a href="?kategorie=hydraulika" data-dept="hydraulika" class="text-link">${icon('arrow-left')} Pokračovat ve výběru</a></section><aside class="checkout-card order-summary"><h2>Souhrn košíku</h2><div class="summary-row"><span>Zboží s DPH</span><strong>${money(total())}</strong></div><p class="muted">Dopravu a platbu vyberete v dalším kroku. Nakoupíte bez registrace.</p><a class="button primary" href="${esc(pageURL('doprava'))}" data-route="doprava">Pokračovat k dopravě ${icon('arrow-right')}</a></aside></div>` : `<section class="checkout-card empty-cart"><h2>Váš košík je prázdný</h2><p>Vyberte si hadici a přidejte ji do košíku.</p><a class="button primary" href="?kategorie=hydraulika" data-dept="hydraulika">Prohlédnout hadice ${icon('arrow-right')}</a></section>`));
  }
  function add(id,qty=1) {
    id=String(id);
    if(!get(id)||max(id)<1){notify('Produkt momentálně není dostupný.');return false;}
    const wanted=(lines.get(id)||0)+Math.max(1,Math.floor(Number(qty)||1));
    lines.set(id,Math.min(max(id),wanted));persist();
    notify(wanted>max(id)?'V košíku už máte dostupné množství.':'Přidáno do košíku');return true;
  }
  function clear(){lines.clear();persist();}
  function init(options) {
    products=options.products;
    try {const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))for(const line of saved){if(Array.isArray(line)&&get(line[0])&&max(line[0])>0&&Number(line[1])>0)lines.set(String(line[0]),Math.min(max(line[0]),Math.floor(Number(line[1]))));}}catch{}
    persist();
    document.addEventListener('click',event=>{
      const target=event.target.closest('[data-cart]');if(!target)return;
      const id=target.dataset.id,action=target.dataset.cart;
      if(action==='remove')lines.delete(id);
      else if(lines.has(id))lines.set(id,Math.max(1,Math.min(max(id),lines.get(id)+(action==='plus'?1:-1))));
      persist();render();
      (document.querySelector(`[data-cart="${action}"][data-id="${id}"]:not(:disabled)`)||document.querySelector('[data-cart-qty]')||document.querySelector('#page-view h1'))?.focus();
    });
    document.addEventListener('change',event=>{
      const input=event.target.closest('[data-cart-qty]');if(!input)return;
      const id=input.dataset.cartQty;
      lines.set(id,Math.max(1,Math.min(max(id),Math.floor(Number(input.value)||1))));persist();render();document.querySelector('[data-cart-qty]')?.focus();
    });
  }
  return {init,add,render,entries,total,clear,open:()=>goPage('kosik')};
})();
