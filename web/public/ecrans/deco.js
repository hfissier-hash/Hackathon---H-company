// Écran « Déco & peinture » : palette, mur d'accent, pots de peinture et déco réels du projet.
(function () {
  if (!Nestr.live) return;
  Nestr.project().then(function (job) {
    if (!job || job.status !== 'done') return;
    var c = document.body.firstElementChild.children[0];
    // Le lien « ← Mes salons » ajouté par nestr.js ne compte pas dans l'ordre des blocs.
    var k = [].filter.call(c.children, function (e) { return e.getAttribute('href') !== 'profil.html'; });
    var subtitle = k[1], swatches = k[2], accent = k[3], others = k[4];
    var tipsTitle = k[5], tips = k[6];
    var fr = function (n) { return String(n).replace('.', ','); };

    subtitle.textContent = 'Palette ' + job.request.style;
    var plain = swatches.children[0].cloneNode(true), chosen = swatches.children[1].cloneNode(true);
    swatches.textContent = '';
    (job.palette || []).forEach(function (col) {
      var s = (col.accent ? chosen : plain).cloneNode(true);
      s.firstElementChild.style.background = col.hex;
      s.lastElementChild.textContent = col.name;
      swatches.appendChild(s);
    });

    var paint = job.products.filter(function (p) { return p.category === 'peinture'; })[0];
    others.style.display = 'none'; // les autres murs ne sont pas repeints dans cette version
    if (!paint) {
      accent.style.display = 'none';
    } else {
      var hex = ((job.palette || []).filter(function (x) { return x.accent; })[0] || {}).hex || '#6F8F72';
      var band = accent.children[0], info = accent.children[1], k = paint.paint;
      var wall = k.wall_cm || [job.request.room.length_cm, job.request.room.height_cm];
      band.style.background = hex;
      band.children[1].children[0].textContent = k.color || paint.name.split(',')[0];
      band.children[1].children[1].textContent = fr((wall[0] / 100).toFixed(2)) + ' × ' + fr((wall[1] / 100).toFixed(2)) + ' m';
      var img = info.querySelector('img');
      img.removeAttribute('data-img'); img.src = paint.image_url; img.alt = paint.name;
      var lines = info.children[1];
      lines.children[0].children[0].textContent = k.pots + ' pot' + (k.pots > 1 ? 's' : '') + ' de ' + fr(k.volume_l) + ' L';
      Nestr.data(lines.children[0].children[1]).textContent = Nestr.euro(paint.price_eur);
      lines.children[1].textContent = fr(k.area_m2.toFixed(1)) + ' m² · 2 couches · ' + fr(k.litres.toFixed(1)) + ' L · ' + Nestr.retailer(paint);
      info.style.cursor = 'pointer';
      info.addEventListener('click', function () { window.open(paint.url, '_blank', 'noopener'); });
    }

    var deco = job.products.filter(function (p) { return ['tapis', 'luminaire', 'suspension', 'miroir', 'cadre', 'plante', 'rideau'].indexOf(p.category) >= 0; });
    var tpl = tips.children[0].cloneNode(true);
    tips.textContent = '';
    tipsTitle.textContent = 'Déco retenue';
    if (!deco.length) tipsTitle.style.display = 'none';
    deco.forEach(function (p) {
      var row = tpl.cloneNode(true), img = row.querySelector('img');
      img.removeAttribute('data-img'); img.src = p.image_url; img.alt = p.name;
      img.onerror = function () { img.style.visibility = 'hidden'; }; // photo indisponible chez l'enseigne : case vide plutôt que du texte
      row.children[1].textContent = p.name.split(',')[0] + ' · ' + Nestr.dims(p);
      var price = document.createElement('p');
      price.style.cssText = 'margin:0;font-size:15px;font-weight:600;white-space:nowrap';
      price.textContent = Nestr.euro(p.price_eur);
      row.replaceChild(price, row.children[2]);
      row.style.cursor = 'pointer';
      row.addEventListener('click', function () { window.open(p.url, '_blank', 'noopener'); });
      tips.appendChild(row);
    });

    // D'autres idées : produits du catalogue qui iraient dans ce salon, avec leur photo (meubles, déco, peinture).
    var LABELS = { canape: 'Canapé', fauteuil: 'Fauteuil', table_basse: 'Table basse', meuble_tv: 'Meuble TV', etagere: 'Étagère', tapis: 'Tapis',
                   luminaire: 'Lampadaire', suspension: 'Suspension', miroir: 'Miroir', cadre: 'Cadre', plante: 'Plante', rideau: 'Rideaux', peinture: 'Peinture' };
    fetch('/api/projects/' + job.id + '/ideas').then(function (r) { return r.ok ? r.json() : null; }).then(function (ideas) {
      if (!ideas) return;
      [['Idées de meubles', ideas.meubles, 'Ils rentrent dans ta pièce et ton budget'],
       ['Idées de déco', ideas.deco, 'Dans le style de ton salon'],
       ['Idées de peinture', ideas.peinture, 'Dans les couleurs de ta palette']].forEach(function (group) {
        if (!group[1] || !group[1].length) return;
        var head = document.createElement('div'), title = document.createElement('p'), sub = document.createElement('p'), rail = document.createElement('div');
        head.className = 'idees-titre';
        title.textContent = group[0]; sub.textContent = group[2];
        head.append(title, sub);
        rail.className = 'idees'; rail.setAttribute('role', 'list'); rail.setAttribute('aria-label', group[0]);
        group[1].forEach(function (p, i) {
          var a = document.createElement('a'), img = document.createElement('img'), tag = document.createElement('span');
          var name = document.createElement('b'), meta = document.createElement('small'), price = document.createElement('span');
          a.className = 'idee'; a.href = p.url; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('role', 'listitem');
          a.style.animationDelay = Math.min(i, 6) * 0.05 + 's';
          img.src = p.image_url; img.alt = p.name; img.loading = 'lazy';
          img.onerror = function () { a.remove(); }; // fiche sans photo exploitable : on ne montre pas de case vide
          tag.className = 'idee-cat'; tag.textContent = LABELS[p.category] || p.category;
          name.textContent = p.name.split(',')[0];
          meta.textContent = p.category === 'peinture' ? Nestr.retailer(p) + (p.color ? ' · ' + p.color.replace('_', ' ') : '') : Nestr.dims(p);
          price.className = 'data idee-prix'; price.textContent = Nestr.euro(p.price_eur);
          a.append(img, tag, name, meta, price);
          rail.appendChild(a);
        });
        c.append(head, rail);
      });
    }).catch(function () {});
  });
})();
