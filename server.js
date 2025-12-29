if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Feature flag for Supabase-backed products
const USE_SUPABASE_PRODUCTS = true;

console.log('[ENV]', {
  SUPABASE_URL: process.env.SUPABASE_URL ? 'OK' : 'MISSING',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? 'OK' : 'MISSING'
});
console.log('SUPABASE_URL VALUE =', process.env.SUPABASE_URL);
const { initTelegramBot, sendOrderToTelegram } = require('./telegram');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/admin/reset-stats', authMiddleware, superAdminMiddleware, (req, res) => {
    const db = readDB();

    db.orders = [];
    db.ordersHistory = [];

    writeDB(db);

    res.json({ success: true });
});

app.get('/api/test-supabase', async (req, res) => {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .limit(5);

    if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ ok: false, error });
    }

    res.json({
        ok: true,
        count: data.length,
        data
    });
});

// SSE clients
const sseClients = new Map();

// ==================== DATABASE ====================
function readDB() {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {
            users: [],
            categories: [],
            products: [],
            orders: [],
            ordersHistory: [],
            sessions: [],
            settings: {
                adminCode: 'amezybeauty2025',
                paymentCard: {
                    number: '4355 0539 2618 2967',
                    holder: 'SERYOZHA SIMONYAN',
                    instruction: 'Переведите точную сумму заказа на карту'
                },
                currencies: {
                    AMD: { symbol: '֏', rate: 1 },
                    RUB: { symbol: '₽', rate: 0.23 },
                    USD: { symbol: '$', rate: 0.0026 }
                }
            }
        };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function initDB() {
    let db = readDB();
    let needsSave = false;
    
    // Инициализация структуры
    if (!db.users) { db.users = []; needsSave = true; }
    if (!db.categories) { db.categories = []; needsSave = true; }
    if (!db.products) { db.products = []; needsSave = true; }
    if (!db.orders) { db.orders = []; needsSave = true; }
    if (!db.ordersHistory) { db.ordersHistory = []; needsSave = true; }
    if (!db.sessions) { db.sessions = []; needsSave = true; }
    if (!db.settings) {
        db.settings = {
            adminCode: 'amezybeauty2025',
            paymentCard: {
                number: '4355 0539 2618 2967',
                holder: 'AMEZY BEAUTY',
                instruction: 'Переведите точную сумму заказа на карту'
            },
            currencies: {
                AMD: { symbol: '֏', rate: 1 },
                RUB: { symbol: '₽', rate: 0.23 },
                USD: { symbol: '$', rate: 0.0026 }
            }
        };
        needsSave = true;
    }
    
    // Создаём админа по умолчанию
    if (!db.users.find(u => u.role === 'admin')) {
        db.users.push({
            id: uuidv4(),
            name: 'Admin',
            email: 'amezybeauty@gmail.com',
            password: 'amezybeauty2025',
            role: 'admin',
            createdAt: new Date().toISOString()
        });
        needsSave = true;
    }
    
    // Создаём категории по умолчанию
    if (db.categories.length === 0) {
        db.categories = [
            { id: uuidv4(), name: 'Уход за лицом', slug: 'face', icon: '✨' },
            { id: uuidv4(), name: 'Уход за телом', slug: 'body', icon: '🧴' },
            { id: uuidv4(), name: 'Уход за ногами', slug: 'feet', icon: '🦶' }
        ];
        needsSave = true;
    }
    
    // Создаём товары по умолчанию
    if (db.products.length === 0) {
        const faceCategory = db.categories.find(c => c.slug === 'face');
        const bodyCategory = db.categories.find(c => c.slug === 'body');
        const feetCategory = db.categories.find(c => c.slug === 'feet');
        
        db.products = [
            { id: uuidv4(), name: 'Увлажняющий крем для лица', price: 15000, categoryId: faceCategory?.id, description: 'Глубокое увлажнение на 24 часа', image: null },
            { id: uuidv4(), name: 'Сыворотка с витамином C', price: 25000, categoryId: faceCategory?.id, description: 'Осветляет и выравнивает тон кожи', image: null },
            { id: uuidv4(), name: 'Маска для лица', price: 8000, categoryId: faceCategory?.id, description: 'Питательная маска с коллагеном', image: null },
            { id: uuidv4(), name: 'Лосьон для тела', price: 12000, categoryId: bodyCategory?.id, description: 'Нежный уход за кожей тела', image: null },
            { id: uuidv4(), name: 'Скраб для тела', price: 10000, categoryId: bodyCategory?.id, description: 'Отшелушивающий скраб с морской солью', image: null },
            { id: uuidv4(), name: 'Масло для тела', price: 18000, categoryId: bodyCategory?.id, description: 'Питательное масло с витамином E', image: null },
            { id: uuidv4(), name: 'Крем для ног', price: 7000, categoryId: feetCategory?.id, description: 'Смягчающий крем для стоп', image: null },
            { id: uuidv4(), name: 'Скраб для ног', price: 6000, categoryId: feetCategory?.id, description: 'Отшелушивающий скраб для пяток', image: null }
        ];
        needsSave = true;
    }
    
    if (needsSave) {
        writeDB(db);
    }
    
    return db;
}

// ==================== AUTH MIDDLEWARE ====================
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    const token = authHeader.split(' ')[1];
    const db = readDB();
    const session = db.sessions.find(s => s.token === token);
    
    if (res.status === 401) {
    localStorage.removeItem('amezy_token');
    state.token = null;
    updateAuthUI();
    showToast('Сессия устарела, войдите снова', 'error');
    return;
}
    
    const user = db.users.find(u => u.id === session.userId);
    
    if (!user) {
        return res.status(401).json({ error: 'Пользователь не найден' });
    }
    
    req.user = user;
    req.token = token;
    next();
}

