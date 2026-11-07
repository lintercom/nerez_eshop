'use strict';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const priceFormat = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = value => priceFormat.format(Number(value)) + ' Kč';
const number = value => Number(value).toLocaleString('cs-CZ');
const normalize = value => String(value || '').toLocaleLowerCase('cs').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const displayName = product => (product.name.startsWith(product.code + ' / ') ? product.name.slice(String(product.code).length + 3) : product.name).replace(/^hadice/, 'Hadice');
const pageSize = 12;
const featuredIds = ['10001'];
const kardanFeaturedIds = [];
let homepageProducts = [];
const mainTypes = ['hydraulicke-hadice'];
const departments = {
  hydraulika: {name:'Hydraulika', title:'Hydraulické hadice', description:'Hydraulické hadice ze skladové evidence NEREZ Vizovice.'}
};
const shortNames = {};
let categories = [], products = [], specs = {}, ready = false, expanded = false;
let lastDepartment;
const byId = new Map();
const pageView = $('#page-view');
const rail = $('#type-rail');
const search = $('#search');
const suggestions = document.createElement('div');
suggestions.className = 'suggestions';
suggestions.hidden = true;
$('#search-form').append(suggestions);
let toastTimer;

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2300);
}
const offline = location.protocol === 'file:';
function params() {
  return offline ? new URLSearchParams(location.hash.slice(1)) : new URL(location.href).searchParams;
}
function urlWith(updates) {
  const url = new URL(location.href);
  const next = params();
  url.hash = '';
  Object.entries(updates).forEach(([key,value]) => {
    if (value == null || value === '' || (key === 'page' && value === 1) || (key === 'sort' && value === 'default')) next.delete(key);
    else next.set(key,value);
  });
  if (offline) url.hash = next.toString();
  else url.search = next.toString();
  return url;
}
function navigate(updates, scroll = false) {
  const url = urlWith(updates);
  if (url.href !== location.href) history.pushState({}, '', url);
  renderRoute(scroll);
}
function departmentFor(p) {
  if (Object.hasOwn(departments,p.get('kategorie'))) return p.get('kategorie');
  const category = categories.find(item=>item.id===p.get('typ'));
  if (category) return category.department;
  // Page-only bookmarks from the original hydraulic shop still open that department.
  if (p.has('page') && !p.has('kategorie') && !p.has('q')) return 'hydraulika';
  return null;
}
function isHome(p) {
  return !['kategorie','typ','q','od','do','page','sort','stranka','dil'].some(key=>p.has(key));
}
function pageTitle() {
  const p = params();
  return (departments[departmentFor(p)]?.title || (isHome(p) ? 'Hydraulické hadice' : 'Výsledky hledání')) + ' | NEREZ Vizovice';
}
function departmentRoute(id,type=null) {
  return {kategorie:id,typ:type,q:null,od:null,do:null,page:null,sort:null,dil:null,stranka:null,objednavka:null};
}
function catalogScroll() {
  $('#shop-view').scrollIntoView({ block: 'start', behavior: 'instant' });
}
function pageURL(page, extra={}) { return urlWith({...departmentRoute(null),stranka:page,objednavka:null,...extra}); }
function goPage(page, extra={}, replace=false) {
  const updates={...departmentRoute(null),stranka:page,objednavka:null,...extra};
  if(replace){history.replaceState({},'',urlWith(updates));renderRoute(true);}else navigate(updates,true);
}
function pageHeading(title) {
  return '<nav class="breadcrumbs" aria-label="Drobečková navigace"><a href="index.html">Úvod</a> / <span aria-current="page">'+esc(title)+'</span></nav><h1 tabindex="-1">'+esc(title)+'</h1>';
}
function renderPage(type, html) {
  $('#home-view').hidden=true;$('#shop-view').hidden=true;pageView.hidden=false;
  pageView.dataset.view=type;pageView.innerHTML=html;
  $('.skip').href='#page-view';
  document.title=(pageView.querySelector('h1')?.textContent||'NEREZ')+' | NEREZ Vizovice';
  suggestions.hidden=true;
}

