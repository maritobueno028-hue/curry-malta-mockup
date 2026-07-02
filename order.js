const DELIVERY_ZONES = {
  st_julians: { label: "St. Julian's", minSubtotal: 15, deliveryFee: 2.5, eta: '32-42 min' },
  sliema: { label: 'Sliema', minSubtotal: 18, deliveryFee: 2.5, eta: '34-44 min' },
  gzira: { label: 'Gzira', minSubtotal: 18, deliveryFee: 2.5, eta: '35-46 min' },
  valletta: { label: 'Valletta', minSubtotal: 20, deliveryFee: 3.0, eta: '38-50 min' },
  swieqi: { label: 'Swieqi', minSubtotal: 17, deliveryFee: 2.5, eta: '30-40 min' },
  msida: { label: 'Msida', minSubtotal: 20, deliveryFee: 3.0, eta: '36-48 min' },
  san_gwann: { label: 'San Gwann', minSubtotal: 17, deliveryFee: 2.5, eta: '31-42 min' },
  birkirkara: { label: 'Birkirkara', minSubtotal: 24, deliveryFee: 3.5, eta: '40-55 min' },
};

const COUPONS = {
  VIP10: { type: 'percent', value: 10, minSubtotal: 25, label: '10% off' },
  LUNCH5: { type: 'fixed', value: 5, minSubtotal: 20, label: 'EUR 5 off' },
};

const POINT_VALUE = 0.1;
const MAX_POINTS_DISCOUNT_RATIO = 0.3;
const MAX_POINTS_PER_ORDER = 600;

const cartItemsElement = document.getElementById('cart-items');
const subtotalElement = document.getElementById('subtotal');
const deliveryFeeElement = document.getElementById('delivery-fee');
const couponDiscountElement = document.getElementById('coupon-discount');
const pointsDiscountElement = document.getElementById('points-discount');
const totalElement = document.getElementById('total');
const mobileCountElement = document.getElementById('mobile-count');
const mobileTotalElement = document.getElementById('mobile-total');

const localitySelect = document.getElementById('locality-select');
const zoneEtaElement = document.getElementById('zone-eta');
const zoneMinimumElement = document.getElementById('zone-minimum');
const checkoutLocalityElement = document.getElementById('checkout-locality');

const promoCodeInput = document.getElementById('promo-code');
const applyPromoButton = document.getElementById('apply-promo');
const promoFeedback = document.getElementById('promo-feedback');
const pointsInput = document.getElementById('points-used');
const applyPointsButton = document.getElementById('apply-points');
const pointsFeedback = document.getElementById('points-feedback');

const checkoutOpenButton = document.getElementById('checkout-open');
const mobileCheckoutOpenButton = document.getElementById('mobile-checkout-open');
const checkoutModal = document.getElementById('checkout-modal');
const checkoutCloseButton = document.getElementById('checkout-close');
const checkoutBackButton = document.getElementById('checkout-back');
const checkoutNextButton = document.getElementById('checkout-next');
const checkoutError = document.getElementById('checkout-error');
const checkoutSummary = document.getElementById('checkout-summary');
const checkoutFinalTotal = document.getElementById('checkout-final-total');
const checkoutSuccess = document.getElementById('checkout-success');
const checkoutForm = document.getElementById('checkout-form');
const stepButtons = Array.from(document.querySelectorAll('.step'));
const stepPanels = Array.from(document.querySelectorAll('.step-panel'));

const cart = [];
let currentStep = 1;
let selectedLocality = localitySelect.value;
let appliedCouponCode = '';
let couponDiscount = 0;
let appliedPoints = 0;
let pointsDiscount = 0;

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function formatPrice(value) {
  return `EUR ${roundMoney(value).toFixed(2)}`;
}

function getZone() {
  return DELIVERY_ZONES[selectedLocality] || DELIVERY_ZONES.st_julians;
}

function getSubtotal() {
  return roundMoney(cart.reduce((sum, item) => sum + item.price * item.qty, 0));
}

function getDeliveryFee() {
  return getZone().deliveryFee;
}

