const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.json());

// Cache för att lagra scrapade nyheter
let cachedArticles = [];
let lastUpdateTime = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minuter

// Scrape SVT Nyheter
async function scrapeSVT() {
  try {
    console.log('Scraping SVT...');
    const response = await fetch('https://www.svt.se/nyheter');
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const articles = [];
    
    // Hämta alla artikelkort från SVT
    $('article, [data-article], .teaser, .article-card').each((i, elem) => {
      const $elem = $(elem);
      
      // Hämta titel
      const title = $elem.find('h2, h3, a, .title, [class*="title"]').first().text().trim();
      
      // Hämta beskrivning
      const description = $elem.find('p, .description, .summary, [class*="summary"]').first().text().trim();
      
      // Hämta länk
      const link = $elem.find('a').first().attr('href');
      
      // Hämta bild
      const image = $elem.find('img').first().attr('src') || $elem.find('img').first().attr('data-src');
      
      // Filtrera på politik
      const text = (title + ' ' + description).toLowerCase();
      if (text.includes('politik') || text.includes('regering') || text.includes('riksdag') || 
          text.includes('val') || text.includes('parti') || text.includes('minister')) {
        
        if (title && (link || description)) {
          articles.push({
            title: title,
            description: description,
            link: link ? (link.startsWith('http') ? link : 'https://www.svt.se' + link) : '',
            source: 'SVT Nyheter',
            image: image ? (image.startsWith('http') ? image : 'https://www.svt.se' + image) : null,
            pubDate: new Date().toISOString(),
            category: 'Politik'
          });
        }
      }
    });
    
    console.log(`SVT: Hittade ${articles.length} politikartiklar`);
    return articles;
  } catch (error) {
    console.error('Fel vid scraping av SVT:', error.message);
    return [];
  }
}

// Scrape SR Nyheter
async function scrapeSR() {
  try {
    console.log('Scraping SR...');
    const response = await fetch('https://www.sr.se/');
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const articles = [];
    
    // Hämta alla artikelkort från SR
    $('article, [data-article], .teaser, .article-card, [class*="article"]').each((i, elem) => {
      const $elem = $(elem);
      
      // Hämta titel
      const title = $elem.find('h2, h3, a, .title, [class*="title"]').first().text().trim();
      
      // Hämta beskrivning
      const description = $elem.find('p, .description, .summary, [class*="summary"]').first().text().trim();
      
      // Hämta länk
      const link = $elem.find('a').first().attr('href');
      
      // Hämta bild
      const image = $elem.find('img').first().attr('src') || $elem.find('img').first().attr('data-src');
      
      // Filtrera på politik
      const text = (title + ' ' + description).toLowerCase();
      if (text.includes('politik') || text.includes('regering') || text.includes('riksdag') || 
          text.includes('val') || text.includes('parti') || text.includes('minister')) {
        
        if (title && (link || description)) {
          articles.push({
            title: title,
            description: description,
            link: link ? (link.startsWith('http') ? link : 'https://www.sr.se' + link) : '',
            source: 'SR Nyheter',
            image: image ? (image.startsWith('http') ? image : 'https://www.sr.se' + image) : null,
            pubDate: new Date().toISOString(),
            category: 'Politik'
          });
        }
      }
    });
    
    console.log(`SR: Hittade ${articles.length} politikartiklar`);
    return articles;
  } catch (error) {
    console.error('Fel vid scraping av SR:', error.message);
    return [];
  }
}

// Uppdatera nyheter från båda källorna
async function updateArticles() {
  try {
    console.log('Uppdaterar nyheter...');
    
    const [svtArticles, srArticles] = await Promise.all([
      scrapeSVT(),
      scrapeSR()
    ]);
    
    // Slå ihop och dedupliceera
    let allArticles = [...svtArticles, ...srArticles];
    
    // Ta bort duplikater baserat på titel
    const seen = new Set();
    allArticles = allArticles.filter(article => {
      if (seen.has(article.title)) {
        return false;
      }
      seen.add(article.title);
      return true;
    });
    
    // Sortera efter datum (nyaste först)
    allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    
    // Begränsa till 50 artiklar
    cachedArticles = allArticles.slice(0, 50);
    lastUpdateTime = Date.now();
    
    console.log(`Uppdaterat! ${cachedArticles.length} artiklar i cache`);
  } catch (error) {
    console.error('Fel vid uppdatering:', error.message);
  }
}

// Uppdatera nyheter var 30:e minut
setInterval(updateArticles, 30 * 60 * 1000);

// Uppdatera direkt vid start
updateArticles();

// Huvudsida
app.get('/', (req, res) => {
  res.send(`
    <h1>Svenska Politiknyheter Server (Scraping)</h1>
    <p>Servern körs!</p>
    <p>API endpoints:</p>
    <ul>
      <li><a href="/api/news">/api/news</a> - Hämta politiknyheter</li>
      <li><a href="/api/status">/api/status</a> - Server status</li>
    </ul>
    <p>Uppdateras automatiskt var 30:e minut</p>
  `);
});

// Hämta nyheter
app.get('/api/news', (req, res) => {
  res.json({
    success: true,
    count: cachedArticles.length,
    lastUpdate: new Date(lastUpdateTime).toISOString(),
    articles: cachedArticles
  });
});

// Server status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    articleCount: cachedArticles.length,
    lastUpdate: new Date(lastUpdateTime).toISOString(),
    nextUpdate: new Date(lastUpdateTime + 30 * 60 * 1000).toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server körs på port ${PORT}`);
});
