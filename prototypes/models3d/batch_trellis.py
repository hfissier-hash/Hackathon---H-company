"""Génère les modèles 3D d'une sélection de produits avec TRELLIS (Space Hugging Face).

Usage : python batch_trellis.py demo_selection.json
Pour chaque produit {id, image_url} : télécharge la photo dans input/ (non versionné),
écrit out/catalog/<id>.glb et une ligne de mesure dans out/catalog/report.jsonl.
Reprise : un modèle déjà présent n'est pas régénéré.
"""
import json, os, shutil, subprocess, sys, time
from gradio_client import Client, handle_file

HERE = os.path.dirname(os.path.abspath(__file__))
IN, OUT = os.path.join(HERE, "input"), os.path.join(HERE, "out", "catalog")
os.makedirs(IN, exist_ok=True); os.makedirs(OUT, exist_ok=True)
tok = open(os.path.expanduser("~/.cache/huggingface/token")).read().strip()
client = None


def generate(img):
    global client
    if client is None:
        client = Client("trellis-community/TRELLIS", token=tok, verbose=False)
        try: client.predict(api_name="/start_session")
        except Exception: pass
    r = client.predict(handle_file(img), [], 0, 7.5, 12, 3.0, 12, "stochastic", 0.95, 1024, api_name="/generate_and_extract_glb")
    path = r[2] if not isinstance(r[2], dict) or r[2].get("value") else r[1]
    return path.get("value") or path.get("path") if isinstance(path, dict) else path


for p in json.load(open(sys.argv[1], encoding="utf-8")):
    dst = os.path.join(OUT, f"{p['id']}.glb")
    if os.path.exists(dst):
        continue
    img = os.path.join(IN, f"{p['id']}.jpg")
    t, row = time.time(), {"id": p["id"], "name": p["name"]}
    try:
        if not os.path.exists(img):
            subprocess.run(["curl", "-sSfL", "--max-time", "60", "-o", img, p["image_url"]], check=True)
        shutil.copy(generate(img), dst)
        row.update(outcome="success", size_kb=os.path.getsize(dst) // 1024)
    except Exception as e:
        client = None  # nouvelle session au prochain produit
        row.update(outcome="failed", error=f"{type(e).__name__}: {str(e)[:200]}")
    row["duration_s"] = round(time.time() - t, 1)
    print(json.dumps(row, ensure_ascii=False), flush=True)
    open(os.path.join(OUT, "report.jsonl"), "a", encoding="utf-8").write(json.dumps(row, ensure_ascii=False) + "\n")
