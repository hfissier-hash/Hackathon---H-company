"""Construit un salon Nester dans Blender à partir d'un JSON et l'exporte en .glb.

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
# Au-delà de cet écart entre les échelles x, y, z, le modèle 3D ne correspond pas au produit
# (ex. même photo pour deux tailles) : on le remplace par un volume simple.
MAX_DEFORMATION = 0.35


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


def join(parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    # Position et rotation passent dans les sommets : l'objet reste à l'origine, sans pivot surprise.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def settle(obj, center_xy, angle_deg=0.0):
    """Les formes sont dessinées à l'origine, dos vers +y ; on les tourne puis on les pose à leur place."""
    import mathutils
    import math
    obj.data.transform(mathutils.Matrix.Rotation(math.radians(angle_deg), 4, "Z"))
    obj.data.transform(mathutils.Matrix.Translation((center_xy[0], center_xy[1], 0)))
    return obj


def spin(obj, center_xy, angle_deg):
    """Tourne un objet déjà posé autour de son propre centre."""
    import mathutils
    import math
    cx, cy = center_xy
    obj.data.transform(mathutils.Matrix.Translation((-cx, -cy, 0)))
    obj.data.transform(mathutils.Matrix.Rotation(math.radians(angle_deg), 4, "Z"))
    obj.data.transform(mathutils.Matrix.Translation((cx, cy, 0)))


# Formes simples pour les produits sans modèle 3D : largeur sur x, profondeur sur y, dos vers +y, posées au sol.

def seat_shape(name, w, d, h, mat, legs_mat):
    """Canapé ou fauteuil : assise, dossier, accoudoirs, pieds."""
    seat_h, t, arm = min(0.44, h * 0.55), min(0.22, d * 0.26), min(0.16, w * 0.13)
    parts = [box(name, (w, d, seat_h - 0.08), (0, 0, 0.08 + (seat_h - 0.08) / 2), mat),
             box(name + "_dossier", (w, t, h - 0.08), (0, d / 2 - t / 2, 0.08 + (h - 0.08) / 2), mat),
             box(name + "_coussin", (w - 2 * arm - 0.04, d - t - 0.06, 0.10), (0, -t / 2, seat_h + 0.04), mat)]
    for sx in (-1, 1):
        parts.append(box(name + "_accoudoir", (arm, d - t, seat_h + 0.16 - 0.08), (sx * (w / 2 - arm / 2), -t / 2, 0.08 + (seat_h + 0.08) / 2), mat))
        for sy in (-1, 1):
            parts.append(box(name + "_pied", (0.05, 0.05, 0.08), (sx * (w / 2 - 0.07), sy * (d / 2 - 0.07), 0.04), legs_mat))
    return join(parts, name)


def table_shape(name, w, d, h, mat, legs_mat, round_top=False):
    if round_top:
        return join([cylinder(name, w / 2, 0.04, (0, 0, h - 0.02), mat), cylinder(name + "_pied", 0.04, h - 0.06, (0, 0, (h - 0.06) / 2 + 0.02), legs_mat),
                     cylinder(name + "_socle", w * 0.28, 0.02, (0, 0, 0.01), legs_mat)], name)
    parts = [box(name, (w, d, 0.04), (0, 0, h - 0.02), mat)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(name + "_pied", (0.04, 0.04, h - 0.04), (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), (h - 0.04) / 2), legs_mat))
    return join(parts, name)


def cabinet_shape(name, w, d, h, mat, legs_mat):
    """Meuble TV : caisson sur socle, plateau débordant."""
    return join([box(name, (w, d, h - 0.08), (0, 0, 0.06 + (h - 0.08) / 2), mat), box(name + "_socle", (w - 0.10, d - 0.08, 0.06), (0, 0, 0.03), legs_mat),
                 box(name + "_plateau", (w + 0.02, d + 0.02, 0.02), (0, -0.005, h - 0.01), mat)], name)


