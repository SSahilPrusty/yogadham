const state = {
  events: [],
  notices: [],
  settings: {},
  filter: "All",
  isAdmin: false
};

const DEFAULT_HERO = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85";
const fallbackImage = "https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?auto=format&fit=crop&w=1200&q=80";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const routes = ["home", "about", "events", "notices", "contact", "admin"];

// ─── API helper ──────────────────────────────────────────────────────────────

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

async function uploadFile(file) {
  if (!file || file.size === 0) return "";
  const data = new FormData();
  data.append("pdf", file);
  const result = await api("/api/upload", { method: "POST", body: data });
  return result.files.pdf || "";
}

// ─── Settings helpers ────────────────────────────────────────────────────────

function applyLogoUrl(url) {
  const logoImg = $("#logoImg");
  const logoMark = $("#logoMark");
  const footerLogoImg = $("#footerLogoImg");
  const footerLogoMark = $("#footerLogoMark");

  if (url) {
    logoImg.src = url;
    logoImg.classList.remove("hidden");
    logoMark.classList.add("hidden");
    footerLogoImg.src = url;
    footerLogoImg.classList.remove("hidden");
    footerLogoMark.classList.add("hidden");
  } else {
    logoImg.classList.add("hidden");
    logoMark.classList.remove("hidden");
    footerLogoImg.classList.add("hidden");
    footerLogoMark.classList.remove("hidden");
  }
}

function applyHeroUrl(url) {
  const heroSection = $("#home");
  const imageUrl = url || DEFAULT_HERO;
  heroSection.style.backgroundImage = `
    linear-gradient(90deg, rgba(23,49,42,0.88), rgba(23,49,42,0.36)),
    url("${imageUrl}")
  `;
}

function applySettings(settings) {
  state.settings = settings || {};
  applyLogoUrl(settings.logo_url || "");
  applyHeroUrl(settings.hero_image_url || DEFAULT_HERO);

  // Sync preview boxes in admin if visible
  const logoPreview = $("#logoPreview");
  const logoPreviewFallback = $("#logoPreviewFallback");
  const heroPreview = $("#heroPreview");
  if (logoPreview) {
    if (settings.logo_url) {
      logoPreview.src = settings.logo_url;
      logoPreview.classList.remove("hidden");
      logoPreviewFallback.classList.add("hidden");
    } else {
      logoPreview.classList.add("hidden");
      logoPreviewFallback.classList.remove("hidden");
    }
  }
  if (heroPreview) {
    heroPreview.src = settings.hero_image_url || DEFAULT_HERO;
  }
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function whatsappLink(event) {
  const phone = String(event.whatsapp || "").replace(/\D/g, "");
  const text = encodeURIComponent(`Namaste Yoga Dham, I am interested in "${event.title}" on ${formatDate(event.date)}. Please share details.`);
  return `https://wa.me/${phone}?text=${text}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function renderEvents() {
  const grid = $("#eventGrid");
  const events = state.filter === "All" ? state.events : state.events.filter((event) => event.category === state.filter);
  grid.innerHTML = events.map((event) => `
    <article class="event-card">
      <img src="${event.image_url || fallbackImage}" alt="${event.title}" loading="lazy">
      <div class="event-body">
        <span class="badge">${event.category}</span>
        <h3>${event.title}</h3>
        <div class="event-meta">
          <span>${formatDate(event.date)} - ${event.time}</span>
          <span>${event.teacher} - ${event.location}</span>
          <strong>${event.fee}</strong>
        </div>
        <p>${event.description}</p>
        <div class="card-actions">
          <button class="btn quiet" data-details="${event.id}">Details</button>
          <a class="btn primary" target="_blank" rel="noreferrer" href="${whatsappLink(event)}">WhatsApp</a>
          ${event.pdf_url ? `<button class="btn quiet" data-view-pdf="${event.pdf_url}" data-pdf-title="${event.title}">View PDF</button>` : ""}
        </div>
      </div>
    </article>
  `).join("") || `<p>No events found for this category.</p>`;
}

function renderNotices() {
  $("#noticeList").innerHTML = state.notices.map((notice) => `
    <article class="notice-item">
      <time>${formatDate(notice.published_on)}</time>
      <div>
        <span class="badge">${notice.type}</span>
        <h3>${notice.title}</h3>
        <p>${notice.summary}</p>
      </div>
      ${notice.pdf_url
        ? `<button class="btn quiet view-pdf-btn" data-view-pdf="${notice.pdf_url}" data-pdf-title="${notice.title}">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
             View PDF
           </button>`
        : ""}
    </article>
  `).join("") || `<p>No notices have been published yet.</p>`;
}

function renderRecords() {
  const eventRows = state.events.map((event) => `
    <div class="record-row">
      <div><strong>Event: ${event.title}</strong><p>${formatDate(event.date)} — ${event.teacher}</p></div>
      <button class="delete-btn" data-delete-event="${event.id}">Delete</button>
    </div>
  `).join("");
  const noticeRows = state.notices.map((notice) => `
    <div class="record-row">
      <div><strong>Notice: ${notice.title}</strong><p>${formatDate(notice.published_on)} — ${notice.type}</p></div>
      <button class="delete-btn" data-delete-notice="${notice.id}">Delete</button>
    </div>
  `).join("");
  $("#recordList").innerHTML = `${eventRows}${noticeRows}` || "<p>No records yet.</p>";
}

function renderStats() {
  $("#eventCount").textContent = state.events.length;
  $("#noticeCount").textContent = state.notices.length;
}

function renderAdminState() {
  $("#loginBox").classList.toggle("hidden", state.isAdmin);
  $("#adminPanel").classList.toggle("hidden", !state.isAdmin);
  $("#logoutBtn").classList.toggle("hidden", !state.isAdmin);
}

// ─── PDF Viewer ──────────────────────────────────────────────────────────────

function openPdfViewer(url, title) {
  const dialog = $("#pdfDialog");
  const frame = $("#pdfFrame");
  const titleEl = $("#pdfDialogTitle");
  const downloadLink = $("#pdfDownloadLink");
  titleEl.textContent = title || "PDF Document";
  downloadLink.href = url;
  dialog.showModal();
  
  // Set iframe src after dialog is visible to prevent Chrome native PDF viewer from failing
  setTimeout(() => {
    frame.src = url;
  }, 50);
}

function closePdfViewer() {
  const dialog = $("#pdfDialog");
  const frame = $("#pdfFrame");
  dialog.close();
  // Clear iframe src to stop loading
  frame.src = "";
}

// ─── Routing ─────────────────────────────────────────────────────────────────

function showRoute(routeName) {
  const route = routes.includes(routeName) ? routeName : "home";
  $$(".page-view").forEach((section) => {
    section.classList.toggle("active", section.id === route);
  });
  $$("nav a[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === route);
  });
  if (location.hash !== `#${route}`) {
    history.replaceState(null, "", `#${route}`);
  }
  window.scrollTo(0, 0);
}

