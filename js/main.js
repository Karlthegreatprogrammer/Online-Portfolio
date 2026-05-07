const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const siteHeader = document.querySelector(".site-header");
const navLinks = [...document.querySelectorAll(".site-nav a")];
const sections = [...document.querySelectorAll("[data-section]")];
const footerYear = document.querySelector("[data-year]");
const themeToggles = [...document.querySelectorAll("[data-theme-toggle]")];
const themeMeta = document.querySelector("meta[name='theme-color']");
const siteFavicon = document.querySelector("[data-site-favicon]");
const carouselTracks = [...document.querySelectorAll("[data-carousel]")];
const projectFilterButtons = [...document.querySelectorAll("[data-project-filter]")];
const THEME_STORAGE_KEY = "karlforge-theme";
const assetRoot = document.documentElement.dataset.assetRoot || "";
const siteRoot = document.documentElement.dataset.siteRoot || "";
const LOADER_DELAY_MS = 140;

const createPageLoader = () => {
  const loader = document.createElement("div");
  loader.className = "page-loader";
  loader.hidden = true;
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.setAttribute("aria-atomic", "true");
  loader.innerHTML = `
    <div class="page-loader-panel">
      <span class="page-loader-mark" aria-hidden="true"></span>
      <span class="page-loader-text">Loading</span>
      <span class="page-loader-bar" aria-hidden="true"><span></span></span>
    </div>
  `;

  document.body.append(loader);

  return loader;
};

const pageLoader = createPageLoader();
let loaderTimer = 0;

const setPageLoading = (isLoading, message = "Loading") => {
  window.clearTimeout(loaderTimer);

  if (!isLoading) {
    pageLoader.hidden = true;
    pageLoader.classList.remove("is-visible");
    document.documentElement.classList.remove("is-page-loading");
    return;
  }

  const text = pageLoader.querySelector(".page-loader-text");

  if (text) {
    text.textContent = message;
  }

  loaderTimer = window.setTimeout(() => {
    pageLoader.hidden = false;
    pageLoader.classList.add("is-visible");
    document.documentElement.classList.add("is-page-loading");
  }, LOADER_DELAY_MS);
};

const watchImageLoading = (image, shell = image?.parentElement, message = "Loading image") => {
  if (!image || !shell) {
    return;
  }

  const finish = () => {
    window.clearTimeout(Number(shell.dataset.loadingTimer || 0));
    shell.classList.remove("is-loading", "is-loading-visible");
    shell.classList.add("is-loaded");
    shell.removeAttribute("aria-busy");
    shell.removeAttribute("aria-label");
  };

  if (image.complete && image.naturalWidth > 0) {
    finish();
    return;
  }

  shell.classList.add("is-loading");
  shell.setAttribute("aria-busy", "true");

  const timer = window.setTimeout(() => {
    shell.classList.add("is-loading-visible");
    shell.setAttribute("aria-label", message);
  }, LOADER_DELAY_MS);

  shell.dataset.loadingTimer = String(timer);
  image.addEventListener("load", finish, { once: true });
  image.addEventListener("error", finish, { once: true });
};

window.KarlForgeLoading = {
  show: (message = "Loading") => setPageLoading(true, message),
  hide: () => setPageLoading(false),
  watchImage: watchImageLoading,
};

const getAssetPath = (path) => {
  if (!path || /^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith("/") || path.startsWith("data:")) {
    return path;
  }

  return `${assetRoot}${path}`;
};

const renderProjectCards = () => {
  const projectGrid = document.querySelector("[data-project-grid]");
  const projects = window.KARLFORGE_PROJECTS;

  if (!projectGrid || !Array.isArray(projects)) {
    return;
  }

  const cards = projects.map((project) => {
    const card = document.createElement("a");
    card.className = "project-card";
    card.href = `${siteRoot}projects/${project.slug}/`;
    card.setAttribute("aria-label", `View ${project.title} case study`);
    card.dataset.projectCategories = (project.categoryTags || []).join("|");

    const media = document.createElement("div");
    media.className = "project-card-media";

    const image = document.createElement("img");
    image.src = getAssetPath(project.image);
    image.alt = project.imageAlt || `${project.title} project preview`;
    image.loading = "lazy";
    image.decoding = "async";
    watchImageLoading(image, media, `${project.title} preview loading`);

    const overlay = document.createElement("span");
    overlay.className = "project-card-overlay";
    overlay.textContent = "View Case Study";

    media.append(image, overlay);

    const copy = document.createElement("div");
    copy.className = "project-card-copy";

    const title = document.createElement("h3");
    title.textContent = project.title;

    const description = document.createElement("p");
    description.textContent = project.shortDescription;

    const tags = document.createElement("div");
    tags.className = "project-tags";

    project.techStack.slice(0, 3).forEach((tech) => {
      const tag = document.createElement("span");
      tag.textContent = tech;
      tags.append(tag);
    });

    const action = document.createElement("span");
    action.className = "project-card-action";
    action.textContent = "View Project";

    copy.append(title, description, tags, action);
    card.append(media, copy);

    return card;
  });

  projectGrid.replaceChildren(...cards);
};

