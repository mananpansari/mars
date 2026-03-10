import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import json
# -------------------------
# FACTORS
# -------------------------

FACTORS = [
    "Rates",
    "Equities",
    "Credit_Spreads",
    "USD",
    "Oil",
    "Volatility"
]

# -------------------------
# THEME → FACTOR SHOCK MATRIX
# -------------------------

THEME_MATRIX = {

    "Inflation_Shock": [2, -1, 1, 1, 1, 1],
    "Disinflation": [-1, 1, -1, -0.5, -0.5, -1],
    "Energy_Shock": [1, -1, 1, 0.5, 3, 1],

    "Growth_Slowdown": [-1, -2, 2, 0.5, -1, 2],
    "Recession_Risk": [-2, -3, 3, 1, -2, 3],
    "Growth_Reacceleration": [1, 2, -1, -0.5, 1, -1],

    "Monetary_Tightening": [2, -1, 1, 1, 0, 1],
    "Monetary_Easing": [-2, 1.5, -1, -0.5, 0.5, -1],

    "Banking_Stress": [-1, -3, 3, 1, -1, 3],
    "Credit_Crunch": [-1, -2.5, 3, 0.5, -1, 2.5],

    "Geopolitical_Escalation": [0, -1.5, 1.2, 0.8, 2.5, 1.8],

    "Dollar_Strength": [0.5, -1, 0.5, 2, -1, 1],
    "Risk_Off": [-1, -3, 2.5, 1, -1, 3],
    "Risk_On": [1, 3, -2, -1, 1, -2],
    "Volatility_Shock": [0.5, -2, 2, 0.5, 0.5, 3]
}

ALL_THEMES = list(THEME_MATRIX.keys())

# -------------------------
# REGIME MULTIPLIERS
# -------------------------
# Precarious = fragile slowdown / late-cycle weakness
# Crisis = full market stress / panic / credit-volatility dislocation

REGIME_MULTIPLIERS = {
    "Inflation_Regime":  [1.4, 1.1, 1.1, 1.2, 1.3, 1.0],
    "Growth_Regime":     [1.1, 1.4, 1.2, 1.0, 1.1, 1.1],
    "Precarious_Regime": [1.1, 1.4, 1.5, 1.1, 1.1, 1.4],
    "Crisis_Regime":     [1.3, 2.0, 2.1, 1.4, 1.3, 2.2],
    "Neutral":           [1, 1, 1, 1, 1, 1]
}

# -------------------------
# SOFTMAX
# -------------------------

def softmax(scores):
    keys = list(scores.keys())
    vals = np.array(list(scores.values()), dtype=float)

    exp = np.exp(vals - np.max(vals))
    probs = exp / exp.sum()

    return dict(zip(keys, probs))

# -------------------------
# REGIME DETECTION
# -------------------------

def compute_regime_scores(probs):
    p_rec = probs.get("Recession_Risk", 0.0)
    p_gro = probs.get("Growth_Slowdown", 0.0)
    p_reacc = probs.get("Growth_Reacceleration", 0.0)

    p_inf = probs.get("Inflation_Shock", 0.0)
    p_hik = probs.get("Monetary_Tightening", 0.0)
    p_energy = probs.get("Energy_Shock", 0.0)

    p_roff = probs.get("Risk_Off", 0.0)
    p_vol = probs.get("Volatility_Shock", 0.0)
    p_bank = probs.get("Banking_Stress", 0.0)
    p_credit = probs.get("Credit_Crunch", 0.0)
    p_geo = probs.get("Geopolitical_Escalation", 0.0)
    p_usd = probs.get("Dollar_Strength", 0.0)

    growth_score = (
        1.00 * p_reacc +
        0.70 * probs.get("Risk_On", 0.0) +
        0.50 * probs.get("Monetary_Easing", 0.0)
    )

    inflation_score = (
        1.00 * p_inf +
        0.80 * p_hik +
        0.60 * p_energy
    )

    precarious_score = (
        1.00 * p_rec +
        0.90 * p_gro +
        0.60 * p_credit +
        0.25 * p_bank +
        0.35 * p_geo
    )

    crisis_score = (
        1.00 * p_roff +
        1.00 * p_vol +
        0.90 * p_credit +
        0.75 * p_bank +
        0.20 * p_geo +
        0.30 * p_usd
    )

    return {
        "Growth_Regime": growth_score,
        "Inflation_Regime": inflation_score,
        "Precarious_Regime": precarious_score,
        "Crisis_Regime": crisis_score
    }


