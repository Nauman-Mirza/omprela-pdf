const path = require('path');
const crypto = require('crypto');
const express = require('express');
const puppeteer = require('puppeteer');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { create } = require('express-handlebars');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Proxy /item_images/ via Nginx (port 80) which serves them directly from disk
app.use('/item_images', createProxyMiddleware({ target: 'http://localhost:80', changeOrigin: true }));

const hbs = create({
  defaultLayout: 'main',
  extname: '.hbs',
  layoutsDir: path.join(__dirname, 'views', 'layouts'),
  partialsDir: path.join(__dirname, 'views', 'partials'),
});

const hb = hbs.handlebars;
hb.registerHelper('nl2br', function nl2br(text) {
  if (text == null || text === '') return '';
  const escaped = hb.Utils.escapeExpression(String(text));
  return new hb.SafeString(escaped.replace(/\r\n|\r|\n/g, '<br>'));
});

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ── Static company data ───────────────────────────────────────────────────────
const STATIC = {
  assets: {
    headerIconUrl: '/icons/umbrella.svg',
    asideImageUrl: '/icons/umbrella-product-icon.svg',
  },
  cover: {
    website: 'omprela.gr',
    brand: 'omprela',
  },
  vibe: {
    headingMain: 'Redefining',
    headingItalic: 'the beach',
    headingTail: 'culture',
    paragraph:
      'Οραματιζόμαστε έναν κόσμο όπου οι άνθρωποι ζουν\nουσιαστικά, απολαμβάνοντας τη χαρά της φύσης και\nτου καλοκαιριού σε χώρους που τους εμπνέουν και που\nθέλουν να μοιραστούν.',
    website: 'www.omprela.gr',
    email: 'e-mail: info@omprela.gr',
    phone1: '23214.01146',
    phone2: '23257.70410',
  },
  terms: {
    paymentTitle: 'Τρόπος Εξόφλησης',
    paymentBody:
      '30% προκαταβολή με την ανάθεση της παραγγελίας.\n' +
      'Το υπόλοιπο ποσό εξοφλείται πριν από την παράδοση.',
    notesTitle: 'Ισχύς Προσφοράς',
    notesBody: 'Η προσφορά ισχύει για 20 ημέρες από την ημερομηνία έκδοσής της.',
    returnsTitle: 'Παρατηρήσεις',
    returnsBody:
      'Οι τιμές δεν περιλαμβάνουν ΦΠΑ 24%.\n\n' +
      'Τα μεταφορικά είναι δωρεάν έως Θεσσαλονίκη, εκτός αν αναφέρεται διαφορετικά.\n\n' +
      'Τυχόν αλλαγές σε ποσότητες, διαστάσεις, υλικά ή φινιρίσματα ενδέχεται να επηρεάσουν την τιμή και τον χρόνο παράδοσης.\n\n' +
      'Η παραγγελία οριστικοποιείται μετά από γραπτή επιβεβαίωση και την καταβολή της προκαταβολής.',
    signatureLabel: 'Υπογραφή / Σφραγίδα',
    dateLabel: '',
    website: 'www.omprela.gr',
    email: 'e-mail: info@omprela.gr',
    phone1: '23214.01146',
    phone2: '23257.70410',
  },
  footer: {
    website: 'www.omprela.gr',
    email: 'e-mail: info@omprela.gr',
    phone1: '23214.01146',
    phone2: '23257.70410',
  },
};

const TEMPLATE_MAP = {
  pricelist: {
    view: 'oikonomiki-prosfora-3pages',
    title: 'Τιμοκατάλογος',
    themeClass: 'theme-second',
    isCatalogDesign: true,
  },
  quotation: {
    view: 'oikonomiki-prosfora',
    title: 'Οικονομική Προσφορά',
    themeClass: 'theme-default',
  },
  'quotation-discount': {
    view: 'oikonomiki-prosfora-design3',
    title: 'Οικονομική Προσφορά',
    themeClass: 'theme-default',
  },
};

// ── In-memory session store (Puppeteer reads rendered page from here) ─────────
const sessions = new Map();

