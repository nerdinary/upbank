
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

const UP_API_BASE_URL = 'https://api.up.com.au/api/v1';

// Fetch all pages of a paginated Up API endpoint
async function fetchAllPages(url, token) {
  const results = [];
  let nextUrl = url;
  while (nextUrl) {
    const { data } = await axios.get(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    results.push(...data.data);
    nextUrl = data.links && data.links.next ? data.links.next : null;
  }
  return results;
}

// GET intro page
router.get('/', (req, res) => {
  if (req.session.accessToken) {
    return res.redirect('/dashboard');
  }
  const error = req.query.error === 'session_expired'
    ? 'Your session has expired. Please log in again.'
    : null;
  res.render('intro', { title: 'Unofficial Up Web', error });
});


// POST login
router.post('/login', async (req, res) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.render('intro', { title: 'Unofficial Up Web', error: 'Access token is required' });
  }

  try {
    await axios.get(`${UP_API_BASE_URL}/util/ping`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    req.session.accessToken = accessToken;

    const webhookUrl = process.env.WEBHOOK_URL;
    const isPublicHttps = webhookUrl && (() => {
      try { return new URL(webhookUrl).protocol === 'https:'; } catch { return false; }
    })();

    if (isPublicHttps) {
      try {
        const { data: { data: webhooks } } = await axios.get(`${UP_API_BASE_URL}/webhooks`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        for (const webhook of webhooks) {
          if (webhook.attributes.url === webhookUrl) {
            await axios.delete(`${UP_API_BASE_URL}/webhooks/${webhook.id}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
          }
        }

        const response = await axios.post(`${UP_API_BASE_URL}/webhooks`, {
          data: {
            attributes: {
              url: webhookUrl,
              description: 'Up Web App Webhook'
            }
          }
        }, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        req.session.webhookId = response.data.data.id;
        // secretKey is only returned at creation time — store module-level for HMAC verification
        webhookSecret = response.data.data.attributes.secretKey;
        console.log(`Registered webhook: ${req.session.webhookId}`);
      } catch (webhookError) {
        console.error('Webhook management error:', webhookError.response ? webhookError.response.data : webhookError.message);
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
    const accounts = await fetchAllPages(`${UP_API_BASE_URL}/accounts`, req.session.accessToken);
    res.render('index', { title: 'Dashboard', accounts });
  } catch (error) {
    if (error.response && error.response.status === 401) return res.redirect('/?error=session_expired');
    console.error(error);
    res.render('error', { error: 'Could not fetch accounts' });
  }
});


// GET transactions for a specific account (with optional filters)
router.get('/api/accounts/:id/transactions', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { status, since, until, category, tag, pageSize } = req.query;

  const params = new URLSearchParams();
  params.set('page[size]', pageSize || '50');
  if (status)   params.set('filter[status]', status);
  if (since)    params.set('filter[since]', since);
  if (until)    params.set('filter[until]', until);
  if (category) params.set('filter[category]', category);
  if (tag)      params.set('filter[tag]', tag);

  try {
    const [txResponse, categories] = await Promise.all([
      axios.get(`${UP_API_BASE_URL}/accounts/${id}/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${req.session.accessToken}` },
      }),
      fetchAllPages(`${UP_API_BASE_URL}/categories`, req.session.accessToken),
    ]);

    const categoryMap = {};
    for (const cat of categories) {
      categoryMap[cat.id] = cat.attributes.name;
    }

    res.json({
      transactions: txResponse.data.data,
      nextPage: txResponse.data.links.next || null,
      categoryMap,
    });
  } catch (error) {
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ error: 'session_expired' });
    }
    console.error(error);
    res.status(500).json({ error: 'Could not fetch transactions' });
  }
});


// GET next page of transactions by cursor URL
router.get('/api/transactions/next', isAuthenticated, async (req, res) => {
  const { cursor } = req.query;
  if (!cursor) return res.status(400).json({ error: 'cursor required' });
  try {
    const { data } = await axios.get(cursor, {
      headers: { Authorization: `Bearer ${req.session.accessToken}` },
    });
    res.json({
      transactions: data.data,
      nextPage: data.links.next || null,
    });
  } catch (error) {
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ error: 'session_expired' });
    }
    res.status(500).json({ error: 'Could not fetch transactions' });
  }
});


// GET all tags for the account
router.get('/api/tags', isAuthenticated, async (req, res) => {
  try {
    const tags = await fetchAllPages(`${UP_API_BASE_URL}/tags`, req.session.accessToken);
    res.json({ tags });
  } catch (error) {
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ error: 'session_expired' });
    }
    res.status(500).json({ error: 'Could not fetch tags' });
  }
});


// POST add tags to a transaction
router.post('/api/transactions/:id/tags', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { tags } = req.body; // array of tag label strings
  try {
    await axios.post(
      `${UP_API_BASE_URL}/transactions/${id}/relationships/tags`,
      { data: tags.map(label => ({ type: 'tags', id: label })) },
      { headers: { Authorization: `Bearer ${req.session.accessToken}` } }
    );
    res.sendStatus(204);
  } catch (error) {
    if (error.response && error.response.status === 401) return res.status(401).json({ error: 'session_expired' });
    res.status(500).json({ error: 'Could not add tags' });
  }
});


// DELETE remove tags from a transaction
router.delete('/api/transactions/:id/tags', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { tags } = req.body;
  try {
    await axios.delete(
      `${UP_API_BASE_URL}/transactions/${id}/relationships/tags`,
      {
        data: { data: tags.map(label => ({ type: 'tags', id: label })) },
        headers: { Authorization: `Bearer ${req.session.accessToken}` },
      }
    );
    res.sendStatus(204);
  } catch (error) {
    if (error.response && error.response.status === 401) return res.status(401).json({ error: 'session_expired' });
    res.status(500).json({ error: 'Could not remove tags' });
  }
});


// PATCH update transaction category
router.patch('/api/transactions/:id/category', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { categoryId } = req.body; // null to clear
  try {
    await axios.patch(
      `${UP_API_BASE_URL}/transactions/${id}/relationships/category`,
      { data: categoryId ? { type: 'categories', id: categoryId } : null },
      { headers: { Authorization: `Bearer ${req.session.accessToken}` } }
    );
    res.sendStatus(204);
  } catch (error) {
    if (error.response && error.response.status === 401) return res.status(401).json({ error: 'session_expired' });
    res.status(500).json({ error: 'Could not update category' });
  }
});


// Module-level state: webhook secret (set at registration) and event queue
// These are module-scoped because Up's servers POST to /api/webhooks without a browser session
let webhookSecret = null;
const EVENT_QUEUE_MAX = 20;
const eventQueue = [];

// POST webhook — receives events from Up Banking
router.post('/api/webhooks', (req, res) => {
  // Verify HMAC signature if we have a secret stored.
  // Up signs the raw body with SHA-256 HMAC; signature is in X-Up-Authenticity-Signature.
  // webhookSecret is module-level because this request comes from Up's servers, not a browser.
  if (webhookSecret) {
    const signature = req.headers['x-up-authenticity-signature'];
    if (!signature) {
      console.warn('Webhook received without signature — rejecting');
      return res.sendStatus(401);
    }
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.rawBody)
      .digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.warn('Webhook signature mismatch — rejecting');
      return res.sendStatus(401);
    }
  }

  const { eventType } = req.body.data.attributes;

  // Ignore PING test events; queue everything else
  if (eventType !== 'PING') {
    if (eventQueue.length >= EVENT_QUEUE_MAX) eventQueue.shift();
    eventQueue.push(eventType);
    console.log(`Queued webhook event: ${eventType}`);
  }

  res.sendStatus(200);
});

// GET latest events (drains the queue)
router.get('/api/events', (req, res) => {
  const events = eventQueue.splice(0);
  res.json({ events });
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
