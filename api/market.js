export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SYMBOLS = {
    nikkei:"^N225", usdjpy:"JPY=X", sp500:"^GSPC",
    nasdaq:"^IXIC", vix:"^VIX", us10y:"^TNX", crude:"CL=F"
  };

  const { ticker } = req.query;

  async function fetchQ(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10d`;
    const r = await fetch(url, { headers:{"User-Agent":"Mozilla/5.0"}, signal:AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    const m = j?.chart?.result?.[0]?.meta;
    if (!m) throw new Error("no data");
    const closes = j.chart.result[0].indicators?.quote?.[0]?.close?.filter(v=>v!=null) || [];
    const p = v => v != null ? Math.round(v*100)/100 : null;
    return {
      symbol, price:p(m.regularMarketPrice), prevClose:p(m.chartPreviousClose||m.previousClose),
      open:p(m.regularMarketOpen), dayHigh:p(m.regularMarketDayHigh), dayLow:p(m.regularMarketDayLow),
      change:p(m.regularMarketPrice-(m.chartPreviousClose||m.previousClose)),
      changePct:p((m.regularMarketPrice/(m.chartPreviousClose||m.previousClose)-1)*100),
      week52High:p(m.fiftyTwoWeekHigh), week52Low:p(m.fiftyTwoWeekLow),
      name:m.shortName||symbol, closes:closes.slice(-14).map(v=>p(v))
    };
  }

  if (ticker) {
    try {
      const sym = ticker.includes(".")?ticker:ticker+".T";
      return res.status(200).json({ ok:true, data:await fetchQ(sym) });
    } catch(e) { return res.status(500).json({ ok:false, error:e.message }); }
  }

  const results = {}, errors = {};
  await Promise.allSettled(Object.entries(SYMBOLS).map(async([k,s])=>{
    try { results[k]=await fetchQ(s); } catch(e) { errors[k]=e.message; results[k]=null; }
  }));
  return res.status(200).json({ ok:true, data:results, errors:Object.keys(errors).length?errors:undefined, fetchedAt:new Date().toISOString() });
}
