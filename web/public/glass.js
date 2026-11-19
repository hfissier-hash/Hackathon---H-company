// Nestr — comportements de la couche « liquid glass » (voir glass.css).
// 1. le reflet d'un élément en verre suit le pointeur ; 2. les cartes s'inclinent sous le doigt ;
// 3. sur les navigateurs qui le permettent, la barre d'onglets déforme ce qui passe derrière, comme une goutte.
(function () {
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reflet : --mx / --my sont lus par les fonds de glass.css.
  var lit = null;
  document.addEventListener('pointermove', function (ev) {
    var el = ev.target.closest && ev.target.closest('[style*="var(--surface)"], [style*="var(--birch)"], [style*="var(--pine)"]');
    if (lit && lit !== el) { lit.style.removeProperty('--mx'); lit.style.removeProperty('--my'); }
    lit = el;
    if (!el || el === document.body.firstElementChild) return;
    var box = el.getBoundingClientRect();
    el.style.setProperty('--mx', (ev.clientX - box.left) + 'px');
    el.style.setProperty('--my', (ev.clientY - box.top) + 'px');
  }, { passive: true });

  // Inclinaison des cartes de style.
  if (!calm) {
    document.addEventListener('pointermove', function (ev) {
      var card = ev.target.closest && ev.target.closest('.style-card');
      document.querySelectorAll('.style-card').forEach(function (c) { if (c !== card) c.style.transform = ''; });
      if (!card) return;
      var b = card.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width - 0.5, y = (ev.clientY - b.top) / b.height - 0.5;
      card.style.transform = 'perspective(600px) rotateX(' + (-y * 9).toFixed(2) + 'deg) rotateY(' + (x * 9).toFixed(2) + 'deg) translateY(-2px)';
    }, { passive: true });
    document.addEventListener('pointerleave', function () {
      document.querySelectorAll('.style-card').forEach(function (c) { c.style.transform = ''; });
    });
  }

  // Réfraction : un filtre SVG en fond de verre, compris par Chrome et Edge seulement.
  var chromium = !!window.chrome && CSS.supports('backdrop-filter', 'blur(2px)');
  if (chromium && !calm) {
    document.addEventListener('DOMContentLoaded', function () {
      var holder = document.createElement('div');
      holder.setAttribute('aria-hidden', 'true');
      holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      // Même recette que le bouton « liquid glass » de référence : bruit, déplacement, léger flou.
      holder.innerHTML = '<svg width="0" height="0"><defs><filter id="lg-liquid" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.05 0.05" numOctaves="1" seed="1" result="turbulence"/>' +
        '<feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="70" xChannelSelector="R" yChannelSelector="B" result="displaced"/>' +
        '<feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur"/>' +
        '<feComposite in="finalBlur" in2="finalBlur" operator="over"/></filter></defs></svg>';
      document.body.appendChild(holder);
      document.documentElement.classList.add('lg-refract');
    });
  }
})();
