"""Agent H Company lancé en direct quand le catalogue ne suffit pas.

L'agent (h/web-scraper-flash, via la commande `holo` déjà connectée sur cette machine) cherche un produit
sur ikea.com et renvoie une fiche JSON. La fiche est vérifiée, ajoutée au catalogue (`products`),
classée par gpt-oss-120b (`product_tags`) et le lancement est mesuré dans `agent_runs`.
"""
import json, os, re, subprocess, sys, time, urllib.parse
import pipeline

sys.path.insert(0, os.path.join(pipeline.ROOT, "prototypes", "ai"))
AGENT = "h/web-scraper-flash"
NOUNS = {"canape": "canapé", "fauteuil": "fauteuil", "table_basse": "table basse", "tapis": "tapis", "luminaire": "lampadaire"}
SUBCATEGORY = {"canape": "canapes-droits", "fauteuil": "fauteuils", "table_basse": "tables-basses", "tapis": "tapis",
               "luminaire": "lampadaires"}
URL_OK = re.compile(r"https://www\.ikea\.com/fr/fr/p/[a-z0-9-]+/?")


def number(v, lo, hi):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi else None


def task(category, limits, max_price):
    w, d = limits.get("p_max_width_cm"), limits.get("p_max_depth_cm")
    size = f" de {int(w)} x {int(d)} cm maximum" if w and d else ""
    query = urllib.parse.quote(NOUNS[category] + (f" {int(w)}x{int(d)}" if category == "tapis" and w and d else ""))
    return (f"Sur le site IKEA France, ouvre https://www.ikea.com/fr/fr/search/?q={query} et choisis un {NOUNS[category]}{size} "
            f"à moins de {int(max_price)} euros. Ouvre sa fiche produit et lis l'onglet Dimensions. "
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
            "category": "déco" if category in ("tapis", "luminaire") else "meuble", "brand": "IKEA",
            "name": str(a.get("name") or "")[:200], "price": price, "currency": "EUR", "image_url": image, "dimensions": dims,
            "attributes": {"sous_categorie_nestr": SUBCATEGORY[category], "couleur": str(a.get("color") or "")[:80] or None,
                           "matiere": str(a.get("material") or "")[:120] or None, "images": [image], "source": "agent_live"}}


def search(category, limits, max_price, crit, request_id):
    t0, prompt = time.time(), task(category, limits, max_price)
    outcome, error, product = "failed", None, None
    try:
        r = subprocess.run(["holo", "run", "-a", AGENT, "--json", "--max-time", "240", prompt],
                           capture_output=True, text=True, timeout=300)
        out = json.loads(r.stdout[r.stdout.index("{"):])
        if out.get("outcome") != "success":
            raise ValueError(str(out.get("error") or out.get("outcome"))[:150])
        row = parse(out.get("answer"), category, limits, max_price)
        saved = pipeline.admin("products?on_conflict=source_url", row, prefer="resolution=merge-duplicates,return=representation")[0]
        tag(saved, row, category, crit)
        outcome, product = "success", saved
    except Exception as e:
        error = f"{type(e).__name__}: {str(e)[:200]}"
    seconds = round(time.time() - t0, 1)
    try:
        pipeline.admin("agent_runs", {"request_id": request_id, "retailer": "ikea", "agent": AGENT, "task_kind": "search",
                                      "query": prompt[:300], "duration_s": seconds, "outcome": outcome,
                                      "products_found": 1 if product else 0, "error": error})
    except Exception:
        pass  # la mesure ne doit jamais faire échouer la demande
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
