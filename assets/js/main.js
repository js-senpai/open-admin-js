const menuButton = document.querySelector("[data-menu-button]");
const nav = document.querySelector(".nav");

if (menuButton && nav) {
  menuButton.addEventListener("click", () => {
    nav.classList.toggle("is-open");
  });
}

const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

if (!prefersReducedMotion) {
  const revealEls = document.querySelectorAll(".reveal-on-scroll");
  if (revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    for (const el of revealEls) io.observe(el);
  }
} else {
  for (const el of document.querySelectorAll(".reveal-on-scroll")) {
    el.classList.add("is-visible");
  }
}

function initDocsPage() {
  for (const btn of document.querySelectorAll("[data-copy-code]")) {
    btn.addEventListener("click", async () => {
      const block = btn.closest(".docs-code-block");
      const code = block?.querySelector("code");
      if (!(code instanceof HTMLElement)) return;
      const text = code.textContent ?? "";
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.classList.remove("copied");
        }, 2000);
      } catch {
        btn.textContent = "Failed";
        setTimeout(() => {
          btn.textContent = "Copy";
        }, 2000);
      }
    });
  }

  const navLinks = document.querySelectorAll(".docs-sidebar--nest a[href^='#']");
  const contentEl = document.querySelector(".docs-content--nest");
  const searchInput = document.querySelector("[data-docs-search]");
  const searchMeta = document.querySelector("[data-docs-search-meta]");

  const sectionIdForAnchor = (id) => {
    if (!id || !contentEl) return id;
    const el = document.getElementById(id);
    if (!el) return id;
    if (el.tagName === "SECTION" && el.id) return el.id;
    const section = el.closest("section[id]");
    return section?.id ?? id;
  };

  const setActive = (id) => {
    if (!id) return;
    const sidebarId = sectionIdForAnchor(id);
    const sidebarHref = sidebarId ? `#${sidebarId}` : `#${id}`;
    for (const a of navLinks) {
      a.classList.toggle("is-active", a.getAttribute("href") === sidebarHref);
    }
  };

  const scrollSpyTargets = () => {
    if (!contentEl) return [];
    const ordered = [];
    for (const sec of contentEl.querySelectorAll("section[id]")) {
      ordered.push(sec);
      for (const h3 of sec.querySelectorAll("h3[id]")) ordered.push(h3);
    }
    return ordered;
  };

  const updateScrollSpy = () => {
    if (!contentEl) return;
    const y = window.scrollY + 140;
    const heads = scrollSpyTargets().filter((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      return top <= y + 2;
    });
    const active = heads[heads.length - 1];
    if (active?.id) setActive(active.id);
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateScrollSpy();
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  updateScrollSpy();

  const fromHash = () => {
    const id = location.hash.replace(/^#/, "");
    if (id) setActive(id);
    else updateScrollSpy();
  };
  fromHash();
  window.addEventListener("hashchange", fromHash);

  if (searchInput instanceof HTMLInputElement && contentEl instanceof HTMLElement) {
    const sections = Array.from(contentEl.querySelectorAll("section[id]"));

    const updateSearch = () => {
      const query = searchInput.value.trim().toLowerCase();
      let visibleCount = 0;

      for (const section of sections) {
        const haystack = (section.textContent ?? "").toLowerCase();
        const visible = !query || haystack.includes(query);
        section.classList.toggle("docs-hidden", !visible);
        if (visible) visibleCount += 1;
      }

      for (const link of navLinks) {
        const href = link.getAttribute("href");
        const targetId = href?.startsWith("#") ? href.slice(1) : "";
        const targetSection = targetId ? contentEl.querySelector(`section[id="${targetId}"]`) : null;
        const visible = targetSection ? !targetSection.classList.contains("docs-hidden") : true;
        link.classList.toggle("docs-hidden", !visible);
      }

      const navGroups = document.querySelectorAll(".docs-sidebar--nest .docs-nav-group");
      for (const group of navGroups) {
        const hasVisibleLink = Array.from(group.querySelectorAll("a")).some((a) => !a.classList.contains("docs-hidden"));
        group.classList.toggle("docs-hidden", !hasVisibleLink);
      }

      if (searchMeta instanceof HTMLElement) {
        if (!query) {
          searchMeta.textContent = "Type to filter documentation sections.";
        } else if (visibleCount === 0) {
          searchMeta.textContent = "No matches. Try a broader phrase.";
        } else {
          searchMeta.textContent = `Found ${visibleCount} matching section${visibleCount === 1 ? "" : "s"}.`;
        }
      }
    };

    searchInput.addEventListener("input", updateSearch);
    updateSearch();
  }
}

if (document.body.classList.contains("site-body--docs")) {
  initDocsPage();
}

for (const card of document.querySelectorAll("[data-wallet]")) {
  const btn = card.querySelector("[data-copy]");
  const code = card.querySelector(".wallet-address");
  if (!btn || !code || !(code instanceof HTMLElement)) continue;

  btn.addEventListener("click", async () => {
    const text = code.textContent?.trim() ?? "";
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 2000);
    } catch {
      btn.textContent = "Select & copy";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 2500);
    }
  });
}
