"""Construit un salon PilePoil dans Blender à partir d'un JSON et l'exporte en .glb.

Usage (sans interface) :
    blender --background --factory-startup --python build_salon.py -- scene.json sortie.glb [rendu.png]

Unités : le JSON est en centimètres, Blender travaille en mètres.
Axes : x = largeur de la pièce (ouest -> est), y = longueur (sud -> nord), z = hauteur.
Les produits sans dimensions complètes reçoivent une taille par défaut et sont
marqués "approximatif" dans le rapport.
"""

import json
import sys
import time

import bpy

# ---------------------------------------------------------------- utilitaires

DEFAULTS_CM = {  # utilisé seulement si l'agent n'a pas trouvé la dimension
    "luminaire": {"width_cm": 35, "depth_cm": 35},
    "coussin": {"height_cm": 15},
    "tapis": {"height_cm": 1},
}
WALL_THICKNESS = 0.10  # m


def hex_to_rgba(hex_color, alpha=1.0):
    h = (hex_color or "#999999").lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (r ** 2.2, g ** 2.2, b ** 2.2, alpha)  # sRGB -> linéaire


def material(name, hex_color, roughness=0.8):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_to_rgba(hex_color)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def box(name, size_m, center_m, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center_m)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size_m
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    return obj


def cylinder(name, radius_m, height_m, center_m, mat):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius_m, depth=height_m, location=center_m, vertices=32)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


# ---------------------------------------------------------------- pièce

def build_room(room):
    W, L, H = room["width_cm"] / 100, room["length_cm"] / 100, room["height_cm"] / 100
    wall_mat = material("Murs", room.get("wall_color_hex", "#EEEEEE"))
    floor_mat = material("Sol", room.get("floor_color_hex", "#B08860"))

    box("Sol", (W, L, 0.02), (W / 2, L / 2, -0.01), floor_mat)
    t = WALL_THICKNESS
    walls = {
        "south": ((W + 2 * t, t, H), (W / 2, -t / 2, H / 2)),
        "north": ((W + 2 * t, t, H), (W / 2, L + t / 2, H / 2)),
        "west": ((t, L, H), (-t / 2, L / 2, H / 2)),
        "east": ((t, L, H), (W + t / 2, L / 2, H / 2)),
    }
    objs = {k: box(f"Mur_{k}", *v, wall_mat) for k, v in walls.items()}

    # Ouvertures (porte, fenêtre) : on creuse le mur avec un booléen.
    for kind in ("door", "window"):
        op = room.get(kind)
        if not op:
            continue
        w, h = op["width_cm"] / 100, op["height_cm"] / 100
        z0 = op.get("sill_cm", 0) / 100
        off = op["offset_cm"] / 100
        wall = op["wall"]
        if wall in ("south", "north"):
            y = -t / 2 if wall == "south" else L + t / 2
            center, size = (off + w / 2, y, z0 + h / 2), (w, t * 3, h)
        else:
            x = -t / 2 if wall == "west" else W + t / 2
            center, size = (x, off + w / 2, z0 + h / 2), (t * 3, w, h)
        cutter = box(f"Trou_{kind}", size, center, wall_mat)
        mod = objs[wall].modifiers.new(f"Ouverture_{kind}", "BOOLEAN")
        mod.operation, mod.object = "DIFFERENCE", cutter
        bpy.context.view_layer.objects.active = objs[wall]
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    return W, L, H


# ---------------------------------------------------------------- placement

def dims_m(p):
    """Dimensions en mètres + liste des valeurs devinées."""
    d = dict(p)
    guessed = []
    for k, v in DEFAULTS_CM.get(p["category"], {}).items():
        if d.get(k) is None:
            d[k] = v
            guessed.append(k)
    if d.get("diameter_cm"):
        d["width_cm"] = d["depth_cm"] = d["diameter_cm"]
    missing = [k for k in ("width_cm", "depth_cm", "height_cm") if d.get(k) is None]
    if missing:
        return None, guessed, missing
    return (d["width_cm"] / 100, d["depth_cm"] / 100, d["height_cm"] / 100), guessed, []


def place(p, size, W, L):
    """Règles simples de placement pour un salon (prototype)."""
    w, dpt, h = size
    cat = p["category"]
    if cat == "canape":  # contre le mur ouest, face à l'est
        return (dpt / 2 + 0.02, L / 2, h / 2), 90
    if cat == "tapis":
        return (0.50 + dpt / 2, L / 2, h / 2), 90  # tourné : son côté court part de 50 cm du mur
    if cat == "table_basse":
        return (0.93 + 0.45 + dpt / 2, L / 2, h / 2), 90
    if cat == "luminaire":  # coin nord-ouest
        return (0.30, L - 0.30, h / 2), 0
    return (W / 2, L / 2, h / 2), 0