def shelf_shape(name, w, d, h, mat):
    """Étagère ou bibliothèque : montants, fond et tablettes tous les 35 cm environ."""
    t = 0.02
    parts = [box(name, (t, d, h), (-w / 2 + t / 2, 0, h / 2), mat), box(name + "_montant", (t, d, h), (w / 2 - t / 2, 0, h / 2), mat),
             box(name + "_fond", (w, 0.008, h), (0, d / 2 - 0.004, h / 2), mat)]
    levels = max(2, round(h / 0.35) + 1)
    for i in range(levels):
        parts.append(box(name + "_tablette", (w - 2 * t, d, t), (0, 0, t / 2 + i * (h - t) / (levels - 1)), mat))
    return join(parts, name)


def plant_shape(name, h, radius, pot_mat, leaf_mat):
    pot_h, r = min(0.30, h * 0.28), min(max(radius, 0.08), 0.20)
    parts = [cylinder(name, r, pot_h, (0, 0, pot_h / 2), pot_mat)]
    leaf = max(0.10, min(0.32, (h - pot_h) * 0.38))
    for dx, dy, dz, k in ((0, 0, 0.72, 1.0), (0.09, 0.04, 0.45, 0.8), (-0.08, 0.06, 0.55, 0.75), (0.02, -0.09, 0.33, 0.7)):
        bpy.ops.mesh.primitive_ico_sphere_add(radius=leaf * k, subdivisions=2, location=(dx, dy, pot_h + (h - pot_h) * dz))
        o = bpy.context.active_object
        o.data.materials.append(leaf_mat)
        parts.append(o)
    return join(parts, name)


def wall_piece(name, w, h, z_center, mat, image_path=None, round_shape=False):
    """Miroir ou cadre : plaque fine dos vers +y. Avec une image, la photo du produit est posée sur la face avant."""
    if round_shape:
        bpy.ops.mesh.primitive_cylinder_add(radius=w / 2, depth=0.03, vertices=48, location=(0, 0, z_center), rotation=(1.5707963, 0, 0))
        obj = bpy.context.active_object
        obj.data.materials.append(mat)
        return join([obj], name)
    frame = box(name, (w, 0.03, h), (0, 0, z_center), mat)
    if not image_path:
        return join([frame], name)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -0.017, z_center), rotation=(1.5707963, 0, 0))
    face = bpy.context.active_object
    face.scale = (w * 0.94, h * 0.94, 1)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    pic = bpy.data.materials.new(name + "_image")
    pic.use_nodes = True
    tex = pic.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(image_path)
    bsdf = pic.node_tree.nodes.get("Principled BSDF")
    pic.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    face.data.materials.append(pic)
    return join([frame, face], name)


def curtains_shape(name, x0, x1, top, mat):
    """Deux pans de rideau ouverts de part et d'autre de la fenêtre (dessinés directement à leur place)."""
    return [(x0 - 0.20, top), (x1 + 0.20, top)], [box(name + ("" if i == 0 else "_2"), (0.36, 0.07, top - 0.04), (x, 0, 0.04 + (top - 0.04) / 2), mat)
                                                 for i, x in enumerate((x0 - 0.20, x1 + 0.20))]


def pendant_shape(name, radius, ceiling, mat, cord_mat):
    drop, shade_h = 0.45, 0.22
    return join([cylinder(name, min(radius, 0.28), shade_h, (0, 0, ceiling - drop - shade_h / 2), mat),
                 cylinder(name + "_fil", 0.004, drop, (0, 0, ceiling - drop / 2), cord_mat)], name)


def floor_lamp(name, radius_m, height_m, center_m, mat):
    """Lampadaire sans modèle 3D : socle, tige fine et abat-jour (au lieu d'un cylindre plein)."""
    x, y = center_m[0], center_m[1]
    radius_m = min(radius_m, 0.22)  # lampes à arc : la largeur de la fiche inclut le bras
    shade_h = min(0.28, height_m * 0.2)
    return join([cylinder(name, radius_m, shade_h, (x, y, height_m - shade_h / 2), mat),
                 cylinder(name + "_tige", 0.012, height_m - shade_h, (x, y, (height_m - shade_h) / 2), mat),
                 cylinder(name + "_socle", radius_m * 0.8, 0.03, (x, y, 0.015), mat)], name)


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

    accent = room.get("accent_wall")  # mur peint : {"wall": "west", "color_hex": "#..."}
    if accent and accent.get("wall") in objs:
        objs[accent["wall"]].data.materials[0] = material("Mur_accent", accent["color_hex"])

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


