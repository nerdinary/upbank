
const express = require('express');
const session = require('express-session');
const path = require('path');
const indexRouter = require('./routes/index');

const app = express();

// Session middleware
app.use(session({
  secret: 'your_secret_key', // In a real app, use an environment variable
  resave: false,
  saveUninitialized: true,
}));

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', indexRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`));