function renderTypes() {
  const p = params();
  const department = departmentFor(p);
  const selected = p.get('typ');
  rail.innerHTML = categories.filter(c=>c.department===department).map(category => '<a class="category-choice' + (category.id === selected ? ' selected' : '') + '" href="' + esc(urlWith(departmentRoute(department,category.id))) + '" data-category="' + esc(category.id) + '"' + (category.id === selected ? ' aria-current="page"' : '') + '><span>' + esc(category.name) + '</span>' + icon('arrow-right') + '</a>').join('');
  setRailButtons();
}
function setRailButtons() {
  $('#type-prev').disabled = rail.scrollLeft <= 2;
  $('#type-next').disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
}
function moveRail(direction) {
  rail.scrollBy({left:direction * (rail.clientWidth + parseFloat(getComputedStyle(rail).columnGap)),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant':'smooth'});
}
function matchesTerms(product, query) {
  return query.every(term => {
    if (product.searchText.includes(term)) return true;
    const compact = term.replace(/[^a-z0-9]/g,'');
    return compact.length > 0 && product.searchCompact.includes(compact);
  });
}
function terms(value) { return normalize(value).trim().split(/\s+/).filter(Boolean); }
function priceLimit(p,key) {
  if (!p.has(key) || !p.get(key).trim()) return null;
  const value = Number(p.get(key));
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function getResults(p) {
  const category = p.get('typ');
  const department = departmentFor(p);
  const query = terms(p.get('q'));
  const min = priceLimit(p,'od'), max = priceLimit(p,'do');
  const filtered = products.filter(item => (!department || item.departments.includes(department)) && (!category || item.categoryIds.includes(category)) && matchesTerms(item,query) && (min == null || item.price >= min) && (max == null || item.price <= max));
  const sorting = p.get('sort');
  if (sorting === 'low' || sorting === 'high') filtered.sort((a,b) => (a.price-b.price) * (sorting === 'low' ? 1 : -1));
  if (sorting === 'name') filtered.sort((a,b) => a.name.localeCompare(b.name,'cs',{numeric:true}));
  return filtered;
}
function productCard(product) {
  return '<article class="product-card"><a class="product-main" data-product="' + esc(product.id) + '" href="' + esc(urlWith({dil:product.id})) + '"><div class="product-img"><img loading="lazy" src="' + esc(product.image) + '" alt=""></div><span class="product-code">' + esc(product.code) + '</span><h3>' + esc(displayName(product)) + '</h3><p class="product-stock">Ukázkové množství: ' + number(product.stock) + ' ks</p></a><div class="product-bottom"><span class="price">' + money(product.price) + ' <small>s DPH / ' + esc(product.unit) + '</small></span><button type="button" class="add-btn" data-add="' + esc(product.id) + '" aria-label="Přidat do košíku: ' + esc(displayName(product)) + '" title="Přidat do košíku">' + icon('cart-add') + '<span>Do košíku</span></button></div></article>';
}
function pagination(page,total) {
  if (total < 2) return '';
  const pages = [...new Set([1,page-1,page,page+1,total])].filter(n=>n>0 && n<=total).sort((a,b)=>a-b);
  let items = '';
  for (const [index,n] of pages.entries()) {
    if (index && pages[index-1] < n-1) items += '<span aria-hidden="true">…</span>';
    items += '<button data-page="' + n + '" aria-label="Strana ' + n + '"' + (n === page ? ' aria-current="page"' : '') + '>' + n + '</button>';
  }
  return '<nav class="pagination" aria-label="Stránky katalogu"><button data-page="' + (page-1) + '" ' + (page===1?'disabled':'') + ' aria-label="Předchozí strana">' + icon('chevron-left') + '</button>' + items + '<button data-page="' + (page+1) + '" ' + (page===total?'disabled':'') + ' aria-label="Další strana">' + icon('chevron-right') + '</button></nav>';
}
function renderChips(p) {
  const active = {};
  if (p.get('typ')) active.typ = categories.find(c=>c.id === p.get('typ'))?.name || p.get('typ');
  if (p.get('q')) active.q = 'Hledání „' + p.get('q') + '“';
  if (priceLimit(p,'od') != null) active.od = 'Od ' + money(priceLimit(p,'od'));
  if (priceLimit(p,'do') != null) active.do = 'Do ' + money(priceLimit(p,'do'));
  $('#chips').innerHTML = Object.entries(active).map(([key,label]) => '<button class="chip" data-remove-filter="' + key + '" aria-label="Zrušit filtr: ' + esc(label) + '">' + esc(label) + icon('x') + '</button>').join('');
  $('#filter-indicator').hidden = !['typ','od','do'].some(key=>key in active);
}
function renderCatalog() {
  const p = params();
  const found = getResults(p);
  const total = Math.ceil(found.length / pageSize);
  const page = Math.min(total || 1, Math.max(1, Math.trunc(Number(p.get('page'))) || 1));
  $('#inline-filters').hidden=true;$('#filter-trigger').setAttribute('aria-expanded','false');
  const section = $('#products');
  section.setAttribute('aria-busy','false');
  $('#result-count').textContent = number(found.length) + (found.length === 1 ? ' produkt' : found.length >= 2 && found.length <= 4 ? ' produkty' : ' produktů');
  $('.sort-label').hidden = products.length < 2;
  $('#sort').value = ['low','high','name'].includes(p.get('sort')) ? p.get('sort') : 'default';
  search.value = p.get('q') || '';
  renderChips(p);
  section.innerHTML = found.length ? found.slice((page-1)*pageSize,page*pageSize).map(productCard).join('') : '<div class="blank"><h3>Žádné odpovídající díly</h3><p>Zkuste jiný název, kód nebo širší cenové rozpětí.</p><button class="button secondary" data-reset>Zobrazit celý katalog</button><p class="empty-advice">Nenašli jste svůj díl? <a href="tel:+420577452200">Zavolejte +420 577 452 200</a>.</p></div>';
  $('#paging').innerHTML = pagination(page,total);
}
function detail(id) {
  const product = byId.get(id);
  if (!product) {
    renderPage('detail', pageHeading('Díl nebyl nalezen') + '<p class="muted">Tento díl se v katalogu nepodařilo najít.</p>');
    return;
  }
  const category = categories.find(item=>item.id === product.categoryId);
  const rows = {'Katalogový kód':product.code,'Kategorie':category?.name || departments[product.departments[0]].title,'Ukázkové množství':number(product.stock)+' ks','Cena bez DPH':money(product.priceExVat)+' / ks','DPH':number(product.vat)+' %','Označení rozměru':'16x1.5x3500','Koncovky dle označení':'DKL-DKL'};
  const facts = Object.entries(rows).map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('');
  renderPage('detail',pageHeading(displayName(product)) + '<div class="detail-layout"><div class="detail-photo"><img src="'+esc(product.image)+'" alt="'+esc(displayName(product))+'"></div><div class="detail-info"><span class="product-code">'+esc(product.code)+'</span><dl>'+facts+'</dl><span class="price">'+money(product.price)+' <small>s DPH / '+esc(product.unit)+'</small></span><p class="detail-note">Vývojový katalog: stav a cena nejsou propojené s POHODOU. Fotografie a úplné technické parametry se připravují. Objednávku můžete dokončit pouze ve zkušebním režimu.</p><form class="detail-actions" id="detail-add"><div class="quantity"><button type="button" data-qty="-1" aria-label="Snížit množství">'+icon('minus')+'</button><input id="detail-qty" type="number" min="1" max="'+Number(product.stock)+'" step="1" required value="1" aria-label="Počet jednotek"><button type="button" data-qty="1" aria-label="Zvýšit množství">'+icon('plus')+'</button></div><button class="button primary">'+icon('cart-add')+' Přidat do košíku</button></form><a class="product-advice" href="tel:+420577452200">Potřebujete ověřit správnou hadici? +420 577 452 200</a></div></div>');
  document.title = product.name + ' | NEREZ Vizovice';
}
function renderRoute(scroll=false) {
  if (!ready) return;
  pageView.hidden=true;
  suggestions.hidden = true;
  const p = params();
  const department = departmentFor(p);
  const home = isHome(p);
  renderSidebar(department,p.get('typ'));
  const route=p.get('stranka');
  if(p.get('dil') || route) {
    $('#home-view').hidden=true;$('#shop-view').hidden=true;
    if(p.get('dil')) detail(p.get('dil'));
    else if(route==='kosik') Basket.render();
    else if(['doprava','udaje','kontrola'].includes(route)) Checkout.render(route);
    else if(route==='potvrzeni') Checkout.confirmation(p.get('objednavka'));
    else if(route==='kontakty') contact();
    else renderPage('missing',pageHeading('Stránka nebyla nalezena')+'<a href="index.html">Zpět na úvod</a>');
    if(scroll || p.get('dil')) {window.scrollTo({top:0,behavior:'instant'});pageView.querySelector('h1')?.focus({preventScroll:true});}
    return;
  }
  $('#home-view').hidden = !home;
  $('#shop-view').hidden = home;
  $('.skip').href = home ? '#home-products' : '#katalog';
  renderSidebar(department,p.get('typ'));
  if (home) {
    search.value='';
    $('#home-products').innerHTML = homepageProducts.map(productCard).join('');
    $('#home-products').setAttribute('aria-busy','false');
  } else {
    $('#shop-view .types').hidden = !department;
    $('#category-title').textContent = department ? departments[department].name : (p.get('q') ? 'Výsledky hledání' : 'Produkty');
    const selectedCategory = categories.find(c=>c.id === p.get('typ'));
    if (selectedCategory) $('#category-title').textContent = selectedCategory.name;
    $('#breadcrumbs').innerHTML = '<a href="index.html">Úvod</a>' + (department ? (selectedCategory ? ' / <a data-dept="'+department+'" href="'+esc(urlWith(departmentRoute(department)))+'">'+esc(departments[department].name)+'</a>' : ' / <span aria-current="page">'+esc(departments[department].name)+'</span>') : '') + (selectedCategory ? ' / <span aria-current="page">'+esc(selectedCategory.name)+'</span>' : '');
    if (department) {
      rail.setAttribute('aria-label','Podkategorie: '+departments[department].name);
      if (department!==lastDepartment) setExpanded(false);
      renderTypes();
    }
    renderCatalog();
  }
  lastDepartment = department;
  document.title=pageTitle();
  if (scroll && !home) catalogScroll();
}
function renderSidebar(department,selected) {
  $('#side-links').innerHTML = Object.entries(departments).map(([id,info])=>{
    const active = department === id;
    const link = '<a class="side-dept' + (active?' active':'') + '" href="'+esc(urlWith(departmentRoute(id)))+'" data-dept="'+id+'"'+(active && !selected?' aria-current="page"':'')+'><span class="side-category-name">'+esc(info.name)+'</span>'+icon('chevron-right')+'</a>';
    const children = categories.filter(c=>c.department===id);
    const submenu = '<div class="category-flyout"><a class="category-flyout-title" data-dept="'+id+'" href="'+esc(urlWith(departmentRoute(id)))+'">'+esc(info.name)+icon('arrow-right')+'</a><div class="category-flyout-links">'+children.map(c=>'<a data-category="'+esc(c.id)+'" href="'+esc(urlWith(departmentRoute(id,c.id)))+'">'+esc(c.name)+'</a>').join('')+'</div></div>';
    return '<div class="side-group">'+link+submenu+'</div>';
  }).join('');
  $('#sidebar').classList.remove('is-open');
  $('#side-toggle').setAttribute('aria-expanded','false');
}
function filters() {
  const p = params();
  const department = departmentFor(p);
  const options = categories.filter(cat=>!department || cat.department===department).map(cat=>'<option value="'+esc(cat.id)+'" '+(cat.id===p.get('typ')?'selected':'')+'>'+esc(cat.name)+'</option>').join('');
  const host=$('#inline-filters');
  if(!host.hidden){host.hidden=true;$('#filter-trigger').setAttribute('aria-expanded','false');return;}
  host.hidden=false;$('#filter-trigger').setAttribute('aria-expanded','true');
  host.innerHTML = '<form class="filter-form" id="filters-form"><label>Typ dílu<select name="typ"><option value="">Všechny podkategorie</option>'+options+'</select></label><div class="price-range"><label>Cena od (Kč)<input name="od" type="number" step="0.01" min="0" value="'+esc(priceLimit(p,'od'))+'" placeholder="0"></label><label>Cena do (Kč)<input name="do" type="number" step="0.01" min="0" value="'+esc(priceLimit(p,'do'))+'" placeholder="Bez omezení"></label></div><div class="filter-buttons"><button class="button primary" type="submit">Zobrazit produkty '+icon('arrow-right')+'</button><button class="button secondary" type="button" data-clear-filters>Zrušit filtry</button></div></form>';
  host.querySelector('select')?.focus();
}
function contact() {
  renderPage('contact',pageHeading('Kontakty') + '<div class="contact-card"><h3>Nerez Vizovice s.r.o.</h3><p>Tyršova 749, 763 12 Vizovice</p><p><a href="tel:+420577452200">'+icon('phone')+'+420 577 452 200</a></p><p><a href="mailto:nerez@nerez.com">'+icon('mail')+'nerez@nerez.com</a></p><p class="muted">IČ 06532446 · DIČ CZ06532446</p></div><a class="button secondary" href="https://www.nerez.com/" target="_blank" rel="noopener">Firemní web NEREZ '+icon('arrow-up-right')+'</a>');
}
function searchPreview() {
  const query = terms(search.value);
  if (!query.length || !ready) { suggestions.hidden = true; return; }
  const found = products.filter(item=>matchesTerms(item,query));
  const rows = found.slice(0,4).map(item=>'<a data-product="'+esc(item.id)+'" href="'+esc(urlWith({dil:item.id}))+'"><img src="'+esc(item.image)+'" alt=""><span><strong>'+esc(displayName(item))+'</strong><small>'+esc(item.code)+'</small></span></a>').join('');
  suggestions.innerHTML = rows + '<button class="search-all" type="submit">'+(found.length?'Zobrazit výsledky ('+number(found.length)+')':'Zobrazit hledání bez výsledků')+icon('arrow-right')+'</button>';
  suggestions.hidden = false;
}
search.addEventListener('input',searchPreview);
search.addEventListener('focus',searchPreview);
$('#search-form').addEventListener('keydown',event=>{
  if (event.key==='Escape') { suggestions.hidden=true; search.focus(); suggestions.hidden=true; }
  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !suggestions.hidden) {
    const items = [...suggestions.querySelectorAll('a,button')];
    const current = items.indexOf(document.activeElement);
    const next = items[Math.max(0,Math.min(current + (event.key === 'ArrowDown' ? 1 : -1),items.length-1))];
    if (next) { event.preventDefault(); next.focus(); }
  }
});
$('#search-form').addEventListener('focusout',event=>{ if (!event.currentTarget.contains(event.relatedTarget)) suggestions.hidden=true; });
$('#search-form').addEventListener('submit',event=>{ event.preventDefault(); if (ready) navigate({...departmentRoute('vse'),q:search.value.trim()},true); search.blur(); });
$('#sort').addEventListener('change',event=>navigate({sort:event.target.value,page:null,dil:null}));
$('#type-prev').addEventListener('click',()=>moveRail(-1));
$('#type-next').addEventListener('click',()=>moveRail(1));
rail.addEventListener('scroll',setRailButtons,{passive:true});
window.addEventListener('resize',setRailButtons);
function setExpanded(value) {
  expanded=value;
  rail.classList.toggle('expanded',expanded);
  $('.scrollers').hidden=expanded;
  const link=$('#all-types');
  link.setAttribute('aria-expanded',String(expanded));
  link.innerHTML=(expanded?'Sbalit podkategorie':'Zobrazit všechny')+' '+icon('chevron-down');
  rail.scrollLeft=0;
  setRailButtons();
}
$('#all-types').addEventListener('click',()=>setExpanded(!expanded));
$('#side-toggle').addEventListener('click',()=>{
  const open=$('#sidebar').classList.toggle('is-open');
  $('#side-toggle').setAttribute('aria-expanded',String(open));
});
const hero = $('#home-hero');
const heroSlides = [...hero.querySelectorAll('.nerez-hero-slide')];
let heroIndex = 0;
let heroPaused = true;
function showHero(index) {
  heroIndex = (index + heroSlides.length) % heroSlides.length;
  heroSlides.forEach((slide, i) => {
    slide.classList.toggle('is-active', i === heroIndex);
    slide.setAttribute('aria-hidden', String(i !== heroIndex));
  });
}
function updateHeroPause() {
  const button = hero.querySelector('[data-hero-pause]');
  button.textContent = heroPaused ? 'Spustit' : 'Pozastavit';
  button.setAttribute('aria-label', heroPaused ? 'Spustit střídání snímků' : 'Pozastavit střídání snímků');
}
hero.querySelector('[data-hero-prev]').addEventListener('click', () => showHero(heroIndex - 1));
hero.querySelector('[data-hero-next]').addEventListener('click', () => showHero(heroIndex + 1));
hero.querySelector('[data-hero-pause]').addEventListener('click', () => { heroPaused = !heroPaused; updateHeroPause(); });
updateHeroPause();
setInterval(() => {
  if (!heroPaused && !document.hidden && !$('#home-view').hidden && !hero.matches(':hover') && !hero.contains(document.activeElement)) showHero(heroIndex + 1);
}, 5000);
document.addEventListener('click',event=>{
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    const target = document.getElementById(anchor.hash.slice(1));
    if (target) {
      event.preventDefault();
      target.scrollIntoView({block:'start'});
      if (target === search) search.focus();
      else if (anchor.matches('.skip')) {
        target.tabIndex = -1;
        target.focus({preventScroll:true});
      }
      return;
    }
  }
  if (!event.target.closest('#search-form')) suggestions.hidden=true;
  const action = event.target.closest('[data-route],[data-open],[data-close],[data-dept],[data-category],[data-product],[data-add],[data-page],[data-remove-filter],[data-reset],[data-qty],[data-clear-filters]');
  if (!action || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const d = action.dataset;
  if ('close' in d) {history.back();return;}
  if(d.route){event.preventDefault();goPage(d.route);return;}
  if (d.open==='contact') {event.preventDefault();goPage('kontakty');return;}
  if (!ready) return;
  if (d.open==='cart') {event.preventDefault();Basket.open();}
  if (d.open==='filters') filters();
  if (d.dept) {
    event.preventDefault();
    navigate(departmentRoute(d.dept));
    window.scrollTo({top:0,behavior:'instant'});
  }
  if (d.category) { event.preventDefault(); navigate(departmentRoute(categories.find(c=>c.id===d.category).department,d.category),true); }
  if (d.product) { event.preventDefault(); navigate({dil:d.product,stranka:null,objednavka:null},true); }
  if (d.add) { if(Basket.add(d.add)) Basket.open(); }
  if (d.page) navigate({page:Number(d.page),dil:null},true);
  if (d.removeFilter) navigate({[d.removeFilter]:null,page:null,dil:null},true);
  if ('reset' in d) navigate({q:null,typ:null,od:null,do:null,page:null,dil:null},true);
  if ('clearFilters' in d) navigate({typ:null,od:null,do:null,page:null,dil:null},true);
  if (d.qty) { const field=$('#detail-qty'); field.value=Math.min(Number(field.max),Math.max(1,(Math.floor(Number(field.value))||1)+Number(d.qty))); }
});
document.addEventListener('submit',event=>{
  const form = event.target;
  if (form.id==='filters-form') {
    event.preventDefault();
    const data = new FormData(form);
    const min = data.get('od'), max = data.get('do');
    if (min!=='' && max!=='' && Number(max)<Number(min)) {
      const input = form.elements.do;
      input.setCustomValidity('Horní hranice musí být alespoň stejně vysoká jako dolní.');input.reportValidity();input.setCustomValidity('');return;
    }
    navigate({typ:data.get('typ'),od:min,do:max,page:null,dil:null},true);
  }
  if (form.id==='detail-add') {
    event.preventDefault(); if(Basket.add(params().get('dil'),Number($('#detail-qty').value))) Basket.open();
  }
});
window.addEventListener('popstate',()=>renderRoute());
function loadScript(src) {
  return new Promise((resolve,reject)=>{
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}
async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(path);
  return response.json();
}
async function loadCatalog() {
  if (offline) {
    await Promise.all([loadScript('data/offline.js'),loadScript('data/kardany-offline.js')]);
    return {hydraulika:window.nerezOffline.catalog, kardany:window.nerezKardanyOffline, specs:window.nerezOffline.specs};
  }
  const [hydraulika,kardany,specs] = await Promise.all([
    loadJson('data/catalog.json?v=single-product-3'), loadJson('data/kardany.json?v=single-product-3'), loadJson('data/featured-specs.json?v=single-product-3').catch(()=>({}))
  ]);
  return {hydraulika,kardany,specs};
}
async function start() {
  try {
    const loaded = await loadCatalog();
    specs = loaded.specs;
    const order = new Map(mainTypes.map((id,index)=>[id,index]));
    for (const department of Object.keys(departments)) {
      const group = loaded[department];
      categories.push(...group.categories.map(c=>({...c,department})));
      for (const item of group.products) {
        const existing = byId.get(item.id);
        if (existing) {
          existing.departments.push(department);
          existing.categoryIds = [...new Set([...existing.categoryIds,...item.categoryIds])];
        } else {
          item.departments = [department];
          item.searchText = normalize(item.name+' '+item.code+' '+(item.text || ''));
          item.searchCompact = normalize(item.code).replace(/[^a-z0-9]/g,'');
          byId.set(item.id,item);
        }
      }
    }
    categories.sort((a,b)=>(order.get(a.id) ?? 99)-(order.get(b.id) ?? 99));
    const priority = new Set([...kardanFeaturedIds,...featuredIds]);
    products = [...Array.from(priority,id=>byId.get(id)).filter(Boolean),...Array.from(byId.values()).filter(item=>!priority.has(item.id))];
    homepageProducts = products.slice(0,8);
    Basket.init({products:byId});
    ready=true;
    renderRoute();
    if (!params().get('dil') && !params().get('stranka') && (params().has('typ') || params().has('q') || params().has('page') || location.hash === '#katalog')) catalogScroll();
  } catch {
    $('#home-view').hidden=true;
    $('#shop-view').hidden=false;
    $('#shop-view .types').hidden=true;
    $('#products').setAttribute('aria-busy','false');
    $('#products').innerHTML='<div class="blank"><h3>Katalog se nepodařilo načíst</h3><p>Obnovte stránku a zkuste to znovu.</p><a class="button secondary" href="./">Obnovit katalog</a></div>';
  }
}
start();