def import_model(path, footprint, center, name):
    """Importe un .glb produit, le tourne pour que sa longueur suive l'axe y
    (canapé contre le mur ouest), puis le met exactement aux dimensions réelles."""
    import mathutils
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in set(bpy.data.objects) - before if o.type == "MESH"]
    # Applique toutes les transformations dans les sommets (évite les pivots surprises).
    for o in meshes:
        o.data.transform(o.matrix_world)
        o.matrix_world = mathutils.Matrix.Identity(4)
    for o in set(bpy.data.objects) - before:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name

    def bounds():
        vs = [v.co for v in obj.data.vertices]
        return [min(v[i] for v in vs) for i in range(3)], [max(v[i] for v in vs) for i in range(3)]

    mn, mx = bounds()
    if (mx[0] - mn[0]) > (mx[1] - mn[1]):  # longueur sur x -> quart de tour (face avant -y -> +x)
        obj.data.transform(mathutils.Matrix.Rotation(1.5707963, 4, "Z"))
        mn, mx = bounds()
    sx, sy, sz = (footprint[i] / (mx[i] - mn[i]) for i in range(3))
    c = [(mn[i] + mx[i]) / 2 for i in range(3)]
    obj.data.transform(mathutils.Matrix.Translation((-c[0], -c[1], -c[2])))
    obj.data.transform(mathutils.Matrix.Diagonal((sx, sy, sz, 1)))
    obj.data.transform(mathutils.Matrix.Translation(center))
    return obj, (round(sx, 3), round(sy, 3), round(sz, 3))


def build_products(products, W, L):
    report = []
    for i, p in enumerate(products):
        size, guessed, missing = dims_m(p)
        entry = {"name": p["name"], "category": p["category"]}
        if size is None:
            entry.update(status="ignoré", missing=missing)
            report.append(entry)
            continue
        center, rot = place(p, size, W, L)
        mat = material(f"Mat_{i}", p.get("color_hex", "#888888"))
        footprint = (size[1], size[0], size[2]) if rot in (90, 270) else size
        if p.get("model_glb"):
            obj, scale = import_model(p["model_glb"], footprint, center, f"P{i}_{p['category']}")
            entry["model"] = {"file": p["model_glb"], "scale_xyz": scale}
        elif p["category"] == "luminaire":
            obj = cylinder(f"P{i}_{p['category']}", size[0] / 2, size[2], center, mat)
        else:
            # Quart de tour = on échange largeur et profondeur (pas de rotation
            # d'objet : sous Blender 5.3 elle pivotait autour du coin de la pièce).
            footprint = (size[1], size[0], size[2]) if rot in (90, 270) else size
            obj = box(f"P{i}_{p['category']}", footprint, center, mat)
        obj["pilepoil_name"] = p["name"]
        obj["pilepoil_url"] = p.get("url") or ""
        obj["pilepoil_price_eur"] = p.get("price_eur") or 0
        entry.update(status="approximatif" if guessed else "ok", guessed=guessed)
        report.append(entry)
    return report


# ---------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    scene_path, glb_path = argv[0], argv[1]
    png_path = argv[2] if len(argv) > 2 else None
    t0 = time.time()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = json.load(open(scene_path, encoding="utf-8"))
    W, L, H = build_room(scene["room"])
    report = build_products(scene["products"], W, L)

    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", export_extras=True, export_apply=True)
    t_glb = time.time() - t0

    t_png = None
    if png_path:
        t1 = time.time()
        sc = bpy.context.scene
        sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
        sc.render.resolution_x, sc.render.resolution_y = 1280, 720
        sc.render.filepath = png_path
        # Vue « maison de poupée » : caméra en hauteur côté sud-est,
        # murs sud et est masqués au rendu (ils restent dans le .glb).
        for wall in ("Mur_south", "Mur_east"):
            bpy.data.objects[wall].hide_render = True
        bpy.ops.object.empty_add(location=(W / 2, L / 2, 0.4))
        target = bpy.context.active_object
        bpy.ops.object.camera_add(location=(W * 1.35, -L * 0.55, 4.8))
        cam = bpy.context.active_object
        track = cam.constraints.new("TRACK_TO")
        track.target, track.track_axis, track.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
        cam.data.lens = 24
        sc.camera = cam
        bpy.ops.object.light_add(type="SUN", location=(0, 0, 10), rotation=(0.6, 0.2, 0.8))
        bpy.context.active_object.data.energy = 3.0
        bpy.ops.object.light_add(type="AREA", location=(W / 2, L / 2, H - 0.05))
        bpy.context.active_object.data.energy = 400
        bpy.context.active_object.data.size = 2.0
        world = bpy.data.worlds.new("Monde")
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
        sc.world = world
        bpy.ops.render.render(write_still=True)
        t_png = time.time() - t1

    print("PILEPOIL_REPORT " + json.dumps({
        "glb": glb_path, "glb_seconds": round(t_glb, 2),
        "png": png_path, "png_seconds": round(t_png, 2) if t_png else None,
        "products": report,
    }, ensure_ascii=False))


main()
