const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");   // ✅ Required for static folder

const app = express();
const PORT = process.env.PORT || 3000;   // ✅ Render uses process.env.PORT

// ===============================================
// ✅ Nirmal Bang AJAX endpoints
// ===============================================
const NB_GENERAL =
  "https://www.nirmalbang.com/ajaxpages/AjaxNewsUpdates.aspx?SecID=7&SubSecID=15&pageNo=1&PageSize=20";
const NB_DERIVATIVE =
  "https://www.nirmalbang.com/ajaxpages/AjaxNewsUpdates.aspx?SecID=4&SubSecID=47&pageNo=1&PageSize=20";

// ===============================================
// ✅ Cache
// ===============================================
let cachedNews = { general: [], derivative: [] };
let lastFetched = 0;
const CACHE_TTL = 60 * 1000; // 1 min

function formatDate(d) {
  return d.replace(/&nbsp;/g, " ").replace("Hrs IST", "").trim();
}

// ===============================================
// ✅ Parse HTML using Cheerio
// ===============================================
function parseHtmlNews(html) {
  const $ = cheerio.load(html);
  const news = [];

  $(".GrNewsMainCont").each((_, el) => {
    const headline = $(el).find(".GrNewsHead").text().trim();
    const date = $(el).find(".GrNewsDate").text().trim();
    if (headline && date) news.push({ date: formatDate(date), headline });
  });

  return news;
}

async function fetchNews(url) {
  const response = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  return parseHtmlNews(response.data);
}

// ===============================================
// ✅ API endpoint: /news
// ===============================================
app.get("/news", async (req, res) => {
  const now = Date.now();

  if (now - lastFetched < CACHE_TTL) {
    console.log("✅ Serving cached news");
    return res.json(cachedNews);
  }

  try {
    console.log("🔍 Fetching fresh HTML news…");

    const [general, derivative] = await Promise.all([
      fetchNews(NB_GENERAL),
      fetchNews(NB_DERIVATIVE),
    ]);

    cachedNews = { general, derivative };
    lastFetched = now;

    console.log(
      `✅ Updated — General: ${general.length}, Derivative: ${derivative.length}`
    );

    res.json(cachedNews);
  } catch (err) {
    console.error("❌ Fetch failed:", err.message);
    res.json(cachedNews);
  }
});

// ===============================================
// ✅ Serve static files from /public folder
// ===============================================
app.use(express.static(path.join(__dirname, "public")));

// ===============================================
// ✅ Fallback: serve index.html from root
// ===============================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===============================================
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
