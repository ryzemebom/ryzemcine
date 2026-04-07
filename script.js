const API_KEY = "AIzaSyC0RtHeNMgPT4WyxdVPg3mTEnDJ5HhFiew";
const FOLDER_LINK =
  "https://drive.google.com/drive/folders/1XUyFDN4itMwO4eVkQoXOGmpiV59nwuWD?usp=sharing";

const MAX_DEPTH = 6; // limite de pastas aninhadas para evitar loops
const ROOT_GROUP = "Filmes";
const DEFAULT_COVER =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=600&auto=format&fit=crop";

let movies = [];

const grid = document.getElementById("moviesGrid");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const modal = document.getElementById("playerModal");
const closeModalButton = document.getElementById("closeModal");
const playerFrame = document.getElementById("playerFrame");
const modalTitle = document.getElementById("modalTitle");

const setStatus = (message) => {
  emptyState.textContent = message;
  emptyState.hidden = false;
};

const clearStatus = () => {
  emptyState.hidden = true;
};

const extractFolderId = (input) => {
  if (!input) return "";
  const directMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (directMatch) return directMatch[1];

  const idMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  if (/^[a-zA-Z0-9_-]+$/.test(input)) return input;
  return "";
};

const normalizeThumbnail = (thumb) => {
  if (!thumb) return DEFAULT_COVER;
  return thumb.replace(/=s\d+/g, "=w500");
};

const toPreviewUrl = (url) => {
  if (!url) return "";
  if (url.includes("/preview")) return url;

  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
  }

  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
  }

  return url;
};

const buildFileViewUrl = (id) => `https://drive.google.com/file/d/${id}/view`;

const cleanTitle = (name) =>
  (name || "").replace(/\.[^/.]+$/, "").trim();

const pad2 = (value) => String(value).padStart(2, "0");

const formatEpisodeCode = (season, episode) => {
  if (Number.isFinite(season) && Number.isFinite(episode)) {
    return `S${pad2(season)}E${pad2(episode)}`;
  }
  if (Number.isFinite(episode)) {
    return `E${pad2(episode)}`;
  }
  return "";
};

const parseEpisodeInfo = (name) => {
  if (!name) return { seasonNumber: null, episodeNumber: null, code: "" };

  let match = name.match(/S(\d{1,2})E(\d{1,3})/i);
  if (match) {
    const seasonNumber = Number(match[1]);
    const episodeNumber = Number(match[2]);
    return {
      seasonNumber,
      episodeNumber,
      code: formatEpisodeCode(seasonNumber, episodeNumber),
    };
  }

  match = name.match(/(\d{1,2})x(\d{1,3})/i);
  if (match) {
    const seasonNumber = Number(match[1]);
    const episodeNumber = Number(match[2]);
    return {
      seasonNumber,
      episodeNumber,
      code: formatEpisodeCode(seasonNumber, episodeNumber),
    };
  }

  match = name.match(/(?:episodio|ep)[ ._-]*(\d{1,3})/i);
  if (match) {
    const episodeNumber = Number(match[1]);
    return {
      seasonNumber: null,
      episodeNumber,
      code: formatEpisodeCode(null, episodeNumber),
    };
  }

  return { seasonNumber: null, episodeNumber: null, code: "" };
};

const parseSeasonNumber = (label) => {
  if (!label) return null;
  const explicit = label.match(/(?:temporada|season|temp|t|s)[ ._-]*(\d{1,2})/i);
  if (explicit) return Number(explicit[1]);

  const loose = label.match(/\b(\d{1,2})\b/);
  return loose ? Number(loose[1]) : null;
};

const buildMeta = (movie) => {
  const parts = [];
  if (movie.seasonLabel) parts.push(movie.seasonLabel);
  if (movie.episodeCode) parts.push(movie.episodeCode);
  return parts.join(" • ");
};

const openModal = (movie) => {
  const previewUrl = toPreviewUrl(movie.driveUrl);
  playerFrame.src = previewUrl;
  modalTitle.textContent = movie.title;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
};

const closeModal = () => {
  playerFrame.src = "";
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
};

const createCard = (movie) => {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.setAttribute("aria-label", `Assistir ${movie.title}`);

  const meta = buildMeta(movie);
  card.innerHTML = `
    <img src="${movie.cover}" alt="Capa do filme ${movie.title}" loading="lazy" />
    <div class="overlay">
      <span class="play">PLAY</span>
    </div>
    <div class="info">
      <span class="title">${movie.title}</span>
      ${meta ? `<span class="meta">${meta}</span>` : ""}
    </div>
  `;

  card.addEventListener("click", () => openModal(movie));
  return card;
};

const sortGroupMovies = (a, b) => {
  const seasonA = Number.isFinite(a.seasonNumber) ? a.seasonNumber : 999;
  const seasonB = Number.isFinite(b.seasonNumber) ? b.seasonNumber : 999;
  if (seasonA !== seasonB) return seasonA - seasonB;

  const episodeA = Number.isFinite(a.episodeNumber) ? a.episodeNumber : 999;
  const episodeB = Number.isFinite(b.episodeNumber) ? b.episodeNumber : 999;
  if (episodeA !== episodeB) return episodeA - episodeB;

  return a.title.localeCompare(b.title, "pt-BR");
};