renderProjectCards();

const setupProjectFilters = () => {
  const projectGrid = document.querySelector("[data-project-grid]");

  if (!projectGrid || !projectFilterButtons.length) {
    return;
  }

  const applyFilter = (filter) => {
    const cards = [...projectGrid.querySelectorAll(".project-card")];

    projectFilterButtons.forEach((button) => {
      const isActive = button.dataset.projectFilter === filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    cards.forEach((card) => {
      const categories = (card.dataset.projectCategories || "").split("|").filter(Boolean);
      const isVisible = filter === "All" || categories.includes(filter);
      card.hidden = !isVisible;
    });
  };

  projectFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyFilter(button.dataset.projectFilter || "All");
    });
  });

  applyFilter("All");
};

setupProjectFilters();

const renderSkillIcon = (skill) => {
  if (skill.icon) {
    const image = document.createElement("img");
    image.src = getAssetPath(skill.icon);
    image.alt = "";
    image.width = 22;
    image.height = 22;
    image.loading = "lazy";
    image.decoding = "async";
    return image;
  }

  const mark = document.createElement("span");
  mark.className = "tech-mark tech-mark-blue";
  mark.textContent = skill.mark || skill.name.slice(0, 2).toUpperCase();
  return mark;
};

const setupSkillDetails = () => {
  const skillStrip = document.querySelector("[data-skills-strip]");
  const modal = document.querySelector("[data-skill-modal]");
  const skills = window.KARLFORGE_SKILLS;

  if (!skillStrip || !modal || !Array.isArray(skills)) {
    return;
  }

  const projectMap = new Map((window.KARLFORGE_PROJECTS || []).map((project) => [project.slug, project]));
  let lastFocusedElement = null;

  const title = modal.querySelector("[data-skill-title]");
  const category = modal.querySelector("[data-skill-category]");
  const description = modal.querySelector("[data-skill-description]");
  const how = modal.querySelector("[data-skill-how]");
  const official = modal.querySelector("[data-skill-official]");
  const officialLabel = modal.querySelector("[data-skill-official-label]");
  const related = modal.querySelector("[data-skill-related]");
  const previewIcon = modal.querySelector("[data-skill-preview-icon]");
  const previewKicker = modal.querySelector("[data-skill-preview-kicker]");
  const previewTitle = modal.querySelector("[data-skill-preview-title]");
  const previewItems = modal.querySelector("[data-skill-preview-items]");
  const panel = modal.querySelector(".skill-modal-panel");

  const getSkillButtons = () => [...skillStrip.querySelectorAll("[data-skill-trigger]")];

  const closeSkillModal = () => {
    modal.classList.remove("is-visible");
    document.body.classList.remove("modal-open");
    getSkillButtons().forEach((button) => {
      button.classList.remove("is-active");
      button.setAttribute("aria-expanded", "false");
    });

    window.setTimeout(() => {
      modal.hidden = true;
    }, 180);

    if (lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus({ preventScroll: true });
    }
  };

  const fillRelatedProjects = (skill) => {
    if (!related) {
      return;
    }

    const links = skill.projectSlugs
      .map((slug) => projectMap.get(slug))
      .filter(Boolean)
      .map((project) => {
        const link = document.createElement("a");
        link.href = `${siteRoot}projects/${project.slug}/`;
        link.textContent = project.title;
        return link;
      });

    if (!links.length) {
      const empty = document.createElement("span");
      empty.className = "skill-related-empty";
      empty.textContent = "No linked case study yet";
      related.replaceChildren(empty);
      return;
    }

    related.replaceChildren(...links);
  };

  const fillPreview = (skill) => {
    if (previewIcon) {
      previewIcon.replaceChildren(renderSkillIcon(skill));
    }

    if (previewKicker) {
      previewKicker.textContent = skill.previewKicker || skill.category;
    }

    if (previewTitle) {
      previewTitle.textContent = skill.previewTitle || skill.name;
    }

    if (previewItems) {
      previewItems.replaceChildren(
        ...skill.previewItems.map((item) => {
          const chip = document.createElement("span");
          chip.textContent = item;
          return chip;
        })
      );
    }
  };

  const openSkillModal = (skill, trigger) => {
    lastFocusedElement = trigger;

    if (title) {
      title.textContent = skill.name;
    }

    if (category) {
      category.textContent = skill.category;
    }

    if (description) {
      description.textContent = skill.description;
    }

    if (how) {
      how.textContent = skill.howIUse;
    }

    if (official) {
      official.href = skill.officialUrl;
    }

    if (officialLabel) {
      officialLabel.textContent = `Visit ${skill.name}`;
    }

    fillRelatedProjects(skill);
    fillPreview(skill);

    getSkillButtons().forEach((button) => {
      const isActive = button.dataset.skillTrigger === skill.slug;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-expanded", String(isActive));
    });

    modal.hidden = false;
    document.body.classList.add("modal-open");

    window.requestAnimationFrame(() => {
      modal.classList.add("is-visible");
      modal.querySelector("[data-skill-close]")?.focus({ preventScroll: true });
    });
  };

  const buttons = skills.map((skill) => {
    const button = document.createElement("button");
    button.className = "tech-pill skill-pill";
    button.type = "button";
    button.dataset.skillTrigger = skill.slug;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", `Open ${skill.name} skill details`);

    const label = document.createElement("span");
    label.textContent = skill.name;

    button.append(renderSkillIcon(skill), label);
    button.addEventListener("click", () => openSkillModal(skill, button));

    return button;
  });

  const titleElement = skillStrip.querySelector("#skills-title");
  skillStrip.replaceChildren(...(titleElement ? [titleElement] : []), ...buttons);

  modal.addEventListener("click", (event) => {
    const target = event.target;

    if (target instanceof Element && target.closest("[data-skill-close]")) {
      closeSkillModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (modal.hidden) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSkillModal();
      return;
    }

    if (event.key !== "Tab" || !panel) {
      return;
    }

    const focusable = [
      ...panel.querySelectorAll("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"),
    ].filter((element) => element instanceof HTMLElement && !element.hasAttribute("hidden"));

    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
};

setupSkillDetails();

const setupRouteLoading = () => {
  document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element) || event.defaultPrevented) {
      return;
    }

    const link = target.closest("a[href]");

    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }

    const isModifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

    if (isModifiedClick || link.target || link.hasAttribute("download") || link.getAttribute("aria-disabled") === "true") {
      return;
    }

    const url = new URL(link.href, window.location.href);
    const currentUrl = new URL(window.location.href);
    const isSameDocument =
      url.origin === currentUrl.origin &&
      url.pathname === currentUrl.pathname &&
      url.search === currentUrl.search &&
      url.hash;

    if (url.origin !== currentUrl.origin || isSameDocument) {
      return;
    }

    setPageLoading(true, "Opening page");
  });

  window.addEventListener("pageshow", () => setPageLoading(false));
  window.addEventListener("load", () => setPageLoading(false));
};

