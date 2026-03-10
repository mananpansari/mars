from openai import OpenAI
import json

from dotenv import load_dotenv
import os

load_dotenv()

# Lazy client initialization — only created when needed
_client = None

def _get_client():
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        _client = OpenAI(api_key=api_key)
    return _client

# -----------------------------
# SAMPLE PORTFOLIO
# -----------------------------

PORTFOLIO = [
    "Apple", "Tesla", "JP Morgan",
    "Oil", "Gold",
    "US 10Y Treasury",
    "EUR/USD"
]

# -----------------------------
# SAMPLE JSON INPUT
# (in production this comes from your dashboard)
# -----------------------------

SAMPLE_JSON = {
    "news": [
        "Diesel at 16-month high as Iran war drives oil prices up",
        "G7 emergency meeting on oil as stock markets sink",
        "Inflation wave coming as Iran war impacts UK economy",
        "Weak jobs data complicates Fed's next move",
        "Dow futures sink 1000 points as Iran conflict rages",
        "War in Middle East threatens global food production",
        "US eases sanctions on Russian oil sales to India"
    ]
}

# -----------------------------
# LOAD NEWS FROM JSON
# -----------------------------

def load_news(filepath=None):
    if filepath:
        try:
            with open(filepath) as f:
                data = json.load(f)
        except FileNotFoundError:
            data = SAMPLE_JSON
    else:
        data = SAMPLE_JSON

    # Handle both formats: {"news": [...]} and {"articles": [...]}
    if "news" in data:
        return data["news"]
    elif "articles" in data:
        return [a.get("title", "") for a in data["articles"]]
    return []


# -----------------------------
# GENERATE SUMMARY
# -----------------------------

def generate_summary(news, portfolio=None):
    client = _get_client()
    if client is None:
        # Fallback: generate a rules-based summary if no API key
        return _fallback_summary(news)

    if portfolio is None:
        portfolio = PORTFOLIO

    news_text = "\n".join(f"- {n}" for n in news)
    portfolio_text = ", ".join(portfolio)

    prompt = f"""
You are a macroeconomic analyst.

Portfolio: {portfolio_text}

Latest news:
{news_text}

Write:
1. A 2 sentence overview of current macro conditions
2. One line per asset on how it is impacted

Be concise and professional.
Do not add asterisks.
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a senior macroeconomic analyst."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=400
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"OpenAI API error: {e}")
        return _fallback_summary(news)


def _fallback_summary(news):
    """Generate a basic summary without AI when API key is unavailable."""
    count = len(news)
    headlines = "; ".join(news[:5]) if news else "No headlines available"
    return (
        f"Macro conditions are driven by {count} recent developments. "
        f"Key headlines: {headlines}. "
        f"Markets are processing multiple macro signals across inflation, rates, and geopolitical themes."
    )


# -----------------------------
# TEST
# -----------------------------

if __name__ == "__main__":
    # Use sample JSON by default
    # To use a real file: news = load_news("your_file.json")
    news = load_news()

    print(f"📰 Loaded {len(news)} articles\n")
    print("📝 AI MACRO BRIEFING")
    print("=" * 60)
    summary = generate_summary(news)
    print(summary)