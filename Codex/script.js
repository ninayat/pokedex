const API_ROOT = "https://pokeapi.co/api/v2";
const TOTAL_POKEMON = 1025;
const PAGE_STEP = 24;
const MAX_BAR_VALUE = 180;

const generationRanges = [
  { key: "all", label: "Toutes", min: 1, max: TOTAL_POKEMON },
  { key: "gen1", label: "Gen 1", min: 1, max: 151 },
  { key: "gen2", label: "Gen 2", min: 152, max: 251 },
  { key: "gen3", label: "Gen 3", min: 252, max: 386 },
  { key: "gen4", label: "Gen 4", min: 387, max: 493 },
  { key: "gen5", label: "Gen 5", min: 494, max: 649 },
  { key: "gen6", label: "Gen 6", min: 650, max: 721 },
  { key: "gen7", label: "Gen 7", min: 722, max: 809 },
  { key: "gen8", label: "Gen 8", min: 810, max: 905 },
  { key: "gen9", label: "Gen 9", min: 906, max: TOTAL_POKEMON },
];

const typeLabels = {
  normal: "Normal",
  fire: "Feu",
  water: "Eau",
  electric: "Électrik",
  grass: "Plante",
  ice: "Glace",
  fighting: "Combat",
  poison: "Poison",
  ground: "Sol",
  flying: "Vol",
  psychic: "Psy",
  bug: "Insecte",
  rock: "Roche",
  ghost: "Spectre",
  dragon: "Dragon",
  dark: "Ténèbres",
  steel: "Acier",
  fairy: "Fée",
};

const featuredHeroId = 1008;
const coreTypes = Object.keys(typeLabels);
const FAVORITES_KEY = "codex-pokemon-favorites";

const state = {
  allPokemon: [],
  filteredPokemon: [],
  detailCache: new Map(),
  speciesCache: new Map(),
  typeSets: new Map(),
  activeGeneration: "all",
  activeType: "all",
  search: "",
  sort: "id-asc",
  visibleCount: PAGE_STEP,
  favorites: new Set(),
  compareIds: [],
};

const els = {
  searchInput: document.querySelector("#search-input"),
  sortSelect: document.querySelector("#sort-select"),
  resetFilters: document.querySelector("#reset-filters"),
  generationFilters: document.querySelector("#generation-filters"),
  typeFilters: document.querySelector("#type-filters"),
  pokemonGrid: document.querySelector("#pokemon-grid"),
  resultsCount: document.querySelector("#results-count"),
  visibleRange: document.querySelector("#visible-range"),
  favoritesCount: document.querySelector("#favorites-count"),
  loadMore: document.querySelector("#load-more"),
  metricTotal: document.querySelector("#metric-total"),
  heroFeatureArt: document.querySelector("#hero-feature-art"),
  heroFeatureName: document.querySelector("#hero-feature-name"),
  heroFeatureTypes: document.querySelector("#hero-feature-types"),
  heroFeatureStats: document.querySelector("#hero-feature-stats"),
  modal: document.querySelector("#detail-modal"),
  modalClose: document.querySelector("#modal-close"),
  detailArt: document.querySelector("#detail-art"),
  detailName: document.querySelector("#detail-name"),
  detailTypes: document.querySelector("#detail-types"),
  detailFlavor: document.querySelector("#detail-flavor"),
  detailCardId: document.querySelector("#detail-card-id"),
  detailCardGen: document.querySelector("#detail-card-gen"),
  detailHeight: document.querySelector("#detail-height"),
  detailWeight: document.querySelector("#detail-weight"),
  detailAbilities: document.querySelector("#detail-abilities"),
  detailStats: document.querySelector("#detail-stats"),
  detailBST: document.querySelector("#detail-bst"),
  detailExp: document.querySelector("#detail-exp"),
  detailCapture: document.querySelector("#detail-capture"),
  detailHabitat: document.querySelector("#detail-habitat"),
  detailSpecies: document.querySelector("#detail-species"),
  comparePanel: document.querySelector("#compare-panel"),
  compareSlots: document.querySelector("#compare-slots"),
  compareStats: document.querySelector("#compare-stats"),
  compareClear: document.querySelector("#compare-clear"),
};

