const DEFAULT_HERO = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85";
const DEFAULT_LOGO = "YD";

let state = {
  events: [],
  notices: [],
  gallery: [],
  team: [],
  settings: {},
  filter: "All",
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
    state.team = data.team || [];
    applySettings(data.settings);
    renderEvents();
    renderNotices();
    renderGallery();
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
    state.team = data.team || [];
    applySettings(data.settings);
    renderEvents();
    renderNotices();
    renderGallery();
    renderTeam();
    renderRecords();
    updateCounts();
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
    
    // Store token and user
    if (data.token) localStorage.setItem("yd_token", data.token);
    if (data.user) localStorage.setItem("yd_adminUser", data.user);
    
    state.adminUser = data.user;
    form.reset();
    await refreshAdmin();
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
  if (hero) hero.style.backgroundImage = `linear-gradient(90deg, rgba(23, 49, 42, 0.88), rgba(23, 49, 42, 0.36)), url("${url}")`;
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

function renderGallery() {
  const grid = $("#galleryGrid");
  if (!grid) return;
  if (!state.gallery || !state.gallery.length) {
    grid.innerHTML = `<p style="grid-column: 1/-1; color: var(--muted);">Gallery is empty.</p>`;
    return;
  }

  grid.innerHTML = state.gallery.map((g) => {
    const isVideo = g.media_type === "video" || (g.media_url && g.media_url.match(/\.(mp4|webm)$/i));
    const mediaHtml = isVideo 
      ? `<video src="${g.media_url}" muted loop playsinline></video>
         <div class="video-icon">▶</div>` 
      : `<img src="${g.media_url}" alt="${g.title}" loading="lazy">`;

    return `
      <article class="gallery-card" data-gallery-id="${g.id}">
        <div class="gallery-media-wrapper">
          ${mediaHtml}
        </div>
        <div class="gallery-body">
          <h3>${g.title}</h3>
        </div>
      </article>
    `;
  }).join("");
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

  html += `<h4 style="margin-top:24px">Gallery</h4>`;
  if (state.gallery) {
    state.gallery.forEach((g) => {
      html += `
        <div class="record-row">
          <div>
            <strong>${g.title}</strong>
            <p>${g.media_type}</p>
          </div>
          <button class="delete-btn" data-delete-gallery="${g.id}">Delete</button>
        </div>
      `;
    });
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
  document.body.style.overflow = "hidden"; // Prevent background scrolling
}

function closePdfViewer() {
  const dialog = $("#pdfDialog");
  const frame = $("#pdfFrame");
  dialog.close();
  frame.src = ""; // Stop loading
  document.body.style.overflow = ""; // Restore scrolling
}

function openGalleryItem(id) {
  const g = state.gallery.find(item => item.id == id);
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
  // Clear content to stop video playback
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

    // Filter chips
    const chip = event.target.closest(".chip");
    if (chip) {
      $$(".chip").forEach((item) => item.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      renderEvents();
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
    
    const galleryCard = event.target.closest(".gallery-card");
    if (galleryCard) {
      openGalleryItem(galleryCard.dataset.galleryId);
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
      
      // Upload image
      const imgFile = form.elements.image?.files[0];
      if (imgFile && imgFile.size > 0) {
        data.image_url = await uploadFile(imgFile);
      }
      delete data.image;
      
      // Upload PDF
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
  
  // Add gallery form
  $("#galleryForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector("button[type=submit]");
    btn.textContent = "Uploading…";
    btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const mediaFile = form.elements.media?.files[0];
      
      if (!mediaFile || mediaFile.size === 0) {
        throw new Error("Please select a photo or video");
      }
      
      const isVideo = mediaFile.type.startsWith("video/");
      data.media_type = isVideo ? "video" : "image";
      data.media_url = await uploadFile(mediaFile);
      delete data.media;
      
      await api("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      form.reset();
      $("#galleryMediaPreview").classList.add("hidden");
      await refreshAdmin();
      showToast("Gallery item uploaded.");
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
  
  // Gallery media preview
  const mediaInput = $("#galleryForm input[name='media']");
  const mediaPreview = $("#galleryMediaPreview");
  if (mediaInput && mediaPreview) {
    mediaInput.addEventListener("change", () => {
      const file = mediaInput.files[0];
      if (!file) {
        mediaPreview.classList.add("hidden");
        return;
      }
      
      const url = URL.createObjectURL(file);
      if (file.type.startsWith("video/")) {
        mediaPreview.innerHTML = `<video src="${url}" controls style="width:100%; max-height:200px; border-radius: 8px;"></video>`;
      } else {
        mediaPreview.innerHTML = `<img src="${url}" style="width:100%; max-height:200px; object-fit:contain; border-radius: 8px;">`;
      }
      mediaPreview.classList.remove("hidden");
    });
  }

  // Team photo preview
  const photoInput = $("#teamForm input[name='photo']");
  const photoPreview = $("#teamPhotoPreview");
  if (photoInput && photoPreview) {
    photoInput.addEventListener("change", () => {
      const file = photoInput.files[0];
      if (!file) {
        photoPreview.classList.add("hidden");
        return;
      }
      
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
bindUi();
renderAdminState();
showRoute(routeFromHash());
refreshPublic().catch((error) => console.warn(error.message));
