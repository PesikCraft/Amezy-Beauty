// ==================== STATE ====================
const state = {
    user: null,
    token: null,
    categories: [],
    products: [],
    cart: [],
    settings: {},
    currentPage: 'home',
    currentCategory: 'all',
    currentOrderFilter: 'all',
    currency: 'AMD',
    pendingOrder: null,
    eventSource: null
};

// ==================== API ====================
const API_BASE = '/api';

async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Произошла ошибка');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ==================== SSE (Real-time) ====================
function connectSSE() {
    if (!state.token || state.eventSource) return;
    
    state.eventSource = new EventSource(`${API_BASE}/sse?token=${state.token}`);
    
    state.eventSource.addEventListener('order_updated', (e) => {
        const order = JSON.parse(e.data);
        showToast(`Статус заказа ${order.orderNumber} изменён`, 'info');
        if (state.currentPage === 'orders') {
            loadOrders();
        }
    });
    
    state.eventSource.addEventListener('new_order', (e) => {
        const order = JSON.parse(e.data);
        showToast(`Новый заказ ${order.orderNumber}`, 'info');
        if (state.currentPage === 'admin') {
            loadAdminOrders();
            loadAdminStats();
        }
    });
    
    state.eventSource.addEventListener('payment_confirmed', (e) => {
        const order = JSON.parse(e.data);
        showToast(`Оплата подтверждена: ${order.orderNumber}`, 'success');
        if (state.currentPage === 'admin') {
            loadAdminOrders();
            loadAdminStats();
        }
    });
    
    state.eventSource.onerror = () => {
        state.eventSource.close();
        state.eventSource = null;
        // Переподключение через 5 секунд
        setTimeout(connectSSE, 5000);
    };
}

function disconnectSSE() {
    if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
    }
}

// ==================== CURRENCY ====================
function loadCurrency() {
    const saved = localStorage.getItem('amezy_currency');
    if (saved && ['AMD', 'RUB', 'USD'].includes(saved)) {
        state.currency = saved;
    }
    document.getElementById('currencySelect').value = state.currency;
}

function changeCurrency(currency) {
    state.currency = currency;
    localStorage.setItem('amezy_currency', currency);
    
    // Перерисовываем цены
    renderProducts();
    renderCart();
    if (state.currentPage === 'admin') {
        loadAdminStats();
        loadAdminProducts();
    }
}

function convertPrice(priceAMD) {
    const rates = state.settings.currencies || {
        AMD: { symbol: '֏', rate: 1 },
        RUB: { symbol: '₽', rate: 0.23 },
        USD: { symbol: '$', rate: 0.0026 }
    };
    
    const currency = rates[state.currency] || rates.AMD;
    const converted = priceAMD * currency.rate;
    
    return formatPrice(converted, state.currency);
}

function formatPrice(price, currency = 'AMD') {
    const symbols = { AMD: '֏', RUB: '₽', USD: '$' };
    const symbol = symbols[currency] || '֏';
    
    if (currency === 'USD') {
        return `${symbol}${price.toFixed(2)}`;
    }
    
    return `${Math.round(price).toLocaleString('ru-RU')} ${symbol}`;
}

// ==================== AUTH ====================
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    
    try {
        errorEl.classList.add('hidden');
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        state.token = data.token;
        state.user = data.user;
        
        localStorage.setItem('amezy_token', data.token);
        
        closeModal();
        updateAuthUI();
        connectSSE();
        showToast('Добро пожаловать, ' + data.user.name + '!', 'success');
        
       
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }

    // (resetStatsBtn UI logic moved to updateAuthUI)
}

async function handleRegister(event) {
    event.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const errorEl = document.getElementById('registerError');
    
    try {
        errorEl.classList.add('hidden');
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password })
        });
        
        state.token = data.token;
        state.user = data.user;
        
        localStorage.setItem('amezy_token', data.token);
        
        closeModal();
        updateAuthUI();
        connectSSE();
        showToast('Регистрация успешна!', 'success');
        
        document.getElementById('registerName').value = '';
        document.getElementById('registerEmail').value = '';
        document.getElementById('registerPassword').value = '';
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }
}

async function checkAuth() {
    const token = localStorage.getItem('amezy_token');
    
    if (!token) return;
    
    state.token = token;
    
    try {
        const data = await apiRequest('/auth/me');
        state.user = data.user;
        updateAuthUI();
        connectSSE();
    } catch (error) {
        localStorage.removeItem('amezy_token');
        state.token = null;
        state.user = null;
    }
}

async function logout() {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {}
    
    localStorage.removeItem('amezy_token');
    state.token = null;
    state.user = null;
    
    disconnectSSE();
    updateAuthUI();
    showPage('home');
    showToast('Вы вышли из аккаунта', 'info');
}