function routeFromHash() {
  return location.hash.replace("#", "") || "home";
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  window.setTimeout(() => { toast.textContent = ""; }, 3500);
}

// ─── Event detail dialog ─────────────────────────────────────────────────────

function openDetails(id) {
  const event = state.events.find((item) => item.id === Number(id));
  if (!event) return;
  $("#eventDetails").innerHTML = `
    <article class="details">
      <img src="${event.image_url || fallbackImage}" alt="${event.title}">
      <div class="details-body">
        <span class="badge">${event.category}</span>
        <h2>${event.title}</h2>
        <p><strong>Teacher:</strong> ${event.teacher}</p>
        <p><strong>Date and time:</strong> ${formatDate(event.date)} at ${event.time}</p>
        <p><strong>Location:</strong> ${event.location}</p>
        <p><strong>Fee:</strong> ${event.fee}</p>
        <p>${event.description}</p>
        <div class="card-actions">
          <a class="btn primary" target="_blank" rel="noreferrer" href="${whatsappLink(event)}">I am interested</a>
          ${event.pdf_url
            ? `<button class="btn quiet" data-view-pdf="${event.pdf_url}" data-pdf-title="${event.title}">View PDF</button>`
            : ""}
        </div>
      </div>
    </article>
  `;
  $("#eventDialog").showModal();
}

// ─── Data refresh ─────────────────────────────────────────────────────────────

async function refreshPublic() {
  const data = await api("/api/site");
  state.events = data.events || [];
  state.notices = data.notices || [];
  applySettings(data.settings || {});
  renderStats();
  renderEvents();
  renderNotices();
  if (state.isAdmin) renderRecords();
}

