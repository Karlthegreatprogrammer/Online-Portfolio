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
    setProjectLink("[data-project-live]", project.links?.live, "Live Demo", "Live Demo unavailable");
    setProjectLink(
      "[data-project-source]",
      project.links?.source,
      "GitHub / Source Code",
      "Source Code unavailable"
    );
  }
}
