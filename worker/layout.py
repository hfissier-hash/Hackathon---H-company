"""Placement des meubles dans le salon, selon la porte et les fenêtres choisies par Léa.

Repère (cm) : x d'ouest en est (0..W), y du sud au nord (0..L). Une position le long d'un mur, `t`, se mesure
depuis l'ouest pour les murs nord et sud, depuis le sud pour les murs est et ouest.

`plan(room)`   choisit le mur du canapé et dit ce qui tient dans la pièce (largeurs maximales, catégories possibles).
`place(...)`   donne à chaque produit sa place : {"wall", "t"} contre un mur, ou {"x", "y", "angle"} au sol.
La zone de débattement de la porte reste libre : une porte qui ouvre vers l'intérieur condamne un carré de sa largeur.
"""
import math

WALLS = ("west", "north", "east", "south")
OPPOSITE = {"west": "east", "east": "west", "north": "south", "south": "north"}
ANGLE = {"north": 0, "west": 90, "south": 180, "east": -90}  # dos du meuble contre ce mur


def wall_length(room, wall):
    return room["width_cm"] if wall in ("north", "south") else room["length_cm"]


def span(room, wall):
    """Distance entre ce mur et le mur d'en face."""
    return room["length_cm"] if wall in ("north", "south") else room["width_cm"]


def point(room, wall, t, inset):
    """Point à `inset` cm du mur, à la position `t` le long du mur."""
    W, L = room["width_cm"], room["length_cm"]
    return {"south": (t, inset), "north": (t, L - inset), "west": (inset, t), "east": (W - inset, t)}[wall]


def openings(room):
    """Porte et fenêtres, avec des valeurs par défaut pour les anciennes demandes."""
    W = room["width_cm"]
    door = dict(room.get("door") or {"wall": "south", "offset_cm": 30, "width_cm": room.get("door_cm", 83)})
    door.setdefault("width_cm", room.get("door_cm", 83))
    door.setdefault("opens", "in")
    door.setdefault("hinge", "start")
    windows = room.get("windows")
    if windows is None:
        windows = [{"wall": "north", "offset_cm": max(40, W / 2 - 60), "width_cm": 120}]
    return door, [dict(w) for w in windows]


def door_zone(room, door):
    """Rectangle au sol à laisser libre devant la porte : (x0, y0, x1, y1)."""
    depth = door["width_cm"] + 5 if door.get("opens", "in") == "in" else 60
    a, b = door["offset_cm"] - 5, door["offset_cm"] + door["width_cm"] + 5
    x0, y0 = point(room, door["wall"], a, 0)
    x1, y1 = point(room, door["wall"], b, depth)
    return min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)


def free_intervals(length, blocked, margin=0):
    """Segments libres d'un mur de longueur `length`, une fois retirés les segments `blocked`."""
    out, cur = [], margin
    for a, b in sorted((max(0, a), min(length, b)) for a, b in blocked):
        if a > cur:
            out.append((cur, a))
        cur = max(cur, b)
    if length - margin > cur:
        out.append((cur, length - margin))
    return [(a, b) for a, b in out if b - a > 1]


def blocked(room, wall, door, windows, with_windows, used):
    """Ce qui occupe un mur : la porte, le débattement d'une porte du mur voisin, les fenêtres (pour ce qui est haut
    ou accroché), et ce qu'on y a déjà posé."""
    out = [(a, b) for w, a, b in used if w == wall]
    if door["wall"] == wall:
        out.append((door["offset_cm"] - 10, door["offset_cm"] + door["width_cm"] + 10))
    else:  # la zone de la porte déborde-t-elle sur ce mur (porte près d'un angle) ?
        x0, y0, x1, y1 = door_zone(room, door)
        length = wall_length(room, wall)
        if wall in ("west", "east"):
            touches = x0 <= 60 if wall == "west" else x1 >= room["width_cm"] - 60
            if touches:
                out.append((y0, y1))
        else:
            touches = y0 <= 60 if wall == "south" else y1 >= room["length_cm"] - 60
            if touches:
                out.append((x0, x1))
    if with_windows:
        out += [(w["offset_cm"] - 25, w["offset_cm"] + w["width_cm"] + 25) for w in windows if w["wall"] == wall]
    return out


