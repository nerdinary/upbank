
const express = require('express');
const router = express.Router();
const axios = require('axios');

const UP_API_BASE_URL = 'https://api.up.com.au/api/v1';

// GET intro page
router.get('/', (req, res) => {
  res.render('intro', { title: 'Unofficial Up Web' });
});


// GET oauth callback
router.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const response = await axios.post('https://api.up.com.au/oauth/token', {
      grant_type: 'authorization_code',
      client_id: process.env.UP_CLIENT_ID, // IMPORTANT: Set these in your environment
      client_secret: process.env.UP_CLIENT_SECRET, // IMPORTANT: Set these in your environment
      redirect_uri: process.env.UP_REDIRECT_URI, // IMPORTANT: Set these in your environment
      code,
    });

    req.session.accessToken = response.data.access_token;
    req.session.refreshToken = response.data.refresh_token;

    res.redirect('/dashboard');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.render('error', { error: 'Could not exchange authorization code for token' });
  }
});


// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.accessToken) {
    return next();
  }
  res.redirect('/');
}

// GET dashboard page
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const { data: { data: accounts } } = await axios.get(`${UP_API_BASE_URL}/accounts`, {
      headers: { Authorization: `Bearer ${req.session.accessToken}` },
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
    const [transactionsResponse, categoriesResponse] = await Promise.all([
      axios.get(`${UP_API_BASE_URL}/accounts/${id}/transactions`, {
        headers: { Authorization: `Bearer ${req.session.accessToken}` },
      }),
      axios.get(`${UP_API_BASE_URL}/categories`, {
        headers: { Authorization: `Bearer ${req.session.accessToken}` },
      }),
    ]);

    res.json({ transactions: transactionsResponse.data.data, categories: categoriesResponse.data.data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not fetch transactions or categories for the account' });
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
        headers: { Authorization: `Bearer ${req.session.accessToken}` },
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
