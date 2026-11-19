// Écran « Déco & peinture » : palette, mur d'accent, pots de peinture et déco réels du projet.
(function () {
  if (!Nestr.live) return;
  Nestr.project().then(function (job) {
    if (!job || job.status !== 'done') return;
    var c = document.body.firstElementChild.children[0];
    var subtitle = c.children[1], swatches = c.children[2], accent = c.children[3], others = c.children[4];
    var tipsTitle = c.children[5], tips = c.children[6];
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
      row.children[1].textContent = p.name.split(',')[0] + ' · ' + Nestr.dims(p);
      var price = document.createElement('p');
      price.style.cssText = 'margin:0;font-size:15px;font-weight:600;white-space:nowrap';
      price.textContent = Nestr.euro(p.price_eur);
      row.replaceChild(price, row.children[2]);
      row.style.cursor = 'pointer';
      row.addEventListener('click', function () { window.open(p.url, '_blank', 'noopener'); });
      tips.appendChild(row);
    });
  });
})();