function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
}

function superAdminMiddleware(req, res, next) {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Только главный администратор может выполнить это действие' });
    }
    next();
}

// ==================== SSE ====================
function sendSSE(userId, event, data) {
    const client = sseClients.get(userId);
    if (client) {
        client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
}

function broadcastSSE(event, data, excludeUserId = null) {
    sseClients.forEach((client, userId) => {
        if (userId !== excludeUserId) {
            client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
    });
}

function broadcastToAdmins(event, data) {
    const db = readDB();
    db.users.filter(u => u.role === 'admin' || u.role === 'superadmin').forEach(admin => {
        sendSSE(admin.id, event, data);
    });
}

app.get('/api/sse', authMiddleware, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    sseClients.set(req.user.id, res);
    
    res.write('event: connected\ndata: {}\n\n');
    
    req.on('close', () => {
        sseClients.delete(req.user.id);
    });
});



// ==================== AUTH ROUTES ====================
app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }
    
    const db = readDB();
    
    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }
    
    const user = {
        id: uuidv4(),
        name,
        email,
        password,
        role: 'user',
        createdAt: new Date().toISOString()
    };
    
    const token = uuidv4();
    const session = {
        token,
        userId: user.id,
        createdAt: new Date().toISOString()
    };
    
    db.users.push(user);
    db.sessions.push(session);
    writeDB(db);
    
    res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    const db = readDB();
    const user = db.users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    
    const token = uuidv4();
    const session = {
        token,
        userId: user.id,
        createdAt: new Date().toISOString()
    };
    
    db.sessions.push(session);
    writeDB(db);
    
    res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({
        user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role }
    });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
    const db = readDB();
    db.sessions = db.sessions.filter(s => s.token !== req.token);
    writeDB(db);
    res.json({ success: true });
});

// ==================== SETTINGS ====================
app.get('/api/settings', (req, res) => {
    const db = readDB();
    res.json(db.settings || {});
});

// ==================== CATEGORIES ====================
app.get('/api/categories', (req, res) => {
    const db = readDB();
    res.json(db.categories);
});

app.post('/api/categories', authMiddleware, adminMiddleware, (req, res) => {
    const { name, icon } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Укажите название категории' });
    }
    
    const db = readDB();
    
    const slug = name.toLowerCase()
        .replace(/[а-яё]/g, char => {
            const map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
            return map[char] || char;
        })
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    
    const category = {
        id: uuidv4(),
        name,
        slug,
        icon: icon || '📦'
    };
    
    db.categories.push(category);
    writeDB(db);
    
    res.json(category);
});

