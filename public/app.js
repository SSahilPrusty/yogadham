const DEFAULT_HERO = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85";
const DEFAULT_LOGO = "YD";

let state = {
  events: [],
  notices: [],
  gallery: [],
  disease_solutions: [],
  team: [],
  settings: {},
  filter: "All",
  galleryFilter: "All",
  adminUser: null
};

// ─── Utility ──────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

async function api(url, options = {}) {
  const token = localStorage.getItem("yd_token");
  if (token) {
    options.headers = options.headers || {};
    options.headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP error ${res.status}`);
  return data;
}

function showToast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  setTimeout(() => { if (t.textContent === msg) t.textContent = ""; }, 5000);
}

// ─── File Uploads ─────────────────────────────────────────────────────────────

async function uploadFile(file) {
  if (!file) return "";
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await api("/api/upload", { method: "POST", body: formData });
    return res.files.file || "";
  } catch (err) {
    throw new Error("Upload failed: " + err.message);
  }
}

// ─── Data fetching & state ────────────────────────────────────────────────────

async function refreshPublic() {
  try {
    const data = await api("/api/site");
    state.events = data.events || [];
    state.notices = data.notices || [];
    state.gallery = data.gallery || [];
    state.disease_solutions = data.disease_solutions || [];
    state.team = data.team || [];
    applySettings(data.settings);
    renderEvents();
    renderNotices();
    renderGallery();
    renderDiseaseSolutions();
    renderTeam();
    updateCounts();
  } catch (error) {
    console.error("Failed to load public data:", error);
  }
}

async function refreshAdmin() {
  try {
    const data = await api("/api/dashboard");
    state.events = data.events || [];
    state.notices = data.notices || [];
    state.gallery = data.gallery || [];
    state.disease_solutions = data.disease_solutions || [];
    state.team = data.team || [];
    applySettings(data.settings);
    renderEvents();
    renderNotices();
    renderGallery();
    renderDiseaseSolutions();
    renderTeam();
    renderRecords();
    updateCounts();
    populateGalleryEventDropdown();
  } catch (error) {
    if (error.message.includes("Admin login")) {
      state.adminUser = null;
      renderAdminState();
    }
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function login(form) {
  const btn = form.querySelector('button[type="submit"]');
  btn.textContent = "Logging in…";
  btn.disabled = true;
  try {
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd);
    if (payload.username) payload.username = payload.username.trim();
    if (payload.password) payload.password = payload.password.trim();
    
    const data = await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (data.token) localStorage.setItem("yd_token", data.token);
    if (data.user) localStorage.setItem("yd_adminUser", data.user);
    
    state.adminUser = data.user;
    form.reset();
    await refreshAdmin();
    renderAdminState();
  } catch (error) {
    alert(error.message);
  } finally {
    btn.textContent = "Login";
    btn.disabled = false;
  }
}

async function logout() {
  await api("/api/admin/logout", { method: "POST" }).catch(()=>null);
  localStorage.removeItem("yd_token");
  localStorage.removeItem("yd_adminUser");
  state.adminUser = null;
  renderAdminState();
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function applyHeroUrl(url) {
  const hero = $(".hero");
  if (!hero) return;
  const isMobile = window.innerWidth <= 768;
  const grad = isMobile 
    ? `linear-gradient(180deg, rgba(23, 49, 42, 0.72), rgba(23, 49, 42, 0.9))` 
    : `linear-gradient(90deg, rgba(23, 49, 42, 0.88), rgba(23, 49, 42, 0.36))`;
  hero.style.backgroundImage = `${grad}, url("${url}")`;
}

function applySettings(settings) {
  if (!settings) return;
  state.settings = settings;
  const logoImg = $("#logoImg");
  const logoMark = $("#logoMark");
  const footerLogoImg = $("#footerLogoImg");
  const footerLogoMark = $("#footerLogoMark");

  if (settings.logo_url) {
    if (logoImg) { logoImg.src = settings.logo_url; logoImg.classList.remove("hidden"); }
    if (logoMark) logoMark.classList.add("hidden");
    if (footerLogoImg) { footerLogoImg.src = settings.logo_url; footerLogoImg.classList.remove("hidden"); }
    if (footerLogoMark) footerLogoMark.classList.add("hidden");
  } else {
    if (logoImg) logoImg.classList.add("hidden");
    if (logoMark) { logoMark.textContent = DEFAULT_LOGO; logoMark.classList.remove("hidden"); }
    if (footerLogoImg) footerLogoImg.classList.add("hidden");
    if (footerLogoMark) { footerLogoMark.textContent = DEFAULT_LOGO; footerLogoMark.classList.remove("hidden"); }
  }

  const heroUrl = settings.hero_image_url || DEFAULT_HERO;
  applyHeroUrl(heroUrl);

  const heroPreview = $("#heroPreview");
  if (heroPreview) heroPreview.src = heroUrl;
}

function updateCounts() {
  const ev = $("#eventCount");
  const no = $("#noticeCount");
  if (ev) ev.textContent = state.events.length;
  if (no) no.textContent = state.notices.length;
}

function renderEvents() {
  const grid = $("#eventGrid");
  if (!grid) return;
  const list = state.filter === "All" ? state.events : state.events.filter((e) => e.category === state.filter);

  if (!list.length) {
    grid.innerHTML = `<p style="grid-column: 1/-1; color: var(--muted);">No programs found for this category.</p>`;
    return;
  }

  grid.innerHTML = list.map((ev) => `
    <article class="event-card">
      ${ev.image_url ? `<img src="${ev.image_url}" alt="${ev.title}" loading="lazy">` : ""}
      <div class="event-body">
        <span class="badge">${ev.category}</span>
        <h3>${ev.title}</h3>
        <div class="event-meta">
          <span>📅 ${ev.date} at ${ev.time}</span>
          <span>👤 ${ev.teacher}</span>
          <span>📍 ${ev.location}</span>
        </div>
        <p>${(ev.description || "").substring(0, 90)}...</p>
        <div class="card-actions">
          <button class="btn quiet" data-details="${ev.id}">Details</button>
          ${ev.pdf_url ? `<button class="btn quiet" data-view-pdf="${ev.pdf_url}" data-pdf-title="${ev.title}">View PDF</button>` : ""}
        </div>
      </div>
    </article>
  `).join("");
}

function renderNotices() {
  const list = $("#noticeList");
  if (!list) return;
  if (!state.notices.length) {
    list.innerHTML = `<p style="color: var(--muted);">No notices posted.</p>`;
    return;
  }

  list.innerHTML = state.notices.map((n) => `
    <div class="notice-item">
      <div>
        <span class="badge">${n.type}</span>
        <time>${n.published_on}</time>
      </div>
      <div>
        <h3>${n.title}</h3>
        <p>${n.summary}</p>
      </div>
      ${n.pdf_url ? `<button class="btn quiet view-pdf-btn" data-view-pdf="${n.pdf_url}" data-pdf-title="${n.title}">📄 View PDF</button>` : ""}
    </div>
  `).join("");
}

// ─── Disease Solutions Rendering ──────────────────────────────────────────────

function renderDiseaseSolutions() {
  const grid = $("#diseaseSolutionsGrid");
  if (!grid) return;

  if (!state.disease_solutions || !state.disease_solutions.length) {
    grid.innerHTML = `<p style="grid-column: 1/-1; color: var(--muted);">No disease solution videos added yet.</p>`;
    return;
  }

  grid.innerHTML = state.disease_solutions.map((ds) => {
    const isVideo = ds.media_type === "video" || (ds.media_url && ds.media_url.match(/\.(mp4|webm)$/i));
    const mediaHtml = isVideo
      ? `<video src="${ds.media_url}" muted loop playsinline></video>
         <div class="video-icon">▶</div>`
      : `<img src="${ds.media_url}" alt="${ds.title}" loading="lazy">`;

    return `
      <article class="gallery-card" data-ds-id="${ds.id}">
        <div class="gallery-media-wrapper">
          ${mediaHtml}
        </div>
        <div class="gallery-body">
          <h3>${ds.title}</h3>
          ${ds.description ? `<p class="gallery-desc">${ds.description}</p>` : ''}
        </div>
      </article>
    `;
  }).join("");
}

// ─── Gallery Rendering (event-category based) ─────────────────────────────────

function getGalleryCategory(item) {
  // Determine the display category for a gallery item
  if (item.event_id) {
    const ev = state.events.find(e => e.id == item.event_id);
    if (ev) return ev.title;
  }
  if (item.custom_category && item.custom_category.trim()) return item.custom_category.trim();
  return "General";
}

function renderGallery() {
  const grid = $("#galleryGrid");
  if (!grid) return;

  let items = state.gallery || [];

  // Apply filter
  if (state.galleryFilter && state.galleryFilter !== "All") {
    items = items.filter(item => getGalleryCategory(item) === state.galleryFilter);
  }

  if (!items.length) {
    grid.innerHTML = `<p style="grid-column: 1/-1; color: var(--muted);">No gallery media found for this category.</p>`;
    renderGalleryFilters();
    return;
  }

  // Group by category
  const grouped = {};
  items.forEach(item => {
    const cat = getGalleryCategory(item);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  let html = "";

  Object.entries(grouped).forEach(([category, catItems]) => {
    html += `<div class="gallery-category-section" style="grid-column: 1/-1;">
      <h3 class="gallery-category-title">${category}</h3>
    </div>`;

    catItems.forEach(g => {
      const isVideo = g.media_type === "video" || (g.media_url && g.media_url.match(/\.(mp4|webm)$/i));
      const mediaHtml = isVideo
        ? `<video src="${g.media_url}" muted loop playsinline></video>
           <div class="video-icon">▶</div>`
        : `<img src="${g.media_url}" alt="${g.title}" loading="lazy">`;

      html += `
        <article class="gallery-card" data-gallery-id="${g.id}">
          <div class="gallery-media-wrapper">
            ${mediaHtml}
          </div>
          <div class="gallery-body">
            <h3>${g.title}</h3>
            ${g.description ? `<p class="gallery-desc">${g.description}</p>` : ''}
          </div>
        </article>
      `;
    });
  });

  grid.innerHTML = html;
  renderGalleryFilters();
}

function renderGalleryFilters() {
  const filtersEl = $("#galleryFilters");
  if (!filtersEl) return;

  // Build unique categories from gallery items
  const categories = new Set(["All"]);
  (state.gallery || []).forEach(item => {
    categories.add(getGalleryCategory(item));
  });

  filtersEl.innerHTML = Array.from(categories).map(cat => `
    <button class="chip gallery-chip ${state.galleryFilter === cat ? 'active' : ''}" data-gallery-filter="${cat}">${cat}</button>
  `).join("");
}

function renderTeam() {
  const grid = $("#teamGrid");
  if (!grid) return;
  if (!state.team || !state.team.length) {
    grid.innerHTML = `<p style="grid-column: 1/-1; color: var(--muted);">No position holders added yet.</p>`;
    return;
  }

  grid.innerHTML = state.team.map((t) => `
    <article class="team-card">
      <img src="${t.photo_url}" alt="${t.name}" loading="lazy">
      <div class="team-body">
        <h3>${t.name}</h3>
        <p class="team-position">${t.position}</p>
        ${t.description ? `<p class="team-desc">${t.description}</p>` : ''}
      </div>
    </article>
  `).join("");
}

function renderRecords() {
  const list = $("#recordList");
  if (!list) return;
  if (!state.adminUser) {
    list.innerHTML = "";
    return;
  }

  let html = `<h4 style="margin-top:0">Events</h4>`;
  state.events.forEach((ev) => {
    html += `
      <div class="record-row">
        <div>
          <strong>${ev.title}</strong>
          <p>${ev.date} • ${ev.category}</p>
        </div>
        <button class="delete-btn" data-delete-event="${ev.id}">Delete</button>
      </div>
    `;
  });

  html += `<h4 style="margin-top:24px">Notices</h4>`;
  state.notices.forEach((n) => {
    html += `
      <div class="record-row">
        <div>
          <strong>${n.title}</strong>
          <p>${n.published_on} • ${n.type}</p>
        </div>
        <button class="delete-btn" data-delete-notice="${n.id}">Delete</button>
      </div>
    `;
  });

  html += `<h4 style="margin-top:24px">Disease Solution Program</h4>`;
  if (state.disease_solutions && state.disease_solutions.length) {
    state.disease_solutions.forEach((ds) => {
      html += `
        <div class="record-row">
          <div>
            <strong>${ds.title}</strong>
            <p>${ds.description ? ds.description.substring(0, 50) + (ds.description.length > 50 ? '...' : '') : 'No description'}</p>
          </div>
          <button class="delete-btn" data-delete-ds="${ds.id}">Delete</button>
        </div>
      `;
    });
  } else {
    html += `<p style="color: var(--muted); font-size: 0.9em;">No disease solutions added.</p>`;
  }

  html += `<h4 style="margin-top:24px">Gallery</h4>`;
  if (state.gallery && state.gallery.length) {
    state.gallery.forEach((g) => {
      const cat = getGalleryCategory(g);
      html += `
        <div class="record-row">
          <div>
            <strong>${g.title}</strong>
            <p>${cat} • ${g.media_type === 'video' ? '🎬 Video' : '🖼️ Image'}</p>
          </div>
          <button class="delete-btn" data-delete-gallery="${g.id}">Delete</button>
        </div>
      `;
    });
  } else {
    html += `<p style="color: var(--muted); font-size: 0.9em;">No gallery media added.</p>`;
  }

  html += `<h4 style="margin-top:24px">Position Holders</h4>`;
  if (state.team) {
    state.team.forEach((t) => {
      html += `
        <div class="record-row">
          <div>
            <strong>${t.name}</strong>
            <p>${t.position}</p>
          </div>
          <button class="delete-btn" data-delete-team="${t.id}">Delete</button>
        </div>
      `;
    });
  }

  list.innerHTML = html;
}

// ─── Populate Gallery Event Dropdown ─────────────────────────────────────────

function populateGalleryEventDropdown() {
  const select = $("#galleryEventSelect");
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">-- Select Event (Optional) --</option>`;
  state.events.forEach(ev => {
    const opt = document.createElement("option");
    opt.value = ev.id;
    opt.textContent = `${ev.title} (${ev.date})`;
    select.appendChild(opt);
  });
  // Restore selection
  if (current) select.value = current;
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function openDetails(id) {
  const ev = state.events.find((e) => e.id == id);
  if (!ev) return;
  const d = $("#eventDetails");
  d.innerHTML = `
    ${ev.image_url ? `<img src="${ev.image_url}" alt="${ev.title}">` : ""}
    <div class="details-body">
      <h2>${ev.title}</h2>
      <div class="event-meta" style="margin: 16px 0; font-size: 1rem;">
        <span><strong>When:</strong> ${ev.date} at ${ev.time}</span>
        <span><strong>Where:</strong> ${ev.location}</span>
        <span><strong>Teacher:</strong> ${ev.teacher}</span>
        <span><strong>Fee:</strong> ${ev.fee}</span>
      </div>
      <p style="white-space: pre-wrap;">${ev.description}</p>
      <div style="margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
        <a class="btn primary" target="_blank" rel="noreferrer" 
           href="https://wa.me/${ev.whatsapp || '918338812111'}?text=Namaste YogaDham, I am interested in '${encodeURIComponent(ev.title)}' on ${ev.date}.">
           Contact Teacher
        </a>
        ${ev.pdf_url ? `<button class="btn quiet" data-view-pdf="${ev.pdf_url}" data-pdf-title="${ev.title}">View Document</button>` : ""}
      </div>
    </div>
  `;
  $("#eventDialog").showModal();
}

function openPdfViewer(url, title) {
  const dialog = $("#pdfDialog");
  const frame = $("#pdfFrame");
  const titleEl = $("#pdfDialogTitle");
  const linkEl = $("#pdfDownloadLink");

  titleEl.textContent = title || "Document Viewer";
  linkEl.href = url;
  frame.src = url;

  dialog.showModal();
  document.body.style.overflow = "hidden";
}

function closePdfViewer() {
  const dialog = $("#pdfDialog");
  const frame = $("#pdfFrame");
  dialog.close();
  frame.src = "";
  document.body.style.overflow = "";
}

function openGalleryItem(id, source) {
  // source = 'gallery' | 'ds'
  const list = source === 'ds' ? state.disease_solutions : state.gallery;
  const g = list.find(item => item.id == id);
  if (!g) return;
  
  const content = $("#galleryDialogContent");
  const isVideo = g.media_type === "video" || (g.media_url && g.media_url.match(/\.(mp4|webm)$/i));
  
  let mediaHtml = isVideo 
    ? `<video src="${g.media_url}" controls autoplay playsinline style="width:100%; max-height: 80vh; background: #000;"></video>`
    : `<img src="${g.media_url}" alt="${g.title}" style="width:100%; max-height: 80vh; object-fit: contain; background: #000;">`;
    
  content.innerHTML = `
    ${mediaHtml}
    <div style="padding: 16px; background: white;">
      <h3 style="margin: 0 0 8px 0;">${g.title}</h3>
      ${g.description ? `<p style="margin: 0; color: var(--muted);">${g.description}</p>` : ''}
    </div>
  `;
  
  $("#galleryDialog").showModal();
}

function closeGalleryDialog() {
  const dialog = $("#galleryDialog");
  const content = $("#galleryDialogContent");
  dialog.close();
  setTimeout(() => { content.innerHTML = ''; }, 300);
}

// ─── Routing & Admin UI ───────────────────────────────────────────────────────

function routeFromHash() {
  const h = window.location.hash.replace("#", "");
  return h || "home";
}

function showRoute(route) {
  $$(".page-view").forEach((el) => el.classList.remove("active"));
  const view = $(`#${route}`);
  if (view) {
    view.classList.add("active");
    window.location.hash = route;
  }

  $$("nav a").forEach((a) => a.classList.remove("active"));
  const navA = $(`nav a[data-route="${route}"]`);
  if (navA) navA.classList.add("active");

  if (route === "admin" && state.adminUser) {
    refreshAdmin();
  }
}

function renderAdminState() {
  const loginBox = $("#loginBox");
  const adminPanel = $("#adminPanel");
  const logoutBtn = $("#logoutBtn");
  const disp = $("#adminUserDisplay");

  if (state.adminUser) {
    loginBox.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    if (disp) disp.textContent = state.adminUser;
    renderRecords();
    populateGalleryEventDropdown();
  } else {
    loginBox.classList.remove("hidden");
    adminPanel.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    if (disp) disp.textContent = "—";
  }
}

// ─── Settings Panel Helpers ───────────────────────────────────────────────────

function initSettingsPanel() {
  const logoFileInput = $("#logoFileInput");
  const logoFileName = $("#logoFileName");
  const logoPreview = $("#logoPreview");
  const logoPreviewFallback = $("#logoPreviewFallback");

  const heroFileInput = $("#heroFileInput");
  const heroFileName = $("#heroFileName");
  const heroPreview = $("#heroPreview");
  const heroUrlInput = $("#heroUrlInput");

  if (logoFileInput) {
    logoFileInput.addEventListener("change", () => {
      const file = logoFileInput.files[0];
      if (!file) return;
      logoFileName.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        logoPreview.src = e.target.result;
        logoPreview.classList.remove("hidden");
        logoPreviewFallback.classList.add("hidden");
      };
      reader.readAsDataURL(file);
    });
  }

  if (heroFileInput) {
    heroFileInput.addEventListener("change", () => {
      const file = heroFileInput.files[0];
      if (!file) return;
      heroFileName.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        heroPreview.src = e.target.result;
        heroUrlInput.value = "";
      };
      reader.readAsDataURL(file);
    });
  }

  if (heroUrlInput) {
    heroUrlInput.addEventListener("input", () => {
      if (heroUrlInput.value) heroPreview.src = heroUrlInput.value;
    });
  }

  const saveLogoBtn = $("#saveLogoBtn");
  if (saveLogoBtn) {
    saveLogoBtn.addEventListener("click", async () => {
      try {
        saveLogoBtn.textContent = "Saving…";
        saveLogoBtn.disabled = true;

        let logoUrl = state.settings.logo_url || "";
        const file = logoFileInput?.files[0];
        if (file && file.size > 0) {
          logoUrl = await uploadFile(file);
        }

        const data = await api("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logo_url: logoUrl })
        });
        applySettings(data.settings);
        showToast("Logo saved.");
        if (logoFileInput) logoFileInput.value = "";
        if (logoFileName) logoFileName.textContent = "No file chosen";
      } catch (err) {
        showToast("Error: " + err.message);
      } finally {
        saveLogoBtn.textContent = "Save Logo";
        saveLogoBtn.disabled = false;
      }
    });
  }

  const removeLogoBtn = $("#removeLogoBtn");
  if (removeLogoBtn) {
    removeLogoBtn.addEventListener("click", async () => {
      if (!confirm("Remove the logo and show 'YD' text instead?")) return;
      try {
        const data = await api("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logo_url: "" })
        });
        applySettings(data.settings);
        showToast("Logo removed.");
      } catch (err) {
        showToast("Error: " + err.message);
      }
    });
  }

  const saveHeroBtn = $("#saveHeroBtn");
  if (saveHeroBtn) {
    saveHeroBtn.addEventListener("click", async () => {
      try {
        saveHeroBtn.textContent = "Saving…";
        saveHeroBtn.disabled = true;

        let heroUrl = heroUrlInput?.value?.trim() || state.settings.hero_image_url || DEFAULT_HERO;
        const file = heroFileInput?.files[0];
        if (file && file.size > 0) {
          heroUrl = await uploadFile(file);
        }

        const data = await api("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hero_image_url: heroUrl })
        });
        applySettings(data.settings);
        showToast("Hero photo saved.");
        if (heroFileInput) heroFileInput.value = "";
        if (heroFileName) heroFileName.textContent = "No file chosen";
      } catch (err) {
        showToast("Error: " + err.message);
      } finally {
        saveHeroBtn.textContent = "Save Hero Photo";
        saveHeroBtn.disabled = false;
      }
    });
  }
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

