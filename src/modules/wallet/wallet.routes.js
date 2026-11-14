const { Router } = require('express');
const service = require('./wallet.service');
const { parseUserId, parseMoneyBody } = require('./wallet.validation');

const router = Router();

router.post('/credit', async (req, res) => {
  const { userId, amount } = parseMoneyBody(req.body);
  const balance = await service.credit(userId, amount);
  res.status(200).json({ user_id: userId, balance });
});

router.post('/debit', async (req, res) => {
  const { userId, amount } = parseMoneyBody(req.body);
  const balance = await service.debit(userId, amount);
  res.status(200).json({ user_id: userId, balance });
});

router.get('/balance/:user_id', async (req, res) => {
  const userId = parseUserId(req.params.user_id);
  const balance = await service.getBalance(userId);
  res.status(200).json({ user_id: userId, balance });
});

module.exports = router;