app.put('/api/categories/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { name, icon } = req.body;
    
    const db = readDB();
    const category = db.categories.find(c => c.id === id);
    
    if (!category) {
        return res.status(404).json({ error: 'Категория не найдена' });
    }
    
    if (name) category.name = name;
    if (icon) category.icon = icon;
    
    writeDB(db);
    res.json(category);
});

app.delete('/api/categories/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const db = readDB();
    
    const index = db.categories.findIndex(c => c.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Категория не найдена' });
    }
    
    db.categories.splice(index, 1);
    writeDB(db);
    
    res.json({ success: true });
});

// ==================== PRODUCTS ====================
app.get('/api/products', async (req, res) => {
    const { categoryId } = req.query;

    if (!USE_SUPABASE_PRODUCTS) {
        const db = readDB();
        let products = db.products;
        if (categoryId && categoryId !== 'all') {
            products = products.filter(p => p.categoryId === categoryId);
        }
        return res.json(products);
    }

    let query = supabase.from('products').select('*');

    if (categoryId && categoryId !== 'all') {
        query = query.eq('category', categoryId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Supabase products error:', error);
        return res.status(500).json({ error: 'Failed to load products' });
    }

    res.json(data);
});

app.post('/api/products', authMiddleware, adminMiddleware, async (req, res) => {
    const { name, price, categoryId, description } = req.body;

    if (!name || !price || !categoryId) {
        return res.status(400).json({ error: 'Заполните обязательные поля' });
    }

    const product = {
        id: uuidv4(),
        name,
        category: categoryId,
        price: Number(price),
        sizes: [],
        colors: [],
        svg: null,
        created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('products').insert([product]);

    if (error) {
        console.error('Supabase insert error:', error);
        return res.status(500).json({ error: 'Не удалось сохранить товар' });
    }

    res.json(product);
});

app.delete('/api/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const db = readDB();
    
    const index = db.products.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Товар не найден' });
    }
    
    db.products.splice(index, 1);
    writeDB(db);
    
    res.json({ success: true });
});


// === Multer memory storage for Supabase upload ===
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// === Supabase Storage Image Upload Helper ===
async function uploadImageToSupabase(fileBuffer, fileName, mimeType) {
    const filePath = `products/${Date.now()}_${fileName}`;

    const { error } = await supabase.storage
        .from('products')
        .upload(filePath, fileBuffer, {
            contentType: mimeType,
            upsert: true
        });

    if (error) throw error;

    const { data } = supabase.storage
        .from('products')
        .getPublicUrl(filePath);

    return data.publicUrl;
}

// === Supabase Storage image upload route ===
app.post('/api/products/:id/image', authMiddleware, adminMiddleware, upload.single('image'), async (req, res) => {
    const { id } = req.params;

    if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
    }

    try {
        const imageUrl = await uploadImageToSupabase(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype
        );

        const { error } = await supabase
            .from('products')
            .update({ image: imageUrl })
            .eq('id', id);

        if (error) {
            console.error('Supabase DB update error:', error);
            return res.status(500).json({ error: 'Не удалось сохранить ссылку изображения' });
        }

        res.json({
            success: true,
            image: imageUrl
        });
    } catch (e) {
        console.error('Supabase Storage upload error:', e);
        res.status(500).json({ error: 'Ошибка загрузки изображения' });
    }
});

// ==================== ORDERS ====================
function generateOrderNumber() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `AB${year}${month}${day}-${random}`;
}

