"""Agent H Company lancé en direct quand le catalogue ne suffit pas.

L'agent (h/web-scraper-flash, via la commande `holo` déjà connectée sur cette machine) cherche un produit
sur ikea.com et renvoie une fiche JSON. La fiche est vérifiée, ajoutée au catalogue (`products`),
classée par gpt-oss-120b (`product_tags`) et le lancement est mesuré dans `agent_runs`.
"""
import json, os, re, subprocess, sys, time, urllib.parse
import pipeline

sys.path.insert(0, os.path.join(pipeline.ROOT, "prototypes", "ai"))
AGENT = "h/web-scraper-flash"
NOUNS = {"canape": "canapé", "fauteuil": "fauteuil", "table_basse": "table basse", "tapis": "tapis", "luminaire": "lampadaire",
         "meuble_tv": "meuble TV", "etagere": "étagère", "miroir": "miroir", "cadre": "cadre", "plante": "plante artificielle",
         "rideau": "rideau", "suspension": "suspension"}
SUBCATEGORY = {"canape": "canapes-droits", "fauteuil": "fauteuils", "table_basse": "tables-basses", "tapis": "tapis",
               "luminaire": "lampadaires", "meuble_tv": "meubles-tv", "etagere": "etageres-bibliotheques", "miroir": "miroirs",
               "cadre": "cadres-tableaux", "plante": "plantes-cache-pots", "rideau": "rideaux", "suspension": "suspensions"}
URL_OK = re.compile(r"https://www\.ikea\.com/fr/fr/p/[a-z0-9-]+/?")


def number(v, lo, hi):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi else None


def clean_wish(wish):
    """Les mots de Léa partent dans une consigne d'agent : on ne garde que lettres, chiffres et espaces."""
    return re.sub(r"\s+", " ", re.sub(r"[^0-9A-Za-zÀ-ÿ' -]", " ", str(wish or ""))).strip()[:80]


def task(category, limits, max_price, wish=""):
    w, d = limits.get("p_max_width_cm"), limits.get("p_max_depth_cm")
    size = f" de {int(w)} x {int(d)} cm maximum" if w and d else ""
    wish = clean_wish(wish)
    words = " ".join(x for x in wish.split() if len(x) > 2)  # « en velours vert » -> « velours vert »
    query = urllib.parse.quote(NOUNS[category] + (f" {words}" if words else f" {int(w)}x{int(d)}" if category == "tapis" and w and d else ""))
    wanted = f" qui correspond à cette envie : « {wish} »," if wish else ""
    # Consigne directe (premier résultat conforme, pas de comparaison) : 4 fois plus rapide à l'essai.
    return (f"Sur le site IKEA France, ouvre https://www.ikea.com/fr/fr/search/?q={query} . Dans les résultats, prends le premier "
            f"{NOUNS[category]}{size}{wanted} à moins de {int(max_price)} euros. Ne compare pas plusieurs produits. "
            "Ouvre sa fiche produit et lis l'onglet Dimensions. "
            'Réponds uniquement avec un objet JSON : {"url": adresse de la fiche, "name": nom complet, "price_eur": nombre, '
            '"width_cm": largeur en cm, "depth_cm": profondeur ou longueur en cm, "height_cm": hauteur en cm ou null, '
            '"color": texte, "material": texte ou null, "image_url": adresse de la photo du produit seul, '
            '"packages": [{"width_cm": nombre, "height_cm": nombre, "length_cm": nombre, "weight_kg": nombre}]}. '
            "N'invente aucune valeur : mets null si elle n'est pas sur la page.")


def parse(answer, category, limits, max_price):
    """Fiche vérifiée au format de la table `products`, ou une erreur lisible."""
    m = re.search(r"\{.*\}", answer or "", re.S)
    if not m:
        raise ValueError("réponse sans JSON")
    a = json.loads(m.group(0))
    url = str(a.get("url") or "")
    if not URL_OK.fullmatch(url):
        raise ValueError("adresse de fiche inattendue")
    price, w, d = number(a.get("price_eur"), 0.5, 5000), number(a.get("width_cm"), 5, 500), number(a.get("depth_cm"), 5, 500)
    h = number(a.get("height_cm"), 0.2, 400)
    image = str(a.get("image_url") or "")
    if price is None or w is None or d is None or not image.startswith("https://www.ikea.com/"):
        raise ValueError("prix, dimensions ou photo manquants")
    if category == "tapis":
        w, d = min(w, d), max(w, d)
    if price > max_price or (limits.get("p_max_width_cm") and w > limits["p_max_width_cm"]) \
            or (limits.get("p_max_depth_cm") and d > limits["p_max_depth_cm"]):
        raise ValueError("produit hors budget ou trop grand")
    if category not in ("tapis",) and h is None:
        raise ValueError("hauteur manquante")
    packages = [{"largeur_cm": number(p.get("width_cm"), 0.5, 400), "hauteur_cm": number(p.get("height_cm"), 0.5, 400),
                 "longueur_cm": number(p.get("length_cm"), 0.5, 400), "poids_kg": number(p.get("weight_kg"), 0.01, 300)}
                for p in (a.get("packages") or []) if isinstance(p, dict)][:8]
    dims = {"largeur_cm": w, "profondeur_cm": d, **({"hauteur_cm": h} if h is not None else {}), **({"colis": packages} if packages else {})}
    return {"source_site": "ikea.com", "source_url": url if url.endswith("/") else url + "/",
            "category": "meuble" if category in pipeline.MEUBLES else "déco", "brand": "IKEA",
            "name": str(a.get("name") or "")[:200], "price": price, "currency": "EUR", "image_url": image, "dimensions": dims,
            "attributes": {"sous_categorie_nestr": SUBCATEGORY[category], "couleur": str(a.get("color") or "")[:80] or None,
                           "matiere": str(a.get("material") or "")[:120] or None, "images": [image], "source": "agent_live"}}