def best_interval(room, wall, door, windows, with_windows, used, margin=10):
    ivs = free_intervals(wall_length(room, wall), blocked(room, wall, door, windows, with_windows, used), margin)
    return max(ivs, key=lambda iv: iv[1] - iv[0]) if ivs else None


def plan(room):
    """Mur du canapé et place disponible pour chaque catégorie."""
    door, windows = openings(room)

    def sofa_score(wall):
        iv = best_interval(room, wall, door, windows, False, [])
        free = iv[1] - iv[0] if iv else 0
        return (door["wall"] != wall, not any(w["wall"] == wall for w in windows), min(free, 300), -WALLS.index(wall))

    sofa_wall = max(WALLS, key=sofa_score)
    sofa_iv = best_interval(room, sofa_wall, door, windows, False, []) or (10, wall_length(room, sofa_wall) - 10)
    depth = span(room, sofa_wall)  # du mur du canapé au mur d'en face
    tv_wall = OPPOSITE[sofa_wall]
    tv_iv = best_interval(room, tv_wall, door, windows, False, [])
    used = [(sofa_wall, *sofa_iv)] + ([(tv_wall, *tv_iv)] if tv_iv else [])
    tall = {w: best_interval(room, w, door, windows, True, used) for w in WALLS}
    side = [w for w in WALLS if w not in (sofa_wall, tv_wall)]
    shelf_wall = max(side, key=lambda w: (tall[w][1] - tall[w][0]) if tall[w] else 0)
    shelf_iv = tall[shelf_wall]
    return {"door": door, "windows": windows, "sofa_wall": sofa_wall, "sofa_interval": sofa_iv, "depth": depth,
            "tv_wall": tv_wall, "tv_interval": tv_iv, "shelf_wall": shelf_wall, "shelf_interval": shelf_iv,
            "max": {"canape_width": min(300, sofa_iv[1] - sofa_iv[0] - 30), "canape_depth": min(110, depth * 0.4),
                    "tv_width": min(200, (tv_iv[1] - tv_iv[0] - 20) if tv_iv else 0),
                    "shelf_width": min(120, (shelf_iv[1] - shelf_iv[0] - 20) if shelf_iv else 0),
                    "rug_short": min(200, depth - 150), "rug_long": wall_length(room, sofa_wall) - 60},
            "room_for": {"fauteuil": room["width_cm"] * room["length_cm"] >= 120000,
                         "meuble_tv": depth >= 340 and bool(tv_iv) and tv_iv[1] - tv_iv[0] >= 110,
                         "etagere": bool(shelf_iv) and shelf_iv[1] - shelf_iv[0] >= 60}}


def overlaps(a, b, gap=0):
    return a[0] < b[2] + gap and b[0] < a[2] + gap and a[1] < b[3] + gap and b[1] < a[3] + gap


def box(cx, cy, w, d):
    return cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2


