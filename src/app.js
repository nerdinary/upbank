
const express = require('express');
const session = require('express-session');
const path = require('path');
const indexRouter = require('./routes/index');

const app = express();

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 10 * 60 * 1000 }, // 10 minutes
}));

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', indexRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`));