function computeCouponDiscount(code, subtotal) {
  if (!code) {
    return 0;
  }

  const coupon = COUPONS[code];
  if (!coupon || subtotal < coupon.minSubtotal) {
    return 0;
  }

  if (coupon.type === 'percent') {
    return roundMoney((subtotal * coupon.value) / 100);
  }
  return roundMoney(coupon.value);
}

function getPointsDiscountCap(subtotal) {
  return roundMoney(subtotal * MAX_POINTS_DISCOUNT_RATIO);
}

function recomputeDiscounts() {
  const subtotal = getSubtotal();
  couponDiscount = computeCouponDiscount(appliedCouponCode, subtotal);

  if (appliedCouponCode && couponDiscount === 0) {
    promoFeedback.textContent = 'Coupon no longer eligible for this subtotal.';
    appliedCouponCode = '';
  }

  const maxByRatio = getPointsDiscountCap(subtotal);
  const requestedPointsDiscount = roundMoney(appliedPoints * POINT_VALUE);
  pointsDiscount = Math.min(maxByRatio, requestedPointsDiscount);
}

function getTotal() {
  const subtotal = getSubtotal();
  const totalBeforeFloor = subtotal - couponDiscount - pointsDiscount + getDeliveryFee();
  return roundMoney(Math.max(totalBeforeFloor, 0));
}

function renderZone() {
  const zone = getZone();
  zoneEtaElement.textContent = `Estimated arrival ${zone.eta}`;
  zoneMinimumElement.textContent = `Minimum order for this zone: ${formatPrice(zone.minSubtotal)}`;
  checkoutLocalityElement.textContent = zone.label;
}

function renderCart() {
  cartItemsElement.innerHTML = '';

  if (cart.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Your cart is empty. Add dishes to continue.';
    cartItemsElement.appendChild(li);
  } else {
    cart.forEach((item) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${item.name} x ${item.qty}</span><strong>${formatPrice(item.price * item.qty)}</strong>`;
      cartItemsElement.appendChild(li);
    });
  }

  recomputeDiscounts();

  const subtotal = getSubtotal();
  const deliveryFee = getDeliveryFee();
  const total = getTotal();

  subtotalElement.textContent = formatPrice(subtotal);
  deliveryFeeElement.textContent = formatPrice(deliveryFee);
  couponDiscountElement.textContent = `-${formatPrice(couponDiscount)}`;
  pointsDiscountElement.textContent = `-${formatPrice(pointsDiscount)}`;
  totalElement.textContent = formatPrice(total);
  mobileTotalElement.textContent = formatPrice(total);
  checkoutFinalTotal.textContent = formatPrice(total);

  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  mobileCountElement.textContent = `${count} item${count === 1 ? '' : 's'}`;

  if (appliedPoints > 0) {
    const cap = getPointsDiscountCap(subtotal);
    pointsFeedback.textContent = `Applied ${appliedPoints} points (${formatPrice(pointsDiscount)}). Max for this basket: ${formatPrice(cap)}.`;
  }
}

function addToCart(name, price) {
  const existing = cart.find((item) => item.name === name);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ name, price, qty: 1 });
  }
  renderCart();
}

function setupMenuActions() {
  document.querySelectorAll('.menu-item .add-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.menu-item');
      const name = card.dataset.name;
      const price = Number(card.dataset.price);
      addToCart(name, price);
    });
  });
}

function setupSearch() {
  const input = document.getElementById('menu-search');
  const cards = Array.from(document.querySelectorAll('.menu-item'));

  input.addEventListener('input', () => {
    const keyword = input.value.trim().toLowerCase();
    cards.forEach((card) => {
      const name = card.dataset.name.toLowerCase();
      card.style.display = name.includes(keyword) ? 'block' : 'none';
    });
  });
}

function setupChips() {
  const chips = Array.from(document.querySelectorAll('.chip'));
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((item) => item.classList.remove('active'));
      chip.classList.add('active');
    });
  });
}

function setupLocation() {
  localitySelect.addEventListener('change', () => {
    selectedLocality = localitySelect.value;
    renderZone();
    renderCart();
  });
  renderZone();
}

function setupDiscounts() {
  applyPromoButton.addEventListener('click', () => {
    const code = promoCodeInput.value.trim().toUpperCase();
    const subtotal = getSubtotal();
    const coupon = COUPONS[code];

    if (!code) {
      appliedCouponCode = '';
      couponDiscount = 0;
      promoFeedback.textContent = 'Coupon cleared.';
      renderCart();
      return;
    }

    if (!coupon) {
      promoFeedback.textContent = 'Invalid coupon code.';
      return;
    }

    if (subtotal < coupon.minSubtotal) {
      promoFeedback.textContent = `Coupon requires at least ${formatPrice(coupon.minSubtotal)} subtotal.`;
      return;
    }

    appliedCouponCode = code;
    couponDiscount = computeCouponDiscount(code, subtotal);
    promoFeedback.textContent = `${coupon.label} applied successfully.`;
    renderCart();
  });

  applyPointsButton.addEventListener('click', () => {
    const raw = Number(pointsInput.value);
    if (!Number.isFinite(raw) || raw < 0) {
      pointsFeedback.textContent = 'Enter a valid number of points.';
      return;
    }

    const roundedPoints = Math.floor(raw);
    if (roundedPoints > MAX_POINTS_PER_ORDER) {
      pointsFeedback.textContent = `Maximum redeemable points per order is ${MAX_POINTS_PER_ORDER}.`;
      return;
    }

    appliedPoints = roundedPoints;
    renderCart();
  });
}

function renderCheckoutSummary() {
  checkoutSummary.innerHTML = '';

  cart.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${item.name} x ${item.qty}</span><strong>${formatPrice(item.price * item.qty)}</strong>`;
    checkoutSummary.appendChild(li);
  });

  const deliveryLine = document.createElement('li');
  deliveryLine.innerHTML = `<span>Delivery (${getZone().label})</span><strong>${formatPrice(getDeliveryFee())}</strong>`;
  checkoutSummary.appendChild(deliveryLine);

  if (couponDiscount > 0) {
    const couponLine = document.createElement('li');
    couponLine.innerHTML = `<span>Coupon ${appliedCouponCode}</span><strong>-${formatPrice(couponDiscount)}</strong>`;
    checkoutSummary.appendChild(couponLine);
  }

  if (pointsDiscount > 0) {
    const pointsLine = document.createElement('li');
    pointsLine.innerHTML = `<span>Rewards (${appliedPoints} pts)</span><strong>-${formatPrice(pointsDiscount)}</strong>`;
    checkoutSummary.appendChild(pointsLine);
  }
}

