
const express = require('express');
const router = express.Router();
const axios = require('axios');

const UP_API_BASE_URL = 'https://api.up.com.au/api/v1';

// GET intro page
router.get('/', (req, res) => {
  if (req.session.accessToken) {
    return res.redirect('/dashboard');
  }
  res.render('intro', { title: 'Unofficial Up Web' });
});


// POST login
router.post('/login', async (req, res) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.render('intro', { title: 'Unofficial Up Web', error: 'Access token is required' });
  }

  try {
    // Validate the token
    await axios.get(`${UP_API_BASE_URL}/util/ping`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    req.session.accessToken = accessToken;

    // Webhook management (as described in README)
    if (process.env.WEBHOOK_URL) {
      try {
        // 1. Fetch existing webhooks
        const { data: { data: webhooks } } = await axios.get(`${UP_API_BASE_URL}/webhooks`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        // 2. Delete existing webhooks pointing to the same URL
        for (const webhook of webhooks) {
          if (webhook.attributes.url === process.env.WEBHOOK_URL) {
            await axios.delete(`${UP_API_BASE_URL}/webhooks/${webhook.id}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
          }
        }

        // 3. Register new webhook
        const response = await axios.post(`${UP_API_BASE_URL}/webhooks`, {
          data: {
            attributes: {
              url: process.env.WEBHOOK_URL,
              description: 'Up Web App Webhook'
            }
          }
        }, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        req.session.webhookId = response.data.data.id;
        console.log(`Registered webhook: ${req.session.webhookId}`);
      } catch (webhookError) {
        console.error('Webhook management error:', webhookError.response ? webhookError.response.data : webhookError.message);
        // We don't fail the login if webhooks fail, but we log it
      }
    }

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error.response ? error.response.data : error.message);
    res.render('error', { error: 'Invalid access token. Please check and try again.' });
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