def log_run(request_id, kind, prompt, seconds, outcome, found, error):
    try:
        pipeline.admin("agent_runs", {"request_id": request_id, "retailer": "ikea", "agent": AGENT, "task_kind": kind,
                                      "query": prompt[:300], "duration_s": seconds, "outcome": outcome,
                                      "products_found": found, "error": error})
    except Exception:
        pass  # la mesure ne doit jamais faire échouer la demande


def holo(prompt, max_time):
    r = subprocess.run(["holo", "run", "-a", AGENT, "--json", "--max-time", str(max_time), prompt],
                       capture_output=True, text=True, timeout=max_time + 60)
    out = json.loads(r.stdout[r.stdout.index("{"):])
    if out.get("outcome") != "success":
        raise ValueError(str(out.get("error") or out.get("outcome"))[:150])
    return out.get("answer") or ""


def check_price(product, request_id):
    """Un agent rouvre la fiche de l'enseigne et relève le prix et la disponibilité du moment."""
    t0 = time.time()
    prompt = (f"Ouvre la fiche produit {product['url']} sur le site IKEA France. Relève le prix actuel affiché et indique si le produit "
              "est disponible à la vente en ligne. Réponds uniquement avec un objet JSON : "
              '{"price_eur": nombre, "available": true, false, ou null si la page ne le dit pas}. N\'invente aucune valeur.')
    live, outcome, error = None, "failed", None
    try:
        a = json.loads(re.search(r"\{.*\}", holo(prompt, 120), re.S).group(0))
        price = number(a.get("price_eur"), 0.5, 5000)
        if price is None:
            raise ValueError("prix illisible")
        unit = product.get("unit_price_eur", product["price_eur"])
        live = {"price_eur": price, "available": a.get("available") if isinstance(a.get("available"), bool) else None,
                "checked_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "changed": abs(price - unit) > 0.01}
        outcome = "success"
    except Exception as e:
        error = f"{type(e).__name__}: {str(e)[:200]}"
    log_run(request_id, "verify", prompt, round(time.time() - t0, 1), outcome, 1 if live else 0, error)
    return live


def search(category, limits, max_price, crit, request_id, wish=""):
    t0, prompt = time.time(), task(category, limits, max_price, wish)
    outcome, error, product = "failed", None, None
    try:
        row = parse(holo(prompt, 180), category, limits, max_price)
        saved = pipeline.admin("products?on_conflict=source_url", row, prefer="resolution=merge-duplicates,return=representation")[0]
        tag(saved, row, category, crit)
        outcome, product = "success", saved
    except Exception as e:
        error = f"{type(e).__name__}: {str(e)[:200]}"
    seconds = round(time.time() - t0, 1)
    log_run(request_id, "search", prompt, seconds, outcome, 1 if product else 0, error)
    detail = (f"Agent H · {product['name'].split(',')[0]} trouvé sur ikea.com" if product
              else f"Agent H · aucun {NOUNS[category]} conforme ({error})")
    return {"product": product, "seconds": seconds, "detail": detail[:160]}


def tag(saved, row, category, crit):
    """Style et couleur par gpt-oss-120b ; à défaut, le produit reste cherchable sans étiquette."""
    styles, color = [], None
    try:
        from tag_products import classify, STYLES, COLORS
        i = classify([{"url": row["source_url"], "category": category, "name": row["name"],
                       "color": row["attributes"]["couleur"], "material": row["attributes"]["matiere"]}])[0]
        styles = [s for s in i.get("style_tags", []) if s in STYLES][:3]
        color = i.get("color_family") if i.get("color_family") in COLORS else None
    except Exception:
        pass
    pipeline.admin("product_tags?on_conflict=product_id", {"product_id": saved["id"], "style_tags": styles, "color_family": color},
                   prefer="resolution=merge-duplicates")