def detect_regime(probs):
    regime_scores = compute_regime_scores(probs)

    best_regime = max(regime_scores, key=regime_scores.get)
    best_score = regime_scores[best_regime]

    if best_score < 0.2:
        return "Neutral", regime_scores

    # Structural fix:
    # if stress is close to fragility and clearly elevated, prefer Crisis
    if (
        regime_scores["Crisis_Regime"] >= 0.85 * regime_scores["Precarious_Regime"]
        and regime_scores["Crisis_Regime"] >= 0.30
    ):
        return "Crisis_Regime", regime_scores

    return best_regime, regime_scores


def detect_regime_from_shock(shock):
    """
    Shock-space override.
    If the realized cross-asset pattern is clearly crisis-like,
    promote regime to Crisis.
    """
    rates, equities, credit, usd, oil, vol = shock

    stress_score = (
        max(0.0, -equities) +
        max(0.0, credit) +
        max(0.0, vol) +
        0.5 * max(0.0, usd)
    )

    if stress_score >= 3.5:
        return "Crisis_Regime"

    return None

# -------------------------
# IMPACT SYMBOL
# -------------------------

def symbol(x):

    mag = abs(x)

    if mag < 0.5:
        return "Neutral"

    if mag < 1:
        return "+" if x > 0 else "-"

    if mag < 2:
        return "++" if x > 0 else "--"

    return "+++" if x > 0 else "---"

# -------------------------
# SHOCK CAPS
# -------------------------

def cap(shock):
    return np.clip(shock, -3, 3)

# -------------------------
# VISUALIZER HELPERS
# -------------------------

def build_cross_asset_visualizer(shock):

    vis = []

    for i, f in enumerate(FACTORS):
        vis.append({
            "factor": f,
            "shock": float(shock[i]),
            "magnitude": abs(float(shock[i])),
            "direction": "positive" if shock[i] > 0 else "negative" if shock[i] < 0 else "neutral"
        })

    return vis


def build_regime_visualizer(probs):

    vis = []

    for k, v in probs.items():
        vis.append({
            "theme": k,
            "probability": float(v)
        })

    vis.sort(key=lambda x: x["probability"], reverse=True)

    return vis


def build_portfolio_visualizer(portfolio_map):

    vis = []

    for a in portfolio_map:
        vis.append({
            "ticker": a["ticker"],
            "factor": a["factor"],
            "impact": float(a["impact"]),
            "size": abs(float(a["impact"])),
            "direction": "positive" if a["impact"] > 0 else "negative" if a["impact"] < 0 else "neutral"
        })

    return vis


def build_scenario_ladder_visualizer(baseline, moderate, severe):

    scenarios = {
        "Baseline": baseline,
        "Moderate": moderate,
        "Severe": severe
    }

    vis = []

    for scenario_name, shock_vec in scenarios.items():
        for i, factor in enumerate(FACTORS):
            vis.append({
                "scenario": scenario_name,
                "factor": factor,
                "shock": float(shock_vec[i]),
                "magnitude": abs(float(shock_vec[i])),
                "direction": "positive" if shock_vec[i] > 0 else "negative" if shock_vec[i] < 0 else "neutral"
            })

    return vis


