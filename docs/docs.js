/**
 * Warden Documentation — Interactive Script
 * Search modal, code copy, smooth scrolling, lightbox, and scrollspy.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ── 1. SEARCH INDEX & MODAL ──
  const searchIndex = [];
  const sections = document.querySelectorAll('.doc-section, h2[id], h3[id], div[id]');

  sections.forEach((sec) => {
    const title = sec.getAttribute('data-title') || sec.querySelector('h2, h3')?.innerText.trim() || sec.innerText.split('\n')[0].trim();
    const id = sec.id || sec.getAttribute('id');
    const parentSection = sec.closest('.doc-section');
    const group = parentSection?.getAttribute('data-group') || 'Documentation';
    if (id && title && title.length < 60) {
      searchIndex.push({
        id,
        title,
        group,
        content: sec.innerText.toLowerCase(),
      });
    }
  });

  const searchModalBackdrop = document.getElementById('searchModalBackdrop');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const searchTriggers = document.querySelectorAll('.search-trigger');

  function openSearch() {
    searchModalBackdrop.classList.add('open');
    searchInput.value = '';
    searchInput.focus();
    renderSearchResults('');
  }

  function closeSearch() {
    searchModalBackdrop.classList.remove('open');
  }

  searchTriggers.forEach((btn) => btn.addEventListener('click', openSearch));

  searchModalBackdrop?.addEventListener('click', (e) => {
    if (e.target === searchModalBackdrop) closeSearch();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (searchModalBackdrop.classList.contains('open')) {
        closeSearch();
      } else {
        openSearch();
      }
    }
    if (e.key === 'Escape' && searchModalBackdrop.classList.contains('open')) {
      closeSearch();
    }
  });

  function renderSearchResults(query) {
    if (!searchResults) return;
    const q = query.trim().toLowerCase();
    const matches = q
      ? searchIndex.filter((item) => item.title.toLowerCase().includes(q) || item.content.includes(q)).slice(0, 8)
      : searchIndex.slice(0, 6);

    if (matches.length === 0) {
      searchResults.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-dim); font-size: 13px;">No results found for "${query}"</div>`;
      return;
    }

    searchResults.innerHTML = matches
      .map(
        (m, idx) => `
        <a href="#${m.id}" class="search-item ${idx === 0 ? 'selected' : ''}">
          <div class="search-item-title">${m.title}</div>
          <div class="search-item-section">${m.group} • #${m.id}</div>
        </a>
      `
      )
      .join('');

    // Attach click handlers to newly created search items
    searchResults.querySelectorAll('.search-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const href = item.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          closeSearch();
          scrollToTarget(href.slice(1));
        }
      });
    });
  }

  searchInput?.addEventListener('input', (e) => {
    renderSearchResults(e.target.value);
  });

  // ── 2. CODE BLOCK COPY BUTTONS ──
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-target');
      const codeEl = targetId ? document.getElementById(targetId) : btn.closest('.code-block-wrapper').querySelector('pre code');
      if (!codeEl) return;

      try {
        await navigator.clipboard.writeText(codeEl.innerText);
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
        btn.style.borderColor = 'var(--color-accent)';
        btn.style.color = 'var(--color-accent)';
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.style.borderColor = '';
          btn.style.color = '';
        }, 2000);
      } catch (err) {
        console.error('Failed to copy code: ', err);
      }
    });
  });

  // ── 3. LIGHTBOX MODAL ──
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxImg = document.getElementById('lightboxImg');

  document.querySelectorAll('.screenshot-container img').forEach((img) => {
    img.parentElement.addEventListener('click', () => {
      if (lightboxModal && lightboxImg) {
        lightboxImg.src = img.src;
        lightboxModal.classList.add('open');
      }
    });
  });

  lightboxModal?.addEventListener('click', () => {
    lightboxModal.classList.remove('open');
  });

  // ── 4. SCROLLSPY & SMOOTH NAVIGATION ──
  const navLinks = document.querySelectorAll('.sidebar-link');
  const tocLinks = document.querySelectorAll('.toc-link');

  const linkTargetIds = Array.from(
    new Set([
      ...Array.from(navLinks).map((l) => l.getAttribute('href')?.replace('#', '')),
      ...Array.from(tocLinks).map((l) => l.getAttribute('href')?.replace('#', '')),
    ])
  ).filter(Boolean);

  let isManualClick = false;

  function setActiveLink(targetId) {
    if (!targetId) return;
    navLinks.forEach((link) => {
      if (link.getAttribute('href') === `#${targetId}`) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    tocLinks.forEach((link) => {
      if (link.getAttribute('href') === `#${targetId}`) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  function scrollToTarget(targetId) {
    if (!targetId) return;
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    isManualClick = true;
    setActiveLink(targetId);

    const headerOffset = 72;
    const elementPosition = targetEl.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

    window.scrollTo({
      top: Math.max(0, offsetPosition),
      behavior: 'smooth',
    });

    if (history.pushState) {
      history.pushState(null, null, '#' + targetId);
    }

    if (window.manualClickTimeout) clearTimeout(window.manualClickTimeout);
    window.manualClickTimeout = setTimeout(() => {
      isManualClick = false;
      setActiveLink(targetId);
    }, 1000);
  }

  // Intercept all internal anchor clicks for smooth scrolling
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || href === '#') return;
      const targetId = href.slice(1);
      if (targetId) {
        e.preventDefault();
        scrollToTarget(targetId);

        // Close mobile drawer if open
        if (window.innerWidth <= 860) {
          const sidebar = document.getElementById('docsSidebar');
          sidebar?.classList.remove('open');
        }
      }
    });
  });

  function updateActiveNav() {
    if (isManualClick) return;

    const elements = linkTargetIds
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .sort((a, b) => a.offsetTop - b.offsetTop);

    const scrollPos = window.scrollY + 100;
    let currentId = elements[0]?.id || '';

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.offsetTop <= scrollPos) {
        currentId = el.id;
      } else {
        break;
      }
    }

    if (currentId) {
      setActiveLink(currentId);
    }
  }

  window.addEventListener('scroll', updateActiveNav, { passive: true });
  updateActiveNav();

  // ── 5. MOBILE SIDEBAR DRAWER ──
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('docsSidebar');

  mobileToggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
  });
});
