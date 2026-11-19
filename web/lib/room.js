// Validation d'une pièce (dimensions, porte, fenêtres) : utilisée par le profil et par les demandes de salon.
export function number(v, lo, hi, name) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${name} : valeur attendue entre ${lo} et ${hi}`);
  return n;
}

const WALLS = ['north', 'south', 'east', 'west'];

// Une ouverture (porte ou fenêtre) : un mur, une position le long du mur, une largeur, ramenées dans le mur.
function opening(o, room, minWidth, maxWidth, name) {
  if (!o || !WALLS.includes(o.wall)) throw new Error(`${name} : mur inconnu`);
  const run = o.wall === 'north' || o.wall === 'south' ? room.width_cm : room.length_cm;
  const width = Math.min(number(o.width_cm, minWidth, maxWidth, name), run - 20);
  const offset = Math.min(Math.max(Number(o.offset_cm) || 0, 5), run - width - 5);
  return { wall: o.wall, offset_cm: Math.round(offset), width_cm: Math.round(width) };
}

export function validRoom(input) {
  const room = input || {};
  const size = { width_cm: number(room.width_cm, 200, 1000, 'largeur'), length_cm: number(room.length_cm, 200, 1000, 'longueur'),
                 height_cm: number(room.height_cm, 200, 400, 'hauteur'), door_cm: number(room.door_cm, 60, 200, 'porte') };
  // Porte et fenêtres placées sur le plan ; absentes, le worker prend une disposition par défaut.
  if (room.door) {
    size.door = { ...opening({ ...room.door, width_cm: room.door.width_cm || size.door_cm }, size, 60, 200, 'porte'),
                  opens: room.door.opens === 'out' ? 'out' : 'in', hinge: room.door.hinge === 'end' ? 'end' : 'start' };
    size.door_cm = size.door.width_cm;
  }
  if (Array.isArray(room.windows)) size.windows = room.windows.slice(0, 4).map((w) => opening(w, size, 40, 300, 'fenêtre'));
  return size;
}
