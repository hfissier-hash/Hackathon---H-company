"""Worker Nester : surveille la table `requests` (Supabase) et traite les demandes de l'application.

    python3 worker/worker.py

kind = project     nouvelle demande de salon
kind = replace     remplacer le produit d'une catégorie dans un projet (parent_id)
kind = understand  ce que l'IA a compris d'un texte (écran Envies)
"""
import json, os, threading, time, traceback
import pipeline

POLL_SECONDS = 0.7


def patch(request_id, fields):
    pipeline.admin(f"requests?id=eq.{request_id}", dict(fields, updated_at="now()"), method="PATCH")


def claim():
    """Prend la plus ancienne demande en attente. Le filtre sur `status` rend la prise atomique."""
    rows = pipeline.admin("requests?status=eq.queued&order=created_at&limit=1&select=id")
    if not rows:
        return None
    got = pipeline.admin(f"requests?id=eq.{rows[0]['id']}&status=eq.queued", {"status": "running", "updated_at": "now()"},
                         method="PATCH", prefer="return=representation")
    return got[0] if got else None


def result_of(job):
    return {k: job[k] for k in pipeline.RESULT if k in job}


def do_project(row):
    job = {"id": row["id"], "status": "running", "request": row["payload"],
           "steps": {k: {"status": "pending"} for k in ("criteria", "catalog", "paint", "build")}}
    pipeline.run(job, lambda: patch(row["id"], {"steps": job["steps"], "result": result_of(job)}))
    patch(row["id"], {"status": job["status"], "steps": job["steps"], "result": result_of(job), "error": job.get("error")})
    if job["status"] == "done":
        # Le salon est livré ; les agents H vérifient les prix en arrière-plan, sans bloquer les demandes suivantes.
        threading.Thread(target=safe_verify, args=(row["id"],), daemon=True).start()
    return job["status"], job.get("seconds")


LOCKS = {}  # un verrou par projet : remplacement et régénération 3D ne réécrivent pas le salon en même temps


def lock_of(project_id):
    return LOCKS.setdefault(project_id, threading.Lock())


def safe_verify(request_id):
    try:
        pipeline.verify(request_id)
        print(f"verify     {request_id[:8]} terminé", flush=True)
    except Exception:
        traceback.print_exc()
    if os.environ.get("NESTER_3D_ON_DEMAND", "1") != "0":
        try:
            pipeline.models_on_demand(request_id, lock_of(request_id))
            print(f"modèles 3D {request_id[:8]} terminé", flush=True)
        except Exception:
            traceback.print_exc()


def do_replace(row):
    parent = pipeline.admin(f"requests?id=eq.{row['parent_id']}&select=id,payload,result,status")
    if not parent or parent[0]["status"] != "done":
        raise ValueError("projet introuvable ou pas encore prêt")
    with lock_of(parent[0]["id"]):
        parent = pipeline.admin(f"requests?id=eq.{row['parent_id']}&select=id,payload,result,status")
        job = dict(parent[0]["result"], id=parent[0]["id"], request=parent[0]["payload"])
        pipeline.replace(job, str(row["payload"].get("category")), str(row["payload"].get("wish") or ""))
        patch(parent[0]["id"], {"result": result_of(job)})
    patch(row["id"], {"status": "done"})
    return "done", None


def do_understand(row):
    crit = pipeline.criteria(row["payload"])
    patch(row["id"], {"status": "done", "result": {"understood": crit["understood"], "llm": crit.get("llm", False)}})
    return "done", None


HANDLERS = {"project": do_project, "replace": do_replace, "understand": do_understand}

if __name__ == "__main__":
    pipeline.secret()  # échoue tout de suite si la clé n'est pas la bonne
    try:
        pipeline.admin("bucket", {"id": "salons", "name": "salons", "public": True}, api="/storage/v1/")
        print("Stockage : dossier « salons » créé", flush=True)
    except RuntimeError:
        pass  # il existe déjà
    print("Worker Nester en attente de demandes…", flush=True)
    while True:
        try:
            row = claim()
        except Exception as e:
            print("Supabase injoignable :", str(e)[:120], flush=True)
            time.sleep(5)
            continue
        if not row:
            time.sleep(POLL_SECONDS)
            continue
        t0 = time.time()
        try:
            status, seconds = HANDLERS[row["kind"]](row)
        except Exception as e:
            status, seconds = "failed", None
            traceback.print_exc()
            try:
                patch(row["id"], {"status": "failed", "error": str(e)[:300]})
            except Exception:
                pass
        print(f"{row['kind']:10} {row['id'][:8]} {status} en {seconds or round(time.time() - t0, 1)} s", flush=True)
