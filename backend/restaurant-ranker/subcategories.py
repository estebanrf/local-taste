"""
Static sub-type map for world cuisine categories.
Used by CATEGORY_RANKER_INSTRUCTIONS to expand a cuisine into targeted search queries.
Curated once — no LLM call needed at runtime.
"""

CUISINE_SUBTYPES: dict[str, list[str]] = {
    "Japanese":       ["ramen", "sushi", "izakaya", "tempura", "yakitori", "tonkatsu", "udon", "omakase"],
    "Italian":        ["pizza", "pasta", "risotto", "trattoria", "gelato", "osteria"],
    "Chinese":        ["dim sum", "Peking duck", "hot pot", "dumplings", "noodles", "Cantonese"],
    "French":         ["bistro", "brasserie", "croissant brunch", "steak frites", "soufflé", "wine bar"],
    "Mexican":        ["tacos", "mole", "pozole", "tamales", "tlayuda", "mezcal bar"],
    "Indian":         ["curry", "biryani", "tandoor", "dosa", "chaat", "thali"],
    "Thai":           ["pad thai", "green curry", "som tam", "boat noodles", "mango sticky rice"],
    "Spanish":        ["tapas", "paella", "pintxos", "jamón", "vermouth bar", "croquetas"],
    "Greek":          ["souvlaki", "meze", "grilled fish", "moussaka", "spanakopita"],
    "Turkish":        ["kebab", "meze", "pide", "lahmacun", "baklava", "köfte"],
    "Lebanese":       ["mezze", "shawarma", "falafel", "hummus", "kibbeh"],
    "Korean":         ["Korean BBQ", "bibimbap", "jjigae", "tteokbokki", "cold noodles"],
    "Vietnamese":     ["pho", "banh mi", "bun cha", "fresh spring rolls", "com tam"],
    "Peruvian":       ["ceviche", "lomo saltado", "causa", "anticuchos", "tiradito"],
    "American":       ["BBQ", "burgers", "clam chowder", "fried chicken", "diner breakfast"],
    "Brazilian":      ["churrasco", "feijoada", "açaí", "pão de queijo", "coxinha"],
    "Argentinian":    ["asado", "empanadas", "dulce de leche", "milanesa", "provoleta"],
    "Ethiopian":      ["injera", "kitfo", "tibs", "shiro", "tej bar"],
    "Moroccan":       ["tagine", "couscous", "bastilla", "harira", "pastilla"],
    "Cambodian":      ["amok", "lok lak", "kuy teav", "nom banh chok"],
    "Indonesian":     ["nasi goreng", "satay", "rendang", "gado-gado", "soto"],
    "Malaysian":      ["nasi lemak", "char kway teow", "laksa", "roti canai", "satay"],
    "Portuguese":     ["bacalhau", "pastéis de nata", "francesinha", "grilled sardines", "bifanas"],
    "German":         ["schnitzel", "bratwurst", "sauerbraten", "pretzels", "beer hall"],
    "Polish":         ["pierogi", "bigos", "żurek", "kotlet schabowy", "gołąbki"],
    "Russian":        ["borscht", "pelmeni", "beef stroganoff", "blini", "solyanka"],
    "Israeli":        ["hummus", "shakshuka", "sabich", "falafel", "burekas"],
    "Georgian":       ["khinkali", "khachapuri", "churchkhela", "mtsvadi", "lobiani"],
    "Filipino":       ["adobo", "sinigang", "lechon", "kare-kare", "halo-halo"],
    "Caribbean":      ["jerk chicken", "roti", "ackee saltfish", "doubles", "curry goat"],
    "Scandinavian":   ["smørrebrød", "gravlax", "meatballs", "herring", "kanelbullar"],
    "Middle Eastern": ["shawarma", "mezze", "knafeh", "mansaf", "freekeh"],
    "African":        ["jollof rice", "suya", "egusi soup", "injera", "bunny chow"],
    "Fusion":         ["fusion tasting menu", "pan-Asian", "Nikkei", "Peruvian-Japanese", "modern bistro"],
}