const revealItems = document.querySelectorAll(".reveal");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const heroSection = document.querySelector(".hero");
const heroCopy = document.querySelector(".hero-copy");
const heroCard = document.querySelector(".hero-card");

function initRevealObserver() {
  if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function capitalize(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugFromUrl(url) {
  return Number(url.split("/").filter(Boolean).pop());
}

function formatId(id) {
  return `#${String(id).padStart(4, "0")}`;
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.favorites = new Set(parsed.filter((value) => Number.isInteger(value)));
  } catch (error) {
    state.favorites = new Set();
  }
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
}

function generationForId(id) {
  // Skip the "all" entry — we need the specific generation key
  return generationRanges.find((g) => g.key !== "all" && id >= g.min && id <= g.max) || generationRanges[0];
}

function typeLabel(type) {
  return typeLabels[type] || capitalize(type);
}

function localizedSpeciesName(species, fallbackName) {
  const frenchName = species.names?.find((entry) => entry.language.name === "fr")?.name;
  return frenchName || capitalize(fallbackName);
}

function getArtworkFromDetail(detail) {
  return (
    detail.sprites?.other?.["official-artwork"]?.front_default ||
    detail.sprites?.other?.home?.front_default ||
    detail.sprites?.front_default ||
    ""
  );
}

function createTypeChips(types, activeClass = "type-chip") {
  return types
    .map((type) => `<span class="${activeClass} type-${type}">${typeLabel(type)}</span>`)
    .join("");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erreur de chargement pour ${url}`);
  }
  return response.json();
}

async function fetchPokemonIndex() {
  const payload = await fetchJson(`${API_ROOT}/pokemon?limit=${TOTAL_POKEMON}&offset=0`);
  state.allPokemon = payload.results.map((entry) => {
    const id = slugFromUrl(entry.url);
    return {
      id,
      name: entry.name,
      generation: generationForId(id).key,
      generationLabel: generationForId(id).label,
    };
  });
}

async function getPokemonDetail(id) {
  if (state.detailCache.has(id)) {
    return state.detailCache.get(id);
  }

  const detail = await fetchJson(`${API_ROOT}/pokemon/${id}`);
  state.detailCache.set(id, detail);
  return detail;
}

async function getPokemonSpecies(id) {
  if (state.speciesCache.has(id)) {
    return state.speciesCache.get(id);
  }

  const species = await fetchJson(`${API_ROOT}/pokemon-species/${id}`);
  state.speciesCache.set(id, species);
  return species;
}

async function getTypeSet(type) {
  if (type === "all") {
    return null;
  }

  if (state.typeSets.has(type)) {
    return state.typeSets.get(type);
  }

  const payload = await fetchJson(`${API_ROOT}/type/${type}`);
  const ids = new Set(
    payload.pokemon
      .map((entry) => slugFromUrl(entry.pokemon.url))
      .filter((id) => id <= TOTAL_POKEMON)
  );
  state.typeSets.set(type, ids);
  return ids;
}

function renderGenerationFilters() {
  if (!els.generationFilters) {
    return;
  }

  els.generationFilters.innerHTML = generationRanges
    .map((generation) => {
      const active = generation.key === state.activeGeneration ? " active" : "";
      return `<button class="gen-chip${active}" type="button" data-generation="${generation.key}">${generation.label}</button>`;
    })
    .join("");

  els.generationFilters.querySelectorAll("[data-generation]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeGeneration = button.getAttribute("data-generation") || "all";
      state.visibleCount = PAGE_STEP;
      await applyFilters();
    });
  });
}

function renderTypeFilters() {
  if (!els.typeFilters) {
    return;
  }

  const chips = ['<button class="type-chip active" type="button" data-type="all">Tous</button>']
    .concat(
      coreTypes.map(
        (type) =>
          `<button class="type-chip type-${type}" type="button" data-type="${type}">${typeLabel(type)}</button>`
      )
    )
    .join("");

  els.typeFilters.innerHTML = chips;
  syncTypeFilterState();

  els.typeFilters.querySelectorAll("[data-type]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeType = button.getAttribute("data-type") || "all";
      state.visibleCount = PAGE_STEP;
      syncTypeFilterState();
      await applyFilters();
    });
  });
}

function syncTypeFilterState() {
  if (!els.typeFilters) {
    return;
  }

  els.typeFilters.querySelectorAll("[data-type]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-type") === state.activeType);
  });
}

function syncGenerationFilterState() {
  if (!els.generationFilters) {
    return;
  }

  els.generationFilters.querySelectorAll("[data-generation]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-generation") === state.activeGeneration);
  });
}

async function applyFilters() {
  let items = [...state.allPokemon];

  if (state.activeGeneration !== "all") {
    items = items.filter((item) => item.generation === state.activeGeneration);
  }

  if (state.activeType !== "all") {
    const typeSet = await getTypeSet(state.activeType);
    items = items.filter((item) => typeSet?.has(item.id));
  }

  if (state.search) {
    const query = state.search.toLowerCase();
    items = items.filter((item) => {
      return (
        item.name.includes(query) ||
        String(item.id) === query ||
        formatId(item.id).toLowerCase().includes(query)
      );
    });
  }

  items.sort((a, b) => {
    switch (state.sort) {
      case "id-desc":
        return b.id - a.id;
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "id-asc":
      default:
        return a.id - b.id;
    }
  });

  state.filteredPokemon = items;
  syncGenerationFilterState();
  renderGrid();
}

function cardMetaText(item) {
  return `${item.generationLabel} / Cliquez pour ouvrir la fiche détaillée et la carte héros.`;
}

function primaryTypeClass(types) {
  return `card-type-${types[0] || "normal"}`;
}

function renderGrid() {
  if (!els.pokemonGrid || !els.resultsCount || !els.visibleRange || !els.loadMore) {
    return;
  }

  const visibleItems = state.filteredPokemon.slice(0, state.visibleCount);
  els.resultsCount.textContent = String(state.filteredPokemon.length);
  els.visibleRange.textContent = `${visibleItems.length}/${state.filteredPokemon.length || 0}`;
  if (els.favoritesCount) {
    els.favoritesCount.textContent = String(state.favorites.size);
  }
  els.loadMore.hidden = visibleItems.length >= state.filteredPokemon.length;

  if (!state.filteredPokemon.length) {
    els.pokemonGrid.className = "empty-state";
    els.pokemonGrid.innerHTML = `<div><strong>Aucun Pokémon trouvé</strong><p>Essayez une autre combinaison de filtres ou de recherche.</p></div>`;
    return;
  }

  els.pokemonGrid.className = "pokemon-grid";

  const containerMarkup = visibleItems
    .map((item) => {
      const generation = generationForId(item.id);
      return `
        <article class="pokemon-card" tabindex="0" data-id="${item.id}" aria-label="Ouvrir la fiche de ${capitalize(item.name)}">
          <div class="pokemon-card-media">
            <img src="" alt="${capitalize(item.name)}" loading="lazy" decoding="async" data-art-for="${item.id}" />
          </div>
          <div class="pokemon-card-head">
            <div>
              <span class="pokemon-card-id">${formatId(item.id)}</span>
              <h3 data-name-for="${item.id}">${capitalize(item.name)}</h3>
            </div>
            <span class="gen-chip">${generation.label}</span>
          </div>
          <p class="pokemon-card-meta" data-meta-for="${item.id}">${cardMetaText(item)}</p>
          <div class="pokemon-card-footer">
            <div class="chip-row" data-types-for="${item.id}"></div>
            <div class="pokemon-card-actions">
              <button class="pokemon-card-button" type="button">Détail</button>
              <button class="pokemon-card-button ${state.favorites.has(item.id) ? "is-favorite" : ""}" type="button" data-favorite="${item.id}">
                ${state.favorites.has(item.id) ? "Favori" : "Favori +"}
              </button>
              <button class="pokemon-card-button ${state.compareIds.includes(item.id) ? "is-compare" : ""}" type="button" data-compare="${item.id}">
                ${state.compareIds.includes(item.id) ? "Comparé" : "Comparer"}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  els.pokemonGrid.innerHTML = containerMarkup;
  bindCardInteractions();
  hydrateVisibleCardTypes(visibleItems);
}

async function hydrateVisibleCardTypes(items) {
  const batch = items;
  await Promise.all(
    batch.map(async (item) => {
      try {
        const [detail, species] = await Promise.all([
          getPokemonDetail(item.id),
          getPokemonSpecies(item.id),
        ]);
        const target = document.querySelector(`[data-types-for="${item.id}"]`);
        const nameTarget = document.querySelector(`[data-name-for="${item.id}"]`);
        const metaTarget = document.querySelector(`[data-meta-for="${item.id}"]`);
        const artTarget = document.querySelector(`[data-art-for="${item.id}"]`);
        if (!target) {
          return;
        }

        const types = detail.types.map((entry) => entry.type.name);
        const frenchName = localizedSpeciesName(species, detail.name);
        target.innerHTML = createTypeChips(types);
        const card = document.querySelector(`.pokemon-card[data-id="${item.id}"]`);
        if (card) {
          card.classList.add(primaryTypeClass(types));
        }
        if (nameTarget) {
          nameTarget.textContent = frenchName;
        }
        if (metaTarget) {
          metaTarget.textContent = `${item.generationLabel} / ${types.map(typeLabel).join(" / ")} / Cliquez pour ouvrir la fiche détaillée et la carte héros.`;
        }
        if (artTarget) {
          artTarget.src = getArtworkFromDetail(detail);
          artTarget.alt = frenchName;
        }
      } catch (error) {
        console.error(error);
      }
    })
  );
}

function bindCardInteractions() {
  document.querySelectorAll(".pokemon-card").forEach((card) => {
    const pokemonId = Number(card.getAttribute("data-id"));

    if (!prefersReducedMotion.matches) {
      card.addEventListener("pointermove", (event) => {
        const bounds = card.getBoundingClientRect();
        const offsetX = event.clientX - bounds.left;
        const offsetY = event.clientY - bounds.top;
        const rotateY = ((offsetX / bounds.width) - 0.5) * 12;
        const rotateX = (0.5 - offsetY / bounds.height) * 12;

        card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
        card.style.setProperty("--spot-x", `${offsetX}px`);
        card.style.setProperty("--spot-y", `${offsetY}px`);
      });

      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
      });

      // Swipe droite → toggle favori
      let touchStartX = 0;
      card.addEventListener("touchstart", (e) => {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });
      card.addEventListener("touchend", (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (dx > 100) {
          card.classList.add("fav-swipe");
          setTimeout(() => toggleFavorite(pokemonId), 380);
        }
      }, { passive: true });
    }

    const openDetail = async () => {
      const id = Number(card.getAttribute("data-id"));
      await openDetailModal(id);
    };

    card.addEventListener("click", openDetail);
    card.addEventListener("keydown", async (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        await openDetail();
      }
    });
  });

  document.querySelectorAll("[data-favorite]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(Number(button.getAttribute("data-favorite")));
    });
  });

  document.querySelectorAll("[data-compare]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleCompare(Number(button.getAttribute("data-compare")));
    });
  });
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
  } else {
    state.favorites.add(id);
  }

  saveFavorites();
  renderGrid();
}