function bindUi() {
  window.addEventListener("hashchange", () => showRoute(routeFromHash()));

  const menuToggle = $("#menuToggle");
  const topNav = $("#topNav");

  if (menuToggle && topNav) {
    menuToggle.addEventListener("click", () => {
      topNav.classList.toggle("open");
    });
  }

  document.body.addEventListener("click", async (event) => {
    // Route links
    const link = event.target.closest("[data-route-link]");
    if (link) {
      event.preventDefault();
      showRoute(link.dataset.routeLink);
      if (topNav) topNav.classList.remove("open");
      return;
    }
    
    // Nav links
    if (event.target.closest("nav a[data-route]")) {
      event.preventDefault();
      showRoute(event.target.dataset.route);
      if (topNav) topNav.classList.remove("open");
      return;
    }

    // Event filter chips
    const chip = event.target.closest(".chip:not(.gallery-chip)");
    if (chip) {
      $$(".chip:not(.gallery-chip)").forEach((item) => item.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      renderEvents();
      return;
    }

    // Gallery filter chips
    const galleryChip = event.target.closest(".gallery-chip");
    if (galleryChip) {
      $$(".gallery-chip").forEach((item) => item.classList.remove("active"));
      galleryChip.classList.add("active");
      state.galleryFilter = galleryChip.dataset.galleryFilter;
      renderGallery();
      return;
    }

    // Admin tabs
    const tab = event.target.closest(".tab");
    if (tab) {
      $$(".tab").forEach((item) => item.classList.remove("active"));
      $$(".panel-content > form, .panel-content > div.records").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      $(`#${tab.dataset.tab}`).classList.add("active");
      return;
    }

    // Details, PDF, Gallery Viewer
    const details = event.target.closest("[data-details]");
    if (details) {
      openDetails(details.dataset.details);
      return;
    }
    
    const pdfBtn = event.target.closest("[data-view-pdf]");
    if (pdfBtn) {
      openPdfViewer(pdfBtn.dataset.viewPdf, pdfBtn.dataset.pdfTitle);
      return;
    }
    
    // Gallery card click (main gallery)
    const galleryCard = event.target.closest(".gallery-card[data-gallery-id]");
    if (galleryCard) {
      openGalleryItem(galleryCard.dataset.galleryId, 'gallery');
      return;
    }

    // Disease solution card click
    const dsCard = event.target.closest(".gallery-card[data-ds-id]");
    if (dsCard) {
      openGalleryItem(dsCard.dataset.dsId, 'ds');
      return;
    }

    // Deletes
    const eventDelete = event.target.closest("[data-delete-event]");
    if (eventDelete && confirm("Delete this event?")) {
      await api(`/api/events/${eventDelete.dataset.deleteEvent}`, { method: "DELETE" });
      await refreshAdmin();
      showToast("Event deleted.");
      return;
    }

    const noticeDelete = event.target.closest("[data-delete-notice]");
    if (noticeDelete && confirm("Delete this notice?")) {
      await api(`/api/notices/${noticeDelete.dataset.deleteNotice}`, { method: "DELETE" });
      await refreshAdmin();
      showToast("Notice deleted.");
      return;
    }
    
    const galleryDelete = event.target.closest("[data-delete-gallery]");
    if (galleryDelete && confirm("Delete this gallery item?")) {
      await api(`/api/gallery/${galleryDelete.dataset.deleteGallery}`, { method: "DELETE" });
      await refreshAdmin();
      showToast("Gallery item deleted.");
      return;
    }

    const dsDelete = event.target.closest("[data-delete-ds]");
    if (dsDelete && confirm("Delete this disease solution?")) {
      await api(`/api/disease-solutions/${dsDelete.dataset.deleteDs}`, { method: "DELETE" });
      await refreshAdmin();
      showToast("Disease solution deleted.");
      return;
    }
    
    const teamDelete = event.target.closest("[data-delete-team]");
    if (teamDelete && confirm("Delete this official?")) {
      await api(`/api/team/${teamDelete.dataset.deleteTeam}`, { method: "DELETE" });
      await refreshAdmin();
      showToast("Official deleted.");
      return;
    }
  });

  // Close dialogs
  $(".dialog-close")?.addEventListener("click", () => $("#eventDialog").close());
  $(".pdf-dialog-close")?.addEventListener("click", closePdfViewer);
  $(".gallery-dialog-close")?.addEventListener("click", closeGalleryDialog);
  
  $("#pdfDialog")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closePdfViewer();
  });
  $("#galleryDialog")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeGalleryDialog();
  });

  // Forms
  $("#loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await login(event.currentTarget);
  });

  $("#logoutBtn")?.addEventListener("click", async () => {
    await logout();
  });

  // Add event form
  $("#eventForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector("button[type=submit]");
    btn.textContent = "Saving…";
    btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      
      const imgFile = form.elements.image?.files[0];
      if (imgFile && imgFile.size > 0) {
        data.image_url = await uploadFile(imgFile);
      }
      delete data.image;
      
      const pdfFile = form.elements.pdf?.files[0];
      if (pdfFile && pdfFile.size > 0) {
        data.pdf_url = await uploadFile(pdfFile);
      }
      delete data.pdf;
      
      await api("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      form.reset();
      await refreshAdmin();
      showToast("Event saved.");
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      btn.textContent = "Save Event";
      btn.disabled = false;
    }
  });

  // Add notice form
  $("#noticeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector("button[type=submit]");
    btn.textContent = "Saving…";
    btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      
      const pdfFile = form.elements.pdf?.files[0];
      if (pdfFile && pdfFile.size > 0) {
        data.pdf_url = await uploadFile(pdfFile);
      }
      delete data.pdf;
      
      await api("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      form.reset();
      await refreshAdmin();
      showToast("Notice saved.");
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      btn.textContent = "Save Notice";
      btn.disabled = false;
    }
  });

  // ─── Add Disease Solution form ────────────────────────────────────────────
  $("#diseaseSolutionsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector("button[type=submit]");
    btn.textContent = "Uploading…";
    btn.disabled = true;
    try {
      const title = form.elements.title.value.trim();
      const description = form.elements.description.value.trim();
      const videoFile = form.elements.video?.files[0];
      
      if (!videoFile || videoFile.size === 0) {
        throw new Error("Please select a video file.");
      }
      
      const maxVideoSize = 4.5 * 1024 * 1024;
      if (videoFile.size > maxVideoSize) {
        throw new Error(`Video is too large (${(videoFile.size / (1024*1024)).toFixed(2)} MB). Max is 4.5 MB.`);
      }
      
      const url = await uploadFile(videoFile);
      if (!url) throw new Error("Upload failed.");
      
      await api("/api/disease-solutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, media_url: url, media_type: "video" })
      });
      
      form.reset();
      const preview = $("#diseaseSolutionsMediaPreview");
      if (preview) { preview.innerHTML = ""; preview.classList.add("hidden"); }
      await refreshAdmin();
      showToast("Disease solution video uploaded successfully.");
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      btn.textContent = "Upload Video & Save";
      btn.disabled = false;
    }
  });

  // ─── Add Gallery form (multi-photo + single video) ────────────────────────
  $("#galleryForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector("button[type=submit]");
    btn.textContent = "Uploading…";
    btn.disabled = true;
    try {
      const title = form.elements.title.value.trim();
      const description = form.elements.description.value.trim();
      const eventId = form.elements.event_id?.value || "";
      const customCat = form.elements.custom_category?.value.trim() || "";
      
      const photoFiles = Array.from(form.elements.photos?.files || []);
      const videoFile = form.elements.video?.files[0];
      
      if (photoFiles.length === 0 && (!videoFile || videoFile.size === 0)) {
        throw new Error("Please select at least one photo or a video.");
      }

      const MAX_IMAGE = 3 * 1024 * 1024;
      const MAX_VIDEO = 4.5 * 1024 * 1024;

      // Validate sizes before uploading
      for (const f of photoFiles) {
        if (f.size > MAX_IMAGE) {
          throw new Error(`Photo "${f.name}" is too large (${(f.size/(1024*1024)).toFixed(2)} MB). Max is 3 MB.`);
        }
      }
      if (videoFile && videoFile.size > MAX_VIDEO) {
        throw new Error(`Video is too large (${(videoFile.size/(1024*1024)).toFixed(2)} MB). Max is 4.5 MB.`);
      }

      const items = [];
      
      // Upload photos
      for (let i = 0; i < photoFiles.length; i++) {
        const f = photoFiles[i];
        btn.textContent = `Uploading photo ${i + 1}/${photoFiles.length}…`;
        const url = await uploadFile(f);
        items.push({
          title: photoFiles.length === 1 ? title : `${title} (${i + 1})`,
          description,
          media_url: url,
          media_type: "image",
          event_id: eventId || null,
          custom_category: customCat
        });
      }

      // Upload video if provided
      if (videoFile && videoFile.size > 0) {
        btn.textContent = "Uploading video…";
        const url = await uploadFile(videoFile);
        items.push({
          title: `${title} (Video)`,
          description,
          media_url: url,
          media_type: "video",
          event_id: eventId || null,
          custom_category: customCat
        });
      }

      // Insert all items
      for (const item of items) {
        await api("/api/gallery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item)
        });
      }

      form.reset();
      const preview = $("#galleryMediaPreview");
      if (preview) { preview.innerHTML = ""; preview.classList.add("hidden"); }
      await refreshAdmin();
      showToast(`Gallery updated: ${items.length} item(s) uploaded.`);
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      btn.textContent = "Upload to Gallery";
      btn.disabled = false;
    }
  });

  // Add team form
  $("#teamForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector("button[type=submit]");
    btn.textContent = "Saving…";
    btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const photoFile = form.elements.photo?.files[0];
      
      if (photoFile && photoFile.size > 0) {
        data.photo_url = await uploadFile(photoFile);
      }
      delete data.photo;
      
      await api("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      form.reset();
      $("#teamPhotoPreview").classList.add("hidden");
      await refreshAdmin();
      showToast("Official saved.");
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      btn.textContent = "Save Official";
      btn.disabled = false;
    }
  });

  // ─── Media Previews ───────────────────────────────────────────────────────

  // Disease solutions video preview
  const dsVideoInput = $("#diseaseSolutionsForm input[name='video']");
  const dsMediaPreview = $("#diseaseSolutionsMediaPreview");
  if (dsVideoInput && dsMediaPreview) {
    dsVideoInput.addEventListener("change", () => {
      dsMediaPreview.innerHTML = "";
      const video = dsVideoInput.files[0];
      if (!video) { dsMediaPreview.classList.add("hidden"); return; }
      const url = URL.createObjectURL(video);
      dsMediaPreview.innerHTML = `
        <div style="position:relative;width:100%;max-width:280px;height:160px;border-radius:4px;overflow:hidden;border:1px solid var(--line);">
          <video src="${url}" style="width:100%;height:100%;object-fit:cover;" controls></video>
        </div>
        <p style="font-size:0.82em;color:var(--muted);margin:4px 0 0;">${video.name} (${(video.size/(1024*1024)).toFixed(2)} MB)</p>
      `;
      dsMediaPreview.classList.remove("hidden");
    });
  }

  // Gallery media preview (photos + video)
  const galleryPhotosInput = $("#galleryForm input[name='photos']");
  const galleryVideoInput = $("#galleryForm input[name='video']");
  const galleryMediaPreview = $("#galleryMediaPreview");

  function updateGalleryPreview() {
    if (!galleryMediaPreview) return;
    galleryMediaPreview.innerHTML = "";

    const photos = Array.from(galleryPhotosInput?.files || []);
    const video = galleryVideoInput?.files[0];

    if (photos.length === 0 && !video) {
      galleryMediaPreview.classList.add("hidden");
      return;
    }

    photos.forEach(f => {
      const url = URL.createObjectURL(f);
      galleryMediaPreview.innerHTML += `
        <div style="position:relative;width:80px;height:80px;border-radius:4px;overflow:hidden;border:1px solid var(--line);">
          <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
        </div>
      `;
    });

    if (video) {
      const url = URL.createObjectURL(video);
      galleryMediaPreview.innerHTML += `
        <div style="position:relative;width:120px;height:80px;border-radius:4px;overflow:hidden;border:2px solid var(--sun);">
          <video src="${url}" style="width:100%;height:100%;object-fit:cover;" muted></video>
          <div style="position:absolute;bottom:2px;right:4px;font-size:0.7em;background:rgba(0,0,0,0.6);color:#fff;padding:1px 4px;border-radius:3px;">▶ Video</div>
        </div>
      `;
    }

    galleryMediaPreview.classList.remove("hidden");
  }

  galleryPhotosInput?.addEventListener("change", updateGalleryPreview);
  galleryVideoInput?.addEventListener("change", updateGalleryPreview);

  // Team photo preview
  const photoInput = $("#teamForm input[name='photo']");
  const photoPreview = $("#teamPhotoPreview");
  if (photoInput && photoPreview) {
    photoInput.addEventListener("change", () => {
      const file = photoInput.files[0];
      if (!file) { photoPreview.classList.add("hidden"); return; }
      const url = URL.createObjectURL(file);
      photoPreview.innerHTML = `<img src="${url}" style="width:100px; height:100px; object-fit:cover; border-radius: 50%;">`;
      photoPreview.classList.remove("hidden");
    });
  }

  initSettingsPanel();
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const closeAllDialogs = () => {
  $$("dialog").forEach(d => { if (d.open) d.close(); });
};
closeAllDialogs();
document.addEventListener("DOMContentLoaded", closeAllDialogs);

// Restore user state from local storage on load
state.adminUser = localStorage.getItem("yd_adminUser") || null;

applyHeroUrl(DEFAULT_HERO);
window.addEventListener("resize", () => {
  if (state.settings && state.settings.hero_image_url) {
    applyHeroUrl(state.settings.hero_image_url);
  } else {
    applyHeroUrl(DEFAULT_HERO);
  }
});
bindUi();
renderAdminState();
showRoute(routeFromHash());
refreshPublic().catch((error) => console.warn(error.message));