function updateAuthUI() {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    const userName = document.getElementById('userName');
    const adminBtn = document.getElementById('adminBtn');
    
    if (state.user) {
        authButtons.classList.add('hidden');
        userMenu.classList.remove('hidden');
        userName.textContent = state.user.name;
        
        // Показываем админ-панель для admin и superadmin
        const isAdmin = state.user.role === 'admin' || state.user.role === 'superadmin';
        adminBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    } else {
        authButtons.classList.remove('hidden');
        userMenu.classList.add('hidden');
    }
    const resetBtn = document.getElementById('resetStatsBtn');
    if (resetBtn) {
        resetBtn.style.display =
            state.user && state.user.role === 'superadmin'
                ? 'inline-block'
                : 'none';
    }
}

function isAdmin() {
    return state.user && (state.user.role === 'admin' || state.user.role === 'superadmin');
}

function isSuperAdmin() {
    return state.user && state.user.role === 'superadmin';
}

// ==================== SETTINGS ====================
async function loadSettings() {
    try {
        state.settings = await apiRequest('/settings');
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// ==================== CATEGORIES ====================
async function loadCategories() {
    try {
        state.categories = await apiRequest('/categories');
        renderCategories();
        renderCategoryFilters();
        renderProductCategorySelect();
    } catch (error) {
        showToast('Ошибка загрузки категорий', 'error');
    }
}

function renderCategories() {
    const grid = document.getElementById('categoriesGrid');
    
    grid.innerHTML = state.categories.map(cat => `
        <div class="category-card" onclick="showPage('catalog'); filterProducts('${cat.id}')">
            <span class="category-icon">${cat.icon || '📦'}</span>
            <h3 class="category-name">${cat.name}</h3>
        </div>
    `).join('');
}

function renderCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    
    container.innerHTML = state.categories.map(cat => `
        <button class="filter-btn" data-category="${cat.id}" onclick="filterProducts('${cat.id}')">${cat.name}</button>
    `).join('');
}

function renderProductCategorySelect() {
    const select = document.getElementById('productCategory');
    if (!select) return;
    
    select.innerHTML = state.categories.map(cat => `
        <option value="${cat.id}">${cat.name}</option>
    `).join('');
}

// ==================== PRODUCTS ====================
async function loadProducts(categoryId = null) {
    try {
        const endpoint = categoryId && categoryId !== 'all' 
            ? `/products?categoryId=${categoryId}` 
            : '/products';
        state.products = await apiRequest(endpoint);
        renderProducts();
    } catch (error) {
        showToast('Ошибка загрузки товаров', 'error');
    }
}

function renderProducts() {
    const featuredGrid = document.getElementById('featuredProducts');
    const catalogGrid = document.getElementById('catalogProducts');
    
    const productsHTML = state.products.map(product => {
        const imageHTML = product.image
            ? `<img src="${product.image}" alt="${product.name}" class="product-image" onerror="this.outerHTML='<div class=\\'product-image-placeholder no-image\\'>📷</div>'">`
            : `<div class="product-image-placeholder no-image">📷</div>`;
        
        return `
            <div class="product-card">
                ${imageHTML}
                <div class="product-info">
                    <h3 class="product-name">${product.name}</h3>
                    <p class="product-description">${product.description || ''}</p>
                    <p class="product-price">${convertPrice(product.price)}</p>
                    <div class="product-actions">
                        <button class="btn btn-primary btn-sm" onclick="addToCart('${product.id}')">
                            В корзину
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    if (featuredGrid) featuredGrid.innerHTML = productsHTML;
    if (catalogGrid) catalogGrid.innerHTML = productsHTML;
}

function filterProducts(categoryId) {
    state.currentCategory = categoryId;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === categoryId);
    });
    
    loadProducts(categoryId);
}

// ==================== CART ====================
function loadCart() {
    const savedCart = localStorage.getItem('amezy_cart');
    if (savedCart) {
        try {
            state.cart = JSON.parse(savedCart);
        } catch (e) {
            state.cart = [];
        }
    }
    updateCartUI();
}

function saveCart() {
    localStorage.setItem('amezy_cart', JSON.stringify(state.cart));
    updateCartUI();
}

function addToCart(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;
    
    const existingItem = state.cart.find(item => item.productId === productId);
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        state.cart.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: 1
        });
    }
    
    saveCart();
    showToast('Товар добавлен в корзину', 'success');
}

function removeFromCart(productId) {
    state.cart = state.cart.filter(item => item.productId !== productId);
    saveCart();
    renderCart();
}

function updateQuantity(productId, delta) {
    const item = state.cart.find(item => item.productId === productId);
    if (!item) return;
    
    item.quantity += delta;
    
    if (item.quantity <= 0) {
        removeFromCart(productId);
    } else {
        saveCart();
        renderCart();
    }
}

function updateCartUI() {
    const countEl = document.getElementById('cartCount');
    const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    countEl.textContent = totalItems;
}

function renderCart() {
    const emptyEl = document.getElementById('cartEmpty');
    const contentEl = document.getElementById('cartContent');
    const itemsEl = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const checkoutEl = document.getElementById('checkoutForm');
    const paymentConfirmEl = document.getElementById('paymentConfirmation');
    
    if (state.cart.length === 0) {
        emptyEl.classList.remove('hidden');
        contentEl.classList.add('hidden');
        checkoutEl.classList.add('hidden');
        paymentConfirmEl.classList.add('hidden');
        return;
    }
    
    emptyEl.classList.add('hidden');
    contentEl.classList.remove('hidden');
    
    itemsEl.innerHTML = state.cart.map(item => {
        const imageHTML = item.image
            ? `<img src="${item.image}" alt="${item.name}" class="cart-item-image" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📷</text></svg>'">`
            : `<div class="cart-item-image" style="display:flex;align-items:center;justify-content:center;font-size:32px;background:var(--bg-secondary);color:var(--text-muted);">📷</div>`;
        
        return `
            <div class="cart-item">
                ${imageHTML}
                <div class="cart-item-info">
                    <h4 class="cart-item-name">${item.name}</h4>
                    <p class="cart-item-price">${convertPrice(item.price)}</p>
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="updateQuantity('${item.productId}', -1)">−</button>
                        <span class="quantity-value">${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateQuantity('${item.productId}', 1)">+</button>
                    </div>
                </div>
                <button class="cart-item-remove" onclick="removeFromCart('${item.productId}')">×</button>
            </div>
        `;
    }).join('');
    
    const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    totalEl.textContent = convertPrice(total);
}

function showCheckout() {
    if (!state.user) {
        showToast('Войдите в аккаунт для оформления заказа', 'error');
        showModal('login');
        return;
    }
    
    document.getElementById('cartContent').classList.add('hidden');
    document.getElementById('checkoutForm').classList.remove('hidden');
    
    // Обновляем сумму для оплаты картой
    const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('paymentAmount').textContent = convertPrice(total);
    
    // Загружаем данные карты из настроек
    if (state.settings.paymentCard) {
        document.getElementById('paymentCardNumber').textContent = state.settings.paymentCard.number;
        document.getElementById('paymentCardHolder').textContent = state.settings.paymentCard.holder;
        document.getElementById('paymentInstruction').textContent = state.settings.paymentCard.instruction;
    }
}

function hideCheckout() {
    document.getElementById('cartContent').classList.remove('hidden');
    document.getElementById('checkoutForm').classList.add('hidden');
}

function togglePaymentInfo() {
    const method = document.querySelector('input[name="paymentMethod"]:checked').value;
    const cardInfo = document.getElementById('cardPaymentInfo');
    const checkoutBtn = document.getElementById('checkoutBtn');
    
    if (method === 'card') {
        cardInfo.classList.remove('hidden');
        checkoutBtn.textContent = 'Перейти к оплате';
    } else {
        cardInfo.classList.add('hidden');
        checkoutBtn.textContent = 'Подтвердить заказ';
    }
}

function copyCardNumber() {
    const cardNumber = document.getElementById('paymentCardNumber').textContent || 
                       document.getElementById('confirmCardNumber').textContent;
    navigator.clipboard.writeText(cardNumber.replace(/\s/g, ''));
    showToast('Номер карты скопирован', 'success');
}

async function placeOrder() {
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    const address = document.getElementById('deliveryAddress').value;
    const mapCoordinates = document.getElementById('mapCoordinates').value;
    const mapAddress = document.getElementById('mapAddress').value;
    
    if (!address.trim()) {
        showToast('Укажите адрес доставки', 'error');
        return;
    }
    
    const items = state.cart.map(item => ({
        productId: item.productId,
        quantity: item.quantity
    }));
    
    try {
        const order = await apiRequest('/orders', {
            method: 'POST',
            body: JSON.stringify({
                items,
                paymentMethod,
                address,
                mapCoordinates: mapCoordinates || null,
                mapAddress: mapAddress || null,
                currency: state.currency
            })
        });
        
        if (paymentMethod === 'card') {
            // Показываем экран подтверждения оплаты
            state.pendingOrder = order;
            showPaymentConfirmation(order);
        } else {
            // Заказ оформлен
            completeOrder();
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function showPaymentConfirmation(order) {
    document.getElementById('checkoutForm').classList.add('hidden');
    document.getElementById('paymentConfirmation').classList.remove('hidden');
    
    document.getElementById('confirmOrderNumber').textContent = order.orderNumber;
    document.getElementById('confirmOrderAmount').textContent = convertPrice(order.total);
    
    if (state.settings.paymentCard) {
        document.getElementById('confirmCardNumber').textContent = state.settings.paymentCard.number;
        document.getElementById('confirmCardHolder').textContent = state.settings.paymentCard.holder;
    }
}

async function confirmPayment() {
    if (!state.pendingOrder) return;
    
    try {
        await apiRequest(`/orders/${state.pendingOrder.id}/confirm-payment`, {
            method: 'POST'
        });
        
        completeOrder();
        showToast('Оплата подтверждена! Ожидайте проверки.', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function cancelPayment() {
    state.pendingOrder = null;
    document.getElementById('paymentConfirmation').classList.add('hidden');
    document.getElementById('cartContent').classList.remove('hidden');
    showToast('Заказ отменён', 'info');
}

function completeOrder() {
    state.cart = [];
    saveCart();
    state.pendingOrder = null;
    
    document.getElementById('deliveryAddress').value = '';
    document.getElementById('addressSearch').value = '';
    document.getElementById('mapCoordinates').value = '';
    document.getElementById('mapAddress').value = '';
    document.getElementById('coordsInput').value = '';
    
    document.getElementById('checkoutForm').classList.add('hidden');
    document.getElementById('paymentConfirmation').classList.add('hidden');
    
    showPage('orders');
    showToast('Заказ успешно оформлен!', 'success');
}

// ==================== ADDRESS & MAP ====================
let searchTimeout = null;

function searchAddress(query) {
    clearTimeout(searchTimeout);
    
    if (query.length < 3) {
        document.getElementById('addressSuggestions').classList.add('hidden');
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        // Простой поиск через Nominatim (OpenStreetMap)
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
            const results = await response.json();
            
            const suggestionsEl = document.getElementById('addressSuggestions');
            
            if (results.length > 0) {
                suggestionsEl.innerHTML = results.map(r => `
                    <div class="address-suggestion" onclick="selectAddress('${r.display_name}', ${r.lat}, ${r.lon})">
                        ${r.display_name}
                    </div>
                `).join('');
                suggestionsEl.classList.remove('hidden');
            } else {
                suggestionsEl.classList.add('hidden');
            }
        } catch (error) {
            console.error('Address search error:', error);
        }
    }, 500);
}

function selectAddress(address, lat, lon) {
    document.getElementById('deliveryAddress').value = address;
    document.getElementById('addressSearch').value = '';
    document.getElementById('addressSuggestions').classList.add('hidden');
    
    document.getElementById('mapCoordinates').value = `${lat},${lon}`;
    document.getElementById('mapAddress').value = address;
    document.getElementById('coordsInput').value = `${lat},${lon}`;
    
    updateMapFrame(lat, lon);
    updateMapLink(lat, lon);
}

function updateMapFromCoords(coords) {
    const parts = coords.split(',').map(s => s.trim());
    if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        
        if (!isNaN(lat) && !isNaN(lon)) {
            document.getElementById('mapCoordinates').value = `${lat},${lon}`;
            updateMapFrame(lat, lon);
            updateMapLink(lat, lon);
        }
    }
}

function updateMapFrame(lat, lon) {
    const iframe = document.getElementById('mapFrame');
    if (!iframe) return;

    // Яндекс.Карты: ВАЖНО — сначала lon, потом lat
    iframe.src = `https://yandex.ru/map-widget/v1/?ll=${lon},${lat}&z=16&pt=${lon},${lat},pm2rdm`;
}

function updateMapLink(lat, lon) {
    const link = document.getElementById('mapLink');
    if (!link) return;

    link.href = `https://yandex.ru/maps/?ll=${lon},${lat}&z=16&pt=${lon},${lat},pm2rdm`;
}

// ==================== ORDERS ====================
async function loadOrders() {
    if (!state.user) return;
    
    try {
        const orders = await apiRequest('/orders');
        renderOrders(orders);
    } catch (error) {
        showToast('Ошибка загрузки заказов', 'error');
    }
}

function renderOrders(orders) {
    const emptyEl = document.getElementById('ordersEmpty');
    const listEl = document.getElementById('ordersList');
    
    if (orders.length === 0) {
        emptyEl.classList.remove('hidden');
        listEl.innerHTML = '';
        return;
    }
    
    emptyEl.classList.add('hidden');
    
    listEl.innerHTML = orders.map(order => `
        <div class="order-card" onclick="showOrderDetail('${order.id}')">
            <div class="order-header">
                <div>
                    <span class="order-id">${order.orderNumber}</span>
                    <span class="order-date">${formatDate(order.createdAt)}</span>
                </div>
                <span class="status-badge status-${order.status}">${getStatusText(order.status)}</span>
            </div>
            <div class="order-items">
                ${order.items.map(item => `
                    <div class="order-item">
                        <span class="order-item-name">${item.name}</span>
                        <span class="order-item-qty">× ${item.quantity}</span>
                    </div>
                `).join('')}
            </div>
            <div class="order-footer">
                <span class="order-total">${convertPrice(order.total)}</span>
                <span class="order-details">${getPaymentText(order.paymentMethod)}</span>
            </div>
            ${order.statusHistory && order.statusHistory.length > 1 ? `
                <div class="status-timeline">
                    ${order.statusHistory.slice(-3).reverse().map(h => `
                        <div class="timeline-item">
                            <div class="timeline-dot"></div>
                            <div class="timeline-content">
                                <div>${getStatusText(h.status)}</div>
                                <div class="timeline-time">${formatDate(h.timestamp)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `).join('');
}

async function showOrderDetail(orderId) {
    try {
        const order = await apiRequest(`/orders/${orderId}`);
        
        const content = document.getElementById('orderDetailContent');
        content.innerHTML = `
            <div class="order-detail">
                <div class="order-detail-header">
                    <div class="order-detail-info">
                        <h2>${order.orderNumber}</h2>
                        <p>${formatDate(order.createdAt)}</p>
                    </div>
                    <span class="status-badge status-${order.status}">${getStatusText(order.status)}</span>
                </div>
                
                <div class="order-detail-section">
                    <h4>Товары</h4>
                    <div class="order-detail-items">
                        ${order.items.map(item => `
                            <div class="order-detail-item">
                                <span>${item.name} × ${item.quantity}</span>
                                <span>${convertPrice(item.total)}</span>
                            </div>
                        `).join('')}
                        <div class="order-detail-item" style="font-weight:bold;border-top:2px solid var(--border-color);padding-top:12px;">
                            <span>Итого</span>
                            <span>${convertPrice(order.total)}</span>
                        </div>
                    </div>
                </div>
                
                <div class="order-detail-section">
                    <h4>Доставка</h4>
                    ${order.mapCoordinates ? `
                        <div class="order-detail-map">
                           <iframe
  src="https://yandex.ru/map-widget/v1/?ll=${order.mapCoordinates.split(',')[1]},${order.mapCoordinates.split(',')[0]}&z=16&pt=${order.mapCoordinates.split(',')[1]},${order.mapCoordinates.split(',')[0]},pm2rdm">
</iframe>
                        </div>
                    ` : ''}
                    <div class="order-detail-address">
                        <strong>Адрес:</strong> ${order.address}
                        ${order.mapCoordinates ? `<br><a href="https://yandex.ru/maps/?ll=${order.mapCoordinates.split(',')[1]},${order.mapCoordinates.split(',')[0]}&z=16&pt=${order.mapCoordinates.split(',')[1]},${order.mapCoordinates.split(',')[0]},pm2rdm" target="_blank">Открыть в Яндекс.Картах</a>` : ''}
                    </div>
                </div>
                
                <div class="order-detail-section">
                    <h4>История статусов</h4>
                    <div class="status-timeline">
                        ${(order.statusHistory || []).reverse().map(h => `
                            <div class="timeline-item">
                                <div class="timeline-dot"></div>
                                <div class="timeline-content">
                                    <div>${getStatusText(h.status)}</div>
                                    <div class="timeline-time">${formatDate(h.timestamp)}</div>
                                    ${h.comment ? `<div style="color:var(--text-muted);font-size:12px;">${h.comment}</div>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('orderDetailOverlay').classList.remove('hidden');
    } catch (error) {
        showToast('Ошибка загрузки заказа', 'error');
    }
}

function closeOrderDetail() {
    document.getElementById('orderDetailOverlay').classList.add('hidden');
}

// ==================== ADMIN ====================
async function loadAdminData() {
    if (!state.user || !isAdmin()) return;
    
    await Promise.all([
        loadAdminStats(),
        loadAdminOrders(),
        loadAdminProducts(),
        loadAdminCategories(),
        loadAdminUsers(),
        loadAdminHistory()
    ]);
}

async function loadAdminStats() {
    try {
        const stats = await apiRequest('/admin/stats');
        
        document.getElementById('statToday').textContent = convertPrice(stats.totalToday);
        document.getElementById('statMonth').textContent = convertPrice(stats.totalMonth);
        document.getElementById('statTotal').textContent = convertPrice(stats.totalAll);
        document.getElementById('statOrders').textContent = stats.ordersCount;
        
        // Статусы
        const statusCounts = stats.statusCounts || {};
        const statusLabels = {
            pending: 'Ожидают',
            paid: 'Оплачены',
            processing: 'В обработке',
            shipping: 'В пути',
            done: 'Выполнены',
            cancelled: 'Отменены'
        };
        
        document.getElementById('statsDetails').innerHTML = Object.entries(statusLabels).map(([status, label]) => `
            <div class="stat-detail">
                <span class="status-badge status-${status}">${label}</span>
                <span>${statusCounts[status] || 0}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadAdminOrders() {
    try {
        const status = state.currentOrderFilter !== 'all' ? `?status=${state.currentOrderFilter}` : '';
        const orders = await apiRequest(`/admin/orders${status}`);
        renderAdminOrders(orders);
    } catch (error) {
        console.error('Error loading admin orders:', error);
    }
}

function filterOrders(status) {
    state.currentOrderFilter = status;
    
    document.querySelectorAll('.status-filters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });
    
    loadAdminOrders();
}

function renderAdminOrders(orders) {
    const listEl = document.getElementById('adminOrdersList');
    
    if (orders.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">Заказов нет</p>';
        return;
    }
    
    const statusOptions = ['pending', 'paid', 'processing', 'shipping', 'delivered', 'done', 'cancelled'];
    
    listEl.innerHTML = orders.map(order => `
        <div class="admin-order-card" onclick="showOrderDetail('${order.id}')">
            <div class="admin-order-header">
                <div class="admin-order-info">
                    <h4>${order.orderNumber}</h4>
                    <p>${order.userName} (${order.userEmail})</p>
                    <p>${formatDate(order.createdAt)} • ${getPaymentText(order.paymentMethod)}</p>
                </div>
                <div class="admin-order-actions" onclick="event.stopPropagation()">
                    <select onchange="updateOrderStatus('${order.id}', this.value)">
                        ${statusOptions.map(s => `
                            <option value="${s}" ${order.status === s ? 'selected' : ''}>${getStatusText(s)}</option>
                        `).join('')}
                    </select>
                    <button class="btn btn-danger btn-sm" onclick="deleteOrder('${order.id}')">🗑</button>
                </div>
            </div>
            <div class="order-items">
                ${order.items.map(item => `
                    <div class="order-item">
                        <span class="order-item-name">${item.name}</span>
                        <span class="order-item-qty">× ${item.quantity} = ${convertPrice(item.total)}</span>
                    </div>
                `).join('')}
            </div>
            <div class="order-footer">
                <span class="order-total">${convertPrice(order.total)}</span>
                <span class="status-badge status-${order.status}">${getStatusText(order.status)}</span>
            </div>
            <div class="order-address">
                <strong>Адрес:</strong> ${order.address}
                ${order.mapCoordinates ? `<br><a href="https://yandex.ru/maps/?ll=${order.mapCoordinates}" target="_blank">Карта</a>` : ''}
            </div>
        </div>
    `).join('');
}

async function updateOrderStatus(orderId, status) {
    try {
        await apiRequest(`/admin/orders/${orderId}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        
        showToast('Статус обновлён', 'success');
        loadAdminStats();
    } catch (error) {
        showToast(error.message, 'error');
        loadAdminOrders();
    }
}

async function deleteOrder(orderId) {
    if (!confirm('Переместить заказ в историю?')) return;
    
    try {
        await apiRequest(`/admin/orders/${orderId}`, { method: 'DELETE' });
        showToast('Заказ перемещён в историю', 'success');
        loadAdminOrders();
        loadAdminStats();
        loadAdminHistory();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function loadAdminHistory() {
    try {
        const history = await apiRequest('/admin/orders-history');
        renderAdminHistory(history);
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

function renderAdminHistory(orders) {
    const listEl = document.getElementById('adminHistoryList');
    
    if (orders.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">История пуста</p>';
        return;
    }
    
    listEl.innerHTML = orders.map(order => `
        <div class="admin-order-card" style="opacity:0.7;">
            <div class="admin-order-header">
                <div class="admin-order-info">
                    <h4>${order.orderNumber}</h4>
                    <p>${order.userName}</p>
                    <p>Удалён: ${formatDate(order.deletedAt)}</p>
                </div>
                <span class="status-badge status-${order.status}">${getStatusText(order.status)}</span>
            </div>
            <div class="order-footer">
                <span class="order-total">${convertPrice(order.total)}</span>
            </div>
        </div>
    `).join('');
}

async function loadAdminProducts() {
    try {
        const products = await apiRequest('/products');
        renderAdminProducts(products);
    } catch (error) {
        console.error('Error loading admin products:', error);
    }
}

function renderAdminProducts(products) {
    const listEl = document.getElementById('adminProductsList');
    
    listEl.innerHTML = products.map(product => {
        const category = state.categories.find(c => c.id === product.categoryId);
        const imageHTML = product.image
            ? `<img src="${product.image}" alt="${product.name}" class="admin-product-image" onerror="this.outerHTML='<div class=\\'admin-product-placeholder no-image\\'>📷</div>'">`
            : `<div class="admin-product-placeholder no-image">📷</div>`;
        
        return `
            <div class="admin-product-card">
                ${imageHTML}
                <div class="admin-product-info">
                    <h4>${product.name}</h4>
                    <p>${category ? category.name : 'Без категории'}</p>
                </div>
                <span class="admin-product-price">${convertPrice(product.price)}</span>
                <div class="admin-product-actions">
                    <label class="btn btn-outline btn-sm">
                        📷
                        <input type="file" accept="image/*" style="display:none" onchange="uploadProductImage('${product.id}', this)">
                    </label>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct('${product.id}')">🗑</button>
                </div>
            </div>
        `;
    }).join('');
}

async function handleAddProduct(event) {
    event.preventDefault();
    
    const name = document.getElementById('productName').value;
    const price = document.getElementById('productPrice').value;
    const categoryId = document.getElementById('productCategory').value;
    const description = document.getElementById('productDescription').value;
    const imageFile = document.getElementById('productImageFile').files[0];
    const errorEl = document.getElementById('productError');
    
    try {
        errorEl.classList.add('hidden');
        
        // Создаём товар
        const product = await apiRequest('/products', {
            method: 'POST',
            body: JSON.stringify({ name, price, categoryId, description })
        });
        
        // Загружаем изображение если есть
        if (imageFile) {
            const formData = new FormData();
            formData.append('image', imageFile);
            
            await fetch(`/api/products/${product.id}/image`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` },
                body: formData
            });
        }
        
        closeModal();
        loadProducts();
        loadAdminProducts();
        showToast('Товар добавлен', 'success');
        
        document.getElementById('productName').value = '';
        document.getElementById('productPrice').value = '';
        document.getElementById('productDescription').value = '';
        document.getElementById('productImageFile').value = '';
        document.getElementById('productImagePreview').innerHTML = '';
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }
}

function previewProductImage(input) {
    const preview = document.getElementById('productImagePreview');
    
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function uploadProductImage(productId, input) {
    if (!input.files || !input.files[0]) return;
    
    const formData = new FormData();
    formData.append('image', input.files[0]);
    
    try {
        await fetch(`/api/products/${productId}/image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });
        
        showToast('Изображение загружено', 'success');
        loadProducts();
        loadAdminProducts();
    } catch (error) {
        showToast('Ошибка загрузки', 'error');
    }
}

async function deleteProduct(productId) {
    if (!confirm('Удалить этот товар?')) return;
    
    try {
        await apiRequest(`/products/${productId}`, { method: 'DELETE' });
        loadProducts();
        loadAdminProducts();
        showToast('Товар удалён', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ==================== ADMIN CATEGORIES ====================
async function loadAdminCategories() {
    renderAdminCategories();
}

function renderAdminCategories() {
    const listEl = document.getElementById('adminCategoriesList');
    
    listEl.innerHTML = state.categories.map(cat => `
        <div class="admin-category-card">
            <span class="admin-category-icon">${cat.icon || '📦'}</span>
            <div class="admin-category-info">
                <h4>${cat.name}</h4>
                <p>Slug: ${cat.slug}</p>
            </div>
            <div class="admin-category-actions">
                <button class="btn btn-outline btn-sm" onclick="editCategory('${cat.id}')">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCategory('${cat.id}')">🗑</button>
            </div>
        </div>
    `).join('');
}

async function handleAddCategory(event) {
    event.preventDefault();
    
    const name = document.getElementById('categoryName').value;
    const icon = document.getElementById('categoryIcon').value || '📦';
    const errorEl = document.getElementById('categoryError');
    
    try {
        errorEl.classList.add('hidden');
        await apiRequest('/categories', {
            method: 'POST',
            body: JSON.stringify({ name, icon })
        });
        
        closeModal();
        await loadCategories();
        renderAdminCategories();
        showToast('Категория добавлена', 'success');
        
        document.getElementById('categoryName').value = '';
        document.getElementById('categoryIcon').value = '';
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }
}

function editCategory(categoryId) {
    const category = state.categories.find(c => c.id === categoryId);
    if (!category) return;
    
    document.getElementById('editCategoryId').value = category.id;
    document.getElementById('editCategoryName').value = category.name;
    document.getElementById('editCategoryIcon').value = category.icon || '';
    
    showModal('editCategory');
}

async function handleEditCategory(event) {
    event.preventDefault();
    
    const id = document.getElementById('editCategoryId').value;
    const name = document.getElementById('editCategoryName').value;
    const icon = document.getElementById('editCategoryIcon').value;
    const errorEl = document.getElementById('editCategoryError');
    
    try {
        errorEl.classList.add('hidden');
        await apiRequest(`/categories/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, icon })
        });
        
        closeModal();
        await loadCategories();
        renderAdminCategories();
        showToast('Категория обновлена', 'success');
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }
}

async function deleteCategory(categoryId) {
    if (!confirm('Удалить эту категорию?')) return;
    
    try {
        await apiRequest(`/categories/${categoryId}`, { method: 'DELETE' });
        await loadCategories();
        renderAdminCategories();
        showToast('Категория удалена', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ==================== ADMIN USERS ====================
async function loadAdminUsers(search = '') {
    try {
        const query = search ? `?search=${encodeURIComponent(search)}` : '';
        const users = await apiRequest(`/admin/users${query}`);
        renderAdminUsers(users);
    } catch (error) {
        console.error('Error loading admin users:', error);
    }
}

function searchUsers(query) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadAdminUsers(query);
    }, 300);
}

function renderAdminUsers(users) {
    const listEl = document.getElementById('adminUsersList');
    const canManageRoles = isSuperAdmin();
    
    const getRoleBadge = (role) => {
        switch(role) {
            case 'superadmin': return 'Главный админ';
            case 'admin': return 'Админ';
            default: return 'Пользователь';
        }
    };
    
    listEl.innerHTML = users.map(user => {
        const isCurrentUser = state.user && state.user.id === user.id;
        const isSuperAdminUser = user.role === 'superadmin';
        const isAdminUser = user.role === 'admin';
        
        let actionButtons = '';
        
        if (canManageRoles && !isCurrentUser && !isSuperAdminUser) {
            if (isAdminUser) {
                // Superadmin может снять админа
                actionButtons = `
                    <button class="btn btn-danger btn-sm" onclick="removeAdmin('${user.id}', '${user.name}')">
                        Снять админа
                    </button>
                `;
            } else {
                // Superadmin может назначить админа
                actionButtons = `
                    <button class="btn btn-outline btn-sm" onclick="showMakeAdmin('${user.id}', '${user.name}')">
                        Сделать админом
                    </button>
                `;
            }
        }
        
        return `
            <div class="admin-user-card">
                <div class="admin-user-info">
                    <h4>${user.name} ${isCurrentUser ? '(Вы)' : ''}</h4>
                    <p>${user.email}</p>
                </div>
                <div class="admin-user-actions">
                    <span class="role-badge role-${user.role}">${getRoleBadge(user.role)}</span>
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
}

function showMakeAdmin(userId, userName) {
    document.getElementById('makeAdminUserId').value = userId;
    document.getElementById('makeAdminUserName').textContent = userName;
    document.getElementById('adminCode').value = '';
    showModal('makeAdmin');
}

async function handleMakeAdmin(event) {
    event.preventDefault();
    
    const userId = document.getElementById('makeAdminUserId').value;
    const adminCode = document.getElementById('adminCode').value;
    const errorEl = document.getElementById('makeAdminError');
    
    try {
        errorEl.classList.add('hidden');
        await apiRequest(`/admin/users/${userId}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role: 'admin', adminCode })
        });
        
        closeModal();
        loadAdminUsers();
        showToast('Пользователь назначен администратором', 'success');
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }
}

async function removeAdmin(userId, userName) {
    if (!confirm(`Снять права администратора с пользователя "${userName}"?`)) return;
    
    try {
        await apiRequest(`/admin/users/${userId}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role: 'user' })
        });
        
        loadAdminUsers();
        showToast('Права администратора сняты', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function showAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(btn => {
        const tabName = btn.textContent.toLowerCase();
        btn.classList.toggle('active', 
            (tab === 'stats' && tabName.includes('статистика')) ||
            (tab === 'orders' && tabName.includes('заказы')) ||
            (tab === 'products' && tabName.includes('товары')) ||
            (tab === 'categories' && tabName.includes('категории')) ||
            (tab === 'users' && tabName.includes('пользователи')) ||
            (tab === 'history' && tabName.includes('история'))
        );
    });
    
    document.querySelectorAll('.admin-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const tabMap = {
        'stats': 'adminStats',
        'orders': 'adminOrders',
        'products': 'adminProducts',
        'categories': 'adminCategories',
        'users': 'adminUsers',
        'history': 'adminHistory'
    };
    
    document.getElementById(tabMap[tab]).classList.add('active');
}

// ==================== NAVIGATION ====================
function showPage(page) {
    state.currentPage = page;
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`${page}Page`).classList.add('active');
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });
    
    switch (page) {
        case 'home':
            loadProducts();
            break;
        case 'catalog':
            loadProducts(state.currentCategory);
            break;
        case 'cart':
            renderCart();
            break;
        case 'orders':
            loadOrders();
            break;
        case 'admin':
            loadAdminData();
            break;
    }
    
    window.scrollTo(0, 0);
}

// ==================== MODALS ====================
function showModal(modalName) {
    const overlay = document.getElementById('modalOverlay');
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(m => m.classList.add('hidden'));
    
    overlay.classList.remove('hidden');
    document.getElementById(`${modalName}Modal`).classList.remove('hidden');
    
    if (modalName === 'addProduct') {
        renderProductCategorySelect();
    }
}

function closeModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.form-error').forEach(el => el.classList.add('hidden'));
}

// ==================== TOAST ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function resetStats() {
    if (!confirm('⚠️ Очистить ВСЮ статистику? Это действие необратимо.')) return;

    try {
        const res = await apiRequest('/admin/reset-stats', {
            method: 'POST'
        });

        if (res.success) {
            showToast('Статистика очищена', 'success');
            loadAdminStats();
            loadAdminOrders();
            loadAdminHistory();
        }
    } catch (error) {
        showToast(error.message || 'Ошибка очистки статистики', 'error');
    }
}

// ==================== UTILITIES ====================
function formatDate(dateString) {
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(dateString));
}

function getStatusText(status) {
    const texts = {
        awaiting_payment: 'Ожидает оплаты',
        pending: 'Ожидает',
        paid: 'Оплачен',
        processing: 'В обработке',
        shipping: 'В пути',
        delivered: 'Доставлен',
        done: 'Выполнен',
        cancelled: 'Отменён'
    };
    return texts[status] || status;
}

function getPaymentText(method) {
    const texts = {
        cash: 'Наличными',
        card: 'Картой'
    };
    return texts[method] || method;
}

// ==================== INIT ====================
async function init() {
    loadCurrency();
    await loadSettings();
    await checkAuth();
    await loadCategories();
    await loadProducts();
    loadCart();
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeOrderDetail();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