function toggleCompare(id) {
  if (state.compareIds.includes(id)) {
    state.compareIds = state.compareIds.filter((value) => value !== id);
  } else if (state.compareIds.length < 2) {
    state.compareIds = [...state.compareIds, id];
  } else {
    state.compareIds = [state.compareIds[1], id];
  }

  renderGrid();
  void renderComparePanel();
}

function bestFlavorText(species) {
  const entry =
    species.flavor_text_entries.find((item) => item.language.name === "fr") ||
    species.flavor_text_entries.find((item) => item.language.name === "en");

  return entry ? entry.flavor_text.replace(/\f|\n/g, " ") : "Aucune description disponible.";
}

function initHeroParallax() {
  // Disable on mobile (perspective:none in CSS) and reduced-motion
  if (!heroSection || !heroCopy || !heroCard || prefersReducedMotion.matches) {
    return;
  }
  if (window.matchMedia("(max-width: 960px)").matches) {
    return;
  }

  heroSection.addEventListener("pointermove", (event) => {
    const bounds = heroSection.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const rx = (0.5 - y / bounds.height) * 8;
    const ry = ((x / bounds.width) - 0.5) * 10;

    heroCopy.style.transform = `translate3d(0, 0, 30px) rotateX(${rx * 0.25}deg) rotateY(${ry * -0.18}deg)`;
    heroCard.style.transform = `translate3d(0, 0, 0) rotateX(${rx}deg) rotateY(${ry}deg)`;
    heroCard.style.setProperty("--hero-spot-x", `${x}px`);
    heroCard.style.setProperty("--hero-spot-y", `${y}px`);
  });

  heroSection.addEventListener("pointerleave", () => {
    heroCopy.style.transform = "";
    heroCard.style.transform = "";
    heroCard.style.removeProperty("--hero-spot-x");
    heroCard.style.removeProperty("--hero-spot-y");
  });
}

