
const express = require('express');
const router = express.Router();
const axios = require('axios');

const UP_API_BASE_URL = 'https://api.up.com.au/api/v1';

// GET intro page
router.get('/', (req, res) => {
  res.render('intro', { title: 'Unofficial Up Web' });
});

// GET login page
router.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

// POST login
router.post('/login', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.render('login', { error: 'API key is required' });
  }

  try {
    // Test the API key
    await axios.get(`${UP_API_BASE_URL}/util/ping`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    req.session.apiKey = apiKey;

    // Delete all existing webhooks
    const { data: { data: webhooks } } = await axios.get(`${UP_API_BASE_URL}/webhooks`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    for (const webhook of webhooks) {
      await axios.delete(`${UP_API_BASE_URL}/webhooks/${webhook.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    }

    // Create a new webhook
    const webhookUrl = process.env.WEBHOOK_URL || 'https://example.com/api/webhooks'; 
    const { data: { data: newWebhook } } = await axios.post(`${UP_API_BASE_URL}/webhooks`, {
      data: {
        attributes: {
          url: webhookUrl,
          description: 'Up Banking Web App',
        },
      },
    }, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    req.session.webhookId = newWebhook.id;
    req.session.webhookSecret = newWebhook.attributes.secretKey;

    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.render('login', { error: 'Invalid API key' });
  }
});


// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.apiKey) {
    return next();
  }
  res.redirect('/');
}

// GET dashboard page
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const { data: { data: accounts } } = await axios.get(`${UP_API_BASE_URL}/accounts`, {
      headers: { Authorization: `Bearer ${req.session.apiKey}` },
    });

    res.render('index', { title: 'Dashboard', accounts });
  } catch (error) {
    console.error(error);
    res.render('error', { error: 'Could not fetch accounts' });
  }
});


// GET transactions for a specific account
router.get('/api/accounts/:id/transactions', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: { data: transactions } } = await axios.get(`${UP_API_BASE_URL}/accounts/${id}/transactions`, {
      headers: { Authorization: `Bearer ${req.session.apiKey}` },
    });

    res.json({ transactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not fetch transactions for the account' });
  }
});




let latestEvent = null;

// POST webhook
router.post('/api/webhooks', (req, res) => {
  const { eventType } = req.body.data.attributes;
  latestEvent = eventType;
  console.log(`New event: ${eventType}`);
  res.sendStatus(200);
});

// GET latest event
router.get('/api/events', (req, res) => {
  res.json({ event: latestEvent });
  latestEvent = null;
});


// GET logout
router.get('/logout', async (req, res) => {
  try {
    if (req.session.webhookId) {
      await axios.delete(`${UP_API_BASE_URL}/webhooks/${req.session.webhookId}`, {
        headers: { Authorization: `Bearer ${req.session.apiKey}` },
      });
    }
  } catch (error) {
    console.error('Error deleting webhook:', error);
  }

  req.session.destroy(err => {
    if (err) {
      return res.redirect('/dashboard');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;