// Internal route — Puppeteer navigates here to get the rendered HTML
app.get('/pdf-render/:uuid', (req, res) => {
  const session = sessions.get(req.params.uuid);
  if (!session) return res.status(404).send('Session expired');

  const { type, data } = session;
  const tpl = TEMPLATE_MAP[type] || TEMPLATE_MAP['quotation'];

  res.render(tpl.view, {
    ...STATIC,
    ...tpl,
    cover: {
      ...STATIC.cover,
      date: data.cover?.date || '',
    },
    terms: {
      ...STATIC.terms,
      dateLabel: data.cover?.date ? `Date: ${data.cover.date}` : '',
    },
    sender: data.sender || {},
    recipient: data.recipient || {},
    products: (data.products || []).map(p => ({
      ...p,
      image_src: p.image_src
        ? (p.image_src.startsWith('http')
            ? p.image_src
            : `http://localhost/${p.image_src.replace(/^\//, '')}`)
        : null,
    })),
    discountNote: data.discountNote || null,
  });
});

// ── PDF generation endpoint ───────────────────────────────────────────────────
app.post('/generate-pdf', async (req, res) => {
  const { type, ...data } = req.body;

  if (!type || !TEMPLATE_MAP[type]) {
    return res.status(400).json({ error: 'Invalid template type' });
  }
  if (!data.products || data.products.length === 0) {
    return res.status(400).json({ error: 'No products provided' });
  }

  const uuid = crypto.randomUUID();
  sessions.set(uuid, { type, data });
  setTimeout(() => sessions.delete(uuid), 60000);
  console.log('Products image_src:', data.products?.map(p => p.image_src));

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.CHROME_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });

    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/pdf-render/${uuid}`, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    await page.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, 1500));

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false,
    });

    sessions.delete(uuid);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="quote.pdf"');
    res.end(pdf, 'binary');
  } catch (err) {
    console.error('PDF generation error:', err);
    sessions.delete(uuid);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error generating PDF: ' + err.message });
    }
  } finally {
    if (browser) await browser.close();
  }
});

// ── Preview routes (open in browser to check template designs) ────────────────
const previewProducts = [
  {
    title: 'Ψάθινη Ομπρέλα',
    description: 'Ομπρέλα ΥΠΕΡ-ΒΑΡΕΩΣ ΤΥΠΟΥ. Με διαιρούμενο κεντρικό σωλήνα.',
    details: [
      { dimensions: 'Φ. 2,15', price: '90€', discount: '10%', netPrice: '81€' },
      { dimensions: 'Φ. 2,30', price: '100€' },
    ],
  },
  {
    title: 'Ξαπλώστρα Παραλίας',
    description: 'Ξύλινη ξαπλώστρα από τροπικό ξύλο ευκάλυπτου.',
    details: [{ dimensions: '190x70', price: '120€' }],
  },
];

const previewSender = { name: 'Εμμανουιλήδου Μαρία', department: 'Τμήμα Πωλήσεων', phone: '2321401146' };
const previewRecipient = { name: 'Καραχριστιανοπούλου Μαγδαληνή', order_method: 'www.omprela.gr', vat_info: 'ΑΦΜ: 127105544' };
const previewCover = { ...STATIC.cover, date: '01 / 10 / 2025' };
const previewTerms = { ...STATIC.terms, dateLabel: 'Date: 01 / 10 / 2025' };

app.get('/', (req, res) => {
  res.render('oikonomiki-prosfora', { ...STATIC, ...TEMPLATE_MAP['quotation'], cover: previewCover, terms: previewTerms, sender: previewSender, recipient: previewRecipient, products: previewProducts });
});
app.get('/discount', (req, res) => {
  res.render('oikonomiki-prosfora-design3', { ...STATIC, ...TEMPLATE_MAP['quotation-discount'], cover: previewCover, terms: previewTerms, sender: previewSender, recipient: previewRecipient, products: previewProducts, discountNote: '*Οι αναγραφόμενες τιμές έχουν διαμορφωθεί ειδικά για την παρούσα πρόταση' });
});
app.get('/pricelist', (req, res) => {
  res.render('oikonomiki-prosfora-3pages', { ...STATIC, ...TEMPLATE_MAP['pricelist'], cover: previewCover, terms: previewTerms, products: previewProducts });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`PDF server: http://localhost:${PORT}`);
});
