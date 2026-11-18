"""Classe le catalogue Nester (vue `catalog_products`) avec gpt-oss-120b : style, famille de couleur, hors sujet.

Usage : python3 tag_catalog.py sortie.json sortie.sql [missing]   (missing = seulement les produits non classés)
Lit SUPABASE_URL et SUPABASE_ANON_KEY (fichier .env à la racine ou environnement).
Écrit les réponses en JSON et un fichier SQL d'insertion dans `product_tags` (à passer côté serveur).
"""
import json, os, subprocess, sys, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from tag_products import classify, STYLES, COLORS

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
BATCH = 10


def env(name):
    if name in os.environ:
        return os.environ[name]
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"{name} manquant")


def fetch(only_missing=False):
    url = env("SUPABASE_URL") + "/rest/v1/catalog_products?select=id,url,category,name,color,material&order=id"
    if only_missing:
        url += "&color_family=is.null"
    key = env("SUPABASE_ANON_KEY")
    r = subprocess.run(["curl", "-sS", "--max-time", "60", url, "-H", "apikey: " + key], capture_output=True, check=True)
    return json.loads(r.stdout)


def tag_batch(batch):
    """Une relance si la réponse est mal formée ou incomplète ; sinon les produits restent non classés."""
    for _ in range(2):
        try:
            by_url = {i.get("url"): i for i in classify(batch)}
        except Exception:
            continue
        out = []
        for p in batch:
            i = by_url.get(p["url"])
            if not i or i.get("color_family") not in COLORS:
                continue
            styles = [s for s in i.get("style_tags", []) if s in STYLES][:3]
            # La peinture n'est jamais « hors sujet » (erreur constatée au test du 17.11).
            off = bool(i.get("hors_sujet")) and p["category"] != "peinture"
            out.append({"id": p["id"], "name": p["name"], "category": p["category"],
                        "style_tags": styles, "color_family": i["color_family"], "off_topic": off})
        if len(out) == len(batch):
            return out
    return out if "out" in locals() else []


if __name__ == "__main__":
    products = fetch(len(sys.argv) > 3 and sys.argv[3] == "missing")
    t = time.time()
    batches = [products[i:i + BATCH] for i in range(0, len(products), BATCH)]
    with ThreadPoolExecutor(4) as ex:
        tags = [x for b in ex.map(tag_batch, batches) for x in b]
    dt = time.time() - t
    json.dump(tags, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    rows = ", ".join("(%d, array[%s]::text[], '%s', %s)" % (
        x["id"], ", ".join("'%s'" % s for s in x["style_tags"]), x["color_family"], str(x["off_topic"]).lower()) for x in tags)
    open(sys.argv[2], "w", encoding="utf-8").write(
        "insert into public.product_tags (product_id, style_tags, color_family, off_topic) values " + rows +
        " on conflict (product_id) do update set style_tags = excluded.style_tags, color_family = excluded.color_family,"
        " off_topic = excluded.off_topic, tagged_at = now();\n")
    print(f"{len(tags)}/{len(products)} classés en {dt:.0f} s, hors sujet : {sum(x['off_topic'] for x in tags)}")
