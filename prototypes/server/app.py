"""Serveur local Nester : sert la maquette et lance le parcours complet.

    python3 prototypes/server/app.py        puis ouvrir http://127.0.0.1:8770/

POST /api/projects        {room:{width_cm,length_cm,height_cm,door_cm}, style, budget_eur, text, wants}
GET  /api/projects/<id>   avancement puis résultat (produits, total, URL du .glb)
"""
import json, os, re, threading, uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import pipeline

MAQUETTE = os.path.join(pipeline.ROOT, "maquette")
JOBS = {}


def number(v, lo, hi, name):
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise ValueError(f"{name} : nombre attendu")
    if not lo <= v <= hi:
        raise ValueError(f"{name} : valeur attendue entre {lo} et {hi}")
    return v


def validate(body):
    room = body.get("room") or {}
    return {"room": {"width_cm": number(room.get("width_cm"), 200, 1000, "largeur"),
                     "length_cm": number(room.get("length_cm"), 200, 1000, "longueur"),
                     "height_cm": number(room.get("height_cm"), 200, 400, "hauteur"),
                     "door_cm": number(room.get("door_cm"), 60, 200, "porte")},
            "style": str(body.get("style") or "Scandinave")[:30],
            "budget_eur": number(body.get("budget_eur"), 100, 20000, "budget"),
            "text": str(body.get("text") or "")[:600],
            "wants": {k: bool((body.get("wants") or {}).get(k, True)) for k in ("meubles", "deco", "peinture")}}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=MAQUETTE, **kw)

    def translate_path(self, path):
        m = re.fullmatch(r"/out/([0-9a-f]{12})/salon\.glb", path.split("?")[0])
        if m:  # seuls les salons générés sont servis hors de la maquette
            return os.path.join(pipeline.OUT, m.group(1), "salon.glb")
        return super().translate_path(path)

    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        m = re.fullmatch(r"/api/projects/([0-9a-f]{12})", self.path)
        if m:
            job = JOBS.get(m.group(1))
            if not job:  # serveur relancé : on relit le résultat enregistré
                saved = os.path.join(pipeline.OUT, m.group(1), "project.json")
                if os.path.exists(saved):
                    return self.send_json(200, dict(json.load(open(saved, encoding="utf-8")), status="done"))
                return self.send_json(404, {"error": "projet inconnu"})
            return self.send_json(200, {k: v for k, v in job.items() if k != "report"})
        if self.path.startswith("/api/"):
            return self.send_json(404, {"error": "adresse inconnue"})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/projects":
            return self.send_json(404, {"error": "adresse inconnue"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 20000:
                raise ValueError("demande trop longue")
            req = validate(json.loads(self.rfile.read(length) or b"{}"))
        except (ValueError, json.JSONDecodeError) as e:
            return self.send_json(400, {"error": str(e)})
        job = {"id": uuid.uuid4().hex[:12], "status": "running", "request": req,
               "steps": {k: {"status": "pending"} for k in ("criteria", "catalog", "paint", "build")}}
        JOBS[job["id"]] = job
        threading.Thread(target=pipeline.run, args=(job,), daemon=True).start()
        self.send_json(202, {"id": job["id"]})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8770))
    print(f"Nester : http://127.0.0.1:{port}/", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
