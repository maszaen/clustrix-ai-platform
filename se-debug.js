require('dotenv').config();

async function debugCustomSearch() {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_CX;
  const q   = process.argv[2] || 'cheerio scraping';

  console.log('Environment variables:');
  console.log('GOOGLE_CSE_KEY:', key ? '✓ Set' : '✗ Missing');
  console.log('GOOGLE_CSE_CX:', cx ? '✓ Set' : '✗ Missing');
  console.log('Query:', q);

  if (!key || !cx) {
    console.error('Missing required environment variables');
    return;
  }

  const u = new URL('https://www.googleapis.com/customsearch/v1');
  u.searchParams.set('key', key);
  u.searchParams.set('cx', cx);
  u.searchParams.set('q', q);
  u.searchParams.set('num', '5');

  console.log('Requesting:', u.toString());

  try {
    const res = await fetch(u); 
    const j = await res.json();
    
    if (j.error) {
      console.error('API Error:', j.error);
      return;
    }
    
    console.log('Results:');
    console.log(j.items?.map(i => ({ title: i.title, link: i.link })) || 'No items found');
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

debugCustomSearch().catch(console.error);