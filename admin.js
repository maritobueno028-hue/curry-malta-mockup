const ordersCountElement = document.getElementById('orders-count');
const ordersRevenueElement = document.getElementById('orders-revenue');
const ordersLocalitiesElement = document.getElementById('orders-localities');
const ordersListElement = document.getElementById('orders-list');
const filterLocalityElement = document.getElementById('filter-locality');
const refreshButton = document.getElementById('refresh-orders');

let allOrders = [];

function formatPrice(value) {
  return `EUR ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }
  return date.toLocaleString();
}

function renderFilters() {
  const localityMap = new Map();
  allOrders.forEach((order) => {
    const key = order.locality || 'unknown';
    const label = order.localityLabel || key;
    localityMap.set(key, label);
  });

  const current = filterLocalityElement.value;
  filterLocalityElement.innerHTML = '<option value="all">All localities</option>';
  Array.from(localityMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([key, label]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = label;
      filterLocalityElement.appendChild(option);
    });

  if (current && filterLocalityElement.querySelector(`option[value="${current}"]`)) {
    filterLocalityElement.value = current;
  }

  ordersLocalitiesElement.textContent = String(localityMap.size);
}

function renderStats() {
  const revenue = allOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  ordersCountElement.textContent = String(allOrders.length);
  ordersRevenueElement.textContent = formatPrice(revenue);
}

function renderOrders() {
  const filter = filterLocalityElement.value;
  const visibleOrders = filter === 'all' ? allOrders : allOrders.filter((order) => order.locality === filter);

  ordersListElement.innerHTML = '';
  if (visibleOrders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No orders for the selected filters.';
    ordersListElement.appendChild(empty);
    return;
  }

  visibleOrders.forEach((order) => {
    const card = document.createElement('article');
    card.className = 'order-card';

    const itemsMarkup = (order.items || []).map((item) => (
      `<li><span>${item.name} x ${item.qty}</span><strong>${formatPrice(Number(item.price) * Number(item.qty))}</strong></li>`
    )).join('');

    const couponCode = order.discounts?.couponCode || 'None';
    const couponDiscount = formatPrice(order.discounts?.couponDiscount || 0);
    const pointsUsed = Number(order.discounts?.pointsUsed || 0);
    const pointsDiscount = formatPrice(order.discounts?.pointsDiscount || 0);

    card.innerHTML = `
      <div class="order-head">
        <h2>${order.orderId || 'Unknown Order'}</h2>
        <strong>${formatPrice(order.total)}</strong>
      </div>
      <p class="order-meta">${formatDate(order.createdAt)} | ${order.localityLabel || order.locality || 'Unknown locality'} | ${order.customer?.name || 'Unknown customer'}</p>
      <p class="order-meta">${order.customer?.phone || ''} | ${order.customer?.address || ''}</p>
      <ul class="order-items">${itemsMarkup}</ul>
      <div class="order-discounts">
        <p>Coupon: ${couponCode} (-${couponDiscount})</p>
        <p>Rewards: ${pointsUsed} pts (-${pointsDiscount})</p>
      </div>
    `;

    ordersListElement.appendChild(card);
  });
}

async function loadOrders() {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Loading';

  try {
    const response = await fetch('/api/orders');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Failed to load orders.');
    }

    allOrders = Array.isArray(data.orders) ? data.orders : [];
    renderStats();
    renderFilters();
    renderOrders();
  } catch (error) {
    ordersListElement.innerHTML = `<div class="empty">${error.message}</div>`;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Refresh';
  }
}

refreshButton.addEventListener('click', loadOrders);
filterLocalityElement.addEventListener('change', renderOrders);

loadOrders();
