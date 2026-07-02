(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = window.matchMedia('(pointer: fine)').matches;
  const heavyMotionEnabled = !prefersReducedMotion && isFinePointer && window.innerWidth >= 980;

  const revealTargets = Array.from(document.querySelectorAll('section, article, .hero-content, .hero-booking, .order-left, .order-right, .order-card'));

  revealTargets.forEach((el, index) => {
    el.classList.add('reveal');
    el.style.setProperty('--delay', `${Math.min(index * 28, 260)}ms`);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-in');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  revealTargets.forEach((target) => observer.observe(target));

  const hero = document.querySelector('.hero');
  const floating = document.querySelectorAll('.hero-content, .hero-booking, .order-right');

  if (hero && heavyMotionEnabled) {
    hero.classList.add('drift-bg');
  }

  if (heavyMotionEnabled) {
    floating.forEach((el) => el.classList.add('float-card'));
  }

  const pulseTargets = document.querySelectorAll('.btn-gold, .checkout-btn, .checkout-next, .mobile-cart-bar button, .cta');
  if (heavyMotionEnabled) {
    pulseTargets.forEach((el) => el.classList.add('pulse-highlight'));
  }

  if (heavyMotionEnabled) {
    let rafId = 0;
    let mouseX = 0;
    let mouseY = 0;

    const applyParallax = () => {
      const x = (mouseX / window.innerWidth - 0.5) * 6;
      const y = (mouseY / window.innerHeight - 0.5) * 6;

      floating.forEach((el, idx) => {
        const factor = idx === 0 ? 1 : 0.65;
        el.style.transform = `translate3d(${x * factor}px, ${y * factor}px, 0)`;
      });

      rafId = 0;
    };

    window.addEventListener('mousemove', (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      if (!rafId) {
        rafId = window.requestAnimationFrame(applyParallax);
      }
    });
  }
})();