def build_theme_tracker_visualizer(theme_tracker_df):

    vis = []

    for _, row in theme_tracker_df.iterrows():
        vis.append({
            "theme": row["Theme"],
            "probability": float(row["Probability"]),
            "current_heat": float(row["Current_Heat"]),
            "previous_heat": float(row["Previous_Heat"]),
            "momentum": float(row["Momentum"]),
            "status": row["Status"]
        })

    return vis

# -------------------------
# GRAPH HELPERS
# -------------------------

def plot_regime_probabilities(probs):

    if not probs:
        return

    items = sorted(probs.items(), key=lambda x: x[1], reverse=True)
    themes = [k for k, _ in items]
    values = [v for _, v in items]

    plt.figure(figsize=(11, 5))
    plt.bar(themes, values)
    plt.title("Macro Theme Probabilities")
    plt.ylabel("Probability")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    plt.show()


def plot_cross_asset_impacts_heatmap(shock):
    """
    Diverging heatmap for cross-asset impact map.
    """
    data = np.array([shock], dtype=float)

    plt.figure(figsize=(10, 2.6))
    vmax = max(np.max(np.abs(data)), 1e-9)

    im = plt.imshow(data, cmap="RdYlGn", aspect="auto", vmin=-vmax, vmax=vmax)

    plt.xticks(range(len(FACTORS)), FACTORS, rotation=45, ha="right")
    plt.yticks([0], ["Moderate"])

    for i, val in enumerate(shock):
        plt.text(i, 0, f"{val:.2f}", ha="center", va="center", color="black", fontsize=10)

    plt.title("Cross-Asset Impact Heatmap")
    plt.colorbar(im, fraction=0.03, pad=0.04, label="Shock Intensity")
    plt.tight_layout()
    plt.show()


def plot_scenario_ladder_heatmap(baseline, moderate, severe):
    """
    Graphical scenario ladder heatmap:
    rows = Baseline / Moderate / Severe
    cols = macro factors
    """
    data = np.array([baseline, moderate, severe], dtype=float)

    plt.figure(figsize=(10, 4))
    vmax = max(np.max(np.abs(data)), 1e-9)

    im = plt.imshow(data, cmap="RdYlGn", aspect="auto", vmin=-vmax, vmax=vmax)

    plt.xticks(range(len(FACTORS)), FACTORS, rotation=45, ha="right")
    plt.yticks([0, 1, 2], ["Baseline", "Moderate", "Severe"])

    for r in range(data.shape[0]):
        for c in range(data.shape[1]):
            plt.text(c, r, f"{data[r, c]:.2f}", ha="center", va="center", color="black", fontsize=9)

    plt.title("Scenario Ladder Heatmap")
    plt.colorbar(im, fraction=0.03, pad=0.04, label="Shock Intensity")
    plt.tight_layout()
    plt.show()


def plot_portfolio_impacts(portfolio_map):
    """
    Portfolio impact chart with risk contribution labels integrated into graph.
    Labels top 3 absolute contributors directly on chart.
    """
    if not portfolio_map:
        return

    tickers = [a["ticker"] for a in portfolio_map]
    impacts = [a["impact"] for a in portfolio_map]
    colors = ["green" if x > 0 else "red" if x < 0 else "gray" for x in impacts]

    plt.figure(figsize=(11, 5))
    plt.bar(tickers, impacts, color=colors)
    plt.title("Portfolio Impact Map")
    plt.ylabel("Shock Contribution")
    plt.axhline(0, color="black", linewidth=1)

    top_contributors = sorted(portfolio_map, key=lambda x: abs(x["impact"]), reverse=True)[:3]

    for item in top_contributors:
        idx = tickers.index(item["ticker"])
        val = item["impact"]
        y_offset = 0.02 if val >= 0 else -0.02
        va = "bottom" if val >= 0 else "top"

        plt.text(
            idx,
            val + y_offset,
            f"{item['ticker']}: {val:.2f}",
            ha="center",
            va=va,
            fontsize=9,
            fontweight="bold"
        )

    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    plt.show()