app.get('/api/orders', authMiddleware, (req, res) => {
    const db = readDB();
    
    let orders = db.orders.filter(o => o.userId === req.user.id);
    
    // Добавляем информацию о товарах
    orders = orders.map(order => ({
        ...order,
        items: order.items.map(item => {
            const product = db.products.find(p => p.id === item.productId);
            return {
                ...item,
                name: product?.name || 'Товар удалён',
                price: item.price,
                total: item.price * item.quantity
            };
        })
    }));
    
    res.json(orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get('/api/orders/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const db = readDB();
    
    const order = db.orders.find(o => o.id === id);
    
    if (!order) {
        return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    // Проверяем доступ
    if (
    order.userId !== req.user.id &&
    req.user.role !== 'admin' &&
    req.user.role !== 'superadmin'
) {
    return res.status(403).json({ error: 'Доступ запрещён' });
}
    
    // Добавляем информацию о товарах
    const orderWithDetails = {
        ...order,
        items: order.items.map(item => {
            const product = db.products.find(p => p.id === item.productId);
            return {
                ...item,
                name: product?.name || 'Товар удалён',
                price: item.price,
                total: item.price * item.quantity
            };
        })
    };
    
    res.json(orderWithDetails);
});

app.post('/api/orders', authMiddleware, (req, res) => {
    const { items, paymentMethod, address, mapCoordinates, mapAddress, currency } = req.body;
    
    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Корзина пуста' });
    }
    
    if (!address) {
        return res.status(400).json({ error: 'Укажите адрес доставки' });
    }
    
    const db = readDB();
    
    // Рассчитываем сумму
    let total = 0;
    const orderItems = items.map(item => {
        const product = db.products.find(p => p.id === item.productId);
        if (!product) {
            throw new Error('Товар не найден');
        }
        total += product.price * item.quantity;
        return {
            productId: item.productId,
            name: product.name,        // 👈 ВАЖНО
            quantity: item.quantity,
            price: product.price
        };
    });
    
    const order = {
        id: uuidv4(),
        orderNumber: generateOrderNumber(),
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        items: orderItems,
        total,
        paymentMethod,
        status: paymentMethod === 'card' ? 'awaiting_payment' : 'pending',
        address,
        mapCoordinates: mapCoordinates || null,
        mapAddress: mapAddress || null,
        currency: currency || 'AMD',
        statusHistory: [{
            status: paymentMethod === 'card' ? 'awaiting_payment' : 'pending',
            timestamp: new Date().toISOString(),
            comment: 'Заказ создан'
        }],
        createdAt: new Date().toISOString()
    };
    
    db.orders.push(order);
    writeDB(db);
    sendOrderToTelegram(order);
    
    // Уведомляем админов только если оплата наличными
    if (paymentMethod === 'cash') {
        broadcastToAdmins('new_order', order);
    }
    
    res.json(order);
});

app.post('/api/orders/:id/confirm-payment', authMiddleware, (req, res) => {
    const { id } = req.params;
    const db = readDB();
    
    const order = db.orders.find(o => o.id === id);
    
    if (!order) {
        return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    if (order.userId !== req.user.id) {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    
    if (order.status !== 'awaiting_payment') {
        return res.status(400).json({ error: 'Заказ уже обработан' });
    }
    
    order.status = 'pending';
    order.paymentConfirmedAt = new Date().toISOString();
    order.statusHistory.push({
        status: 'pending',
        timestamp: new Date().toISOString(),
        comment: 'Оплата подтверждена пользователем'
    });
    
    writeDB(db);
    
    // Уведомляем админов
    broadcastToAdmins('payment_confirmed', order);
    
    res.json(order);
});

// ==================== ADMIN ====================
app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
    const db = readDB();
    
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Считаем только оплаченные/выполненные заказы
    const paidStatuses = [
  'pending',
  'processing',
  'shipping',
  'delivered'
];
    
    const allOrders = [...db.orders, ...db.ordersHistory];
    const paidOrders = allOrders.filter(o => paidStatuses.includes(o.status) || o.paymentMethod === 'cash');
    
    const totalToday = paidOrders
        .filter(o => new Date(o.createdAt) >= startOfDay)
        .reduce((sum, o) => sum + o.total, 0);
    
    const totalMonth = paidOrders
        .filter(o => new Date(o.createdAt) >= startOfMonth)
        .reduce((sum, o) => sum + o.total, 0);
    
    const totalAll = paidOrders.reduce((sum, o) => sum + o.total, 0);
    
    // Подсчёт по статусам
    const statusCounts = {};
    db.orders.forEach(o => {
        statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });
    
    res.json({
        totalToday,
        totalMonth,
        totalAll,
        ordersCount: db.orders.length,
        statusCounts
    });
});

app.get('/api/admin/orders', authMiddleware, adminMiddleware, (req, res) => {
// Получение одного заказа для админа
app.get('/api/admin/orders/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const db = readDB();

    const order = db.orders.find(o => o.id === id);
    if (!order) {
        return res.status(404).json({ error: 'Заказ не найден' });
    }

    const orderWithDetails = {
        ...order,
        items: order.items.map(item => {
            const product = db.products.find(p => p.id === item.productId);
            return {
                ...item,
                name: product?.name || 'Товар удалён',
                price: item.price,
                total: item.price * item.quantity
            };
        })
    };

    res.json(orderWithDetails);
});
    const { status } = req.query;
    const db = readDB();
    
    let orders = db.orders;
    
    if (status && status !== 'all') {
        orders = orders.filter(o => o.status === status);
    }
    
    // Добавляем информацию о товарах
    orders = orders.map(order => ({
        ...order,
        items: order.items.map(item => {
            const product = db.products.find(p => p.id === item.productId);
            return {
                ...item,
                name: product?.name || 'Товар удалён',
                price: item.price,
                total: item.price * item.quantity
            };
        })
    }));
    
    res.json(orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.put('/api/admin/orders/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { status, comment } = req.body;
    
    const db = readDB();
    const order = db.orders.find(o => o.id === id);
    
    if (!order) {
        return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    const oldStatus = order.status;
    order.status = status;
    order.statusHistory.push({
        status,
        timestamp: new Date().toISOString(),
        comment: comment || `Статус изменён с ${oldStatus} на ${status}`
    });
    
    writeDB(db);
    
    // Уведомляем пользователя
    sendSSE(order.userId, 'order_updated', order);

    // 🔔 Telegram: статус изменён
    const { sendOrderStatusUpdate } = require('./telegram');
    sendOrderStatusUpdate(order);

    res.json(order);
});

app.delete('/api/admin/orders/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const db = readDB();
    
    const index = db.orders.findIndex(o => o.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    const order = db.orders[index];
    
    // Перемещаем в историю
    db.ordersHistory.push({
        ...order,
        deletedAt: new Date().toISOString()
    });
    
    db.orders.splice(index, 1);
    writeDB(db);
    
    res.json({ success: true });
});

app.get('/api/admin/orders-history', authMiddleware, adminMiddleware, (req, res) => {
    const db = readDB();
    res.json(db.ordersHistory.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)));
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    const { search } = req.query;
    const db = readDB();
    
    let users = db.users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt
    }));
    
    if (search) {
        const searchLower = search.toLowerCase();
        users = users.filter(u => 
            u.name.toLowerCase().includes(searchLower) ||
            u.email.toLowerCase().includes(searchLower)
        );
    }
    
    res.json(users);
});

app.put('/api/admin/users/:id/role', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { role, adminCode } = req.body;
    
    const db = readDB();
    
    const user = db.users.find(u => u.id === id);
    
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Нельзя изменить роль superadmin
    if (user.role === 'superadmin') {
        return res.status(403).json({ error: 'Нельзя изменить роль главного администратора' });
    }
    
    // Только superadmin может назначать/снимать админов
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Только главный администратор может управлять ролями' });
    }
    
    // Проверяем код администратора при назначении админа
    if (role === 'admin' && adminCode !== db.settings.adminCode) {
        return res.status(403).json({ error: 'Неверный код администратора' });
    }
    
    // Нельзя назначить superadmin через UI
    if (role === 'superadmin') {
        return res.status(403).json({ error: 'Нельзя назначить главного администратора' });
    }
    
    user.role = role;
    writeDB(db);
    
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});



// ==================== START SERVER ====================
initDB();

app.listen(PORT, () => {
    console.log(`🌸 Amezy Beauty server running at http://localhost:${PORT}`);

    initTelegramBot({
        token: '8589034965:AAHEqv9chJMnYu62OrGxODhupQhCUxA12Vo',
        chatId: '-1003567859536'
    });
});
