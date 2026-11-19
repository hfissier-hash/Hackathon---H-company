"""Un modèle 3D pour un produit, à partir de sa photo (Space Hugging Face TRELLIS).

Usage : python gen3d.py <id produit> <adresse de la photo>
Écrit out/catalog/<id>.glb. Appelé par le worker pour générer un modèle à la demande.
"""
import os, shutil, subprocess, sys
from gradio_client import Client, handle_file

HERE = os.path.dirname(os.path.abspath(__file__))
IN, OUT = os.path.join(HERE, "input"), os.path.join(HERE, "out", "catalog")


def trellis(img):
    tok = open(os.path.expanduser("~/.cache/huggingface/token")).read().strip()
    client = Client("trellis-community/TRELLIS", token=tok, verbose=False)
    try:
        client.predict(api_name="/start_session")
    except Exception:
        pass
    r = client.predict(handle_file(img), [], 0, 7.5, 12, 3.0, 12, "stochastic", 0.95, 1024, api_name="/generate_and_extract_glb")
    path = r[2] if not isinstance(r[2], dict) or r[2].get("value") else r[1]
    return path.get("value") or path.get("path") if isinstance(path, dict) else path


if __name__ == "__main__":
    pid, url = str(int(sys.argv[1])), sys.argv[2]
    if not url.startswith("https://www.ikea.com/"):
        sys.exit("photo refusée : seules les photos ikea.com sont acceptées")
    os.makedirs(IN, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    img, dst = os.path.join(IN, pid + ".jpg"), os.path.join(OUT, pid + ".glb")
    if not os.path.exists(img):
        subprocess.run(["curl", "-sSfL", "--max-time", "60", "-o", img, url], check=True)
    tmp = dst + ".part"
    shutil.copy(trellis(img), tmp)
    os.replace(tmp, dst)  # le fichier n'apparaît qu'une fois complet
    print("OK", dst)