def plot_theme_heat_tracker(theme_tracker_df):
    """
    Single Theme Heat Tracker graph.
    Momentum is still computed and available in outputs,
    but only current heat is graphed.
    """
    if theme_tracker_df.empty:
        return

    df = theme_tracker_df.sort_values("Current_Heat", ascending=False)

    themes = df["Theme"].tolist()
    current_heat = df["Current_Heat"].tolist()

    bar_colors = []
    for _, row in df.iterrows():
        if "Hot" in row["Status"]:
            bar_colors.append("orange")
        elif row["Status"] == "Cooling":
            bar_colors.append("steelblue")
        elif row["Status"] == "Rising":
            bar_colors.append("green")
        elif row["Status"] == "Falling":
            bar_colors.append("red")
        else:
            bar_colors.append("gray")

    plt.figure(figsize=(13, 5))
    plt.bar(themes, current_heat, color=bar_colors)
    plt.title("Theme Heat Tracker")
    plt.ylabel("Current Heat")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    plt.show()

# -------------------------
# SCENARIO LADDER
# -------------------------

def scenario_ladder(shock):
    baseline = shock * 0.5
    moderate = shock
    severe = shock * 1.5
    return baseline, moderate, severe

# -------------------------
# PORTFOLIO IMPACT MAP
# -------------------------

def portfolio_impact_map(portfolio, shock, factor_map):

    impacts = []
    total = 0.0

    for asset in portfolio:

        ticker = asset["ticker"]
        weight = float(asset["weight"])

        factor = factor_map.get(ticker, None)

        if factor in FACTORS:
            idx = FACTORS.index(factor)
            impact = weight * shock[idx]
        else:
            impact = 0.0

        total += impact

        impacts.append({
            "ticker": ticker,
            "weight": weight,
            "factor": factor,
            "impact": float(impact)
        })

    return impacts, total

# -------------------------
# RISK CONTRIBUTION HELPERS
# -------------------------

def compute_risk_contributions(portfolio_map, top_n=3):

    sorted_assets = sorted(portfolio_map, key=lambda x: x["impact"])
    top_negative = sorted_assets[:top_n]

    sorted_positive = sorted(portfolio_map, key=lambda x: x["impact"], reverse=True)
    top_positive = sorted_positive[:top_n]

    return {
        "top_negative_contributors": top_negative,
        "top_positive_contributors": top_positive
    }

# -------------------------
# THEME HEAT + MOMENTUM TRACKER
# -------------------------

def compute_theme_heat_and_momentum(
    probs,
    global_heat,
    previous_theme_heat=None,
    hot_threshold=0.18,
    cool_threshold=0.05
):
    """
    current theme heat = theme probability * global heat
    momentum = current_heat - previous_heat
    """
    previous_theme_heat = previous_theme_heat or {}

    rows = []

    for theme in ALL_THEMES:
        prob = float(probs.get(theme, 0.0))
        current_heat = prob * float(global_heat)
        previous_heat = float(previous_theme_heat.get(theme, 0.0))
        momentum = current_heat - previous_heat

        if current_heat >= hot_threshold and momentum > 0.01:
            status = "Hot and Rising"
        elif current_heat >= hot_threshold and abs(momentum) <= 0.01:
            status = "Hot and Stable"
        elif current_heat <= cool_threshold and momentum < 0:
            status = "Cooling"
        elif momentum > 0.01:
            status = "Rising"
        elif momentum < -0.01:
            status = "Falling"
        else:
            status = "Stable"

        rows.append({
            "Theme": theme,
            "Probability": prob,
            "Current_Heat": current_heat,
            "Previous_Heat": previous_heat,
            "Momentum": momentum,
            "Status": status
        })

    theme_tracker_df = pd.DataFrame(rows)
    theme_tracker_df.sort_values(
        by=["Current_Heat", "Probability"],
        ascending=False,
        inplace=True
    )
    theme_tracker_df.reset_index(drop=True, inplace=True)

    current_heat_map = {
        row["Theme"]: float(row["Current_Heat"])
        for _, row in theme_tracker_df.iterrows()
    }

    return theme_tracker_df, current_heat_map

