// app.js
// Fetch logic + caching. Minimal dependencies. Uses node global fetch (Node 18+/20+).

const NEWS_URLS = {
  // ACESPHERE main (general market) and derivative
  general:
    "https://responsiveweb.acesphereonline.com/AjaxPages/AjaxNewsUpdates.aspx",
  derivative:
    "https://responsiveweb.acesphereonline.com/AjaxPages/AjaxNewsUpdates.aspx?SecID=4&SubSecID=47&pageNo=1&PageSize=50",
};

// Fallback general news source (HTML) if ACESPHERE fails
const NIRMALBANG_GENERAL =
  "https://www.nirmalbang.com/news/stock-market-corporate-news.aspx";

// simple in-memory cache
let cached = {
  derivative: [],
  general: [],
  lastUpdated: null,
};

// utility to format date to DD-MM-YYYY HH:MM (24h)
function formatDateToDDMMYYYY_HHMM(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const day = pad(dt.getDate());
  const month = pad(dt.getMonth() + 1);
  const year = dt.getFullYear();
  const hours = pad(dt.getHours());
  const mins = pad(dt.getMinutes());
  return `${day}-${month}-${year} ${hours}:${mins}`;
}

// try fetch JSON from ACESPHERE with AJAX headers
async function fetchAcesphere(url) {
  const options = {
    method: "GET",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0)",
      Accept: "application/json, text/plain, */*",
      Referer: "https://responsiveweb.acesphereonline.com/",
    },
  };

  const resp = await fetch(url, options);
  const text = await resp.text();

  // if returned HTML, treat as failure
  if (text.trim().startsWith("<")) {
    throw new Error("ACESPHERE returned HTML");
  }

  // parse JSON
  const data = JSON.parse(text);
  return data;
}

// fallback: fetch Nirmalbang and parse headlines (simple HTML parse)
async function fetchNirmalbangHeadlines() {
  try {
    const resp = await fetch(NIRMALBANG_GENERAL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    const html = await resp.text();

    // crude but effective parsing: find <a> inside the main listing
    // This may need tweaks if site structure changes. We'll extract first few
    const matches = [...html.matchAll(/<a[^>]*href=["'][^"']*["'][^>]*>(.*?)<\/a>/gi)];
    const headlines = [];
    for (const m of matches) {
      const text = m[1].replace(/<[^>]+>/g, "").trim();
      if (text && text.length > 5) {
        headlines.push({ headline: text, date: null });
      }
      if (headlines.length >= 10) break;
    }
    return headlines;
  } catch (e) {
    console.warn("Nirmalbang fetch failed:", e.message);
    return [];
  }
}

// Normalize different ACESPHERE JSON shapes into { headline, date }
function parseAcesphereList(obj) {
  // try several possible properties used on different responses
  const list = obj?.NewsList || obj?.ListNewsBean || obj?.newsList || obj?.Data || obj?.News || obj;
  if (!Array.isArray(list)) return [];

  const out = list.map((item) => {
    // possible date fields: DateTime, Date, NewsDate, CreatedOn, TimeStamp, NewsDateTime
    const dateVal =
      item.DateTime || item.Date || item.TimeStamp || item.NewsDate || item.CreatedOn || item.NewsDateTime || null;
    // possible headline fields: Title, Headline, NewsHeading, Heading
    const headline =
      item.Title || item.Headline || item.NewsHeading || item.Heading || item.NewsTitle || item.NewsDesc || "";

    return {
      headline: String(headline).trim(),
      dateRaw: dateVal,
      date: formatDateToDDMMYYYY_HHMM(dateVal),
    };
  });

  // filter empties
  return out.filter((x) => x.headline && x.headline.length > 0);
}

// Attempt to fetch derivative and general news from ACESPHERE. If general fails, fallback to Nirmalbang.
async function refreshNewsNow() {
  try {
    // derivative
    let derivativeItems = [];
    try {
      const derJson = await fetchAcesphere(NEWS_URLS.derivative);
      derivativeItems = parseAcesphereList(derJson);
    } catch (e) {
      console.warn("Derivative fetch failed:", e.message);
      derivativeItems = [];
    }

    // general (try acesphere first)
    let generalItems = [];
    try {
      const genJson = await fetchAcesphere(NEWS_URLS.general);
      generalItems = parseAcesphereList(genJson);
    } catch (e) {
      console.warn("Acesphere general fetch failed, falling back to NirmalBang:", e.message);
      // fallback: parse site for headlines
      const nb = await fetchNirmalbangHeadlines();
      generalItems = nb.map((n) => ({
        headline: n.headline,
        dateRaw: n.date || null,
        date: n.date ? formatDateToDDMMYYYY_HHMM(n.date) : "",
      }));
    }

    // Keep only required counts and order (latest first)
    // We assume ACESPHERE items are already newest-first; otherwise sort by dateRaw descending when available.
    const sortByDateDesc = (arr) => {
      const withDate = arr.filter((r) => r.dateRaw).sort((a, b) => new Date(b.dateRaw) - new Date(a.dateRaw));
      const withoutDate = arr.filter((r) => !r.dateRaw);
      return [...withDate, ...withoutDate];
    };

    derivativeItems = sortByDateDesc(derivativeItems).slice(0, 4);
    generalItems = sortByDateDesc(generalItems).slice(0, 6);

    // final normalized arrays: each item should have { date (formatted), headline }
    cached.derivative = derivativeItems.map((i) => ({
      date: i.date || "",
      headline: i.headline,
    }));
    cached.general = generalItems.map((i) => ({
      date: i.date || "",
      headline: i.headline,
    }));
    cached.lastUpdated = new Date().toISOString();
    console.log("News cache refreshed:", cached.lastUpdated);
  } catch (err) {
    console.error("Error refreshing news:", err);
  }
}

// start the periodic updater: run immediately, then every 30 minutes
function startNewsUpdater() {
  // initial refresh
  refreshNewsNow();
  // 30 minutes = 30 * 60 * 1000 ms
  setInterval(refreshNewsNow, 30 * 60 * 1000);
}

// accessor
function getCachedNews() {
  return {
    derivative: cached.derivative,
    general: cached.general,
    lastUpdated: cached.lastUpdated,
  };
}

module.exports = { startNewsUpdater, getCachedNews };
