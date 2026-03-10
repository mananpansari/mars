from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
import json
import os

from feeds import fetch_articles
from scorer import score_article, compute_confidence, compute_theme_strength, compute_theme_matches, compute_sentiment
from heat_score import calculate_heat, compute_article_heat, compute_recency
from alerts import run_alerts
from timeline import save_snapshot, load_timeline

app = FastAPI()

# Allow React frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# -----------------------------
# CORE PIPELINE
# -----------------------------

def run_pipeline():
    print("🔄 Running NLP pipeline...")
    articles = fetch_articles()

    sst_payload = []

    for article in articles:
        match_scores = compute_theme_matches(article["text"])
        scores = score_article(article["text"])

        if not scores:
            continue

        strength = compute_theme_strength(match_scores)
        confidence = compute_confidence(match_scores)
        sentiment = compute_sentiment(article["text"])
        recency = compute_recency(article["published"])
        heat = compute_article_heat(
            match_scores,
            article["text"],
            article["published"],
            len(articles)
        )

        sst_payload.append({
            "title":        article["title"],
            "published":    article["published"],
            "source":       article["source"],
            "theme_scores": scores,
            "heat":         heat,
            "confidence":   confidence,
            "sentiment":    sentiment,
            "recency":      recency,
            "strength":     strength
        })

    heat = calculate_heat(articles)
    alerts = run_alerts(articles)
    save_snapshot(heat)

    # Save for SST engine
    with open("sst_input.json", "w") as f:
        json.dump({
            "heatmap":  heat,
            "articles": sst_payload,
            "alerts":   alerts
        }, f, indent=2)

    print("✅ Pipeline complete, sst_input.json updated")
    return heat, sst_payload, alerts


# -----------------------------
# AUTO REFRESH EVERY 30 MINS
# -----------------------------

scheduler = BackgroundScheduler()
scheduler.add_job(run_pipeline, "interval", minutes=30)
scheduler.start()


# -----------------------------
# ENDPOINTS
# -----------------------------

@app.get("/")
def root():
    return {"status": "Macro NLP Engine Running"}


@app.get("/heatmap")
def heatmap():
    articles = fetch_articles()
    heat = calculate_heat(articles)
    return {"heatmap": heat}


@app.get("/alerts")
def alerts():
    articles = fetch_articles()
    triggered = run_alerts(articles)
    return {"alerts": triggered}


@app.get("/articles")
def articles():
    articles = fetch_articles()
    
    seen_titles = set()
    unique_articles = []
    for a in articles:
        norm = a["title"].lower().strip()
        if norm not in seen_titles:
            seen_titles.add(norm)
            unique_articles.append(a)
            
    results = []
    for article in unique_articles:
        match_scores = compute_theme_matches(article["text"])
        scores = score_article(article["text"])
        if not scores:
            continue
        sentiment = compute_sentiment(article["text"])
        recency = compute_recency(article["published"])
        heat = compute_article_heat(
            match_scores,
            article["text"],
            article["published"],
            len(articles)
        )
        results.append({
            "title":      article["title"],
            "published":  article["published"],
            "source":     article["source"],
            "link":       article.get("link", ""),
            "themes":     scores,
            "strength":   compute_theme_strength(match_scores),
            "confidence": compute_confidence(match_scores),
            "sentiment":  sentiment,
            "heat":       heat,
            "recency":    recency,
            "summary":    article["text"][:200] if len(article["text"]) > 200 else article["text"]
        })
    results.sort(key=lambda x: list(x["themes"].values())[0], reverse=True)
    return {"articles": results}


@app.get("/timeline")
def timeline():
    return {"timeline": load_timeline()}


@app.get("/snapshot")
def snapshot():
    articles = fetch_articles()
    heat = calculate_heat(articles)
    save_snapshot(heat)
    return {"status": "Snapshot saved", "scores": heat}


@app.get("/sst")
def sst():
    # SST engine writes its output here
    if os.path.exists("sst_output.json"):
        with open("sst_output.json") as f:
            return json.load(f)
    return {"status": "SST output not available yet"}


@app.get("/dashboard")
def dashboard():
    # Single endpoint that returns everything for the dashboard
    articles_data = fetch_articles()
    heat = calculate_heat(articles_data)
    alerts = run_alerts(articles_data)
    timeline = load_timeline()

    sst = {}
    if os.path.exists("sst_output.json"):
        with open("sst_output.json") as f:
            sst = json.load(f)

    return {
        "heatmap":  heat,
        "alerts":   alerts,
        "timeline": timeline[-5:],  # last 5 snapshots
        "sst":      sst
    }

from summarizer import generate_summary, load_news

@app.get("/briefing")
def briefing():
    try:
        news = load_news("sst_input.json")
        summary = generate_summary(news)
        return {"briefing": summary}
    except Exception as e:
        return {"briefing": f"Briefing unavailable: {str(e)}"}


# ── Portfolio & Stock Tracking ────────────────────────────────

import yfinance as yf
import sys

class _SuppressPrints:
    def __enter__(self):
        self._stdout, self._stderr = sys.stdout, sys.stderr
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
    def __exit__(self, *a):
        sys.stdout, sys.stderr = self._stdout, self._stderr

