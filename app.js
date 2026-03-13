const BOUNDS = {
  lonMin: -11,
  lonMax: 32,
  latMin: 35,
  latMax: 71,
};

const LOCAL_STORAGE_KEY = "hubsays-live-work-map-weights";
const LOCAL_PREFERENCE_KEY = "hubsays-live-work-map-preferences";

const filters = {
  country: "All",
  city: "All",
  language: "All",
  mode: "All",
  category: "All",
  visa: "All",
};

const weights = {
  jobs: 8,
  housing: 8,
  english: 7,
  visa: 7,
};

const preferences = {
  salaryTarget: 65000,
  remotePreference: "Any",
  freshnessWindow: "Any",
  visaRequired: false,
  hidePersistent: false,
};

const presets = {
  all: { country: "All", city: "All", language: "All", mode: "All", category: "All", visa: "All" },
  "nl-live-work": { country: "Netherlands", city: "All", language: "English", mode: "All", category: "All", visa: "All" },
  "nl-english": { country: "Netherlands", city: "All", language: "English", mode: "All", category: "All", visa: "All" },
  "nl-visa": { country: "Netherlands", city: "All", language: "English", mode: "All", category: "All", visa: "HSM/Visa-likely" },
  "eu-english": { country: "All", city: "All", language: "English", mode: "All", category: "All", visa: "All" },
  expat: { country: "All", city: "All", language: "English", mode: "All", category: "All", visa: "All" },
  "ai-radar": { country: "All", city: "All", language: "All", mode: "All", category: "AI / Data / Engineering", visa: "All" },
  "it-italian": { country: "Italy", city: "All", language: "Italian", mode: "All", category: "All", visa: "All" },
  "de-german": { country: "Germany", city: "All", language: "German", mode: "All", category: "All", visa: "All" },
};

let jobs = [];
let cities = [];
let countries = [];
let activeId = "";
let activePreset = "all";
let compareState = {
  cityA: "",
  cityB: "",
  role: "All",
};

function templateFor(job) {
  const category = String(job?.category || "").toLowerCase();
  if (category.includes("engineering") || category.includes("data")) {
    return {
      label: "Software engineer CV template",
      href: "./assets/resume-template-software-engineer.md",
    };
  }
  return {
    label: "Product manager CV template",
    href: "./assets/resume-template-product-manager.md",
  };
}

function projectPoint(lon, lat) {
  const x = ((lon - BOUNDS.lonMin) / (BOUNDS.lonMax - BOUNDS.lonMin)) * 100;
  const y = (1 - (lat - BOUNDS.latMin) / (BOUNDS.latMax - BOUNDS.latMin)) * 100;
  return { x, y };
}

function optionsFor(key) {
  const values = [...new Set(jobs.map((job) => job[key]))].sort();
  return ["All", ...values];
}

