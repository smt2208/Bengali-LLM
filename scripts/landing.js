/* ============================================================
   Bengali LLM — Landing Page JavaScript
   ============================================================ */

'use strict';

// ─── Navbar scroll effect ──────────────────────────────────
const navbar = document.getElementById('navbar');
const handleScroll = () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
};
window.addEventListener('scroll', handleScroll, { passive: true });

// ─── Navbar active link on scroll ─────────────────────────
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(link => {
        link.classList.toggle(
          'active',
          link.getAttribute('href') === `#${entry.target.id}`
        );
      });
    }
  });
}, { rootMargin: '-40% 0px -55% 0px' });
sections.forEach(s => sectionObserver.observe(s));

// ─── Mobile menu ───────────────────────────────────────────
const hamburgerBtn   = document.getElementById('hamburger-btn');
const mobileOverlay  = document.getElementById('mobile-overlay');
const mobileCloseBtn = document.getElementById('mobile-close-btn');
const mobileLinks    = document.querySelectorAll('.mobile-link, .mobile-cta');

const openMenu = () => {
  mobileOverlay.classList.add('open');
  mobileOverlay.removeAttribute('aria-hidden');
  hamburgerBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
};
const closeMenu = () => {
  mobileOverlay.classList.remove('open');
  mobileOverlay.setAttribute('aria-hidden', 'true');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
};

hamburgerBtn?.addEventListener('click', openMenu);
mobileCloseBtn?.addEventListener('click', closeMenu);
mobileLinks.forEach(link => link.addEventListener('click', closeMenu));
mobileOverlay?.addEventListener('click', (e) => {
  if (e.target === mobileOverlay) closeMenu();
});

// ─── Comparison Tabs ───────────────────────────────────────
const compTabs   = document.querySelectorAll('.comp-tab');
const compPanels = document.querySelectorAll('.comp-panel');

compTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    // Update tabs
    compTabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    // Update panels
    compPanels.forEach(panel => {
      const isTarget = panel.id === `comp-panel-${targetTab}`;
      panel.classList.toggle('active', isTarget);
      if (isTarget) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    });
  });

  // Keyboard accessibility
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tab.click();
    }
  });
});

// ─── Metric bars animation on scroll ──────────────────────
const metricBars = document.querySelectorAll('.metric-bar');
const metricsObserver = new IntersectionObserver((entries) => {
  entries.forEach(bar => {
    if (bar.isIntersecting) {
      const el   = bar.target;
      const fill = el.style.getPropertyValue('--fill');
      el.style.width = fill;
      metricsObserver.unobserve(el);
    }
  });
}, { threshold: 0.3 });
metricBars.forEach(bar => {
  bar.style.width = '0%';
  metricsObserver.observe(bar);
});

// ─── Scroll-reveal animations ──────────────────────────────
const revealEls = document.querySelectorAll(
  '.glass-card, .dataset-card, .about-card, .metric-card'
);
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }, i * 60);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
revealEls.forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  revealObserver.observe(el);
});

// ─── Smooth scroll for anchor links ───────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ─── Fallback logo ─────────────────────────────────────────
document.querySelectorAll('img[src*="cu-logo"]').forEach(img => {
  img.addEventListener('error', () => {
    img.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='42' height='42' viewBox='0 0 42 42'>
      <circle cx='21' cy='21' r='21' fill='%230d1428'/>
      <circle cx='21' cy='21' r='19' fill='none' stroke='%2300d4c8' stroke-width='1.5'/>
      <text x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' fill='%23f5c842' font-size='14' font-family='Arial' font-weight='bold'>CU</text>
    </svg>`;
  });
});

console.log('%c Bengali LLM — CU Data Science Lab 🎓', 'color:#00d4c8;font-weight:bold;font-size:14px;');
