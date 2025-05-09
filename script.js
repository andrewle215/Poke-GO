window.addEventListener("load", () => {
  // ———————— Species→HSL palette ————————
  const speciesColorMap = {};
  function getColorForSpecies(species) {
    if (!speciesColorMap[species]) {
      // random hue, fixed sat/light
      const hue = Math.floor(Math.random() * 360);
      speciesColorMap[species] = `hsl(${hue},70%,60%)`;
    }
    return speciesColorMap[species];
  }

  // ———————— Camera setup ————————
  const camera = document.querySelector("[gps-new-camera]");
  if (!camera) {
    console.error("🔴 <a-camera gps-new-camera> not found!");
    return;
  }
  const offset = parseFloat(localStorage.getItem("calibrationOffset") || "0");
  camera.setAttribute("gps-new-camera", {
    gpsMinDistance: 3,
    rotate: true,
    rotationOffset: offset,
  });
  // force A-Frame/AR.js to realign
  setTimeout(() => window.dispatchEvent(new Event("resize")), 500);

  // ———————— State ————————
  let userBox = null;
  const plantDots = {};
  const scene = document.querySelector("a-scene");
  const infoBox = document.getElementById("plant-info");

  let lastUpdate = 0;
  const UPDATE_INTERVAL = 10_000; // 10s
  let first = false;

  // ———————— On each GPS update ————————
  camera.addEventListener("gps-camera-update-position", (e) => {
    const { latitude, longitude } = e.detail.position;
    console.log("📍 GPS:", latitude, longitude);

    // 1) red “you are here” box
    if (!userBox) {
      userBox = document.createElement("a-box");
      userBox.setAttribute("scale", "1 1 1");
      userBox.setAttribute("material", "color:red;opacity:0.8");
      scene.appendChild(userBox);
    }
    userBox.setAttribute(
      "gps-new-entity-place",
      `latitude:${latitude};longitude:${longitude}`
    );

    // 2) throttle plant‐dot updates
    const now = Date.now();
    if (!first || now - lastUpdate > UPDATE_INTERVAL) {
      first = true;
      lastUpdate = now;
      updatePlantDots(latitude, longitude);
    }
  });

  // ———————— Fetch & place colored dots ————————
  function updatePlantDots(userLat, userLon) {
    fetch("ABG.csv")
      .then((r) => r.text())
      .then((txt) => {
        const all = parseCSV(txt);
        const nearby = all
          .map((p) => ({
            ...p,
            dist: haversine(userLat, userLon, p.lat, p.lon),
          }))
          .filter((p) => p.dist <= 1000) // show within 1 km for debug
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 10);

        console.log("➡️ placing:", nearby);

        nearby.forEach((p) => {
          const col = getColorForSpecies(p.species || p.genus);

          if (!plantDots[p.s_id]) {
            // first time: create a sphere
            const dot = document.createElement("a-sphere");
            dot.setAttribute("radius", "1");
            dot.setAttribute("material", `color:${col};opacity:0.8`);
            dot.setAttribute("look-at", "[gps-new-camera]");
            dot.classList.add("clickable");
            dot.addEventListener("click", () => {
              infoBox.innerHTML = `
                <strong>${p.cname2 ? p.cname2 + ", " : ""}${p.cname1}</strong><br>
                Genus: ${p.genus}<br>Species: ${p.species}
              `;
              infoBox.style.display = "block";
              setTimeout(() => (infoBox.style.display = "none"), 3000);
            });
            scene.appendChild(dot);
            plantDots[p.s_id] = dot;
          }

          // update position each pass
          plantDots[p.s_id].setAttribute(
            "gps-new-entity-place",
            `latitude:${p.lat};longitude:${p.lon}`
          );
        });

        // remove any dots for plants no longer nearby
        Object.keys(plantDots).forEach((id) => {
          if (!nearby.find((p) => p.s_id === id)) {
            scene.removeChild(plantDots[id]);
            delete plantDots[id];
          }
        });
      })
      .catch((err) => console.error("❌ CSV error:", err));
  }

  // ———————— CSV → JS objects ————————
  function parseCSV(txt) {
    return txt
      .split("\n")
      .slice(1)
      .map((r) => {
        const c = r.split(",");
        while (c.length < 11) c.push("");
        return {
          s_id: c[0].trim(),
          cname1: c[1].trim() || "Unknown",
          cname2: c[2].trim() || "",
          genus: c[4].trim() || "Unknown",
          species: c[5].trim() || "",
          lon: parseFloat(c[7]) || 0,
          lat: parseFloat(c[8]) || 0,
        };
      })
      .filter((p) => p.s_id && p.lat && p.lon);
  }

  // ———————— Haversine dist (m) ————————
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000,
      toRad = Math.PI / 180;
    const φ1 = lat1 * toRad,
      φ2 = lat2 * toRad;
    const dφ = (lat2 - lat1) * toRad,
      dλ = (lon2 - lon1) * toRad;
    const a =
      Math.sin(dφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
});