# -------------------------
# MAIN SST ENGINE
# -------------------------

def run_sst(
    theme_scores,
    portfolio,
    factor_map,
    heat=0.7,
    confidence=0.8,
    previous_theme_heat=None
):
    if not theme_scores:
        raise ValueError("theme_scores cannot be empty.")

    scaled_scores = {k: v / 5 for k, v in theme_scores.items()}
    probs = softmax(scaled_scores)

    # Base shock before regime amplification
    base_shock = np.zeros(len(FACTORS), dtype=float)

    for theme, p in probs.items():
        if theme in THEME_MATRIX:
            base_shock += p * np.array(THEME_MATRIX[theme], dtype=float)

    base_shock *= (0.5 + heat)
    base_shock *= (0.75 + 0.25 * confidence)

    regime, regime_scores = detect_regime(probs)
    shock = base_shock * np.array(REGIME_MULTIPLIERS[regime], dtype=float)

    shock = cap(shock)

    # ---------------------
    # Theme Heat + Momentum
    # ---------------------

    theme_tracker_df, current_theme_heat_map = compute_theme_heat_and_momentum(
        probs=probs,
        global_heat=heat,
        previous_theme_heat=previous_theme_heat
    )

    theme_tracker_visual = build_theme_tracker_visualizer(theme_tracker_df)

    # ---------------------
    # Cross Asset Map
    # ---------------------

    cross_asset_df = pd.DataFrame({
        "Factor": FACTORS,
        "Shock": shock,
        "Impact": [symbol(s) for s in shock]
    })

    cross_asset_visual = build_cross_asset_visualizer(shock)

    # ---------------------
    # Scenario Ladder
    # ---------------------

    baseline, moderate, severe = scenario_ladder(shock)

    scenario_ladder_visual = build_scenario_ladder_visualizer(
        baseline,
        moderate,
        severe
    )

    # ---------------------
    # Portfolio Impact
    # ---------------------

    portfolio_map, total_portfolio_impact = portfolio_impact_map(
        portfolio,
        shock,
        factor_map
    )

    portfolio_visual = build_portfolio_visualizer(portfolio_map)

    risk_contributions = compute_risk_contributions(portfolio_map)

    # ---------------------
    # Regime Confidence
    # ---------------------

    regime_confidence = float(max(regime_scores.values())) if regime_scores else 0.0

    # ---------------------
    # Graph Outputs
    # ---------------------

    plot_regime_probabilities(probs)
    plot_theme_heat_tracker(theme_tracker_df)
    plot_cross_asset_impacts_heatmap(shock)
    plot_scenario_ladder_heatmap(baseline, moderate, severe)
    plot_portfolio_impacts(portfolio_map)

    # ---------------------
    # Final JSON Output
    # ---------------------

    result = {

        "regime_output": {
            "regime": regime,
            "regime_confidence": regime_confidence,
            "regime_scores": {k: float(v) for k, v in regime_scores.items()},
            "probabilities": {k: float(v) for k, v in probs.items()},
            "visualizer": build_regime_visualizer(probs)
        },

        "theme_tracker": {
            "table": theme_tracker_df.to_dict(orient="records"),
            "visualizer": theme_tracker_visual,
            "current_theme_heat_map": current_theme_heat_map
        },

        "cross_asset_impact": {
            "table": cross_asset_df.to_dict(orient="records"),
            "visualizer": cross_asset_visual
        },

        "scenario_ladder": {
            "baseline": baseline.tolist(),
            "moderate": moderate.tolist(),
            "severe": severe.tolist(),
            "visualizer": scenario_ladder_visual
        },

        "portfolio_impact": {
            "total_portfolio_impact": float(total_portfolio_impact),
            "portfolio_map": portfolio_map,
            "visualizer": portfolio_visual,
            "risk_contributions": risk_contributions
        },

        "shock_vector": shock.tolist()
    }

    return result

