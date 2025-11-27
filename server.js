const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Nirmal Bang Endpoints
const NB_GENERAL =
  "https://www.nirmalbang.com/ajaxpages/AjaxNewsUpdates.aspx?SecID=7&SubSecID=15&pageNo=1&PageSize=20";
const NB_DERIVATIVE =
  "https://www.nirmalbang.com/ajaxpages/AjaxNewsUpdates.aspx?SecID=4&SubSecID=47&pageNo=1&PageSize=20";

// Cache
let cachedNews = { general: [], derivative: [] };
let lastFetched = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

function formatDate(d) {
  return d.replace(/&nbsp;/g, " ").replace("Hrs IST", "").trim();
}

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

app.get("/news", async (req, res) => {
  const now = Date.now();

  if (now - lastFetched < CACHE_TTL) {
    return res.json(cachedNews);
  }

  try {
    const [general, derivative] = await Promise.all([
      fetchNews(NB_GENERAL),
      fetchNews(NB_DERIVATIVE),
    ]);

    cachedNews = { general, derivative };
    lastFetched = now;

    res.json(cachedNews);
  } catch (err) {
    res.json(cachedNews); // send cached even on error
  }
});

// Redirect ROOT to table.html
app.get("/", (req, res) => {
  res.redirect("/table.html");
});

// Serve STATIC FILES
app.use(express.static(path.join(__dirname, "public")));

// Routing
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "table.html"))
);

app.get("/table", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "table.html"))
);

app.get("/ticker", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "ticker.html"))
);

app.get("/ticker-remote", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "ticker-remote.html"))
);

app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});
