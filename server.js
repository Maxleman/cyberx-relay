const http = require('http');
const fs = require('fs');
const path = require('path');

const RELAY_SECRET = process.env.RELAY_SECRET || 'cyberxgreen_relay_2025';
const PORT = process.env.PORT || 3000;
const ORDERS_FILE = path.join(__dirname, 'orders.json');

function readOrders() {
  try {
    if (!fs.existsSync(ORDERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')) || [];
  } catch { return []; }
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

function generateId() {
  return 'relay_' + Math.random().toString(36).substr(2, 10);
}

const server = http.createServer((req, res) => {
  // Парсим URL правильно
  const baseUrl = `http://localhost`;
  const fullUrl = new URL(req.url, baseUrl);
  const action = fullUrl.searchParams.get('action');
  const key = fullUrl.searchParams.get('key');

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const respond = (data, code = 200) => {
    res.writeHead(code);
    res.end(JSON.stringify(data, null, 2));
  };

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let parsed = {};
    try { parsed = body ? JSON.parse(body) : {}; } catch {}

    // Если нет action — отвечаем ping по умолчанию
    if (!action || action === 'ping') {
      return respond({ success: true, message: 'CyberXGreen Relay is alive', time: new Date().toISOString() });
    }

    switch (action) {

      case 'submit_order': {
        if (req.method !== 'POST') return respond({ error: 'POST required' }, 405);
        if (!parsed.items || !parsed.items.length) return respond({ error: 'Invalid order' }, 400);

        const order = {
          id: generateId(),
          table_id: parsed.table_id || 'unknown',
          items: parsed.items,
          total: parsed.total || 0,
          note: parsed.note || '',
          status: 'pending',
          created_at: new Date().toISOString(),
          fetched_at: null,
        };

        const orders = readOrders();
        orders.push(order);
        writeOrders(orders);

        console.log(`[ORDER] ${order.id} от ${order.table_id}, сумма ${order.total} BYN`);
        respond({ success: true, order_id: order.id, message: 'Заказ принят' });
        break;
      }

      case 'fetch_pending': {
        if (key !== RELAY_SECRET) return respond({ error: 'Unauthorized' }, 403);

        const orders = readOrders();
        const pending = orders.filter(o => o.status === 'pending');

        orders.forEach(o => {
          if (o.status === 'pending') {
            o.status = 'fetched';
            o.fetched_at = new Date().toISOString();
          }
        });
        writeOrders(orders);

        console.log(`[FETCH] Отдано ${pending.length} заказов`);
        respond({ success: true, orders: pending });
        break;
      }

      case 'confirm': {
        if (key !== RELAY_SECRET) return respond({ error: 'Unauthorized' }, 403);
        if (req.method !== 'POST') return respond({ error: 'POST required' }, 405);

        const ids = parsed.ids || [];
        const orders = readOrders();
        orders.forEach(o => { if (ids.includes(o.id)) o.status = 'done'; });
        writeOrders(orders);

        console.log(`[CONFIRM] Подтверждено ${ids.length} заказов`);
        respond({ success: true, confirmed: ids.length });
        break;
      }

      case 'status': {
        if (key !== RELAY_SECRET) return respond({ error: 'Unauthorized' }, 403);
        const orders = readOrders();
        respond({
          success: true,
          total: orders.length,
          pending: orders.filter(o => o.status === 'pending').length,
          fetched: orders.filter(o => o.status === 'fetched').length,
          done: orders.filter(o => o.status === 'done').length,
          last_orders: orders.slice(-10).reverse(),
        });
        break;
      }

      default:
        respond({ error: 'Unknown action' }, 404);
    }
  });
});

server.listen(PORT, () => {
  console.log(`CyberXGreen Relay запущен на порту ${PORT}`);
});
