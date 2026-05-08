const projectDetail = document.querySelector("[data-project-detail]");

const getDetailAssetPath = (path) => {
  const detailAssetRoot = document.documentElement.dataset.assetRoot || "";

  if (!path || /^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith("/") || path.startsWith("data:")) {
    return path;
  }

  return `${detailAssetRoot}${path}`;
};

const getCurrentProjectSlug = () => {
  if (projectDetail?.dataset.projectSlug) {
    return projectDetail.dataset.projectSlug;
  }

  const parts = window.location.pathname.split("/").filter(Boolean);
  const lastPart = parts.at(-1);

  return lastPart === "index.html" ? parts.at(-2) : lastPart;
};

const setDetailText = (selector, text) => {
  const element = projectDetail.querySelector(selector);

  if (element) {
    element.textContent = text || "";
  }
};

const renderList = (selector, items) => {
  const list = projectDetail.querySelector(selector);

  if (!list) {
    return;
  }

  list.replaceChildren(
    ...(items || []).map((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      return listItem;
    })
  );
};

const renderTags = (selector, items) => {
  const tags = projectDetail.querySelector(selector);

  if (!tags) {
    return;
  }

  tags.replaceChildren(
    ...(items || []).map((item) => {
      const tag = document.createElement("span");
      tag.textContent = item;
      return tag;
    })
  );
};

const setProjectLink = (selector, url, availableLabel, unavailableLabel) => {
  const link = projectDetail.querySelector(selector);

  if (!link) {
    return;
  }

  const label = link.querySelector("[data-project-link-label]") || link;

  if (url) {
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.classList.remove("is-disabled");
    link.removeAttribute("aria-disabled");
    label.textContent = availableLabel;
    return;
  }

  link.removeAttribute("href");
  link.removeAttribute("target");
  link.removeAttribute("rel");
  link.classList.add("is-disabled");
  link.setAttribute("aria-disabled", "true");
  label.textContent = unavailableLabel;
};

const renderCaseStudySections = (sections) => {
  const existing = projectDetail.querySelector("[data-project-case-study]");

  if (existing) {
    existing.remove();
  }

  if (!Array.isArray(sections) || !sections.length) {
    return;
  }

  const bodySection = projectDetail.querySelector(".project-detail-body");
  const bottom = projectDetail.querySelector(".project-detail-bottom");

  if (!bodySection || !bottom) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "container project-case-study-grid";
  wrapper.dataset.projectCaseStudy = "";

  const panels = sections.map((section) => {
    const article = document.createElement("article");
    article.className = "project-detail-panel project-case-study-panel";

    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = section.eyebrow || "Case Study";

    const title = document.createElement("h2");
    title.textContent = section.title || "";

    const body = document.createElement("p");
    body.textContent = section.body || "";

    article.append(eyebrow, title, body);
    return article;
  });

  wrapper.append(...panels);
  bodySection.insertBefore(wrapper, bottom);
};

const renderProjectScreenshots = (screenshots, caption) => {
  const existing = projectDetail.querySelector("[data-project-screenshots]");

  if (existing) {
    existing.remove();
  }

  if (!Array.isArray(screenshots) || !screenshots.length) {
    return;
  }

  const bodySection = projectDetail.querySelector(".project-detail-body");
  const bottom = projectDetail.querySelector(".project-detail-bottom");

  if (!bodySection || !bottom) {
    return;
  }

  const section = document.createElement("section");
  section.id = "project-gallery";
  section.className = "container project-screenshot-section";
  section.dataset.projectScreenshots = "";

  const header = document.createElement("div");
  header.className = "project-screenshot-header";

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Screenshots";

  const title = document.createElement("h2");
  title.textContent = "Key screens";

  header.append(eyebrow, title);

  if (caption) {
    const summary = document.createElement("p");
    summary.textContent = caption;
    header.append(summary);
  }

  const grid = document.createElement("div");
  grid.className = "project-screenshot-grid";

  screenshots.forEach((screenshot, index) => {
    const figure = document.createElement("figure");
    figure.className = "project-screenshot-card";

    const imageShell = document.createElement("div");
    imageShell.className = "project-screenshot-media";

    const image = document.createElement("img");
    image.src = getDetailAssetPath(screenshot.image);
    image.alt = screenshot.alt || screenshot.title || `${projectDetail.dataset.projectSlug} screenshot`;
    image.loading = "lazy";
    image.decoding = "async";
    window.KarlForgeLoading?.watchImage(
      image,
      imageShell,
      `${screenshot.title || "Project screenshot"} loading`
    );

    imageShell.append(image);

    const captionBlock = document.createElement("figcaption");

    const number = document.createElement("span");
    number.className = "project-screenshot-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const screenshotTitle = document.createElement("h3");
    screenshotTitle.textContent = screenshot.title || "";

    const body = document.createElement("p");
    body.textContent = screenshot.description || "";

    captionBlock.append(number, screenshotTitle, body);
    figure.append(imageShell, captionBlock);
    grid.append(figure);
  });

  section.append(header, grid);
  bodySection.insertBefore(section, bottom);
};

if (projectDetail) {
  const projects = window.KARLFORGE_PROJECTS || [];
  const project = projects.find((item) => item.slug === getCurrentProjectSlug());

  if (!project) {
    document.title = "Project Not Found | KarlForge";
    setDetailText("[data-project-title]", "Project not found");
    setDetailText("[data-project-description]", "This project page is not available yet.");
  } else {
    document.title = `${project.title} | KarlForge`;

    const metaDescription = document.querySelector("meta[name='description']");

    if (metaDescription) {
      metaDescription.setAttribute("content", project.description || project.shortDescription);
    }

    const preview = projectDetail.querySelector("[data-project-image]");

    if (preview) {
      preview.src = getDetailAssetPath(project.image);
      preview.alt = project.imageAlt || `${project.title} project preview`;
      window.KarlForgeLoading?.watchImage(
        preview,
        preview.closest(".project-detail-preview"),
        `${project.title} preview loading`
      );
    }

    setDetailText("[data-project-title]", project.title);
    setDetailText("[data-project-short-description]", project.shortDescription);
    setDetailText("[data-project-description]", project.description);
    setDetailText("[data-project-role]", project.role);
    setDetailText("[data-project-problem]", project.problem);
    renderTags("[data-project-tech]", project.techStack);
    renderList("[data-project-features]", project.features);
    renderCaseStudySections(project.caseStudy);
    renderProjectScreenshots(project.screenshots, project.portfolioCaption);
    setProjectLink(
      "[data-project-live]",
      project.links?.live,
      project.links?.liveLabel || "Live Demo",
      project.links?.liveUnavailableLabel || "Live Demo unavailable"
    );
    setProjectLink(
      "[data-project-source]",
      project.links?.source,
      "GitHub / Source Code",
      "Source Code unavailable"
    );
  }
}
