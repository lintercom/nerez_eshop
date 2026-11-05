'use strict';
const iconPaths = {
  'arrow-down': '<path d="M12 4v16m-6-6 6 6 6-6"/>',
  'arrow-left': '<path d="M20 12H4m7-7-7 7 7 7"/>',
  'arrow-right': '<path d="M4 12h16m-7-7 7 7-7 7"/>',
  'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-left': '<path d="m14 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  cart: '<path d="M2 3h3l3.1 12.5h10.8l2.6-9H6"/><circle cx="9" cy="20" r="1.15"/><circle cx="18" cy="20" r="1.15"/>',
  'cart-add': '<path d="M2 3h3l3.1 12.5h10.8l1.8-6M6 6.5h6m6-4v6m-3-3h6"/><circle cx="9" cy="20" r="1.15"/><circle cx="18" cy="20" r="1.15"/>',
  phone: '<path d="M20 15.8v3a1.75 1.75 0 0 1-1.92 1.75A16.4 16.4 0 0 1 3.45 5.92 1.75 1.75 0 0 1 5.2 4h2.9l1.25 4.25-2.05 1.9a13.2 13.2 0 0 0 6.55 6.55l1.9-2.05L20 15.8Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1.8"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.7"/><path d="m16 16 5.2 5.2"/>',
  sliders: '<path d="M3 7h4m4 0h10M3 17h10m4 0h4"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  sort: '<path d="M4 6h15M4 12h11M4 18h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  box: '<path d="m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5m-9 5v10M7.5 4.5l9 5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>'
};
function icon(name) {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (iconPaths[name] || '') + '</svg>';
}
document.querySelectorAll('[data-icon]').forEach(element => element.outerHTML = icon(element.dataset.icon));
