# Omprela Quotation – Handlebars (load from Node.js)

Handlebars (HBS) templates and CSS for the Oικονομική Προσφορά form. Load and render them from your Node.js app.

## Files to load from your app

- **Views:** `views/oikonomiki-prosfora.hbs`, `views/layouts/main.hbs`, `views/layouts/print.hbs`
- **CSS:** `public/css/oikonomiki-prosfora.css`, `public/css/print.css`

## Load Handlebars in your Node.js app

Install in your project:

```bash
npm install express express-handlebars
```

Register the engine and views directory:

```javascript
const path = require('path');
const express = require('express');
const { create } = require('express-handlebars');

const app = express(); // or your existing app

const hbs = create({
  defaultLayout: 'main',
  extname: '.hbs',
  layoutsDir: path.join(__dirname, 'views', 'layouts'),
  partialsDir: path.join(__dirname, 'views', 'partials'),
});

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
```

Render the quotation page with your data:

```javascript
app.get('/quotation', (req, res) => {
  res.render('oikonomiki-prosfora', {
    company: { website: 'www.omprela.gr', email: 'info@omprela.gr' },
    title: 'Oικονομική Προσφορά',
    date: '01 / 10 / 2025',
    products: [
      { dimensions: '20x20x20', price: '90€', name: '...', description: '...' },
    ],
    contact: {
      phones: ['23214.01146', '23257.70410'],
      from: { name: '...', department: '...', phone: '...' },
      to: { name: '...' },
      orderingMethod: 'Τρόπος Παραγγελίας: www.omprela.gr, info@omprela.gr',
      afm: '127105544',
      doy: 'Δ.Ο.Υ. ΣΕΡΡΩΝ, ΔΑΣΟΧΩΡΙ ΣΕΡΡΩΝ',
    },
  });
});
```

## Template variables

| Variable | Description |
|----------|-------------|
| `company.website`, `company.email` | Header/footer |
| `title`, `date` | Title and date |
| `products[]` | `dimensions`, `price`, `name`, `description` |
| `contact.phones`, `contact.from`, `contact.to`, `contact.orderingMethod`, `contact.afm`, `contact.doy` | Contact block |

## Run the example

```bash
npm install
npm start
```

Open http://localhost:3000 to see the page (only loads the HBS view with sample data).