DEFAULT_PORTFOLIO = [
    {"ticker": "AAPL",  "name": "Apple Inc.",       "quantity": 50,  "sector": "Technology"},
    {"ticker": "TSLA",  "name": "Tesla Inc.",       "quantity": 20,  "sector": "Automotive"},
    {"ticker": "JPM",   "name": "JPMorgan Chase",   "quantity": 30,  "sector": "Financials"},
    {"ticker": "GLD",   "name": "SPDR Gold Trust",  "quantity": 40,  "sector": "Commodities"},
    {"ticker": "USO",   "name": "US Oil Fund",      "quantity": 100, "sector": "Energy"},
    {"ticker": "TLT",   "name": "20+ Year Treasury","quantity": 60,  "sector": "Bonds"},
    {"ticker": "QQQ",   "name": "Nasdaq-100 ETF",   "quantity": 25,  "sector": "Technology"},
    {"ticker": "SPY",   "name": "S&P 500 ETF",      "quantity": 35,  "sector": "Index"},
]

@app.post("/portfolio")
def portfolio(items: list[dict] = Body(default=None)):
    if not items:
        items = DEFAULT_PORTFOLIO

    results = []
    for item in items:
        ticker = item["ticker"]
        try:
            t = yf.Ticker(ticker)
            
            # Get recent history (always available, even after hours)
            hist = t.history(period="1mo", interval="1d")
            sparkline = hist["Close"].tolist()[-5:] if not hist.empty else []
            
            # Try fast_info for live price, fallback to last historical close
            try:
                info = t.fast_info
                price = float(info.get("last_price", 0))
                prev_close = float(info.get("previous_close", 0))
                market_cap = float(info.get("market_cap", 0))
                day_high = float(info.get("day_high", 0))
                day_low = float(info.get("day_low", 0))
                yr_high = float(info.get("year_high", 0))
                yr_low = float(info.get("year_low", 0))
                volume = int(info.get("last_volume", 0))
            except:
                price = 0
                prev_close = 0
                market_cap = 0
                day_high = 0
                day_low = 0
                yr_high = 0
                yr_low = 0
                volume = 0
            
            # Fallback: use last close from history if fast_info failed
            if price == 0 and len(sparkline) > 0:
                price = sparkline[-1]
                if len(sparkline) > 1:
                    prev_close = sparkline[-2]
                    day_high = max(sparkline[-3:]) if len(sparkline) >= 3 else price
                    day_low = min(sparkline[-3:]) if len(sparkline) >= 3 else price
                else:
                    prev_close = price
            
            # Compute 52-week range from history if not available
            if yr_high == 0 and not hist.empty:
                yr_high = float(hist["Close"].max())
                yr_low = float(hist["Close"].min())
            
            change = price - prev_close if prev_close > 0 else 0
            change_pct = (change / prev_close * 100) if prev_close > 0 else 0

            holding_value = price * item["quantity"]

            results.append({
                "ticker": ticker,
                "name": item["name"],
                "sector": item["sector"],
                "quantity": item["quantity"],
                "price": round(price, 2),
                "change": round(change, 2),
                "changePct": round(change_pct, 2),
                "holdingValue": round(holding_value, 2),
                "volume": volume,
                "marketCap": market_cap,
                "dayHigh": round(day_high, 2),
                "dayLow": round(day_low, 2),
                "yearHigh": round(yr_high, 2),
                "yearLow": round(yr_low, 2),
                "sparkline": [round(s, 2) for s in sparkline],
            })
        except Exception as e:
            results.append({
                "ticker": ticker,
                "name": item["name"],
                "sector": item["sector"],
                "quantity": item["quantity"],
                "price": 0,
                "change": 0,
                "changePct": 0,
                "holdingValue": 0,
                "volume": 0,
                "marketCap": 0,
                "dayHigh": 0,
                "dayLow": 0,
                "yearHigh": 0,
                "yearLow": 0,
                "sparkline": [],
                "error": str(e),
            })

    total_value = sum(r["holdingValue"] for r in results)
    total_change = sum(r["change"] * r["quantity"] for r in results)

    return {
        "holdings": results,
        "totalValue": round(total_value, 2),
        "totalChange": round(total_change, 2),
        "totalChangePct": round((total_change / total_value * 100) if total_value > 0 else 0, 2),
    }

from dateutil import parser
import datetime

@app.post("/portfolio/shift")
def portfolio_shift(timestamp: str = Body(...), items: list[dict] = Body(default=None)):
    if not items:
        items = DEFAULT_PORTFOLIO
        
    try:
        t0_dt = parser.parse(timestamp)
        # Handle timezones to get UTC date for yfinance start string
        if t0_dt.tzinfo:
            t0_dt = t0_dt.astimezone(datetime.timezone.utc)
        t0_date = t0_dt.strftime('%Y-%m-%d')
    except Exception as e:
        return {"error": f"Invalid timestamp format: {e}"}
        
    shifts = {}
    for item in items:
        ticker = item["ticker"]
        try:
            t = yf.Ticker(ticker)
            # Fetch history from the date of the article to now
            hist = t.history(start=t0_date)
            if not hist.empty:
                t0_price = float(hist['Close'].iloc[0])
                current_price = float(hist['Close'].iloc[-1])
                try:
                    info = t.fast_info
                    current_price = float(info.get("last_price", current_price))
                except:
                    pass
                    
                if t0_price > 0:
                    shift_pct = ((current_price - t0_price) / t0_price) * 100
                    shifts[ticker] = round(shift_pct, 2)
        except:
            pass
            
    # Calculate portfolio weighted shift
    total_val = 0
    total_shift = 0
    for item in items:
        ticker = item["ticker"]
        qty = float(item.get("quantity", 0))
        
        # approximate weighting by quantity for simple calc if initial price isn't stored locally
        # properly it should be qty * initial_price, but we only have % shift here 
        # let's just use equal weight or simple average for now to simplify
        if ticker in shifts:
            total_val += qty
            total_shift += qty * shifts[ticker]
            
    avg_shift = total_shift / total_val if total_val > 0 else 0
    
    return {
        "shifts": shifts,
        "portfolioShift": round(avg_shift, 2)
    }