setupRouteLoading();

const animatedItems = [
  ...document.querySelectorAll(
    [
      ".hero-copy",
      ".hero-showcase",
      ".hero-stats",
      ".skills-strip-shell",
      ".section-heading",
      ".currently-heading",
      ".currently-card",
      ".projects-intro",
      ".experience-intro",
      ".capability-card",
      ".project-card",
      ".project-detail-preview",
      ".project-detail-copy",
      ".project-detail-panel",
      ".project-detail-bottom",
      ".cv-hero-copy",
      ".cv-profile-panel",
      ".cv-panel",
      ".quote-card",
      ".contact-shell",
    ].join(", ")
  ),
];

if (footerYear) {
  footerYear.textContent = new Date().getFullYear();
}

const updateLayoutMetrics = () => {
  if (!siteHeader) {
    return;
  }

  document.documentElement.style.setProperty("--site-header-height", `${siteHeader.offsetHeight}px`);
};

const getSavedTheme = () => {
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY);
    return theme === "dark" || theme === "light" ? theme : null;
  } catch (error) {
    return null;
  }
};

const getUrlTheme = () => {
  try {
    const theme = new URLSearchParams(window.location.search).get("theme");
    return theme === "dark" || theme === "light" ? theme : null;
  } catch (error) {
    return null;
  }
};

const saveTheme = (theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // Theme still works for the current session if storage is unavailable.
  }
};

