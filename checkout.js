'use strict';
const Checkout = (() => {
  const draftKey='nerez-checkout-draft-v1', requestKey='nerez-order-request-v1';
  let draft={shipping:'pickup',payment:'cash',customer:{}}, pending=false;
  try {draft={...draft,...JSON.parse(sessionStorage.getItem(draftKey)||'{}')};}catch{}
  function save(){try{sessionStorage.setItem(draftKey,JSON.stringify(draft));}catch{}}
  function steps(active) {
    return `<ol class="checkout-steps" aria-label="Postup objednávky">${[['kosik','Košík'],['doprava','Doprava a platba'],['udaje','Vaše údaje'],['kontrola','Kontrola']].map(([route,label],i)=>`<li class="${i+1===active?'current':i+1<active?'done':''}" ${i+1===active?'aria-current="step"':''}>${i+1<active?`<a data-route="${route}" href="${esc(pageURL(route))}"><span>${i+1}</span>${label}</a>`:`<span class="step-number">${i+1}</span>${label}`}</li>`).join('')}</ol><p class="development-note">Vývojový provoz: objednávka se uloží pouze na lokálním serveru. NEREZu se neodešle, nic neplatíte. Doprava za 149 Kč je pouze ukázková.</p>`;
  }
  const shippingCost=()=>draft.shipping==='delivery'?149:0;
  const shippingName=()=>draft.shipping==='delivery'?'Doručení na adresu (ruční zpracování)':'Osobní odběr — Tyršova 749, Vizovice';
  const paymentName=()=>draft.payment==='transfer'?'Bankovní převod — čeká na pokyny':'Hotově při osobním převzetí';
  function summary(button='') {
    return `<aside class="checkout-card order-summary"><h2>Vaše objednávka</h2>${Basket.entries().map(l=>`<p class="summary-item">${l.qty}× ${esc(displayName(l.product))}</p>`).join('')}<div class="summary-row"><span>Zboží s DPH</span><span>${money(Basket.total())}</span></div><div class="summary-row"><span>Doprava</span><span>${shippingCost()?money(shippingCost()):'Zdarma'}</span></div><div class="summary-row summary-total"><span>Celkem s DPH</span><strong>${money(Basket.total()+shippingCost())}</strong></div>${button}<p class="muted">Ukázkové ceny. Žádná platba se neprovede.</p></aside>`;
  }
  function field(name,label,type='text',required=true,auto='') {
    return `<label>${label}${required?' *':' (nepovinné)'}<input name="${name}" type="${type}" ${required?'required':''} maxlength="${name==='note'?2000:200}" autocomplete="${auto||'off'}" value="${esc(draft.customer?.[name]||'')}" ${name==='phone'?'pattern="[+0-9 ()-]{9,25}"':name==='zip'?'pattern="[0-9]{3} ?[0-9]{2}" inputmode="numeric"':name==='ico'?'pattern="[0-9]{8}" inputmode="numeric"':''}></label>`;
  }
  function choices() {
    return `<h2>Doprava</h2><label class="checkout-option"><input type="radio" name="shipping" value="pickup" ${draft.shipping==='pickup'?'checked':''}><span><strong>Osobní odběr</strong><small>Tyršova 749, Vizovice · termín bude potvrzen.</small></span><b>Zdarma</b></label><label class="checkout-option"><input type="radio" name="shipping" value="delivery" ${draft.shipping==='delivery'?'checked':''}><span><strong>Doručení na adresu</strong><small>Ruční zpracování, bez napojení dopravce. Ukázková cena.</small></span><b>149 Kč</b></label><h2 class="form-section">Platba</h2><label class="checkout-option"><input type="radio" name="payment" value="transfer" ${draft.payment==='transfer'?'checked':''}><span><strong>Bankovní převod</strong><small>Platba se zde neprovádí. Pokyny zatím nejsou vystavovány.</small></span><b>Zdarma</b></label>${draft.shipping==='pickup'?`<label class="checkout-option"><input type="radio" name="payment" value="cash" ${draft.payment==='cash'?'checked':''}><span><strong>Hotově při osobním převzetí</strong><small>Bez platby předem.</small></span><b>Zdarma</b></label>`:''}<p class="muted">Online platby kartou a automatické služby dopravců zatím nejsou zapojené.</p>`;
  }
  function customerValid(){const c=draft.customer||{};return c.firstName?.trim()&&c.lastName?.trim()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email||'')&&/^\+?[\d ()-]{9,25}$/.test(c.phone||'')&&(draft.shipping!=='delivery'||(c.street?.trim()&&c.city?.trim()&&/^\d{3}\s?\d{2}$/.test(c.zip||'')));}
  function render(route) {
    if(!Basket.entries().length){goPage('kosik',{},true);return;}
    if(route==='kontrola'&&!customerValid()){goPage('udaje',{},true);return;}
    const active=route==='doprava'?2:route==='udaje'?3:4;
    const heading={doprava:'Doprava a platba',udaje:'Vaše údaje',kontrola:'Kontrola objednávky'}[route];
    let form;
    if(route==='doprava')form=`<form id="delivery-form">${choices()}<div class="checkout-actions"><a data-route="kosik" href="${esc(pageURL('kosik'))}">Zpět do košíku</a><button class="button primary">Pokračovat k údajům ${icon('arrow-right')}</button></div></form>`;
    else if(route==='udaje')form=`<form id="customer-form"><h2>Kontaktní údaje</h2><p class="muted">Bez registrace. Pole označená * jsou povinná.</p><div class="form-grid">${field('firstName','Jméno','text',true,'given-name')}${field('lastName','Příjmení','text',true,'family-name')}${field('email','E-mail','email',true,'email')}${field('phone','Telefon','tel',true,'tel')}</div><details ${draft.customer?.company||draft.customer?.ico?'open':''}><summary>Nakupuji na firmu</summary><div class="form-grid">${field('company','Název firmy','text',false,'organization')}${field('ico','IČ','text',false)}</div></details>${draft.shipping==='delivery'?`<h2 class="form-section">Adresa doručení v ČR</h2><div class="form-grid">${field('street','Ulice a číslo','text',true,'street-address')}${field('city','Město','text',true,'address-level2')}${field('zip','PSČ','text',true,'postal-code')}</div>`:'<p class="pickup-address">Osobní odběr: Tyršova 749, Vizovice. Doručovací adresu nepotřebujeme.</p>'}<label>Poznámka (nepovinné)<textarea name="note" rows="3" maxlength="2000">${esc(draft.customer?.note||'')}</textarea></label><div class="checkout-actions"><a data-route="doprava" href="${esc(pageURL('doprava'))}">Zpět k dopravě</a><button class="button primary">Pokračovat ke kontrole ${icon('arrow-right')}</button></div></form>`;
    else {const c=draft.customer;form=`<section><h2>Zkontrolujte údaje</h2><div class="review-block"><h3>Kontakt <a data-route="udaje" href="${esc(pageURL('udaje'))}">Upravit</a></h3><p>${esc(c.firstName)} ${esc(c.lastName)}<br>${esc(c.email)}<br>${esc(c.phone)}</p>${c.company?`<p>${esc(c.company)} ${c.ico?'· IČ '+esc(c.ico):''}</p>`:''}</div><div class="review-block"><h3>Doprava a platba <a data-route="doprava" href="${esc(pageURL('doprava'))}">Upravit</a></h3><p>${shippingName()}<br>${paymentName()}</p>${draft.shipping==='delivery'?`<p>${esc(c.street)}, ${esc(c.zip)} ${esc(c.city)}</p>`:''}</div>${c.note?`<div class="review-block"><h3>Poznámka</h3><p>${esc(c.note)}</p></div>`:''}<form id="order-form"><label class="consent"><input type="checkbox" name="accepted" required><span>Rozumím, že vytvářím pouze zkušební objednávku, která se neodešle NEREZu a nezakládá nákup.</span></label><p id="order-error" class="form-error" role="alert"></p><button class="button primary" id="place-order">Dokončit zkušební objednávku ${icon('arrow-right')}</button><p class="muted">Potvrzení se zobrazí až po úspěšném uložení na server. Žádný e-mail ani platba se neodesílá.</p></form></section>`;}
    renderPage('checkout',pageHeading(heading)+steps(active)+`<div class="checkout-layout"><section class="checkout-card">${form}</section>${summary()}</div>`);
  }
  async function confirmation(id) {
    renderPage('confirmation',pageHeading('Potvrzení objednávky')+'<p role="status">Načítám uloženou objednávku…</p>');
    try {
      const token=sessionStorage.getItem('nerez-order-token-'+id);
      if(!token)throw Error('Potvrzení je dostupné pouze v prohlížeči, kde byla objednávka vytvořena.');
      const response=await fetch('api/orders/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!response.ok)throw Error('Uloženou objednávku se nepodařilo načíst. Zkuste stránku obnovit.');
      const o=await response.json();if(params().get('objednavka')!==id)return;
      renderPage('confirmation',pageHeading('Zkušební objednávka je uložená')+`<section class="checkout-card confirmation"><div class="confirmation-icon">${icon('check')}</div><h2>Objednávka ${esc(o.number)}</h2><p>Objednávka je uložená na lokálním serveru. NEREZu se neodeslala. Žádná platba se neprovedla.</p><div class="review-block"><p><strong>Stav:</strong> Zkušební, nezaplaceno<br><strong>Doprava:</strong> ${o.shipping==='pickup'?'Osobní odběr':'Doručení na adresu — ruční zpracování'}<br><strong>Platba:</strong> ${o.payment==='cash'?'Hotově při převzetí':'Bankovní převod — bez vystavených pokynů'}</p></div>${o.items.map(l=>`<div class="summary-row"><span>${l.qty}× ${esc(l.name)}</span><strong>${money(l.total)}</strong></div>`).join('')}<div class="summary-row"><span>Doprava</span><span>${money(o.shippingPrice)}</span></div><div class="summary-row summary-total"><span>Celkem s DPH</span><strong>${money(o.total)}</strong></div><p>Potvrzení si můžete vytisknout nebo uložit do PDF. E-mailové potvrzení zatím není zapojené.</p><div class="checkout-actions"><button class="button secondary" data-print-order>Vytisknout potvrzení</button><a href="?kategorie=hydraulika" data-dept="hydraulika" class="button primary">Zpět do nabídky</a></div></section>`);
    }catch(error){if(params().get('objednavka')===id)renderPage('confirmation',pageHeading('Potvrzení není dostupné')+`<section class="checkout-card"><p role="alert">${esc(error.message)}</p><a class="button secondary" href="${esc(pageURL('potvrzeni',{objednavka:id}))}">Zkusit znovu</a></section>`);}
  }
  async function submit(form) {
    if(pending)return;
    const error=document.querySelector('#order-error'), button=document.querySelector('#place-order');
    if(!form.reportValidity()||!customerValid())return;
    pending=true;button.disabled=true;button.textContent='Ukládám objednávku…';error.textContent='';
    try {
      const payload={items:Basket.entries().map(l=>({id:l.id,qty:l.qty})),customer:draft.customer,shipping:draft.shipping,payment:draft.payment,accepted:true};
      const fingerprint=JSON.stringify(payload);
      let request=JSON.parse(sessionStorage.getItem(requestKey)||'null');
      if(!request||request.fingerprint!==fingerprint){request={key:crypto.randomUUID(),token:crypto.randomUUID(),fingerprint};sessionStorage.setItem(requestKey,JSON.stringify(request));}
      const response=await fetch('api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':request.key,'X-Order-Token':request.token},body:JSON.stringify(payload)});
      if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('Objednávkový server není dostupný. Košík zůstává zachován; spusťte lokální server projektu.');
      const order=await response.json();if(!response.ok)throw Error(order.error||'Objednávku se nepodařilo uložit.');
      sessionStorage.setItem('nerez-order-token-'+order.id,request.token);
      Basket.clear();sessionStorage.removeItem(draftKey);sessionStorage.removeItem(requestKey);draft={shipping:'pickup',payment:'cash',customer:{}};
      goPage('potvrzeni',{objednavka:order.id});
    }catch(e){error.textContent=e.message||'Spojení se serverem selhalo. Košík zůstává zachován. Zkuste to znovu.';error.tabIndex=-1;error.focus();button.disabled=false;button.textContent='Zkusit uložit objednávku znovu';}
    finally{pending=false;}
  }
  function capture(form){if(!form)return;draft.customer={...draft.customer,...Object.fromEntries(new FormData(form))};save();}
  document.addEventListener('input',event=>{if(event.target.closest('#customer-form'))capture(event.target.form);});
  document.addEventListener('change',event=>{
    if(event.target.closest('#delivery-form')){const form=event.target.form;const data=new FormData(form);draft.shipping=data.get('shipping');draft.payment=data.get('payment')||'transfer';if(draft.shipping==='delivery')draft.payment='transfer';save();const name=event.target.name,value=event.target.value;render('doprava');document.querySelector('#delivery-form input[name="'+name+'"][value="'+value+'"]')?.focus();}
  });
  document.addEventListener('submit',event=>{
    if(event.target.id==='delivery-form'){event.preventDefault();save();goPage('udaje');}
    if(event.target.id==='customer-form'){event.preventDefault();capture(event.target);goPage('kontrola');}
    if(event.target.id==='order-form'){event.preventDefault();submit(event.target);}
  });
  document.addEventListener('click',event=>{if(event.target.closest('[data-print-order]'))window.print();});
  return {render,confirmation,steps};
})();
