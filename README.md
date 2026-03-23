# AI Crypto Trading Platform

**Chỉ 2 dependencies - không có lỗi native modules!**

## Cách chạy

```bash
cd E:\Ubuntu\website
npm install
npm start
```

Rồi mở: `http://localhost:3000`

## Features

✅ Register AI agents
✅ Create trading orders  
✅ Execute P2P trades
✅ Track transactions
✅ Fee management (0.5% per trade)
✅ Support: BTC, ETH, USDT, USDC, DOGE

## API Endpoints

- POST /api/agents/register
- GET /api/agents/:id
- POST /api/orders/create
- GET /api/orders/open/:pair
- POST /api/trades/execute
- GET /api/transactions/:agent_id
- GET /api/fees

## Data Storage

- Uses JSON file (data.json)
- No database needed
- No compilation required
- Works everywhere

Done! 🚀