def import_model(path, footprint, center, name, back=-1, plain_mat=None):
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
    # Modèle très détaillé (Hunyuan3D : plus de 300 000 faces) : on l'allège pour un fichier rapide à charger.
    if len(obj.data.polygons) > 60000:
        mod = obj.modifiers.new("Allege", "DECIMATE")
        mod.ratio = 60000 / len(obj.data.polygons)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Modèle sans texture (forme seule) : on lui donne la couleur du produit.
    textured = any(m and m.use_nodes and any(n.type == "TEX_IMAGE" for n in m.node_tree.nodes) for m in obj.data.materials)
    if not textured and plain_mat is not None:
        obj.data.materials.clear()
        obj.data.materials.append(plain_mat)
    # TRELLIS exporte ses matériaux en « métal » : un tissu ressort alors noir dans le navigateur.
    for m in obj.data.materials:
        bsdf = m.node_tree.nodes.get("Principled BSDF") if m and m.use_nodes else None
        if bsdf:
            for key, value in (("Metallic", 0.0), ("Roughness", 0.85)):
                for link in list(bsdf.inputs[key].links):
                    m.node_tree.links.remove(link)
                bsdf.inputs[key].default_value = value

    def bounds():
        vs = [v.co for v in obj.data.vertices]
        return [min(v[i] for v in vs) for i in range(3)], [max(v[i] for v in vs) for i in range(3)]

    def coords():
        import numpy as np
        a = np.empty(len(obj.data.vertices) * 3)
        obj.data.vertices.foreach_get("co", a)
        return a.reshape(-1, 3)

    # L'ombre de la photo devient parfois une plaque sous le meuble : on la retire
    # (tranche basse dont l'emprise dépasse nettement celle du reste).
    import bmesh
    import numpy as np
    co = coords()
    z0, zh = co[:, 2].min(), np.ptp(co[:, 2])
    low = co[:, 2] < z0 + 0.03 * zh
    plate_removed = False
    if low.any() and (~low).any():
        emprise = lambda pts: np.ptp(pts[:, 0]) * np.ptp(pts[:, 1])
        if emprise(co[low]) > 1.3 * emprise(co[~low]):
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.delete(bm, geom=[v for v, is_low in zip(bm.verts, low) if is_low], context="VERTS")
            bm.to_mesh(obj.data)
            bm.free()
            plate_removed = True

    # Les photos produit sont souvent de trois quarts : TRELLIS rend alors le meuble tourné.
    # On le redresse en cherchant l'angle qui donne la plus petite emprise au sol.
    xy = coords()[::max(1, len(obj.data.vertices) // 20000), :2]
    def area(deg):
        c, s_ = np.cos(np.radians(deg)), np.sin(np.radians(deg))
        return np.ptp(c * xy[:, 0] - s_ * xy[:, 1]) * np.ptp(s_ * xy[:, 0] + c * xy[:, 1])
    straighten = min(range(90), key=area)
    if straighten:
        obj.data.transform(mathutils.Matrix.Rotation(np.radians(straighten), 4, "Z"))

    mn, mx = bounds()
    if (mx[0] - mn[0]) > (mx[1] - mn[1]):  # longueur sur x -> quart de tour (face avant -y -> +x)
        obj.data.transform(mathutils.Matrix.Rotation(1.5707963, 4, "Z"))
        mn, mx = bounds()
    sx, sy, sz = (footprint[i] / (mx[i] - mn[i]) for i in range(3))
    c = [(mn[i] + mx[i]) / 2 for i in range(3)]
    obj.data.transform(mathutils.Matrix.Translation((-c[0], -c[1], -c[2])))
    obj.data.transform(mathutils.Matrix.Diagonal((sx, sy, sz, 1)))
    # Le dossier est le côté le plus haut en moyenne : on le met en -x (back=-1) ou en +x (back=1).
    co = coords()
    side_a, side_b = co[co[:, 0] * back < 0][:, 2], co[co[:, 0] * back > 0][:, 2]
    if len(side_a) and len(side_b) and side_a.mean() > side_b.mean() + 0.02:
        obj.data.transform(mathutils.Matrix.Rotation(3.14159265, 4, "Z"))
    obj.data.transform(mathutils.Matrix.Translation(center))
    return obj, (round(sx, 3), round(sy, 3), round(sz, 3)), {"straighten_deg": int(straighten), "plate_removed": plate_removed}


DEFAULT_HEX = {"plante": "#5E7F5A"}
WALL_PIECES = ("miroir", "cadre")


def import_official(path, category, name, fiche):
    """Importe le modèle 3D du fabricant. Il est déjà aux vraies dimensions : on ne l'étire pas, on le met seulement
    dans le repère des formes (largeur sur x, dos vers +y, posé au sol, centré) et on l'allège si besoin."""
    import math
    import mathutils
    import numpy as np
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = set(bpy.data.objects) - before
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        o.data.transform(o.matrix_world)
        o.matrix_world = mathutils.Matrix.Identity(4)
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    obj = join(meshes, name)
    faces = len(obj.data.polygons)
    if faces > 40000:  # certains modèles dépassent 100 000 faces
        mod = obj.modifiers.new("Allege", "DECIMATE")
        mod.ratio = 40000 / faces
        bpy.ops.object.modifier_apply(modifier=mod.name)

    def coords():
        a = np.empty(len(obj.data.vertices) * 3)
        obj.data.vertices.foreach_get("co", a)
        return a.reshape(-1, 3)

    def turn(axis, deg):
        obj.data.transform(mathutils.Matrix.Rotation(math.radians(deg), 4, axis))

    ext = np.ptp(coords(), axis=0)
    turned = []
    if category in WALL_PIECES:
        if ext[2] < ext[1]:  # miroir ou cadre livré couché à plat : on le redresse, face vers -y
            turn("X", 90)
            turned.append("redressé")
    else:
        w, d = fiche[0], fiche[1]
        if category == "tapis":
            w, d = min(w, d), max(w, d)
        if w and d and abs(ext[0] - d) + abs(ext[1] - w) < abs(ext[0] - w) + abs(ext[1] - d) - 0.05:
            turn("Z", 90)  # modèle tourné d'un quart de tour par rapport à la fiche
            turned.append("quart de tour")
        if category in ("canape", "fauteuil"):
            co = coords()
            mid = (co[:, 1].min() + co[:, 1].max()) / 2
            if co[co[:, 1] < mid][:, 2].mean() > co[co[:, 1] >= mid][:, 2].mean() + 0.02:
                turn("Z", 180)  # le dossier (côté le plus haut) doit être vers +y
                turned.append("demi-tour")
    co = coords()
    mn, mx = co.min(axis=0), co.max(axis=0)
    obj.data.transform(mathutils.Matrix.Translation((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2])))
    size = [round(float(v), 3) for v in (mx - mn)]
    return obj, size, {"file": path, "kind": "officiel", "faces": faces, "size_m": size, "turned": turned}


def lift(obj, dz):
    import mathutils
    obj.data.transform(mathutils.Matrix.Translation((0, 0, dz)))


def shrink_textures(limit=768):
    """Textures légères pour le salon affiché dans le navigateur (elles font l'essentiel du poids du fichier) :
    - on retire les cartes de relief et d'occlusion des modèles du fabricant, invisibles à cette échelle ;
    - les images sont ramenées à 768 px ;
    - celles qui n'ont pas de transparence sont enregistrées en JPEG (le feuillage des plantes reste en PNG)."""
    import os
    import tempfile
    import numpy as np
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        if bsdf:
            for link in list(bsdf.inputs["Normal"].links):
                nt.links.remove(link)
        for node in list(nt.nodes):  # groupe « glTF Material Output » : carte d'occlusion
            if node.type == "GROUP" and node.node_tree and "glTF" in node.node_tree.name:
                nt.nodes.remove(node)
    used = {n.image for m in bpy.data.materials if m.use_nodes for n in m.node_tree.nodes
            if n.type == "TEX_IMAGE" and n.image and n.outputs["Color"].links}
    tmp = tempfile.mkdtemp(prefix="nester_tex_")
    for i, img in enumerate(bpy.data.images):
        if img not in used or not img.size[0] or not img.size[1]:
            continue
        if img.size[0] > limit or img.size[1] > limit:
            k = limit / max(img.size)
            img.scale(max(1, int(img.size[0] * k)), max(1, int(img.size[1] * k)))
        try:
            px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            opaque = float(px[3::4].min()) > 0.98
        except Exception:
            opaque = False
        if opaque:
            try:
                path = os.path.join(tmp, f"tex_{i}.jpg")
                img.filepath_raw, img.file_format = path, "JPEG"
                img.save()
                if img.packed_file:
                    img.unpack(method="REMOVE")
                img.source, img.filepath = "FILE", path
                img.reload()
            except Exception:
                pass  # en cas d'échec, l'image part telle quelle


def build_products(products, W, L, H, room):
    """Place chaque produit dans le salon. Le canapé est contre le mur ouest (x = 0) ; les murs sud et est
    sont ceux que la caméra masque, donc la déco murale va sur les murs ouest et nord."""
    report = []
    win = room.get("window") or {}
    win_x0 = win.get("offset_cm", W * 50 - 60) / 100
    win_x1 = win_x0 + win.get("width_cm", 120) / 100
    win_top = (win.get("sill_cm", 90) + win.get("height_cm", 125)) / 100
    dim = lambda cat, key, default: next((q[key] / 100 for q in products if q["category"] == cat and q.get(key)), default)
    sofa_d, sofa_h, sofa_w = dim("canape", "depth_cm", 0.90), dim("canape", "height_cm", 0.85), dim("canape", "width_cm", 1.80)
    table_d = dim("table_basse", "depth_cm", 0.60)
    table_x = sofa_d + 0.02 + 0.40 + table_d / 2
    wood = material("Bois_pieds", "#3B2F28")
    for i, p in enumerate(products):
        cat, name = p["category"], f"P{i}_{p['category']}"
        entry = {"name": p["name"], "category": cat}
        size, guessed, missing = dims_m(p)
        if cat in ("miroir", "cadre", "plante", "rideau", "suspension"):
            size, missing = (0, 0, 0), []  # dimensions lues plus bas, selon la catégorie
        if size is None:
            entry.update(status="ignoré", missing=missing)
            report.append(entry)
            continue
        w, d, h = size
        mat = material(f"Mat_{i}", p.get("color_hex") or DEFAULT_HEX.get(cat, "#888888"))
        cm = lambda key, default=None: p[key] / 100 if p.get(key) else default

        if p.get("model_kind") == "official":
            # Modèle du fabricant : mêmes emplacements que les formes, sans étirement.
            obj, real, entry["model"] = import_official(p["model_glb"], cat, name, (w, d, h))
            rw, rd, rh = real
            if cat == "canape":
                settle(obj, (rd / 2 + 0.02, L / 2), 90)
            elif cat == "fauteuil":
                settle(obj, (min(W - rd / 2 - 0.55, table_x + table_d / 2 + 0.75 + rd / 2), max(rw / 2 + 0.45, L * 0.22)), -125)
            elif cat == "table_basse":
                settle(obj, (table_x, L / 2), 90)
            elif cat == "tapis":
                settle(obj, (max(sofa_d - 0.30, 0.20) + rw / 2, L / 2), 0)
            elif cat == "meuble_tv":
                settle(obj, (W - rd / 2 - 0.02, L / 2), -90)
            elif cat == "etagere":
                settle(obj, (W - rw / 2 - 0.08, L - rd / 2 - 0.02), 0)
            elif cat == "luminaire":
                settle(obj, (0.35, min(L - 0.35, L / 2 + sofa_w / 2 + 0.35)), 0)
            elif cat == "suspension":  # le modèle inclut son câble : on l'accroche au plafond
                lift(obj, max(H - rh, 1.75))
                settle(obj, (table_x, L / 2), 0)
            elif cat == "plante":
                settle(obj, (W - 0.30 - rw / 4, 0.32 + rd / 4), 0)
            elif cat == "miroir":
                lift(obj, min(max(0.06, 1.45 - rh / 2), H - rh - 0.08))
                settle(obj, (max(rw / 2 + 0.20, (0.20 + win_x0 - 0.45) / 2), L - 0.01 - rd / 2), 0)
            elif cat == "cadre":
                lift(obj, min(max(sofa_h + 0.28, 1.45 - rh / 2), H - rh - 0.08))
                count = int(p.get("count") or 1)
                pieces = [obj]
                for k in range(1, count):
                    twin = obj.copy()
                    twin.data = obj.data.copy()
                    bpy.context.collection.objects.link(twin)
                    pieces.append(twin)
                for k, piece in enumerate(pieces):
                    settle(piece, (0.01 + rd / 2, L / 2 + (k - (count - 1) / 2) * (rw + 0.12)), 90)
                obj = join(pieces, name) if count > 1 else obj
            else:
                settle(obj, (W / 2, L / 2), 0)
        elif cat in ("canape", "fauteuil"):
            if cat == "canape":
                center, back, angle = (d / 2 + 0.02, L / 2), -1, 90
            else:  # en face du canapé, côté porte, tourné de trois quarts vers lui
                center, back, angle = (min(W - d / 2 - 0.55, table_x + table_d / 2 + 0.75 + d / 2), max(w / 2 + 0.45, L * 0.22)), 1, -90
            if p.get("model_glb"):
                obj, scale, fixes = import_model(p["model_glb"], (d, w, h), (center[0], center[1], h / 2), name, back=back, plain_mat=mat)
                deformation = round(max(scale) / min(scale) - 1, 2)
                entry["model"] = {"file": p["model_glb"], "scale_xyz": scale, "deformation": deformation, **fixes}
                if deformation > MAX_DEFORMATION:
                    bpy.data.objects.remove(obj, do_unlink=True)
                    entry["model"]["rejected"] = True
                    obj = settle(seat_shape(name, w, d, h, mat, wood), center, angle)
            else:
                obj = settle(seat_shape(name, w, d, h, mat, wood), center, angle)
            if cat == "fauteuil":
                spin(obj, center, -35)
        elif cat == "table_basse":
            obj = settle(table_shape(name, w, d, h, mat, wood, p.get("shape") == "rond"), (table_x, L / 2), 90)
        elif cat == "tapis":  # glissé de 30 cm sous l'avant du canapé, grand côté parallèle au canapé
            obj = box(name, (w, d, h), (max(sofa_d - 0.30, 0.20) + w / 2, L / 2, h / 2), mat)
        elif cat == "meuble_tv":  # contre le mur est, face au canapé
            obj = settle(cabinet_shape(name, w, d, h, mat, wood), (W - d / 2 - 0.02, L / 2), -90)
        elif cat == "etagere":  # contre le mur nord, à droite de la fenêtre
            obj = settle(shelf_shape(name, w, d, h, mat), (W - w / 2 - 0.08, L - d / 2 - 0.02), 0)
        elif cat == "luminaire":  # à côté du canapé, côté fenêtre (le coin nord-ouest reste libre pour le miroir)
            obj = floor_lamp(name, w / 2, h, (0.35, min(L - 0.35, L / 2 + sofa_w / 2 + 0.35), h / 2), mat)
        elif cat == "suspension":  # au-dessus de la table basse
            obj = settle(pendant_shape(name, cm("width_cm", 0.35) / 2, H, mat, wood), (table_x, L / 2))
        elif cat == "plante":  # coin sud-est
            obj = settle(plant_shape(name, cm("height_cm", 0.9), cm("diameter_cm", 0.24) / 2, material(f"Pot_{i}", "#D8D2C4"), mat), (W - 0.30, 0.32))
        elif cat == "rideau":
            _, panels = curtains_shape(name, win_x0, win_x1, min(H - 0.08, win_top + 0.18), mat)
            obj = settle(join(panels, name), (0, L - 0.05))
        elif cat in ("miroir", "cadre"):
            pw = cm("width_cm") or cm("diameter_cm", 0.5)
            ph = cm("height_cm") or pw
            round_shape = p.get("shape") == "rond"
            if cat == "miroir":  # mur nord, entre l'angle et la fenêtre
                mirror = material(f"Miroir_{i}", "#DCE3E6", roughness=0.04)
                mirror.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 1.0
                z = min(max(ph / 2 + 0.06, 1.45), H - ph / 2 - 0.08)
                obj = settle(wall_piece(name, pw, ph, z, mirror, round_shape=round_shape), (max(pw / 2 + 0.20, (0.20 + win_x0 - 0.45) / 2), L - 0.02), 0)
            else:  # mur ouest, centré au-dessus du canapé ; deux cadres côte à côte si la fiche le prévoit
                z = min(max(sofa_h + 0.28 + ph / 2, 1.45), H - ph / 2 - 0.08)
                count = int(p.get("count") or 1)
                pieces = []
                for k in range(count):
                    off = (k - (count - 1) / 2) * (pw + 0.12)
                    pieces.append(settle(wall_piece(f"{name}_{k}", pw, ph, z, mat, p.get("image_file")), (0.02, L / 2 + off), 90))
                obj = join(pieces, name)
        else:
            obj = box(name, (w, d, h), (W / 2, L / 2, h / 2), mat)
        obj["nester_name"] = p["name"]
        obj["nester_url"] = p.get("url") or ""
        obj["nester_price_eur"] = p.get("price_eur") or 0
        entry.update(status="approximatif" if guessed or entry.get("model", {}).get("rejected") else "ok", guessed=guessed)
        report.append(entry)
    return report


# ---------------------------------------------------------------- photo

def render_photo(path, W, L, H, room, samples=64):
    """Rendu photoréaliste du salon (moteur Cycles) : vue d'intérieur depuis le mur est, face au canapé.
    Les meubles sont ceux du salon 3D, à leurs vraies dimensions : rien n'est inventé par une IA d'image."""
    import math
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    try:  # carte graphique du Mac (Metal) si elle est disponible, sinon processeur
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for dev in prefs.devices:
            dev.use = True
        sc.cycles.device = "GPU"
    except Exception:
        sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.03
    sc.cycles.max_bounces = 5
    sc.render.resolution_x, sc.render.resolution_y = 1320, 880
    sc.render.filepath = path
    if path.lower().endswith((".jpg", ".jpeg")):
        sc.render.image_settings.file_format = "JPEG"
        sc.render.image_settings.quality = 88
    sc.view_settings.view_transform = "AgX" if "AgX" in [v.identifier for v in type(sc.view_settings).bl_rna.properties["view_transform"].enum_items] else "Filmic"
    sc.view_settings.exposure = 0.1

    # Parquet : le sol reçoit un veinage et un léger brillant.
    floor = bpy.data.objects.get("Sol")
    if floor and floor.data.materials:
        m = floor.data.materials[0]
        nt, bsdf = m.node_tree, m.node_tree.nodes["Principled BSDF"]
        base = tuple(bsdf.inputs["Base Color"].default_value)
        coord, mapping = nt.nodes.new("ShaderNodeTexCoord"), nt.nodes.new("ShaderNodeMapping")
        wave, ramp = nt.nodes.new("ShaderNodeTexWave"), nt.nodes.new("ShaderNodeValToRGB")
        mapping.inputs["Scale"].default_value = (0.35, 7.0, 1.0)  # lames dans le sens de la longueur
        wave.inputs["Scale"].default_value, wave.inputs["Distortion"].default_value = 1.0, 1.2
        wave.inputs["Detail"].default_value = 1.0
        ramp.color_ramp.elements[0].color = tuple(c * 0.84 for c in base[:3]) + (1,)
        ramp.color_ramp.elements[1].color = base
        nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
        nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.42

    # Plafond et plinthes : la pièce est fermée, la lumière rebondit comme dans une vraie pièce.
    white = material("Plafond", "#F6F5F1", roughness=0.9)
    box("Plafond", (W + 0.2, L + 0.2, 0.05), (W / 2, L / 2, H + 0.025), white)
    for nm, size, center in (("west", (0.012, L, 0.08), (0.006, L / 2, 0.04)), ("north", (W, 0.012, 0.08), (W / 2, L - 0.006, 0.04)),
                             ("south", (W, 0.012, 0.08), (W / 2, 0.006, 0.04))):
        box("Plinthe_" + nm, size, center, white)

    # Lumière du jour : ciel clair uniforme (pas d'horizon visible par la fenêtre), soleil par la fenêtre, appoint au plafond.
    world = bpy.data.worlds.new("Ciel")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.78, 0.88, 1.0, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.1
    sc.world = world
    # La porte : un battant blanc ferme l'ouverture (sinon on voit le vide derrière le mur).
    door = room.get("door")
    if door:
        dw, dh, off = door["width_cm"] / 100, door["height_cm"] / 100, door["offset_cm"] / 100
        if door["wall"] == "south":
            box("Porte", (dw, 0.04, dh), (off + dw / 2, -0.03, dh / 2), white)
        elif door["wall"] == "north":
            box("Porte", (dw, 0.04, dh), (off + dw / 2, L + 0.03, dh / 2), white)
    win = room.get("window") or {}
    wx = (win.get("offset_cm", W * 50 - 60) + win.get("width_cm", 120) / 2) / 100
    wz = (win.get("sill_cm", 90) + win.get("height_cm", 125) / 2) / 100
    bpy.ops.object.light_add(type="SUN", location=(wx, L + 2, wz + 2))
    sun = bpy.context.active_object
    sun.data.energy, sun.data.angle = 2.4, math.radians(4)
    sun.rotation_euler = (math.radians(48), 0, math.radians(165))  # entre par la fenêtre, vers le sol devant le canapé
    bpy.ops.object.light_add(type="AREA", location=(wx, L + 0.25, wz), rotation=(math.radians(90), 0, 0))
    portal = bpy.context.active_object  # la fenêtre comme source de lumière douce
    portal.data.shape, portal.data.size, portal.data.size_y = "RECTANGLE", win.get("width_cm", 120) / 100, win.get("height_cm", 125) / 100
    portal.data.energy, portal.data.color = 260, (1.0, 0.97, 0.92)
    bpy.ops.object.light_add(type="AREA", location=(W * 0.55, L * 0.45, H - 0.06))
    fill = bpy.context.active_object
    fill.data.size, fill.data.energy, fill.data.color = 1.6, 90, (1.0, 0.93, 0.84)

    # Appareil : adossé au mur est, à hauteur d'yeux assis, grand angle.
    bpy.ops.object.empty_add(location=(0.4, L * 0.52, 0.95))
    target = bpy.context.active_object
    bpy.ops.object.camera_add(location=(W - 0.12, L * 0.40, 1.35))
    cam = bpy.context.active_object
    track = cam.constraints.new("TRACK_TO")
    track.target, track.track_axis, track.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    cam.data.lens, cam.data.clip_start = 17, 0.05
    sc.camera = cam
    # Ce qui est entre l'appareil et la pièce (mur est, meuble TV adossé à ce mur) n'apparaît pas sur la photo.
    for o in bpy.data.objects:
        if o.name == "Mur_east" or "_meuble_tv" in o.name:
            o.hide_render = True
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    photo_path = None
    if "--photo" in argv:  # ... -- scene.json sortie.glb [rendu.png] --photo photo.png
        i = argv.index("--photo")
        photo_path = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    scene_path, glb_path = argv[0], argv[1]
    png_path = argv[2] if len(argv) > 2 else None
    t0 = time.time()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = json.load(open(scene_path, encoding="utf-8"))
    W, L, H = build_room(scene["room"])
    report = build_products(scene["products"], W, L, H, scene["room"])

    shrink_textures()
    # Fichier compact : géométrie compressée (Draco). Les textures gardent leur format d'origine :
    # le WebP, plus léger, n'est pas lu par tous les navigateurs avec three.js (essai du 19.11).
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", export_extras=True, export_apply=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
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

    t_photo = None
    if photo_path:
        t2 = time.time()
        render_photo(photo_path, W, L, H, scene["room"])
        t_photo = round(time.time() - t2, 1)

    print("NESTER_REPORT " + json.dumps({
        "photo": photo_path, "photo_seconds": t_photo,
        "glb": glb_path, "glb_seconds": round(t_glb, 2),
        "png": png_path, "png_seconds": round(t_png, 2) if t_png else None,
        "products": report,
    }, ensure_ascii=False))


main()
