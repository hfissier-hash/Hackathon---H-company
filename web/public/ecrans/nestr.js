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
  // Compte : tous les écrans sauf l'accueil et « Ton compte » demandent d'être connecté.
  // Nestr.me donne la personne connectée ({ email, first_name, room }) ou null ; le logement du profil sert de pièce par défaut.
  var open = /\/(accueil|compte)\.html$/.test(location.pathname), online = /^https?:$/.test(location.protocol);
  var me = !online ? Promise.resolve(null) : fetch('/api/me').then(function (r) {
    if (r.status === 401) { if (!open) location.replace('compte.html#connexion'); return null; }
    return r.ok ? r.json().then(function (j) { return j.user; }) : null;
  }).then(function (user) {
    if (!user) return null;
    var s = get();
    if (s.owner && s.owner !== user.email) { try { localStorage.removeItem(KEY); } catch (e) {} s = {}; } // un autre compte sur cet appareil : on repart de zéro
    if (!s.owner || (!s.room && user.room)) set({ owner: user.email, room: s.room || user.room || undefined });
    return user;
  }).catch(function () { return null; });
  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('nav[aria-label="Navigation principale"]');
    if (!nav || nav.querySelector('a[href="profil.html"]')) return;
    // Retour vers la saisie (pièce, style, budget, envies) depuis les écrans du projet.
    var title = document.querySelector('h2');
    if (title && !/(profil|menu)\.html$/.test(location.pathname)) {
      var back = document.createElement('a');
      back.href = 'profil.html';
      back.textContent = '← Mes salons';
      back.style.cssText = 'display:inline-block;margin:0 0 8px;padding:6px 12px;border-radius:999px;background:var(--birch);color:var(--ink);font-size:13px;font-weight:600;text-decoration:none';
      title.parentNode.insertBefore(back, title);
    }
    // Onglet « Profil » : informations du compte et salons enregistrés.
    var tab = nav.lastElementChild.cloneNode(true), here = /profil\.html$/.test(location.pathname);
    tab.href = 'profil.html';
    tab.removeAttribute('aria-current');
    tab.lastChild.textContent = 'Profil';
    tab.querySelector('svg').innerHTML = '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>';
    tab.style.color = here ? 'var(--ink)' : 'var(--ink-muted)';
    tab.style.fontWeight = here ? '600' : '500';
    if (here) tab.setAttribute('aria-current', 'page');
    nav.appendChild(tab);
    // Onglet « Accueil » : le point de retour de l'application.
    var home = tab.cloneNode(true), there = /menu\.html$/.test(location.pathname);
    home.href = 'menu.html';
    home.lastChild.textContent = 'Accueil';
    home.querySelector('svg').innerHTML = '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z"/>';
    home.style.color = there ? 'var(--ink)' : 'var(--ink-muted)';
    home.style.fontWeight = there ? '600' : '500';
    if (there) home.setAttribute('aria-current', 'page'); else home.removeAttribute('aria-current');
    nav.insertBefore(home, nav.firstChild);
    // Sans salon ouvert, 3D / Déco / Liste n'ont rien à montrer : onglets grisés.
    if (!get().projectId) [].forEach.call(nav.querySelectorAll('a[href="rendu-3d.html"], a[href="deco.html"], a[href="liste.html"]'), function (a) {
      a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); a.style.opacity = '0.35';
    });
  });
  function project() {
    var id = get().projectId;
    if (!id) return Promise.resolve(null);
    return fetch('/api/projects/' + id).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  // Prix et mesures : police de données de la charte.
  function data(el) { if (el) el.classList.add('data'); return el; }
  return { data: data, live: /^https?:$/.test(location.protocol), get: get, set: set, num: num, euro: euro, dims: dims,
           retailer: retailer, checks: checks, live: live, project: project, me: me };
})();
