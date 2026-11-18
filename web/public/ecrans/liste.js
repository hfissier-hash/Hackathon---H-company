// Écran « Liste d'achat » : produits, sous-totaux et total réels du projet.
(function () {
  if (!Nestr.live) return;
  var content = document.body.firstElementChild.children[0];
  var count = content.children[1], total = content.children[2], groups = content.children[3];
  var button = content.children[4], note = content.children[5];
  var groupTpl = groups.children[0].cloneNode(true), rowTpl = groupTpl.children[1].cloneNode(true);
  while (groupTpl.children.length > 1) groupTpl.removeChild(groupTpl.lastElementChild);
  var links = [];
  button.addEventListener('click', function () { links.forEach(function (u) { window.open(u, '_blank', 'noopener'); }); });

  function show(job) {
    if (!job || job.status !== 'done') return;

    var by = {};
    job.products.forEach(function (p) { (by[Nestr.retailer(p)] = by[Nestr.retailer(p)] || []).push(p); });
    var names = Object.keys(by);
    count.textContent = job.products.length + ' articles · ' + names.length + ' enseigne' + (names.length > 1 ? 's' : '');

    var budget = job.request.budget_eur, left = Math.round((budget - job.total_eur) * 100) / 100;
    var unverified = job.products.filter(function (p) { return p.door_verified === false; }).length;
    total.children[1].children[0].textContent = Nestr.euro(job.total_eur);
    total.children[1].children[1].textContent = 'sur ' + Nestr.euro(budget);
    total.children[2].firstElementChild.style.width = Math.min(100, Math.round(job.total_eur / budget * 100)) + '%';
    total.children[3].textContent = (unverified ? unverified + ' passage(s) de porte non vérifié(s)' : '✓ Tout rentre et passe la porte')
      + ' · reste ' + Nestr.euro(left);

    groups.textContent = '';
    names.forEach(function (name) {
      var g = groupTpl.cloneNode(true);
      g.children[0].children[0].textContent = name;
      g.children[0].children[1].textContent = Nestr.euro(by[name].reduce(function (a, p) { return a + p.price_eur; }, 0));
      by[name].forEach(function (p) {
        var row = rowTpl.cloneNode(true), img = row.querySelector('img');
        img.removeAttribute('data-img'); img.src = p.image_url; img.alt = p.name;
        row.children[1].children[0].textContent = p.name.split(',')[0];
        row.children[1].children[1].textContent = Nestr.dims(p);
        if (p.live || p.found_by_agent) { // ce que les agents H ont fait sur ce produit
          var tag = document.createElement('p');
          tag.style.cssText = 'margin:3px 0 0;font-size:12px;font-weight:500;color:' + (p.live && p.live.changed ? '#B84F2C' : '#1F7A4A');
          tag.textContent = (p.found_by_agent ? 'Trouvé par un agent H' : '') + (p.found_by_agent && p.live ? ' · ' : '') + (p.live ? Nestr.live(p)[0] : '');
          row.children[1].appendChild(tag);
        }
        row.children[2].textContent = Nestr.euro(p.price_eur);
        row.style.cursor = 'pointer';
        row.addEventListener('click', function () { window.open(p.url, '_blank', 'noopener'); });
        g.appendChild(row);
      });
      groups.appendChild(g);
    });

    button.textContent = 'Ouvrir les ' + job.products.length + ' liens';
    links = job.products.map(function (p) { return p.url; });
    var d = new Date(job.products[0].scraped_at);
    var verify = (job.steps || {}).verify;
    note.textContent = verify ? verify.detail : 'Prix relevés par les agents H le ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    // Tant que les agents vérifient les prix, la liste se met à jour toute seule.
    if (verify && verify.status === 'running') setTimeout(function () { Nestr.project().then(show); }, 3000);
  }
  Nestr.project().then(show);
})();