function populateSelect(id, values) {
  const select = document.getElementById(id);
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function populateCompareSelects() {
  const options = cities
    .map((city) => ({
      value: `${city.country}::${city.city}`,
      label: `${city.city}, ${city.country}`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  ["compare-city-a", "compare-city-b"].forEach((id) => {
    const select = document.getElementById(id);
    select.innerHTML = "";
    options.forEach((optionData) => {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      select.appendChild(option);
    });
  });
  if (!compareState.cityA && options[0]) {
    compareState.cityA = options[0].value;
  }
  if (!compareState.cityB && options[1]) {
    compareState.cityB = options[1].value;
  }
  document.getElementById("compare-city-a").value = compareState.cityA;
  document.getElementById("compare-city-b").value = compareState.cityB;
  document.getElementById("compare-role").value = compareState.role;
}

function filteredJobs() {
  return jobs
    .filter((job) => (
      (filters.country === "All" || job.country === filters.country) &&
      (filters.city === "All" || job.city === filters.city) &&
      (filters.language === "All" || job.language === filters.language) &&
      (filters.mode === "All" || job.mode === filters.mode) &&
      (filters.category === "All" || job.category === filters.category) &&
      (filters.visa === "All" || job.visa === filters.visa) &&
      matchesPreferenceFilters(job)
    ))
    .sort((left, right) => {
      const fitDelta = personalFitForJob(right) - personalFitForJob(left);
      if (fitDelta !== 0) {
        return fitDelta;
      }
      return (left.days_open || 0) - (right.days_open || 0);
    });
}

function renderStats(items) {
  document.getElementById("job-count").textContent = String(items.length);
  document.getElementById("country-count").textContent = String(new Set(items.map((job) => job.country)).size);
  document.getElementById("language-count").textContent = String(new Set(items.map((job) => job.language)).size);
  document.getElementById("result-summary").textContent = `${items.length} role${items.length === 1 ? "" : "s"} after filters`;
}

function syncSelects() {
  document.getElementById("country-filter").value = filters.country;
  document.getElementById("city-filter").value = filters.city;
  document.getElementById("language-filter").value = filters.language;
  document.getElementById("mode-filter").value = filters.mode;
  document.getElementById("category-filter").value = filters.category;
  document.getElementById("visa-filter").value = filters.visa;
}

function renderPresets() {
  document.querySelectorAll(".preset-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === activePreset);
  });
}

function renderMap(items) {
  const root = document.getElementById("map-bounds");
  root.innerHTML = "";
  items.forEach((job) => {
    const marker = document.createElement("button");
    marker.className = `marker${job.id === activeId ? " active" : ""}`;
    marker.type = "button";
    marker.title = `${job.title} · ${job.city}, ${job.country}`;
    const point = projectPoint(job.lon, job.lat);
    marker.style.left = `${point.x}%`;
    marker.style.top = `${point.y}%`;
    marker.addEventListener("click", () => {
      activeId = job.id;
      render();
    });
    root.appendChild(marker);
  });
}

function countsByCity(items, role = "All") {
  const counts = new Map();
  items
    .filter((job) => role === "All" || job.category === role)
    .forEach((job) => {
      const key = `${job.country}::${job.city}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  return counts;
}

function rankedCities(items) {
  const counts = countsByCity(items);
  return cities
    .map((city) => ({
      ...city,
      visible_jobs: counts.get(`${city.country}::${city.city}`) || 0,
    }))
    .filter((city) => city.visible_jobs > 0)
    .filter((city) => filters.country === "All" || city.country === filters.country)
    .filter((city) => filters.city === "All" || city.city === filters.city)
    .sort((left, right) => {
      if (right.visible_jobs !== left.visible_jobs) {
        return right.visible_jobs - left.visible_jobs;
      }
      return right.move_score - left.move_score;
    });
}

function cityForJob(job) {
  return cities.find((city) => city.city === job.city && city.country === job.country);
}

function cityByKey(key) {
  return cities.find((city) => `${city.country}::${city.city}` === key) || null;
}

function countryByName(name) {
  return countries.find((country) => country.name === name) || null;
}

function scoreFromLabel(label, table) {
  const lowered = String(label || "").toLowerCase();
  for (const row of table) {
    if (lowered.includes(row.match)) {
      return row.score;
    }
  }
  return 50;
}

function englishScore(label) {
  return scoreFromLabel(label, [
    { match: "very high", score: 95 },
    { match: "high", score: 80 },
    { match: "medium", score: 60 },
    { match: "mixed", score: 50 },
    { match: "low", score: 30 },
  ]);
}

function visaScore(label) {
  return scoreFromLabel(label, [
    { match: "hsm-friendly", score: 92 },
    { match: "good", score: 80 },
    { match: "mixed", score: 60 },
    { match: "unknown", score: 45 },
    { match: "low", score: 30 },
  ]);
}

function roleSalaryMultiplier(roleLens) {
  const multipliers = {
    "All": 1,
    "AI / Data / Engineering": 1.08,
    Product: 1.03,
    Operations: 0.95,
  };
  return multipliers[roleLens] || 1;
}

function salaryEstimate(city, roleLens) {
  const citySalary = Number(city?.metrics?.median_salary_target_skill_eur || 0);
  const countrySalary = Number(countryByName(city?.country)?.metrics?.median_salary_target_skill_eur || 0);
  const baseline = citySalary || countrySalary || 0;
  return Math.round(baseline * roleSalaryMultiplier(roleLens));
}

function formatEur(value) {
  return `EUR ${Math.round(value || 0).toLocaleString()}`;
}

function formatSignalDate(value) {
  if (!value) {
    return "Unknown";
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function hiringSignalLabel(job) {
  const daysOpen = Number(job?.days_open || 0);
  const repostCount = Number(job?.repost_count || 0);
  if (repostCount >= 2 || daysOpen >= 30) {
    return "Persistent listing";
  }
  if (repostCount >= 1 || daysOpen >= 15) {
    return "Steady listing";
  }
  return "Fresh listing";
}

function preferenceRoleLens() {
  if (filters.category === "AI / Data / Engineering") {
    return "AI / Data / Engineering";
  }
  if (filters.category === "Product") {
    return "Product";
  }
  if (filters.category === "Operations") {
    return "Operations";
  }
  return "All";
}

function jobRoleLens(job) {
  if (job?.category === "AI / Data / Engineering" || job?.category === "Engineering") {
    return "AI / Data / Engineering";
  }
  if (job?.category === "Product") {
    return "Product";
  }
  if (job?.category === "Operations") {
    return "Operations";
  }
  return "All";
}

function visaAwareJob(job) {
  return ["HSM/Visa-likely", "Remote/EU-friendly"].includes(job?.visa);
}

function matchesPreferenceFilters(job) {
  if (preferences.freshnessWindow !== "Any" && Number(job?.days_open || 0) > Number(preferences.freshnessWindow)) {
    return false;
  }
  if (preferences.hidePersistent && hiringSignalLabel(job) === "Persistent listing") {
    return false;
  }
  if (preferences.visaRequired && !visaAwareJob(job)) {
    return false;
  }
  return true;
}

function modeFitScore(job) {
  if (preferences.remotePreference === "Any") {
    return 75;
  }
  return job?.mode === preferences.remotePreference ? 100 : 35;
}

function salaryFitScore(job) {
  const city = cityForJob(job);
  const estimate = salaryEstimate(city, jobRoleLens(job));
  if (!estimate) {
    return 50;
  }
  const target = Number(preferences.salaryTarget || 0);
  if (!target) {
    return 70;
  }
  const ratio = estimate / target;
  if (ratio >= 1.15) {
    return 100;
  }
  if (ratio >= 1) {
    return 88;
  }
  if (ratio >= 0.9) {
    return 72;
  }
  if (ratio >= 0.75) {
    return 52;
  }
  return 30;
}

function freshnessFitScore(job) {
  const daysOpen = Number(job?.days_open || 0);
  const reposts = Number(job?.repost_count || 0);
  if (daysOpen <= 14 && reposts === 0) {
    return 96;
  }
  if (daysOpen <= 30 && reposts <= 1) {
    return 78;
  }
  if (daysOpen <= 45 && reposts <= 2) {
    return 60;
  }
  return 38;
}

function visaFitScore(job) {
  if (!preferences.visaRequired) {
    return visaAwareJob(job) ? 88 : 62;
  }
  return visaAwareJob(job) ? 100 : 25;
}

function personalFitForJob(job) {
  const city = cityForJob(job);
  const cityScore = Number(city?.move_score || 55);
  const salaryScore = salaryFitScore(job);
  const freshnessScore = freshnessFitScore(job);
  const visaFit = visaFitScore(job);
  const modeScore = modeFitScore(job);
  return Math.round(
    (cityScore * 0.3) +
    (salaryScore * 0.25) +
    (visaFit * 0.2) +
    (modeScore * 0.15) +
    (freshnessScore * 0.1)
  );
}

function citySalaryFit(city) {
  return salaryFitScore({
    ...city,
    category: preferenceRoleLens(),
    country: city.country,
    city: city.city,
  });
}

function housingScore(city, minRent, maxRent) {
  if (maxRent <= minRent) {
    return 60;
  }
  return Math.round(100 - (((city.avg_rent_eur - minRent) / (maxRent - minRent)) * 100));
}

function decisionRows(items) {
  const rows = rankedCities(items);
  const maxJobs = Math.max(...rows.map((city) => city.visible_jobs), 1);
  const minRent = Math.min(...rows.map((city) => city.avg_rent_eur), 1);
  const maxRent = Math.max(...rows.map((city) => city.avg_rent_eur), 1);
  const totalWeight = weights.jobs + weights.housing + weights.english + weights.visa;
  return rows.map((city) => {
    const jobScore = Math.round((city.visible_jobs / maxJobs) * 100);
    const rentScore = housingScore(city, minRent, maxRent);
    const engScore = englishScore(city.english_friendly);
    const visScore = visaScore(city.visa_friendly);
    const weighted = (
      (jobScore * weights.jobs) +
      (rentScore * weights.housing) +
      (engScore * weights.english) +
      (visScore * weights.visa)
    ) / totalWeight;
    return {
      ...city,
      decision_score: Math.round((weighted * 0.7) + (city.move_score * 0.3)),
      job_score: jobScore,
      rent_score: rentScore,
      english_score: engScore,
      visa_score: visScore,
    };
  }).sort((left, right) => right.decision_score - left.decision_score);
}

function renderDecisionDesk(items) {
  const root = document.getElementById("decision-results");
  root.innerHTML = "";
  const rows = decisionRows(items).slice(0, 4);
  const summary = document.getElementById("decision-persona-summary");
  if (summary) {
    summary.textContent = `Local-only profile: salary target ${formatEur(preferences.salaryTarget)}, remote preference ${preferences.remotePreference.toLowerCase()}, freshness ${preferences.freshnessWindow === "Any" ? "any age" : `${preferences.freshnessWindow} days`}, visa filter ${preferences.visaRequired ? "on" : "off"}, persistent-role hide ${preferences.hidePersistent ? "on" : "off"}.`;
  }
  if (!rows.length) {
    root.innerHTML = "<p class=\"footnote\">No cities match the current filters, so the decision desk cannot rank anything yet.</p>";
    return;
  }
  rows.forEach((city) => {
    const salaryFit = citySalaryFit(city);
    const personalFit = Math.round((city.decision_score * 0.65) + (salaryFit * 0.2) + ((preferences.visaRequired ? city.visa_score : 70) * 0.15));
    const article = document.createElement("article");
    article.className = "decision-card";
    article.innerHTML = `
      <div class="decision-card-head">
        <div>
          <div class="eyebrow">${city.country}</div>
          <h3>${city.city}</h3>
        </div>
        <div class="decision-badge">${city.decision_score}</div>
      </div>
      <p>${city.why_move}</p>
      <div class="city-stats">
        <span class="chip">${city.visible_jobs} visible jobs</span>
        <span class="chip">Rent ~ EUR ${city.avg_rent_eur}/mo</span>
        <span class="chip">English ${city.english_score}</span>
        <span class="chip">Visa ${city.visa_score}</span>
        <span class="chip">Salary fit ${salaryFit}</span>
        <span class="chip">Personal fit ${personalFit}</span>
      </div>
    `;
    root.appendChild(article);
  });
}

function renderCityInsights(items) {
  const rows = rankedCities(items).slice(0, 6);
  const root = document.getElementById("city-grid");
  const summary = document.getElementById("city-summary");
  root.innerHTML = "";
  if (!rows.length) {
    summary.textContent = "No city intelligence matches the current filters.";
    return;
  }
  rows.forEach((city) => {
    const article = document.createElement("article");
    article.className = "city-card";
    article.innerHTML = `
      <div class="city-card-head">
        <div>
          <div class="eyebrow">${city.country}</div>
          <h3>${city.city}</h3>
        </div>
        <div class="city-score">${city.move_score}</div>
      </div>
      <div class="city-stats">
        <span class="chip">${city.visible_jobs} visible jobs</span>
        <span class="chip">Rent ~ EUR ${city.avg_rent_eur}/mo</span>
        <span class="chip">${city.english_friendly}</span>
        <span class="chip">${city.visa_friendly}</span>
      </div>
      <p>${city.why_move}</p>
      <p><strong>Housing pressure:</strong> ${city.housing_pressure}</p>
      <div class="action-list">
        <button type="button" class="action-link city-focus">Focus on ${city.city}</button>
      </div>
    `;
    article.querySelector(".city-focus").addEventListener("click", () => {
      filters.country = city.country;
      filters.city = city.city;
      activePreset = "all";
      syncSelects();
      const firstMatch = jobs.find((job) => job.city === city.city && job.country === city.country);
      activeId = firstMatch?.id || "";
      render();
    });
    root.appendChild(article);
  });
  const top = rows[0];
  summary.textContent = `${top.city} currently leads this filtered view for practical relocation fit: ${top.visible_jobs} visible jobs, move score ${top.move_score}, and ${top.housing_pressure.toLowerCase()} housing pressure in the current beta dataset.`;
}

function renderJobs(items) {
  const root = document.getElementById("job-list");
  root.innerHTML = "";
  items.forEach((job) => {
    const signalLabel = hiringSignalLabel(job);
    const personalFit = personalFitForJob(job);
    const article = document.createElement("article");
    article.className = `job-card${job.id === activeId ? " active" : ""}`;
    article.innerHTML = `
      <div class="eyebrow">${job.company}</div>
      <h3>${job.title}</h3>
      <p>${job.city}, ${job.country}</p>
      <div class="job-meta">
        <span class="chip">${job.language}</span>
        <span class="chip">${job.mode}</span>
        <span class="chip">${job.category}</span>
        <span class="chip">${job.visa}</span>
        <span class="chip">${signalLabel}</span>
        <span class="chip">Verified ${formatSignalDate(job.last_verified)}</span>
        <span class="chip">Open ${job.days_open || 0}d</span>
        <span class="chip">Personal fit ${personalFit}</span>
      </div>
      <p>${job.summary}</p>
      <p><strong>Best fit:</strong> ${job.fit}</p>
      <p><strong>Hiring signal:</strong> ${job.hiring_signal_summary || "Lifecycle data is not available yet in this beta."}</p>
    `;
    article.addEventListener("click", () => {
      activeId = job.id;
      render();
    });
    root.appendChild(article);
  });
}

function renderSelected(job) {
  const root = document.getElementById("selected-role");
  if (!job) {
    root.innerHTML = "<p class=\"footnote\">No role matches the current filters.</p>";
    return;
  }
  const template = templateFor(job);
  const city = cityForJob(job);
  const signalLabel = hiringSignalLabel(job);
  const personalFit = personalFitForJob(job);
  root.innerHTML = `
    <div class="eyebrow">${job.company}</div>
    <h3>${job.title}</h3>
    <p>${job.city}, ${job.country}</p>
    <div class="job-meta">
      <span class="chip">${job.language}</span>
      <span class="chip">${job.mode}</span>
      <span class="chip">${job.category}</span>
      <span class="chip">${job.visa}</span>
      <span class="chip">${signalLabel}</span>
      <span class="chip">Personal fit ${personalFit}</span>
    </div>
    <p>${job.summary}</p>
    <p><strong>Best fit:</strong> ${job.fit}</p>
    <p><strong>Personal fit:</strong> ${personalFit}/100 based on relocation fit, salary target, freshness, visa posture, and mode preference stored in this browser.</p>
    <p><strong>Hiring signal:</strong> ${job.hiring_signal_summary || "Lifecycle data is not available yet in this beta."}</p>
    <p><strong>Lifecycle:</strong> First seen ${formatSignalDate(job.first_seen)}. Last verified ${formatSignalDate(job.last_verified)}. Reposts observed ${job.repost_count || 0}. Days open ${job.days_open || 0}.</p>
    <p><strong>Visa path:</strong> ${job.visa_note}</p>
    ${city ? `<p><strong>Relocation fit:</strong> Move score ${city.move_score}, rent ~ EUR ${city.avg_rent_eur}/mo, housing pressure ${city.housing_pressure.toLowerCase()}.</p>` : ""}
    <p><strong>Source posture:</strong> this beta uses structured lifecycle metadata and short summaries. Always verify the current role details at the original source.</p>
    <div class="micro-note">
      AI-assisted expat snapshot only. This site should complement the original listing, not replace it,
      and it should never promise sponsorship or hiring outcomes.
    </div>
    <div class="action-list">
      <a class="action-link" href="${template.href}">${template.label}</a>
    </div>
  `;
}

function compareCityMetric(cityKey, roleLens) {
  const city = cityByKey(cityKey);
  if (!city) {
    return null;
  }
  const count = countsByCity(jobs, roleLens).get(cityKey) || 0;
  const fit = {
    english: englishScore(city.english_friendly),
    visa: visaScore(city.visa_friendly),
    jobs: count,
  };
  const salary = salaryEstimate(city, roleLens);
  return { ...city, role_jobs: count, fit, salary_estimate_eur: salary };
}

function rentAdjustedSalary(home, target, roleLens) {
  if (!home || !target) {
    return null;
  }
  const homeSalary = salaryEstimate(home, roleLens);
  const targetSalary = salaryEstimate(target, roleLens);
  const homeRent = Number(home?.metrics?.median_rent_1br_centre_eur || home?.avg_rent_eur || 1);
  const targetRent = Number(target?.metrics?.median_rent_1br_centre_eur || target?.avg_rent_eur || 1);
  const adjusted = Math.round(targetSalary / (targetRent / homeRent));
  return {
    homeSalary,
    targetSalary,
    adjustedSalary: adjusted,
    better: adjusted >= homeSalary,
    delta: adjusted - homeSalary,
  };
}

function compareVerdict(left, right, roleLens) {
  if (!left || !right) {
    return "Pick two different cities to compare.";
  }
  const leftComposite = (left.move_score * 0.5) + (left.fit.english * 0.2) + (left.fit.visa * 0.2) + (left.role_jobs * 6);
  const rightComposite = (right.move_score * 0.5) + (right.fit.english * 0.2) + (right.fit.visa * 0.2) + (right.role_jobs * 6);
  const leader = leftComposite >= rightComposite ? left : right;
  const lagger = leader === left ? right : left;
  const roleText = roleLens === "All" ? "the current role mix" : roleLens.toLowerCase();
  const leaderAgainstLagger = rentAdjustedSalary(lagger, leader, roleLens);
  const salaryText = leaderAgainstLagger
    ? ` The current rent-adjusted salary snapshot keeps ${leader.city} around ${formatEur(leaderAgainstLagger.adjustedSalary)} when benchmarked against ${lagger.city}.`
    : "";
  return `${leader.city} currently looks stronger than ${lagger.city} for ${roleText}: ${leader.role_jobs} visible roles in this beta slice, move score ${leader.move_score}, estimated salary ${formatEur(leader.salary_estimate_eur)}, and rent around ${formatEur(leader.avg_rent_eur)}/month.${salaryText}`;
}

function renderComparePPP(left, right) {
  const root = document.getElementById("compare-ppp");
  root.innerHTML = "";
  if (!left || !right) {
    return;
  }
  const scenarios = [
    { home: left, target: right },
    { home: right, target: left },
  ].map(({ home, target }) => {
    const view = rentAdjustedSalary(home, target, compareState.role);
    const maxVisual = Math.max(view.homeSalary, view.adjustedSalary, 1);
    return {
      home,
      target,
      ...view,
      homeWidth: Math.round((view.homeSalary / maxVisual) * 100),
      targetWidth: Math.round((view.adjustedSalary / maxVisual) * 100),
    };
  });
  root.innerHTML = `
    <article class="ppp-panel">
      <div class="panel-head">
        <h3>Rent-adjusted salary snapshot</h3>
        <div class="footnote">Useful as a directional heuristic only. This beta adjusts for central rent pressure, not full tax law, family size, or every living cost.</div>
      </div>
      <div class="ppp-grid">
        ${scenarios.map((scenario) => `
          <section class="ppp-card">
            <div class="ppp-card-head">
              <div>
                <div class="eyebrow">${scenario.home.city} baseline</div>
                <h4>${scenario.target.city} after rent adjustment</h4>
              </div>
              <div class="ppp-pill${scenario.better ? " up" : " down"}">
                ${scenario.better ? "+" : ""}${formatEur(scenario.delta)}
              </div>
            </div>
            <div class="ppp-row">
              <div class="ppp-label">${scenario.home.city} estimated salary</div>
              <div class="ppp-value">${formatEur(scenario.homeSalary)}</div>
            </div>
            <div class="ppp-bar-shell"><div class="ppp-bar baseline" style="width:${scenario.homeWidth}%"></div></div>
            <div class="ppp-row">
              <div class="ppp-label">${scenario.target.city} salary, adjusted to ${scenario.home.city} rent</div>
              <div class="ppp-value ${scenario.better ? "up" : "down"}">${formatEur(scenario.adjustedSalary)}</div>
            </div>
            <div class="ppp-bar-shell"><div class="ppp-bar ${scenario.better ? "up" : "down"}" style="width:${scenario.targetWidth}%"></div></div>
            <p class="ppp-note">
              A ${formatEur(scenario.targetSalary)} target salary in ${scenario.target.city} feels closer to
              <strong>${formatEur(scenario.adjustedSalary)}</strong> when you benchmark it against ${scenario.home.city}'s rent pressure.
            </p>
          </section>
        `).join("")}
      </div>
    </article>
  `;
}

function renderCompareWorkbench() {
  const root = document.getElementById("compare-grid");
  const summary = document.getElementById("compare-summary");
  root.innerHTML = "";
  const left = compareCityMetric(compareState.cityA, compareState.role);
  const right = compareCityMetric(compareState.cityB, compareState.role);
  summary.textContent = compareVerdict(left, right, compareState.role);
  [left, right].forEach((city) => {
    if (!city) {
      return;
    }
    const article = document.createElement("article");
    article.className = "compare-card";
    article.innerHTML = `
      <div class="city-card-head">
        <div>
          <div class="eyebrow">${city.country}</div>
          <h3>${city.city}</h3>
        </div>
        <div class="city-score">${city.move_score}</div>
      </div>
      <div class="city-stats">
        <span class="chip">${city.role_jobs} visible roles</span>
        <span class="chip">Rent ~ EUR ${city.avg_rent_eur}/mo</span>
        <span class="chip">Salary ~ ${formatEur(city.salary_estimate_eur)}</span>
        <span class="chip">English ${city.fit.english}</span>
        <span class="chip">Visa ${city.fit.visa}</span>
      </div>
      <p>${city.why_move}</p>
      <p><strong>Housing pressure:</strong> ${city.housing_pressure}</p>
      <p><strong>Positioning:</strong> ${city.english_friendly}; ${city.visa_friendly}.</p>
    `;
    root.appendChild(article);
  });
  renderComparePPP(left, right);
}

function renderIndexSummary() {
  const topCity = [...cities].sort((left, right) => right.scores.overall_score_default_weights - left.scores.overall_score_default_weights)[0];
  const topCountry = [...countries].sort((left, right) => right.scores.overall_score_default_weights - left.scores.overall_score_default_weights)[0];
  document.getElementById("index-top-city").textContent = topCity
    ? `${topCity.city}, ${topCity.country} (${Math.round(topCity.scores.overall_score_default_weights * 100)})`
    : "No city data loaded";
  document.getElementById("index-top-country").textContent = topCountry
    ? `${topCountry.name} (${Math.round(topCountry.scores.overall_score_default_weights * 100)})`
    : "No country data loaded";
  document.getElementById("index-data-model").textContent = `${cities.length} cities, ${countries.length} countries, static JSON contract with raw metrics + derived scores.`;
}

function applyPreset(name) {
  const preset = presets[name];
  if (!preset) {
    return;
  }
  activePreset = name;
  filters.country = preset.country;
  filters.city = preset.city;
  filters.language = preset.language;
  filters.mode = preset.mode;
  filters.category = preset.category;
  filters.visa = preset.visa;
  syncSelects();
  render();
}

function saveWeights() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(weights));
}

function savePreferences() {
  localStorage.setItem(LOCAL_PREFERENCE_KEY, JSON.stringify(preferences));
}

function loadWeights() {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    ["jobs", "housing", "english", "visa"].forEach((key) => {
      if (typeof parsed[key] === "number") {
        weights[key] = parsed[key];
      }
    });
  } catch (_error) {
    // ignore malformed local state
  }
}

function loadPreferences() {
  const raw = localStorage.getItem(LOCAL_PREFERENCE_KEY);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.salaryTarget === "number") {
      preferences.salaryTarget = parsed.salaryTarget;
    }
    if (typeof parsed.remotePreference === "string") {
      preferences.remotePreference = parsed.remotePreference;
    }
    if (typeof parsed.freshnessWindow === "string") {
      preferences.freshnessWindow = parsed.freshnessWindow;
    }
    if (typeof parsed.visaRequired === "boolean") {
      preferences.visaRequired = parsed.visaRequired;
    }
    if (typeof parsed.hidePersistent === "boolean") {
      preferences.hidePersistent = parsed.hidePersistent;
    }
  } catch (_error) {
    // ignore malformed local state
  }
}

function syncWeightControls() {
  document.getElementById("weight-jobs").value = String(weights.jobs);
  document.getElementById("weight-housing").value = String(weights.housing);
  document.getElementById("weight-english").value = String(weights.english);
  document.getElementById("weight-visa").value = String(weights.visa);
}

function syncPreferenceControls() {
  document.getElementById("salary-target").value = String(preferences.salaryTarget);
  document.getElementById("salary-target-value").textContent = `${formatEur(preferences.salaryTarget)}+`;
  document.getElementById("remote-preference").value = preferences.remotePreference;
  document.getElementById("freshness-window").value = preferences.freshnessWindow;
  document.getElementById("visa-required").checked = preferences.visaRequired;
  document.getElementById("hide-persistent").checked = preferences.hidePersistent;
}

function render() {
  const items = filteredJobs();
  if (!items.find((item) => item.id === activeId)) {
    activeId = items[0]?.id || "";
  }
  const active = items.find((item) => item.id === activeId);
  renderPresets();
  renderStats(items);
  renderCityInsights(items);
  renderDecisionDesk(items);
  renderMap(items);
  renderJobs(items);
  renderSelected(active);
  renderCompareWorkbench();
}

async function main() {
  [jobs, cities, countries] = await Promise.all([
    fetch("./data/jobs.json").then((response) => response.json()),
    fetch("./data/cities.json").then((response) => response.json()),
    fetch("./data/countries.json").then((response) => response.json()),
  ]);

  loadWeights();
  loadPreferences();
  syncWeightControls();
  syncPreferenceControls();

  populateSelect("country-filter", optionsFor("country"));
  populateSelect("city-filter", optionsFor("city"));
  populateSelect("language-filter", optionsFor("language"));
  populateSelect("mode-filter", optionsFor("mode"));
  populateSelect("category-filter", optionsFor("category"));
  populateSelect("visa-filter", optionsFor("visa"));
  populateCompareSelects();
  renderIndexSummary();

  document.getElementById("country-filter").addEventListener("change", (event) => {
    filters.country = event.target.value;
    if (filters.country !== "All" && filters.city !== "All") {
      const cityExists = jobs.some((job) => job.country === filters.country && job.city === filters.city);
      if (!cityExists) {
        filters.city = "All";
      }
    }
    syncSelects();
    render();
  });
  document.getElementById("city-filter").addEventListener("change", (event) => {
    filters.city = event.target.value;
    render();
  });
  document.getElementById("language-filter").addEventListener("change", (event) => {
    filters.language = event.target.value;
    render();
  });
  document.getElementById("mode-filter").addEventListener("change", (event) => {
    filters.mode = event.target.value;
    render();
  });
  document.getElementById("category-filter").addEventListener("change", (event) => {
    filters.category = event.target.value;
    activePreset = "all";
    render();
  });
  document.getElementById("visa-filter").addEventListener("change", (event) => {
    filters.visa = event.target.value;
    activePreset = "all";
    render();
  });
  document.querySelectorAll(".preset-button").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset || "all"));
  });
  ["country-filter", "city-filter", "language-filter", "mode-filter", "category-filter", "visa-filter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      activePreset = "all";
      renderPresets();
    });
  });

  [
    ["weight-jobs", "jobs"],
    ["weight-housing", "housing"],
    ["weight-english", "english"],
    ["weight-visa", "visa"],
  ].forEach(([id, key]) => {
    document.getElementById(id).addEventListener("input", (event) => {
      weights[key] = Number(event.target.value);
      saveWeights();
      render();
    });
  });

  document.getElementById("salary-target").addEventListener("input", (event) => {
    preferences.salaryTarget = Number(event.target.value);
    savePreferences();
    syncPreferenceControls();
    render();
  });
  document.getElementById("remote-preference").addEventListener("change", (event) => {
    preferences.remotePreference = event.target.value;
    savePreferences();
    render();
  });
  document.getElementById("freshness-window").addEventListener("change", (event) => {
    preferences.freshnessWindow = event.target.value;
    savePreferences();
    render();
  });
  document.getElementById("visa-required").addEventListener("change", (event) => {
    preferences.visaRequired = event.target.checked;
    savePreferences();
    render();
  });
  document.getElementById("hide-persistent").addEventListener("change", (event) => {
    preferences.hidePersistent = event.target.checked;
    savePreferences();
    render();
  });

  document.getElementById("compare-city-a").addEventListener("change", (event) => {
    compareState.cityA = event.target.value;
    renderCompareWorkbench();
  });
  document.getElementById("compare-city-b").addEventListener("change", (event) => {
    compareState.cityB = event.target.value;
    renderCompareWorkbench();
  });
  document.getElementById("compare-role").addEventListener("change", (event) => {
    compareState.role = event.target.value;
    renderCompareWorkbench();
  });

  document.getElementById("updated-at").textContent = `Updated ${new Date().toLocaleString("en-GB", { timeZone: "Europe/Amsterdam" })}`;
  syncSelects();
  applyPreset("nl-live-work");
}

main();