function showStep(stepNumber) {
  currentStep = stepNumber;
  stepButtons.forEach((button) => {
    const step = Number(button.dataset.step);
    button.classList.toggle('active', step === currentStep);
  });

  stepPanels.forEach((panel) => {
    const step = Number(panel.dataset.stepPanel);
    panel.classList.toggle('hidden', step !== currentStep);
  });

  checkoutBackButton.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
  checkoutNextButton.textContent = currentStep === 3 ? 'Place Order' : 'Next';
}

function closeCheckout() {
  checkoutModal.classList.remove('open');
  checkoutModal.setAttribute('aria-hidden', 'true');
}

function valueOf(id) {
  return document.getElementById(id).value.trim();
}

function validateZoneEligibility() {
  const subtotal = getSubtotal();
  const zone = getZone();
  if (subtotal < zone.minSubtotal) {
    checkoutError.textContent = `Minimum order for ${zone.label} is ${formatPrice(zone.minSubtotal)}.`;
    return false;
  }
  return true;
}

function openCheckout() {
  if (cart.length === 0) {
    checkoutError.textContent = 'Your cart is empty. Add at least one dish before checkout.';
    return;
  }

  if (!validateZoneEligibility()) {
    return;
  }

  checkoutError.textContent = '';
  checkoutSuccess.classList.add('hidden');
  checkoutModal.classList.add('open');
  checkoutModal.setAttribute('aria-hidden', 'false');
  renderCheckoutSummary();
  showStep(1);
}

