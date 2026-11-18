// Lien entre la maquette et le serveur local Nester (prototypes/server/app.py).
// Ouverte en simple fichier, la maquette garde son contenu d'exemple : Nestr.live vaut false.
window.Nestr = (function () {
  var KEY = 'nestr-projet';
  function get() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function set(patch) {
    var s = Object.assign(get(), patch);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }
  function num(text, fallback) {
    var n = parseFloat(String(text).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : fallback;
  }
  function euro(n) {
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
  }
  function cm(n) { return String(Math.round(Number(n) * 10) / 10).replace('.', ','); }
  function dims(p) {
    if (p.category === 'peinture' && p.paint) {
      return p.paint.pots + ' × ' + cm(p.paint.volume_l) + ' L · ' + cm(p.paint.area_m2) + ' m², 2 couches';
    }
    if (p.category === 'tapis') return cm(p.width_cm) + ' × ' + cm(p.depth_cm) + ' cm';
    if (p.category === 'luminaire') return 'H ' + cm(p.height_cm) + ' cm';
    return cm(p.width_cm) + ' × ' + cm(p.depth_cm) + ' × ' + cm(p.height_cm) + ' cm';
  }
  var RETAILERS = { ikea: 'IKEA', castorama: 'Castorama', maisonsdumonde: 'Maisons du Monde' };
  function retailer(p) { return RETAILERS[p.retailer] || p.retailer; }
  // Contrôles réellement faits par la recherche : dimensions de la pièce, colis et porte.
  function checks(p) {
    if (p.category === 'peinture') return [['✓ ' + p.paint.pots + ' pot' + (p.paint.pots > 1 ? 's' : '') + ' suffi' + (p.paint.pots > 1 ? 'sen' : '') + 't', true]];
    return [['✓ Rentre', true], p.door_verified ? ['✓ Passe la porte', true] : ['Porte non vérifiée', false]];
  }
  function project() {
    var id = get().projectId;
    if (!id) return Promise.resolve(null);
    return fetch('/api/projects/' + id).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  return { live: /^https?:$/.test(location.protocol), get: get, set: set, num: num, euro: euro, dims: dims,
           retailer: retailer, checks: checks, project: project };
})();
