// Lien entre les écrans et l'application Nester (routes /api de Next.js, traitées par le worker).
// Ouverts en simple fichier, les écrans gardent leur contenu d'exemple : Nestr.live vaut false.
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
    var many = p.count > 1 ? p.count + ' × ' : '';
    if (p.category === 'tapis') return cm(p.width_cm) + ' × ' + cm(p.depth_cm) + ' cm';
    if (p.category === 'luminaire' || p.category === 'plante') return 'H ' + cm(p.height_cm) + ' cm';
    if (p.category === 'suspension') return 'Ø ' + cm(p.width_cm) + ' cm';
    if (p.category === 'miroir' || p.category === 'cadre' || p.category === 'rideau') {
      return many + cm(p.width_cm) + ' × ' + cm(p.height_cm || p.width_cm) + ' cm';
    }
    return cm(p.width_cm) + ' × ' + cm(p.depth_cm) + ' × ' + cm(p.height_cm) + ' cm';
  }
  var RETAILERS = { ikea: 'IKEA', castorama: 'Castorama', maisonsdumonde: 'Maisons du Monde' };
  function retailer(p) { return RETAILERS[p.retailer] || p.retailer; }
  // Contrôles réellement faits par la recherche : dimensions de la pièce, colis et porte.
  function checks(p) {
    if (p.category === 'peinture') return !p.paint ? [] : [['✓ ' + p.paint.pots + ' pot' + (p.paint.pots > 1 ? 's' : '') + ' suffi' + (p.paint.pots > 1 ? 'sen' : '') + 't', true]];
    var list = [['✓ Rentre', true], p.door_verified ? ['✓ Passe la porte', true] : ['Porte non vérifiée', false]];
    if (p.found_by_agent) list.push(['Trouvé par un agent H', true]);
    if (p.live) list.push(live(p));
    return list;
  }
  // Lien partageable : ?p=<identifiant> ouvre un projet enregistré.
  var shared = new URLSearchParams(location.search).get('p');
  if (shared && /^[0-9a-f-]{36}$/.test(shared)) set({ projectId: shared });
  // Prix relevé en direct par un agent H après la livraison du salon.
  function live(p) {
    var d = new Date(p.live.checked_at), at = String(d.getHours()).padStart(2, '0') + ' h ' + String(d.getMinutes()).padStart(2, '0');
    if (p.live.changed) return ['Prix du jour : ' + euro(p.live.price_eur), false];
    return ['✓ Prix vérifié à ' + at, true];
  }
  // Onglet « Agents » ajouté à la barre de navigation des écrans du projet.
  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('nav[aria-label="Navigation principale"]');
    if (!nav || nav.querySelector('a[href="agents.html"]')) return;
    var tab = nav.lastElementChild.cloneNode(true), here = /agents\.html$/.test(location.pathname);
    tab.href = 'agents.html';
    tab.removeAttribute('aria-current');
    tab.lastChild.textContent = 'Agents';
    tab.querySelector('svg').innerHTML = '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>';
    tab.style.color = here ? '#111111' : '#6B6B6B';
    tab.style.fontWeight = here ? '600' : '500';
    if (here) tab.setAttribute('aria-current', 'page');
    nav.appendChild(tab);
  });
  function project() {
    var id = get().projectId;
    if (!id) return Promise.resolve(null);
    return fetch('/api/projects/' + id).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  return { live: /^https?:$/.test(location.protocol), get: get, set: set, num: num, euro: euro, dims: dims,
           retailer: retailer, checks: checks, live: live, project: project };
})();
