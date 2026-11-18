// Écran « L'agent cherche » : lance le parcours complet et affiche l'avancement réel.
(function () {
  if (!Nestr.live) return;
  var root = document.body.firstElementChild;
  var ring = root.children[1], rows = root.children[2], card = root.children[3], cta = root.children[5];
  var arc = ring.querySelectorAll('circle')[1], pct = ring.querySelectorAll('p')[0], clock = ring.querySelectorAll('p')[1];
  var title = ring.querySelector('h2'), subtitle = ring.querySelectorAll('p')[2];
  var STEPS = [['criteria', 'IA', 'Vos envies', 'Lecture de votre demande'],
               ['catalog', 'I', 'IKEA', 'Recherche dans le catalogue'],
               ['paint', 'C', 'Castorama', 'Recherche de la peinture'],
               ['build', '3D', 'Salon en 3D', 'Construction aux vraies dimensions']];

  var template = rows.children[0];
  rows.textContent = '';
  var lines = STEPS.map(function (s) {
    var row = template.cloneNode(true);
    row.children[0].textContent = s[1];
    row.children[1].children[0].textContent = s[2];
    row.children[1].children[1].textContent = s[3];
    var dot = document.createElement('span');
    dot.style.cssText = 'width:24px;height:24px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#FFFFFF;background:#E7E5E0';
    row.replaceChild(dot, row.children[2]);
    rows.appendChild(row);
    return { key: s[0], wait: s[3], detail: row.children[1].children[1], dot: dot };
  });
  card.style.visibility = 'hidden';
  cta.style.opacity = '0.35';
  cta.style.pointerEvents = 'none';
  subtitle.textContent = 'Votre demande est comparée au catalogue relevé par les agents H Company.';

  var started = Date.now();
  function show(job) {
    var done = 0;
    lines.forEach(function (l) {
      var s = (job.steps || {})[l.key] || { status: 'pending' };
      var st = s.status;
      if (st === 'done' || st === 'skipped') done++;
      l.dot.style.background = st === 'done' ? '#1F7A4A' : st === 'failed' ? '#B84F2C' : st === 'running' ? '#111111' : '#E7E5E0';
      l.dot.textContent = st === 'done' ? '✓' : st === 'failed' ? '!' : st === 'running' ? '…' : '';
      l.dot.setAttribute('role', 'img');
      l.dot.setAttribute('aria-label', { done: 'Terminé', failed: 'Échec', running: 'En cours', skipped: 'Ignoré', pending: 'En attente' }[st]);
      l.detail.textContent = s.detail ? s.detail + (s.seconds ? ' · ' + String(s.seconds).replace('.', ',') + ' s' : '') : l.wait;
    });
    var ratio = job.status === 'done' ? 1 : done / lines.length;
    arc.setAttribute('stroke-dasharray', Math.round(327 * ratio) + ' 327');
    pct.textContent = Math.round(ratio * 100) + ' %';
    var secs = job.seconds ? Math.round(job.seconds) : Math.round((Date.now() - started) / 1000);
    clock.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');

    var last = job.products ? job.products[0] : job.last;
    if (last) {
      card.style.visibility = 'visible';
      var img = card.querySelector('img'), txt = card.children[0].children[1].children, chips = card.children[1];
      img.removeAttribute('data-img'); img.src = last.image_url; img.alt = last.name;
      txt[0].textContent = (job.products ? 'Pièce maîtresse · ' : 'Dernière trouvaille · ') + Nestr.retailer(last);
      txt[1].textContent = last.name.split(',')[0];
      txt[2].textContent = Nestr.euro(last.price_eur) + ' · ' + Nestr.dims(last);
      var chipTpl = chips.children[0].cloneNode(true);
      chips.textContent = '';
      Nestr.checks(last).forEach(function (c) {
        var chip = chipTpl.cloneNode(true);
        chip.textContent = c[0];
        chip.style.color = c[1] ? '#1F7A4A' : '#B84F2C';
        chips.appendChild(chip);
      });
    }
    if (job.status === 'done') {
      title.textContent = 'Votre salon est prêt';
      subtitle.textContent = job.products.length + ' produits pour ' + Nestr.euro(job.total_eur) + ' sur ' + Nestr.euro(job.request.budget_eur) + '.';
      cta.style.opacity = '1';
      cta.style.pointerEvents = 'auto';
    } else if (job.status === 'failed') {
      title.textContent = 'La recherche a échoué';
      subtitle.textContent = job.error || 'Erreur inconnue.';
      cta.textContent = 'Modifier ma demande';
      cta.href = 'pieces.html';
      cta.style.opacity = '1';
      cta.style.pointerEvents = 'auto';
    }
  }

  function poll(id) {
    fetch('/api/projects/' + id).then(function (r) { return r.json(); }).then(function (job) {
      show(job);
      if (job.status === 'running') setTimeout(function () { poll(id); }, 400);
    }).catch(function () {
      show({ status: 'failed', error: 'Le serveur Nester ne répond plus.', steps: {} });
    });
  }

  show({ status: 'running', steps: {} });
  var s = Nestr.get();
  if (s.projectId) return poll(s.projectId);
  var body = { room: s.room || { width_cm: 420, length_cm: 360, height_cm: 250, door_cm: 83 },
               style: s.style || 'Scandinave', budget_eur: s.budget_eur || 1200, text: s.text || '', wants: s.wants };
  fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
    .then(function (j) { Nestr.set({ projectId: j.id }); poll(j.id); })
    .catch(function (e) { show({ status: 'failed', error: e.message || 'Le serveur Nester ne répond pas.', steps: {} }); });
})();
