// Écran « L'agent cherche » : lance le parcours complet et affiche l'avancement réel.
(function () {
  if (!Nestr.live) return;
  var root = document.body.firstElementChild;
  var ring = root.children[1], rows = root.children[2], card = root.children[3], cta = root.children[5];
  var arc = ring.querySelectorAll('circle')[1], pct = ring.querySelectorAll('p')[0], clock = ring.querySelectorAll('p')[1];
  var title = ring.querySelector('h2'), subtitle = ring.querySelectorAll('p')[2];
  var STEPS = [['criteria', 'IA', 'Tes envies', 'Lecture de ta demande'],
               ['catalog', 'I', 'IKEA', 'Recherche dans le catalogue'],
               ['agent', 'H', 'Agent H Company', 'Recherche en direct sur ikea.com'],
               ['paint', 'C', 'Castorama', 'Recherche de la peinture'],
               ['stylist', 'IA', 'Styliste', 'Relecture du salon face à ta demande'],
               ['build', '3D', 'Salon en 3D', 'Construction aux vraies dimensions']];

  var template = rows.children[0];
  rows.textContent = '';
  var lines = STEPS.map(function (s) {
    var row = template.cloneNode(true);
    row.children[0].textContent = s[1];
    row.children[1].children[0].textContent = s[2];
    row.children[1].children[1].textContent = s[3];
    var dot = document.createElement('span');
    dot.style.cssText = 'width:24px;height:24px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--surface);background:var(--line)';
    row.replaceChild(dot, row.children[2]);
    row.style.padding = '8px 0'; // cinq étapes possibles : lignes plus serrées pour garder le bouton entier
    rows.appendChild(row);
    return { key: s[0], wait: s[3], detail: row.children[1].children[1], dot: dot, row: row };
  });
  ring.style.marginTop = '14px';
  rows.style.marginTop = '14px';
  card.style.visibility = 'hidden';
  cta.style.opacity = '0.35';
  cta.style.pointerEvents = 'none';
  subtitle.textContent = 'Ta demande est comparée au catalogue des agents H Company, puis relue par un styliste IA.';

  var started = Date.now(), seen = null, shownPct = 0, target = 0, counting = false;
  // Le pourcentage défile jusqu'à sa valeur au lieu de sauter.
  function count(to) {
    target = to;
    if (counting) return;
    counting = true;
    (function step() {
      if (shownPct === target) { counting = false; return; }
      shownPct += shownPct < target ? Math.max(1, Math.round((target - shownPct) / 6)) : -1;
      pct.textContent = shownPct + ' %';
      requestAnimationFrame(step);
    })();
  }
  function show(job) {
    var done = 0, shown = 0;
    lines.forEach(function (l) {
      var s = (job.steps || {})[l.key] || { status: 'pending' };
      var st = s.status;
      // L'agent n'apparaît que s'il est lancé (catalogue insuffisant).
      l.row.style.display = (l.key === 'agent' || l.key === 'stylist') && !(job.steps || {})[l.key] ? 'none' : 'flex';
      if (l.row.style.display === 'none') return;
      shown++;
      if (st === 'done' || st === 'skipped') done++;
      l.row.dataset.state = st === 'skipped' ? 'done' : st;
      l.dot.style.background = st === 'done' ? 'var(--ok)' : st === 'failed' ? 'var(--warn)' : st === 'running' ? 'var(--ink)' : 'var(--line)';
      l.dot.textContent = st === 'done' ? '✓' : st === 'failed' ? '!' : st === 'running' ? '…' : '';
      l.dot.setAttribute('role', 'img');
      l.dot.setAttribute('aria-label', { done: 'Terminé', failed: 'Échec', running: 'En cours', skipped: 'Ignoré', pending: 'En attente' }[st]);
      l.detail.textContent = s.detail ? s.detail + (s.seconds ? ' · ' + String(s.seconds).replace('.', ',') + ' s' : '') : l.wait;
    });
    card.children[1].style.display = shown > 5 ? 'none' : 'flex'; // six étapes (un agent est parti) : la carte se resserre pour garder le bouton visible
    var ratio = job.status === 'done' ? 1 : done / shown;
    arc.setAttribute('stroke-dasharray', Math.round(327 * ratio) + ' 327');
    count(Math.round(ratio * 100));
    root.dataset.status = job.status;
    var secs = job.seconds ? Math.round(job.seconds) : Math.round((Date.now() - started) / 1000);
    clock.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');

    var last = job.products ? job.products[0] : job.last;
    if (last) {
      if (seen !== last.url) { seen = last.url; card.classList.remove('arrive'); void card.offsetWidth; card.classList.add('arrive'); } // chaque nouvelle trouvaille surgit
      card.style.visibility = 'visible';
      var img = card.querySelector('img'), txt = card.children[0].children[1].children, chips = card.children[1];
      img.removeAttribute('data-img'); img.src = last.image_url; img.alt = last.name;
      txt[0].textContent = (job.products ? 'Pièce maîtresse · ' : 'Dernière trouvaille · ') + Nestr.retailer(last);
      txt[1].textContent = last.name.split(',')[0];
      Nestr.data(txt[2]).textContent = Nestr.euro(last.price_eur) + ' · ' + Nestr.dims(last);
      var chipTpl = chips.children[0].cloneNode(true);
      chips.textContent = '';
      Nestr.checks(last).forEach(function (c) {
        var chip = chipTpl.cloneNode(true);
        chip.textContent = c[0];
        chip.style.color = c[1] ? 'var(--ok)' : 'var(--warn)';
        chips.appendChild(chip);
      });
    }
    if (job.status === 'done') {
      title.textContent = 'Ton salon est prêt';
      subtitle.textContent = job.products.length + ' produits pour ' + Nestr.euro(job.total_eur) + ' sur ' + Nestr.euro(job.request.budget_eur) + '.';
      cta.style.opacity = '1';
      cta.style.pointerEvents = 'auto';
    } else if (job.status === 'failed') {
      title.textContent = 'La recherche a échoué';
      subtitle.textContent = job.error || 'Erreur inconnue.';
      rows.style.display = 'none'; // rien n'a tourné : on laisse la place au message et au bouton
      card.style.display = 'none';
      cta.textContent = 'Corriger ma demande';
      cta.href = 'pieces.html';
      cta.style.opacity = '1';
      cta.style.pointerEvents = 'auto';
    }
  }

  var misses = 0;
  function poll(id) {
    fetch('/api/projects/' + id).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
      .then(function (job) {
        misses = 0;
        show(job);
        if (job.status === 'running' || job.status === 'queued') setTimeout(function () { poll(id); }, 600);
      }).catch(function () {
        // Une coupure passagère ne doit pas faire échouer l'écran : on réessaie quelques fois.
        if (++misses < 6) return setTimeout(function () { poll(id); }, 1000);
        show({ status: 'failed', error: 'Le serveur Nester ne répond plus.', steps: {} });
      });
  }

  show({ status: 'running', steps: {} });
  var s = Nestr.get();
  if (s.projectId) return poll(s.projectId);
  var body = { room: s.room || { width_cm: 420, length_cm: 360, height_cm: 250, door_cm: 83 },
               style: s.style || 'Scandinave', budget_eur: s.budget_eur || 1200, text: s.text || '', wants: s.wants,
               inspiration: s.inspiration };
  fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
    .then(function (j) { Nestr.set({ projectId: j.id }); poll(j.id); })
    .catch(function (e) { show({ status: 'failed', error: e.message || 'Le serveur Nester ne répond pas.', steps: {} }); });
})();