function validateStep(stepNumber) {
  checkoutError.textContent = '';

  if (stepNumber === 1) {
    const name = valueOf('customer-name');
    const phone = valueOf('customer-phone');
    const address = valueOf('customer-address');

    if (!validateZoneEligibility()) {
      return false;
    }
    if (name.length < 2) {
      checkoutError.textContent = 'Please provide a valid full name.';
      return false;
    }
    if (!/^\+?[0-9\s]{7,15}$/.test(phone)) {
      checkoutError.textContent = 'Please provide a valid phone number.';
      return false;
    }
    if (address.length < 8) {
      checkoutError.textContent = 'Please provide a complete delivery address.';
      return false;
    }
  }

  if (stepNumber === 2) {
    const cardName = valueOf('card-name');
    const cardNumber = valueOf('card-number').replace(/\s+/g, '');
    const cardExpiry = valueOf('card-expiry');
    const cardCvc = valueOf('card-cvc');

    if (cardName.length < 2) {
      checkoutError.textContent = 'Card holder name is required.';
      return false;
    }
    if (!/^\d{13,19}$/.test(cardNumber)) {
      checkoutError.textContent = 'Card number must contain 13 to 19 digits.';
      return false;
    }
    if (!/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(cardExpiry)) {
      checkoutError.textContent = 'Expiry format must be MM/YY.';
      return false;
    }
    if (!/^\d{3,4}$/.test(cardCvc)) {
      checkoutError.textContent = 'CVC must be 3 or 4 digits.';
      return false;
    }
  }

  return true;
}

async function submitOrder() {
  const payload = {
    customer: {
      name: valueOf('customer-name'),
      phone: valueOf('customer-phone'),
      address: valueOf('customer-address'),
    },
    payment: {
      cardHolder: valueOf('card-name'),
      cardLast4: valueOf('card-number').replace(/\s+/g, '').slice(-4),
      expiry: valueOf('card-expiry'),
    },
    locality: selectedLocality,
    localityLabel: getZone().label,
    items: cart,
    discounts: {
      couponCode: appliedCouponCode || null,
      couponDiscount,
      pointsUsed: appliedPoints,
      pointsDiscount,
    },
    subtotal: getSubtotal(),
    deliveryFee: getDeliveryFee(),
    total: getTotal(),
    createdAt: new Date().toISOString(),
  };

  checkoutNextButton.disabled = true;
  checkoutNextButton.textContent = 'Placing...';

  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Checkout request failed. Please try again.');
    }

    checkoutForm.reset();
    cart.length = 0;
    appliedCouponCode = '';
    couponDiscount = 0;
    appliedPoints = 0;
    pointsDiscount = 0;
    promoCodeInput.value = '';
    pointsInput.value = '';
    promoFeedback.textContent = '';
    pointsFeedback.textContent = '';

    renderCart();
    renderCheckoutSummary();
    checkoutSuccess.textContent = `Order confirmed. Your order ID is ${data.orderId}.`;
    checkoutSuccess.classList.remove('hidden');
    showStep(1);
  } catch (error) {
    checkoutError.textContent = error.message;
  } finally {
    checkoutNextButton.disabled = false;
    showStep(currentStep);
  }
}

function setupCheckout() {
  checkoutOpenButton.addEventListener('click', openCheckout);
  mobileCheckoutOpenButton.addEventListener('click', openCheckout);
  checkoutCloseButton.addEventListener('click', closeCheckout);

  checkoutBackButton.addEventListener('click', () => {
    if (currentStep > 1) {
      showStep(currentStep - 1);
    }
  });

  checkoutNextButton.addEventListener('click', async () => {
    if (!validateStep(currentStep)) {
      return;
    }

    if (currentStep < 3) {
      if (currentStep === 2) {
        renderCheckoutSummary();
      }
      showStep(currentStep + 1);
      return;
    }

    await submitOrder();
  });

  stepButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetStep = Number(button.dataset.step);
      if (targetStep <= currentStep || validateStep(currentStep)) {
        if (targetStep === 3) {
          renderCheckoutSummary();
        }
        showStep(targetStep);
      }
    });
  });
}

setupMenuActions();
setupSearch();
setupChips();
setupLocation();
setupDiscounts();
setupCheckout();
renderCart();