async function refreshAdmin() {
  const data = await api("/api/dashboard");
  state.events = data.events || [];
  state.notices = data.notices || [];
  applySettings(data.settings || {});
  renderStats();
  renderEvents();
  renderNotices();
  renderRecords();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

async function login(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  await api("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  state.isAdmin = true;
  renderAdminState();
  form.reset();
  const adminDisplay = $("#adminUserDisplay");
  if (adminDisplay) adminDisplay.textContent = data.username;
  await refreshAdmin();
  showToast("Admin login successful.");
}

async function logout() {
  await api("/api/admin/logout", { method: "POST" });
  state.isAdmin = false;
  renderAdminState();
}

// ─── Settings panel helpers ───────────────────────────────────────────────────

function initSettingsPanel() {
  const logoFileInput = $("#logoFileInput");
  const logoFileName = $("#logoFileName");
  const logoPreview = $("#logoPreview");
  const logoPreviewFallback = $("#logoPreviewFallback");

  const heroFileInput = $("#heroFileInput");
  const heroFileName = $("#heroFileName");
  const heroPreview = $("#heroPreview");
  const heroUrlInput = $("#heroUrlInput");

  // Logo file picker preview
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

  // Hero file picker preview
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

  // Hero URL input live preview
  if (heroUrlInput) {
    heroUrlInput.addEventListener("input", () => {
      if (heroUrlInput.value) heroPreview.src = heroUrlInput.value;
    });
  }

  // Save logo button
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
        showToast("Logo saved successfully.");
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

  // Remove logo button
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

  // Save hero photo button
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
        showToast("Hero photo saved successfully.");
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

// ─── Event bindings ───────────────────────────────────────────────────────────

function bindUi() {
  window.addEventListener("hashchange", () => showRoute(routeFromHash()));

  const menuToggle = $("#menuToggle");
  const topNav = $("#topNav");

  if (menuToggle && topNav) {
    menuToggle.addEventListener("click", () => {
      topNav.classList.toggle("open");
    });
  }

  // Route links (data-route-link)
  document.body.addEventListener("click", (event) => {
    const link = event.target.closest("[data-route-link]");
    if (!link) return;
    event.preventDefault();
    showRoute(link.dataset.routeLink);
    if (topNav) topNav.classList.remove("open");
  });

  // Nav links
  $$("nav a[data-route]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showRoute(link.dataset.route);
      if (topNav) topNav.classList.remove("open");
    });
  });

  // Filter chips
  $$(".chip").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".chip").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      renderEvents();
    });
  });

  // Admin tabs
  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tab").forEach((item) => item.classList.remove("active"));
      $$(".panel-form").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.tab}`).classList.add("active");
    });
  });

  // Global click handler (details, delete, PDF viewer)
  document.body.addEventListener("click", async (event) => {
    // Event detail
    const details = event.target.closest("[data-details]");
    if (details) {
      openDetails(details.dataset.details);
      return;
    }

    // PDF viewer (notices and events)
    const pdfBtn = event.target.closest("[data-view-pdf]");
    if (pdfBtn) {
      openPdfViewer(pdfBtn.dataset.viewPdf, pdfBtn.dataset.pdfTitle);
      return;
    }

    // Delete event
    const eventDelete = event.target.closest("[data-delete-event]");
    if (eventDelete && confirm("Delete this event?")) {
      await api(`/api/events/${eventDelete.dataset.deleteEvent}`, { method: "DELETE" });
      await refreshAdmin();
      showToast("Event deleted.");
      return;
    }

    // Delete notice
    const noticeDelete = event.target.closest("[data-delete-notice]");
    if (noticeDelete && confirm("Delete this notice?")) {
      await api(`/api/notices/${noticeDelete.dataset.deleteNotice}`, { method: "DELETE" });
      await refreshAdmin();
      showToast("Notice deleted.");
      return;
    }
  });

  // Close dialogs
  $(".dialog-close").addEventListener("click", () => $("#eventDialog").close());
  $(".pdf-dialog-close").addEventListener("click", closePdfViewer);
  $("#pdfDialog").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closePdfViewer();
  });

  // Login form
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await login(event.currentTarget);
    } catch (error) {
      alert(error.message);
    }
  });

  // Logout
  $("#logoutBtn").addEventListener("click", async () => {
    await logout();
  });

  // Add event form
  $("#eventForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector("button[type=submit]");
    btn.textContent = "Saving…";
    btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      data.pdf_url = await uploadFile(form.elements.pdf.files[0]);
      delete data.pdf;
      await api("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      form.reset();
      await refreshAdmin();
      showToast("Event saved to database.");
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      btn.textContent = "Save Event";
      btn.disabled = false;
    }
  });

  // Add notice form
  $("#noticeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector("button[type=submit]");
    btn.textContent = "Saving…";
    btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      data.pdf_url = await uploadFile(form.elements.pdf.files[0]);
      delete data.pdf;
      await api("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      form.reset();
      await refreshAdmin();
      showToast("Notice saved to database.");
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      btn.textContent = "Save Notice";
      btn.disabled = false;
    }
  });

  // Settings panel interactions
  initSettingsPanel();
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

// Close any open dialogs immediately (and on DOMContentLoaded for safety)
const closeAllDialogs = () => {
  const eventDialog = document.getElementById("eventDialog");
  const pdfDialog = document.getElementById("pdfDialog");
  if (eventDialog) eventDialog.close();
  if (pdfDialog) pdfDialog.close();
};
closeAllDialogs();
document.addEventListener("DOMContentLoaded", closeAllDialogs);

// Apply default hero immediately (will be overridden by settings from server)
applyHeroUrl(DEFAULT_HERO);

bindUi();
renderAdminState();
showRoute(routeFromHash());
refreshPublic().catch((error) => showToast(error.message));