const groupMovies = (list) => {
  const order = [];
  const map = new Map();

  list.forEach((movie) => {
    const key = movie.group || ROOT_GROUP;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(movie);
  });

  return order.map((key) => {
    const items = map.get(key).sort(sortGroupMovies);
    const isSeries = items.some((item) => item.seasonLabel || item.episodeCode);
    return {
      key,
      title: key === ROOT_GROUP ? ROOT_GROUP : key,
      badge: key === ROOT_GROUP ? "" : isSeries ? "Série" : "Pasta",
      items,
    };
  });
};

const renderMovies = (list) => {
  grid.innerHTML = "";

  if (list.length === 0) {
    setStatus("Nenhum filme encontrado.");
    return;
  }

  clearStatus();
  const groups = groupMovies(list);

  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "section";

    const head = document.createElement("div");
    head.className = "section-head";

    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = group.title;

    const meta = document.createElement("div");
    meta.className = "section-meta";

    if (group.badge) {
      const badge = document.createElement("span");
      badge.className = "section-badge";
      badge.textContent = group.badge;
      meta.appendChild(badge);
    }

    const count = document.createElement("span");
    count.className = "section-count";
    count.textContent = `${group.items.length} item${
      group.items.length === 1 ? "" : "s"
    }`;
    meta.appendChild(count);

    head.appendChild(title);
    head.appendChild(meta);

    const gridSection = document.createElement("div");
    gridSection.className = "section-grid";
    group.items.forEach((movie) => gridSection.appendChild(createCard(movie)));

    section.appendChild(head);
    section.appendChild(gridSection);
    grid.appendChild(section);
  });
};

searchInput.addEventListener("input", () => {
  const term = searchInput.value.toLowerCase().trim();
  const filtered = movies.filter((movie) =>
    movie.title.toLowerCase().includes(term)
  );
  renderMovies(filtered);
});

closeModalButton.addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("open")) {
    closeModal();
  }
});

const isVideoFile = (file) => {
  if (!file) return false;
  if (file.mimeType && file.mimeType.startsWith("video/")) return true;
  const name = (file.name || "").toLowerCase();
  return [".mp4", ".mkv", ".avi", ".mov", ".webm"].some((ext) =>
    name.endsWith(ext)
  );
};

const listFolderItems = async (folderId) => {
  const items = [];
  let pageToken = "";

  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent(
      "nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink)"
    );
    const endpoint =
      `https://www.googleapis.com/drive/v3/files?` +
      `q=${query}&fields=${fields}&pageSize=1000&` +
      `supportsAllDrives=true&includeItemsFromAllDrives=true&key=${API_KEY}` +
      (pageToken ? `&pageToken=${pageToken}` : "");

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Erro na API do Drive (${response.status}).`);
    }

    const data = await response.json();
    items.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return items;
};

const buildMovie = (file, path) => {
  const title = cleanTitle(file.name) || "Sem título";
  const series = path[0] || "";
  const seasonFolder = path[1] || "";
  const seasonNumberFromFolder = parseSeasonNumber(seasonFolder);
  const episodeInfo = parseEpisodeInfo(title);
  const seasonNumber =
    Number.isFinite(episodeInfo.seasonNumber)
      ? episodeInfo.seasonNumber
      : seasonNumberFromFolder;

  const seasonLabel = seasonFolder
    ? seasonFolder
    : Number.isFinite(seasonNumber)
      ? `Temporada ${seasonNumber}`
      : "";

  return {
    title,
    cover: normalizeThumbnail(file.thumbnailLink),
    driveUrl: file.webViewLink || buildFileViewUrl(file.id),
    group: series || ROOT_GROUP,
    seasonLabel,
    seasonNumber,
    episodeNumber: episodeInfo.episodeNumber,
    episodeCode: episodeInfo.code,
  };
};

const fetchVideosRecursively = async (folderId, depth, visited, path) => {
  if (visited.has(folderId)) return [];
  if (depth > MAX_DEPTH) return [];

  visited.add(folderId);

  const items = await listFolderItems(folderId);
  const videos = [];
  const subfolders = [];

  items.forEach((item) => {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      subfolders.push({ id: item.id, name: item.name || "" });
      return;
    }

    if (isVideoFile(item)) {
      videos.push(buildMovie(item, path));
    }
  });

  for (const subfolder of subfolders) {
    const childVideos = await fetchVideosRecursively(
      subfolder.id,
      depth + 1,
      visited,
      [...path, subfolder.name.trim()]
    );
    videos.push(...childVideos);
  }

  return videos;
};

const loadMovies = async () => {
  setStatus("Carregando filmes e séries do Google Drive...");

  try {
    if (!API_KEY || API_KEY.includes("COLE")) {
      throw new Error("Configure sua API KEY no arquivo script.js.");
    }

    const folderId = extractFolderId(FOLDER_LINK);
    if (!folderId) {
      throw new Error("Link da pasta inválido.");
    }

    const result = await fetchVideosRecursively(folderId, 0, new Set(), []);
    if (result.length === 0) {
      throw new Error("Nenhum vídeo encontrado na pasta ou subpastas.");
    }

    movies = result;
    renderMovies(movies);
  } catch (error) {
    console.warn("Falha ao carregar filmes:", error);
    setStatus(`Não foi possível carregar: ${error.message}`);
  }
};

loadMovies();

