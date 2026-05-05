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
