const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory database (JSON file)
const DB_FILE = 'data.json';

function getDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return {
      agents: [],
      orders: [],
      transactions: [],
      fees: {
        BTC: 0.1,
        ETH: 0.1,
        USDT: 0.1,
        USDC: 0.1,
        DOGE: 0.1,
        SOL: 0.1,
        XRP: 0.1,
        LINK: 0.1,
        ADA: 0.1,
        AVAX: 0.1
      }
    };
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Initialize DB
if (!fs.existsSync(DB_FILE)) {
  saveDB(getDB());
}

// API Routes

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

// Register Agent
app.post('/api/agents/register', (req, res) => {
  const { address, name, wallet_address } = req.body;
  if (!address || !wallet_address) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = getDB();
  if (db.agents.find(a => a.address === address)) {
    return res.status(400).json({ error: 'Agent already exists' });
  }

  const agent = {
    id: db.agents.length + 1,
    address,
    name: name || 'Agent',
    wallet_address,
    balance: 0,
    created_at: new Date().toISOString()
  };

  db.agents.push(agent);
  saveDB(db);
  res.json({ id: agent.id, message: 'Agent registered' });
});

// Get Agent
app.get('/api/agents/:id', (req, res) => {
  const db = getDB();
  const agent = db.agents.find(a => a.id == req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// Create Order
app.post('/api/orders/create', (req, res) => {
  const { agent_id, pair, order_type, amount, price } = req.body;
  if (!agent_id || !pair || !order_type || !amount || !price) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const db = getDB();
  const order = {
    id: db.orders.length + 1,
    agent_id,
    pair,
    order_type,
    amount,
    price,
    status: 'open',
    created_at: new Date().toISOString()
  };

  db.orders.push(order);
  saveDB(db);
  res.json({ order_id: order.id, message: 'Order created' });
});

// Get Open Orders
app.get('/api/orders/open/:pair', (req, res) => {
  const db = getDB();
  const orders = db.orders.filter(o => o.pair === req.params.pair && o.status === 'open');
  res.json(orders);
});

// Execute Trade
app.post('/api/trades/execute', (req, res) => {
  const { seller_id, buyer_id, pair, amount, price, crypto_type } = req.body;
  if (!seller_id || !buyer_id || !pair || !amount || !price) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const db = getDB();
  const fee = amount * 0.001; // 0.1% fee

  const transaction = {
    id: db.transactions.length + 1,
    seller_id,
    buyer_id,
    pair,
    amount,
    price,
    fee,
    fee_type: crypto_type,
    status: 'completed',
    created_at: new Date().toISOString()
  };

  db.transactions.push(transaction);
  saveDB(db);
  res.json({
    transaction_id: transaction.id,
    amount,
    fee,
    fee_type: crypto_type,
    total: amount + fee,
    message: 'Trade executed'
  });
});

// Get Transactions
app.get('/api/transactions/:agent_id', (req, res) => {
  const db = getDB();
  const txs = db.transactions.filter(
    t => t.seller_id == req.params.agent_id || t.buyer_id == req.params.agent_id
  );
  res.json(txs);
});

// Get Fees
app.get('/api/fees', (req, res) => {
  const db = getDB();
  const fees = Object.keys(db.fees).map(crypto => ({
    crypto_type: crypto,
    fee_percentage: db.fees[crypto]
  }));
  res.json(fees);
});

// Swap endpoint (frontend usage)
app.post('/api/swap', (req, res) => {
  const { from_token, to_token, amount_in, wallet_address } = req.body;
  if (!from_token || !to_token || !amount_in || !wallet_address) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = getDB();
  const fee = amount_in * 0.001; // 0.1% fee
  const amount_out = amount_in - fee;

  const transaction = {
    id: db.transactions.length + 1,
    type: 'swap',
    wallet_address,
    from_token,
    to_token,
    amount_in,
    amount_out,
    fee,
    fee_token: from_token,
    timestamp: new Date().toISOString()
  };

  db.transactions.push(transaction);
  saveDB(db);

  res.json({
    success: true,
    transaction_id: transaction.id,
    from_token,
    to_token,
    amount_in,
    amount_out,
    fee,
    total_received: amount_out,
    message: 'Swap executed successfully'
  });
});

// Price quote endpoint
app.get('/api/quote/:from/:to/:amount', (req, res) => {
  const { from, to, amount } = req.params;
  const amt = parseFloat(amount);
  const fee = amt * 0.001;
  
  res.json({
    from_token: from,
    to_token: to,
    amount_in: amt,
    fee: fee,
    amount_out: amt - fee,
    exchange_rate: `1 ${from} = 1 ${to}`,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Open browser: http://localhost:${PORT}`);
});