function formatMeters(value) {
  return `${(value / 10).toFixed(1)} m`;
}

function formatKilograms(value) {
  return `${(value / 10).toFixed(1)} kg`;
}

function totalBaseStats(stats) {
  return stats.reduce((sum, stat) => sum + stat.base_stat, 0);
}

async function renderComparePanel() {
  if (!els.compareSlots || !els.compareStats || !els.comparePanel) {
    return;
  }

  if (!state.compareIds.length) {
    els.comparePanel.hidden = true;
    els.compareSlots.innerHTML = `
      <div class="compare-slot"><span class="compare-empty">Ajoutez un premier Pokémon au comparateur.</span></div>
      <div class="compare-slot"><span class="compare-empty">Ajoutez un second Pokémon pour voir la différence.</span></div>
    `;
    els.compareStats.innerHTML = "";
    return;
  }

  els.comparePanel.hidden = false;

  const details = await Promise.all(state.compareIds.map((id) => getPokemonDetail(id)));
  const speciesList = await Promise.all(state.compareIds.map((id) => getPokemonSpecies(id)));

  els.compareSlots.innerHTML = [0, 1]
    .map((index) => {
      const detail = details[index];
      const species = speciesList[index];
      if (!detail || !species) {
        return `<div class="compare-slot"><span class="compare-empty">Emplacement libre</span></div>`;
      }

      return `
        <div class="compare-slot">
          <span>${formatId(detail.id)}</span>
          <strong>${localizedSpeciesName(species, detail.name)}</strong>
          <span>${detail.types.map((entry) => typeLabel(entry.type.name)).join(" / ")}</span>
        </div>
      `;
    })
    .join("");

  if (details.length < 2) {
    els.compareStats.innerHTML = `<div class="compare-empty">Ajoutez un second Pokémon pour comparer les statistiques.</div>`;
    return;
  }

  const left = details[0];
  const right = details[1];
  const metrics = [
    { label: "BST", left: totalBaseStats(left.stats), right: totalBaseStats(right.stats) },
    { label: "PV", left: left.stats.find((stat) => stat.stat.name === "hp")?.base_stat ?? 0, right: right.stats.find((stat) => stat.stat.name === "hp")?.base_stat ?? 0 },
    { label: "Attaque", left: left.stats.find((stat) => stat.stat.name === "attack")?.base_stat ?? 0, right: right.stats.find((stat) => stat.stat.name === "attack")?.base_stat ?? 0 },
    { label: "Défense", left: left.stats.find((stat) => stat.stat.name === "defense")?.base_stat ?? 0, right: right.stats.find((stat) => stat.stat.name === "defense")?.base_stat ?? 0 },
    { label: "Vitesse", left: left.stats.find((stat) => stat.stat.name === "speed")?.base_stat ?? 0, right: right.stats.find((stat) => stat.stat.name === "speed")?.base_stat ?? 0 },
  ];

  els.compareStats.innerHTML = metrics
    .map((metric) => {
      const leftClass = metric.left === metric.right ? "" : metric.left > metric.right ? "win" : "lose";
      const rightClass = metric.left === metric.right ? "" : metric.right > metric.left ? "win" : "lose";
      return `
        <div class="compare-row">
          <div class="compare-value ${leftClass}">${metric.left}</div>
          <b>${metric.label}</b>
          <div class="compare-value right ${rightClass}">${metric.right}</div>
        </div>
      `;
    })
    .join("");
}