# -------------------------
# TESTING CODE (JSON-DRIVEN)
# -------------------------

plt.style.use("seaborn-v0_8")

# -------------------------
# EXAMPLE PORTFOLIO
# -------------------------

portfolio = [
    {"ticker": "AAPL", "weight": 0.18},
    {"ticker": "MSFT", "weight": 0.17},
    {"ticker": "TLT", "weight": 0.20},
    {"ticker": "HYG", "weight": 0.12},
    {"ticker": "UUP", "weight": 0.08},
    {"ticker": "USO", "weight": 0.10},
    {"ticker": "VIXY", "weight": 0.05},
    {"ticker": "GOOGL", "weight": 0.10}
]

# -------------------------
# TICKER -> FACTOR MAP
# -------------------------

factor_map = {
    "AAPL": "Equities",
    "MSFT": "Equities",
    "GOOGL": "Equities",
    "TLT": "Rates",
    "HYG": "Credit_Spreads",
    "UUP": "USD",
    "USO": "Oil",
    "VIXY": "Volatility"
}

# -------------------------
# THEME NAME MAP
# -------------------------

THEME_NAME_MAP = {
    "Inflation Shock": "Inflation_Shock",
    "Disinflation": "Disinflation",
    "Energy Shock": "Energy_Shock",
    "Growth Slowdown": "Growth_Slowdown",
    "Recession Risk": "Recession_Risk",
    "Growth Reacceleration": "Growth_Reacceleration",
    "Monetary Tightening": "Monetary_Tightening",
    "Monetary Easing": "Monetary_Easing",
    "Banking Stress": "Banking_Stress",
    "Credit Crunch": "Credit_Crunch",
    "Geopolitical Escalation": "Geopolitical_Escalation",
    "Dollar Strength": "Dollar_Strength",
    "Risk Off": "Risk_Off",
    "Risk On": "Risk_On",
    "Volatility Shock": "Volatility_Shock"
}

# -------------------------
# JSON ADAPTER HELPERS
# -------------------------

def normalize_theme_name(theme_name):
    return THEME_NAME_MAP.get(theme_name, theme_name.replace(" ", "_"))

def extract_theme_scores_from_heatmap(nlp_json):
    raw_heatmap = nlp_json.get("heatmap", {})
    theme_scores = {}

    for theme, score in raw_heatmap.items():
        normalized = normalize_theme_name(theme)

        if normalized in THEME_MATRIX:
            theme_scores[normalized] = float(score)

    if not theme_scores:
        raise ValueError("No valid theme scores found in NLP JSON heatmap.")

    return theme_scores

def aggregate_heat(nlp_json):
    """
    Uses article-level heat if available.
    Falls back to 0.5 if not found.
    """
    articles = nlp_json.get("articles", [])

    if not articles:
        return 0.5

    heats = []
    weights = []

    for article in articles:
        article_heat = float(article.get("heat", 0.5))

        # Prefer article strength if available, otherwise use 1.0
        article_strength = float(article.get("strength", 1.0))
        if article_strength <= 0:
            article_strength = 1.0

        heats.append(article_heat)
        weights.append(article_strength)

    return float(np.clip(np.average(heats, weights=weights), 0.0, 1.0))

def aggregate_confidence(nlp_json):
    """
    Uses article-level confidence if available.
    Falls back to 0.5 if not found.
    """
    articles = nlp_json.get("articles", [])

    if not articles:
        return 0.5

    confidences = []
    weights = []

    for article in articles:
        conf = float(article.get("confidence", 0.5))
        heat = float(article.get("heat", 1.0))
        if heat <= 0:
            heat = 1.0

        confidences.append(conf)
        weights.append(heat)

    return float(np.clip(np.average(confidences, weights=weights), 0.0, 1.0))