def place(room, products, p=None):
    """Place de chaque produit. Renvoie {id du produit: place} et le plan utilisé."""
    p = p or plan(room)
    door, windows = p["door"], p["windows"]
    W, L = room["width_cm"], room["length_cm"]
    zone = door_zone(room, door)
    by = {}
    for prod in products:
        by.setdefault(prod["category"], prod)
    out, used, floor = {}, [], [zone]
    sw = p["sofa_wall"]
    along = (1, 0) if sw in ("north", "south") else (0, 1)           # sens du mur du canapé
    inward = {"south": (0, 1), "north": (0, -1), "west": (1, 0), "east": (-1, 0)}[sw]  # vers la pièce
    num = lambda v, d: float(v) if v else d

    sofa = by.get("canape")
    sofa_w, sofa_d = num(sofa and sofa.get("width_cm"), 180), num(sofa and sofa.get("depth_cm"), 90)
    a, b = p["sofa_interval"]
    mid = wall_length(room, sw) / 2
    sofa_t = min(max(mid, a + sofa_w / 2), b - sofa_w / 2) if b - a >= sofa_w else (a + b) / 2
    if sofa:
        out[sofa["id"]] = {"wall": sw, "t": sofa_t}
        used.append((sw, sofa_t - sofa_w / 2 - 5, sofa_t + sofa_w / 2 + 5))
    sx, sy = point(room, sw, sofa_t, 0)

    def from_sofa(forward, lateral):
        """Point repéré depuis le milieu du canapé : `forward` vers la pièce, `lateral` le long du mur."""
        return sx + inward[0] * forward + along[0] * lateral, sy + inward[1] * forward + along[1] * lateral

    table = by.get("table_basse")
    table_d = num(table and table.get("depth_cm"), 60)
    table_c = from_sofa(sofa_d + 42 + table_d / 2, 0)
    if table:
        out[table["id"]] = {"x": table_c[0], "y": table_c[1], "angle": ANGLE[sw]}
        tw = num(table.get("width_cm"), 90)
        floor.append(box(*table_c, *( (tw, table_d) if sw in ("north", "south") else (table_d, tw))))
    rug = by.get("tapis")
    if rug:
        short = min(num(rug.get("width_cm"), 160), num(rug.get("depth_cm"), 230))
        rc = from_sofa(max(sofa_d - 30, 20) + short / 2, 0)
        out[rug["id"]] = {"x": rc[0], "y": rc[1], "angle": ANGLE[sw] - 90}  # grand côté parallèle au canapé
    if by.get("suspension"):
        out[by["suspension"]["id"]] = {"x": table_c[0], "y": table_c[1], "angle": 0}

    lamp = by.get("luminaire")
    if lamp:  # à côté du canapé, du côté le plus dégagé
        for side in (1, -1):
            t = sofa_t + side * (sofa_w / 2 + 35)
            c = point(room, sw, t, 35)
            if 25 <= t <= wall_length(room, sw) - 25 and not overlaps(box(*c, 40, 40), zone):
                out[lamp["id"]] = {"x": c[0], "y": c[1], "angle": 0}
                used.append((sw, t - 25, t + 25))
                break

    tv = by.get("meuble_tv")
    if tv and p["tv_interval"]:
        tvw, (a, b) = num(tv.get("width_cm"), 150), p["tv_interval"]
        if b - a >= tvw:
            t = min(max(sofa_t, a + tvw / 2), b - tvw / 2)  # en face du canapé si possible
            out[tv["id"]] = {"wall": p["tv_wall"], "t": t}
            used.append((p["tv_wall"], t - tvw / 2 - 5, t + tvw / 2 + 5))
            c = point(room, p["tv_wall"], t, num(tv.get("depth_cm"), 40) / 2)
            floor.append(box(*c, *((tvw, 45) if p["tv_wall"] in ("north", "south") else (45, tvw))))

    def hang(prod, width, with_windows, walls, prefer=None):
        """Cherche un segment de mur libre pour un produit haut ou accroché."""
        for wall in walls:
            iv = best_interval(room, wall, door, windows, with_windows, used)
            if iv and iv[1] - iv[0] >= width + 10:
                if prefer == "far":   # loin du canapé : au bout du segment
                    far = max(iv, key=lambda t: abs((point(room, wall, t, 0)[0] - sx) * along[0] + (point(room, wall, t, 0)[1] - sy) * along[1])
                              + abs((point(room, wall, t, 0)[0] - sx) * inward[0] + (point(room, wall, t, 0)[1] - sy) * inward[1]))
                    t = far - width / 2 - 8 if far == iv[1] else far + width / 2 + 8
                else:
                    t = (iv[0] + iv[1]) / 2
                out[prod["id"]] = {"wall": wall, "t": t}
                used.append((wall, t - width / 2 - 8, t + width / 2 + 8))
                return wall, t
        return None

    side = [w for w in WALLS if w not in (sw, p["tv_wall"])]
    shelf = by.get("etagere")
    if shelf:
        got = hang(shelf, num(shelf.get("width_cm"), 80), True, [p["shelf_wall"]] + [w for w in side if w != p["shelf_wall"]] + [p["tv_wall"]], "far")
        if got:
            c = point(room, got[0], got[1], num(shelf.get("depth_cm"), 35) / 2)
            sw_, sd_ = num(shelf.get("width_cm"), 80), 45
            floor.append(box(*c, *((sw_, sd_) if got[0] in ("north", "south") else (sd_, sw_))))
    frame = by.get("cadre")
    if frame:  # au-dessus du canapé s'il n'y a pas de fenêtre, sinon sur un mur libre
        fw = num(frame.get("width_cm"), 50) * int(frame.get("count") or 1) + 12 * (int(frame.get("count") or 1) - 1)
        behind = [w for w in windows if w["wall"] == sw and w["offset_cm"] < sofa_t + fw / 2 + 20 and w["offset_cm"] + w["width_cm"] > sofa_t - fw / 2 - 20]
        if not behind:
            out[frame["id"]] = {"wall": sw, "t": sofa_t, "above_sofa": True}
        else:
            hang(frame, fw, True, side + [p["tv_wall"], sw])
    mirror = by.get("miroir")
    if mirror:
        hang(mirror, num(mirror.get("width_cm") or mirror.get("diameter_cm"), 50), True, side + [p["tv_wall"], sw])

    chair = by.get("fauteuil")
    if chair:  # en face du canapé, de trois quarts, du côté où il ne gêne ni la porte ni les meubles
        cw, cd = num(chair.get("width_cm"), 75), num(chair.get("depth_cm"), 80)
        forward = min(p["depth"] - cd / 2 - 60, sofa_d + 42 + table_d + 75 + cd / 2)
        reach = min(sofa_w / 2 + 35, wall_length(room, sw) / 2 - cw / 2 - 45)
        spots = sorted(((forward, s * reach) for s in (1, -1)), key=lambda fl: overlaps(box(*from_sofa(*fl), cw + 20, cd + 20), zone))
        for fwd, lat in spots + [(forward - 40, s * reach) for s in (1, -1)]:
            c = from_sofa(fwd, lat)
            b_ = box(*c, cw + 10, cd + 10)
            if not any(overlaps(b_, f) for f in floor) and 30 < c[0] < W - 30 and 30 < c[1] < L - 30:
                tx, ty = from_sofa(sofa_d / 2, 0)  # regarde le canapé
                face = math.degrees(math.atan2(ty - c[1], tx - c[0]))
                out[chair["id"]] = {"x": c[0], "y": c[1], "angle": face + 90}  # forme : avant vers -y à l'angle 0
                floor.append(b_)
                break
    plant = by.get("plante")
    if plant:  # dans un angle libre, le plus loin possible de la porte
        dz = ((zone[0] + zone[2]) / 2, (zone[1] + zone[3]) / 2)
        corners = sorted(((32, 32), (W - 32, 32), (32, L - 32), (W - 32, L - 32)), key=lambda c: -math.hypot(c[0] - dz[0], c[1] - dz[1]))
        for c in corners:
            b_ = box(*c, 60, 60)
            near_wall_used = any(overlaps(b_, box(*point(room, w, (a + b2) / 2, 25), *((b2 - a, 50) if w in ("north", "south") else (50, b2 - a)))) for w, a, b2 in used)
            if not any(overlaps(b_, f) for f in floor) and not near_wall_used:
                out[plant["id"]] = {"x": c[0], "y": c[1], "angle": 0}
                break
    return out, p
