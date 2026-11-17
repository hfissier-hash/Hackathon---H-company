"""Test : photo produit -> modèle 3D via des Spaces Hugging Face (gradio)."""
import os, shutil, sys, time
from gradio_client import Client, handle_file
img, out_dir = sys.argv[1], sys.argv[2]
tok = open(os.path.expanduser("~/.cache/huggingface/token")).read().strip()
os.makedirs(out_dir, exist_ok=True)

def run(name, fn):
    t = time.time()
    try:
        path = fn()
        if isinstance(path, dict):
            path = path.get("value") or path.get("path") or path.get("name")
        dst = os.path.join(out_dir, name + os.path.splitext(path)[1])
        shutil.copy(path, dst)
        print(f"OK   {name:18} {time.time()-t:6.1f}s  {os.path.getsize(dst)//1024} Ko  {dst}")
    except Exception as e:
        print(f"FAIL {name:18} {time.time()-t:6.1f}s  {type(e).__name__}: {str(e)[:300]}")

if len(sys.argv) <= 3: run("stable_fast_3d", lambda: Client("stabilityai/stable-fast-3d", token=tok, verbose=False)
    .predict(handle_file(img), 0.85, "None", -1, 1024, api_name="/run_button")[1])
if len(sys.argv) <= 3: run("hunyuan3d_2", lambda: Client("tencent/Hunyuan3D-2", token=tok, verbose=False)
    .predict(None, handle_file(img), None, None, None, None, 30, 5.0, 1234, 256, True, 8000, False, api_name="/generation_all")[1])

if len(sys.argv) > 3 and sys.argv[3] == "more":
    run("hunyuan3d_2_shape", lambda: Client("tencent/Hunyuan3D-2", token=tok, verbose=False)
        .predict(None, handle_file(img), None, None, None, None, 30, 5.0, 1234, 256, True, 8000, False, api_name="/shape_generation")[0])
    run("sf3d_simple", lambda: Client("stabilityai/stable-fast-3d", token=tok, verbose=False)
        .predict(handle_file(img), 0.85, api_name="/requires_bg_remove")[1])

if len(sys.argv) > 3 and sys.argv[3] == "trellis":
    def trellis():
        c = Client("trellis-community/TRELLIS", token=tok, verbose=False)
        try: c.predict(api_name="/start_session")
        except Exception: pass
        r = c.predict(handle_file(img), [], 0, 7.5, 12, 3.0, 12, "stochastic", 0.95, 1024, api_name="/generate_and_extract_glb")
        return r[2] if not isinstance(r[2], dict) or r[2].get("value") else r[1]
    run("trellis", trellis)
