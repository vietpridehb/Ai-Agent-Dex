const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.json());
app.use(express.static('public', {
  maxAge: 0 // No cache
}));

// Default route to swap.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'swap.html'));
});

// In-memory database (JSON file)
const DB_FILE = 'data.json';

// Wallet configuration
const WALLETS = {
  ethereum: '0xeDABd062f7B9585f7Ef3a9681985f28DF8e2319D',
  bitcoin: 'bc1qyzk3fvn75mtaw7t9w46sdlsnly3hm7wa5sap07'
};

function getDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return {
      agents: [],
      orders: [],
      transactions: [],
      fees_collected: {
        ethereum: 0,
        bitcoin: 0,
        total: 0
      },
      wallet_config: WALLETS
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

// Execute Trade (with dual-wallet fee tracking)
app.post('/api/trades/execute', (req, res) => {
  const { seller_id, buyer_id, pair, amount, price, crypto_type } = req.body;
  if (!seller_id || !buyer_id || !pair || !amount || !price) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const db = getDB();
  const fee = amount * 0.001; // 0.1% fee
  
  // Split fee 50/50 between ETH and BTC wallets
  const ethFee = fee / 2;
  const btcFee = fee / 2;

  const transaction = {
    id: db.transactions.length + 1,
    seller_id,
    buyer_id,
    pair,
    amount,
    price,
    fee,
    fee_split: {
      ethereum: ethFee,
      bitcoin: btcFee
    },
    fee_type: crypto_type,
    status: 'completed',
    created_at: new Date().toISOString()
  };

  db.transactions.push(transaction);
  
  // Update fees collected
  if (!db.fees_collected) {
    db.fees_collected = { ethereum: 0, bitcoin: 0, total: 0 };
  }
  db.fees_collected.ethereum += ethFee;
  db.fees_collected.bitcoin += btcFee;
  db.fees_collected.total += fee;
  
  saveDB(db);
  res.json({
    transaction_id: transaction.id,
    amount,
    fee,
    fee_split: {
      ethereum: { amount: ethFee, wallet: WALLETS.ethereum },
      bitcoin: { amount: btcFee, wallet: WALLETS.bitcoin }
    },
    fee_type: crypto_type,
    total: amount + fee,
    message: 'Trade executed - fees split to dual wallets'
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

// Get Fees Collected & Wallet Config
app.get('/api/fees', (req, res) => {
  const db = getDB();
  res.json({
    fees_collected: db.fees_collected || { ethereum: 0, bitcoin: 0, total: 0 },
    wallets: WALLETS,
    fee_rate: 0.001, // 0.1%
    distribution: {
      ethereum: '50%',
      bitcoin: '50%'
    }
  });
});

// Get Earnings Dashboard
app.get('/api/dashboard/earnings', (req, res) => {
  const db = getDB();
  const feesCollected = db.fees_collected || { ethereum: 0, bitcoin: 0, total: 0 };
  res.json({
    total_fees: feesCollected.total,
    ethereum: {
      amount: feesCollected.ethereum,
      wallet: WALLETS.ethereum,
      percentage: 50
    },
    bitcoin: {
      amount: feesCollected.bitcoin,
      wallet: WALLETS.bitcoin,
      percentage: 50
    },
    wallet_config: WALLETS,
    last_updated: new Date().toISOString()
  });
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

// CoinGecko price mapping
const coinGeckoMap = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'SOL': 'solana',
  'DOGE': 'dogecoin',
  'XRP': 'ripple',
  'LINK': 'chainlink',
  'ADA': 'cardano',
  'AVAX': 'avalanche-2'
};

// Get real-time price from CoinGecko
function getPriceFromCoinGecko(coinId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json[coinId]?.usd || null);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Get price endpoint (real-time)
app.get('/api/price/:token', async (req, res) => {
  const token = req.params.token.toUpperCase();
  const coinId = coinGeckoMap[token];
  
  if (!coinId) {
    return res.status(400).json({ error: 'Token not supported' });
  }
  
  try {
    const price = await getPriceFromCoinGecko(coinId);
    if (price === null) {
      return res.status(404).json({ error: 'Price not found' });
    }
    res.json({
      token,
      price: price,
      currency: 'USD',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

// Price quote endpoint (with real-time prices)
app.get('/api/quote/:from/:to/:amount', async (req, res) => {
  const { from, to, amount } = req.params;
  const amt = parseFloat(amount);
  const fee = amt * 0.001;
  
  try {
    const fromCoinId = coinGeckoMap[from.toUpperCase()];
    const toCoinId = coinGeckoMap[to.toUpperCase()];
    
    if (!fromCoinId || !toCoinId) {
      return res.status(400).json({ error: 'Token not supported' });
    }
    
    const fromPrice = await getPriceFromCoinGecko(fromCoinId);
    const toPrice = await getPriceFromCoinGecko(toCoinId);
    
    if (!fromPrice || !toPrice) {
      return res.status(404).json({ error: 'Price not found' });
    }
    
    const exchangeRate = fromPrice / toPrice;
    const amount_out = (amt - fee) * exchangeRate;
    
    res.json({
      from_token: from,
      to_token: to,
      amount_in: amt,
      fee: fee,
      amount_out: amount_out.toFixed(8),
      exchange_rate: exchangeRate.toFixed(8),
      from_price_usd: fromPrice,
      to_price_usd: toPrice,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate quote' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Open browser: http://localhost:${PORT}`);
});
// Cache bust at Mon Mar 23 07:07:27 UTC 2026