def run_sst_from_nlp_json(
    nlp_json,
    portfolio,
    factor_map,
    previous_theme_heat=None
):
    theme_scores = extract_theme_scores_from_heatmap(nlp_json)
    heat = aggregate_heat(nlp_json)
    confidence = aggregate_confidence(nlp_json)

    result = run_sst(
        theme_scores=theme_scores,
        portfolio=portfolio,
        factor_map=factor_map,
        heat=heat,
        confidence=confidence,
        previous_theme_heat=previous_theme_heat
    )

    result["nlp_metadata"] = {
        "derived_theme_scores": theme_scores,
        "derived_heat": heat,
        "derived_confidence": confidence,
        "alerts": nlp_json.get("alerts", []),
        "article_count": len(nlp_json.get("articles", []))
    }

    return result

# -------------------------
# LOAD JSON INPUT
# -------------------------

with open("/Users/smyannarang/Downloads/sst_input.json", "r") as f:
    nlp_json = json.load(f)

# -------------------------
# RUN SST ENGINE FROM NLP JSON
# -------------------------

result = run_sst_from_nlp_json(
    nlp_json=nlp_json,
    portfolio=portfolio,
    factor_map=factor_map,
    previous_theme_heat=None
)

# -------------------------
# PRINT TEST OUTPUTS
# -------------------------

print("\n================ NLP METADATA ================\n")
print("Article Count:", result["nlp_metadata"]["article_count"])
print("Derived Heat:", result["nlp_metadata"]["derived_heat"])
print("Derived Confidence:", result["nlp_metadata"]["derived_confidence"])

print("\nDerived Theme Scores:")
for k, v in result["nlp_metadata"]["derived_theme_scores"].items():
    print(f"{k}: {v:.4f}")

print("\nAlerts:")
for alert in result["nlp_metadata"]["alerts"]:
    print(alert)

print("\n================ REGIME OUTPUT ================\n")
print("Detected Regime:", result["regime_output"]["regime"])
print("Regime Confidence:", result["regime_output"]["regime_confidence"])

print("\nTheme Probabilities:")
for k, v in result["regime_output"]["probabilities"].items():
    print(f"{k}: {v:.4f}")

print("\nRegime Visualizer:")
for row in result["regime_output"]["visualizer"]:
    print(row)

print("\n================ THEME TRACKER ================\n")
for row in result["theme_tracker"]["table"]:
    print(row)

print("\n================ CROSS ASSET IMPACT ================\n")
print("Cross Asset Table:")
for row in result["cross_asset_impact"]["table"]:
    print(row)

print("\nCross Asset Visualizer:")
for row in result["cross_asset_impact"]["visualizer"]:
    print(row)

print("\n================ SCENARIO LADDER ================\n")
print("Baseline Shock:", result["scenario_ladder"]["baseline"])
print("Moderate Shock:", result["scenario_ladder"]["moderate"])
print("Severe Shock:", result["scenario_ladder"]["severe"])

print("\nScenario Ladder Visualizer:")
for row in result["scenario_ladder"]["visualizer"]:
    print(row)

print("\n================ PORTFOLIO IMPACT ================\n")
print("Total Portfolio Impact:", result["portfolio_impact"]["total_portfolio_impact"])

print("\nPortfolio Map:")
for row in result["portfolio_impact"]["portfolio_map"]:
    print(row)

print("\nPortfolio Visualizer:")
for row in result["portfolio_impact"]["visualizer"]:
    print(row)

print("\nTop Positive Contributors:")
for row in result["portfolio_impact"]["risk_contributions"]["top_positive_contributors"]:
    print(row)

print("\nTop Negative Contributors:")
for row in result["portfolio_impact"]["risk_contributions"]["top_negative_contributors"]:
    print(row)

print("\n================ SHOCK VECTOR ================\n")
print(result["shock_vector"])

print("\n================ FULL JSON OUTPUT ================\n")
print(json.dumps(result, indent=2))