function renderHeroFeature(detail) {
  if (!els.heroFeatureArt || !els.heroFeatureName || !els.heroFeatureTypes || !els.heroFeatureStats) {
    return;
  }

  const types = detail.types.map((entry) => entry.type.name);
  const specialAttack = detail.stats.find((entry) => entry.stat.name === "special-attack")?.base_stat ?? "--";
  const speed = detail.stats.find((entry) => entry.stat.name === "speed")?.base_stat ?? "--";
  const metaScore = Math.min(99, Math.round(totalBaseStats(detail.stats) / 7.2));

  els.heroFeatureArt.src = getArtworkFromDetail(detail);
  els.heroFeatureArt.alt = capitalize(detail.name);
  els.heroFeatureName.textContent = capitalize(detail.name);
  els.heroFeatureTypes.textContent = types.map(typeLabel).join(" / ");
  els.heroFeatureStats.innerHTML = `
    <div>
      <span>Attaque spéciale</span>
      <strong>${specialAttack}</strong>
    </div>
    <div>
      <span>Vitesse</span>
      <strong>${speed}</strong>
    </div>
    <div>
      <span>Indice méta</span>
      <strong>${metaScore}%</strong>
    </div>
  `;
}

async function openDetailModal(id) {
  if (!els.modal) {
    return;
  }

  els.detailName.textContent = "Chargement...";
  els.detailFlavor.textContent = "Récupération des données détaillées.";

  if (!els.modal.open) {
    els.modal.showModal();
  }

  try {
    const [detail, species] = await Promise.all([getPokemonDetail(id), getPokemonSpecies(id)]);
    const generation = generationForId(id);
    const types = detail.types.map((entry) => entry.type.name);
    const frenchName = localizedSpeciesName(species, detail.name);

    els.detailArt.src = getArtworkFromDetail(detail);
    els.detailArt.alt = frenchName;
    els.detailName.textContent = frenchName;
    els.detailTypes.innerHTML = createTypeChips(types);
    els.detailCardId.textContent = formatId(id);
    els.detailCardGen.textContent = generation.label;
    els.detailFlavor.textContent = bestFlavorText(species);
    els.detailHeight.textContent = formatMeters(detail.height);
    els.detailWeight.textContent = formatKilograms(detail.weight);
    els.detailAbilities.textContent = detail.abilities
      .map((entry) => capitalize(entry.ability.name))
      .join(", ");
    els.detailExp.textContent = String(detail.base_experience ?? "-");
    els.detailCapture.textContent = String(species.capture_rate ?? "-");
    els.detailHabitat.textContent = species.habitat ? capitalize(species.habitat.name) : "Inconnu";
    els.detailSpecies.textContent = capitalize(species.name);
    els.detailBST.textContent = `BST ${totalBaseStats(detail.stats)}`;

    els.detailStats.innerHTML = detail.stats
      .map((entry, index) => {
        const label = capitalize(entry.stat.name.replace("-", " "));
        const pct = Math.min(100, Math.round((entry.base_stat / MAX_BAR_VALUE) * 100));
        return `
          <div class="stat-row">
            <span>${label}</span>
            <div class="stat-bar"><i style="--bar-fill:${pct}%;--bar-delay:${index * 80}ms"></i></div>
            <strong>${entry.base_stat}</strong>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error(error);
    els.detailName.textContent = "Erreur de chargement";
    els.detailFlavor.textContent = "Impossible de récupérer la fiche détaillée pour le moment.";
  }
}

function bindControls() {
  els.searchInput?.addEventListener("input", async () => {
    state.search = els.searchInput.value.trim().toLowerCase();
    state.visibleCount = PAGE_STEP;
    await applyFilters();
  });

  els.sortSelect?.addEventListener("change", async () => {
    state.sort = els.sortSelect.value;
    await applyFilters();
  });

  els.resetFilters?.addEventListener("click", async () => {
    state.search = "";
    state.sort = "id-asc";
    state.activeGeneration = "all";
    state.activeType = "all";
    state.visibleCount = PAGE_STEP;
    if (els.searchInput) {
      els.searchInput.value = "";
    }
    if (els.sortSelect) {
      els.sortSelect.value = "id-asc";
    }
    syncTypeFilterState();
    syncGenerationFilterState();
    await applyFilters();
  });

  els.loadMore?.addEventListener("click", () => {
    state.visibleCount += PAGE_STEP;
    renderGrid();
  });

  els.compareClear?.addEventListener("click", () => {
    state.compareIds = [];
    renderGrid();
    void renderComparePanel();
  });

  els.modalClose?.addEventListener("click", () => {
    els.modal?.close();
  });

  els.modal?.addEventListener("click", (event) => {
    const rect = els.modal.getBoundingClientRect();
    const inDialog =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;

    if (!inDialog) {
      els.modal.close();
    }
  });

  // FAB: scroll vers les filtres et focus sur la recherche
  const fabFilter = document.querySelector("#fab-filter");
  if (fabFilter) {
    fabFilter.addEventListener("click", () => {
      const panel = document.querySelector("#catalogue");
      if (panel) {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => els.searchInput?.focus(), 400);
      }
    });
  }

  // Swipe bas sur le modal pour le fermer
  if (els.modal && !prefersReducedMotion.matches) {
    let modalTouchStartY = 0;
    els.modal.addEventListener("touchstart", (e) => {
      modalTouchStartY = e.touches[0].clientY;
    }, { passive: true });
    els.modal.addEventListener("touchend", (e) => {
      const dy = e.changedTouches[0].clientY - modalTouchStartY;
      if (dy > 80) {
        els.modal.close();
      }
    }, { passive: true });
  }
}

function renderLoadingState() {
  if (!els.pokemonGrid) {
    return;
  }

  els.pokemonGrid.className = "loading-state";
  els.pokemonGrid.innerHTML = `<div><strong>Chargement du catalogue complet...</strong><p>Connexion au dex de toutes les générations.</p></div>`;
}

function clearLoadingState() {
  if (!els.pokemonGrid) {
    return;
  }

  els.pokemonGrid.className = "pokemon-grid";
  els.pokemonGrid.innerHTML = "";
}

async function init() {
  loadFavorites();
  initRevealObserver();
  bindControls();
  renderGenerationFilters();
  renderTypeFilters();
  renderLoadingState();

  try {
    await fetchPokemonIndex();
    els.metricTotal.textContent = String(state.allPokemon.length);
    const [heroDetail, heroSpecies] = await Promise.all([
      getPokemonDetail(featuredHeroId),
      getPokemonSpecies(featuredHeroId),
    ]);
    renderHeroFeature(heroDetail);
    if (els.heroFeatureName) {
      els.heroFeatureName.textContent = localizedSpeciesName(heroSpecies, heroDetail.name);
    }
    clearLoadingState();
    await applyFilters();
    await renderComparePanel();
  } catch (error) {
    console.error(error);
    clearLoadingState();
    if (els.pokemonGrid) {
      els.pokemonGrid.className = "empty-state";
      els.pokemonGrid.innerHTML = `<div><strong>Le catalogue n’a pas pu être chargé</strong><p>Vérifiez la connexion, puis rechargez la page.</p></div>`;
    }
  }
}

initHeroParallax();
init();