const applyTheme = (theme, { persist = true } = {}) => {
  const nextTheme = theme === "dark" ? "dark" : "light";
  const isDark = nextTheme === "dark";

  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;

  if (themeMeta) {
    themeMeta.setAttribute("content", isDark ? "#000000" : "#ffffff");
  }

  if (siteFavicon) {
    siteFavicon.setAttribute(
      "href",
      getAssetPath(isDark ? "assets/images/karlforge-logo-light.png" : "assets/images/karlforge-logo-dark.png")
    );
  }

  themeToggles.forEach((toggle) => {
    const label = isDark ? "Switch to light mode" : "Switch to dark mode";
    const icon = toggle.querySelector("[data-theme-icon]");
    const text = toggle.querySelector("[data-theme-text]");

    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.title = label;

    if (icon) {
      icon.textContent = isDark ? "\u2600" : "\u263E";
    }

    if (text) {
      text.textContent = isDark ? "Light mode" : "Dark mode";
    }
  });

  if (persist) {
    saveTheme(nextTheme);
  }
};

const initialTheme = getUrlTheme() || getSavedTheme() || document.documentElement.dataset.theme || "light";
applyTheme(initialTheme, { persist: false });
updateLayoutMetrics();

themeToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(currentTheme === "dark" ? "light" : "dark");

    if (toggle.classList.contains("mobile-theme-link")) {
      closeMenu();
    }
  });
});

const closeMenu = () => {
  if (!navToggle || !siteNav) {
    return;
  }

  navToggle.setAttribute("aria-expanded", "false");
  siteNav.classList.remove("is-open");
  document.body.classList.remove("menu-open");
};

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isExpanded = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isExpanded));
    siteNav.classList.toggle("is-open", !isExpanded);
    document.body.classList.toggle("menu-open", !isExpanded);
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Node)) {
      return;
    }

    const clickedThemeToggle = themeToggles.some((toggle) => toggle.contains(target));

    if (!siteNav.contains(target) && !navToggle.contains(target) && !clickedThemeToggle) {
      closeMenu();
    }
  });
}

const setActiveNav = () => {
  if (!sections.length || !navLinks.length) {
    return;
  }

  const offset = window.scrollY + 140;
  let activeId = "home";

  sections.forEach((section) => {
    if (section.offsetTop <= offset) {
      activeId = section.id;
    }
  });

  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === `#${activeId}`);
  });
};

window.addEventListener("scroll", setActiveNav, { passive: true });
window.addEventListener("resize", setActiveNav);
window.addEventListener("resize", updateLayoutMetrics);
window.addEventListener("load", updateLayoutMetrics);
setActiveNav();

const setupRevealMotion = () => {
  if (!animatedItems.length) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  animatedItems.forEach((item) => {
    item.classList.add("animate-in");
  });

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    animatedItems.forEach((item) => {
      item.classList.add("is-visible");
    });
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.12,
    }
  );

  animatedItems.forEach((item) => {
    revealObserver.observe(item);
  });
};

setupRevealMotion();

const setupCarouselProgress = () => {
  if (!carouselTracks.length) {
    return;
  }

  carouselTracks.forEach((track) => {
    const carouselName = track.dataset.carousel;
    const progress = document.querySelector(`[data-carousel-dots="${carouselName}"]`);

    if (!carouselName || !progress) {
      return;
    }

    const getCards = () =>
      [...track.children].filter((child) => {
        if (!(child instanceof HTMLElement)) {
          return false;
        }

        return window.getComputedStyle(child).display !== "none";
      });

    const update = () => {
      const cards = getCards();

      if (!cards.length) {
        progress.replaceChildren();
        return;
      }

      if (progress.children.length !== cards.length) {
        progress.replaceChildren(
          ...cards.map((_, index) => {
            const dot = document.createElement("button");
            dot.type = "button";
            dot.setAttribute("aria-label", `Go to ${carouselName} card ${index + 1}`);
            dot.dataset.carouselIndex = String(index);
            return dot;
          })
        );
      }

      const firstCard = cards[0];
      const secondCard = cards[1];
      const scrollStep = secondCard
        ? secondCard.offsetLeft - firstCard.offsetLeft
        : firstCard.offsetWidth;
      const activeIndex = Math.min(
        cards.length - 1,
        Math.max(0, Math.round(track.scrollLeft / Math.max(scrollStep, 1)))
      );

      [...progress.children].forEach((dot, index) => {
        dot.classList.toggle("is-active", index === activeIndex);
      });
    };

    let rafId = 0;
    const requestUpdate = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(update);
    };

    progress.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const dot = target.closest("[data-carousel-index]");

      if (!(dot instanceof HTMLElement)) {
        return;
      }

      const cards = getCards();
      const targetCard = cards[Number(dot.dataset.carouselIndex)];

      if (targetCard) {
        track.scrollTo({
          left: targetCard.offsetLeft - track.offsetLeft,
          behavior: "smooth",
        });
      }
    });

    track.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    update();
  });
};

setupCarouselProgress();
