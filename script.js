window.addEventListener("load", () => {
  // ———————— Color‐by‐species palette ————————
  const speciesColorMap = {};
  function getColorForSpecies(species) {
    if (!speciesColorMap[species]) {
      const hue = Math.floor(Math.random() * 360);
      speciesColorMap[species] = `hsl(${hue},70%,60%)`;
    }
    return speciesColorMap[species];
  }

  // ———————— Camera setup ————————
  const camera = document.querySelector("[gps-projected-camera]");
  if (!camera) {
    console.error("🔴 couldn’t find <a-camera gps-projected-camera> in the DOM");
    return;
  }
  const offset = parseFloat(localStorage.getItem("calibrationOffset") || "0");
  camera.setAttribute("gps-projected-camera", {
    gpsMinDistance: 3,
    rotate: true,
    rotationOffset: offset
  });
  // Force a resize so A-Frame & AR.js re-align
  setTimeout(() => window.dispatchEvent(new Event("resize")), 500);

  // ———————— State ————————
  let userMarker = null;
  const plantMarkers = {};
  const scene = document.querySelector("a-scene");
  const plantInfoDisplay = document.getElementById("plant-info");
  let lastMarkerUpdate = 0;
  const UPDATE_INTERVAL = 10_000;   // ms
  let firstUpdateDone = false;

  // ———————— Listen for GPS updates ————————
  camera.addEventListener("gps-camera-update-position", (e) => {
    const { latitude: userLat, longitude: userLon } = e.detail.position;
    console.log("🌐 GPS update:", userLat, userLon);

    // 1) “you are here” red box
    if (!userMarker) {
      userMarker = document.createElement("a-box");
      userMarker.setAttribute("scale", "1 1 1");
      userMarker.setAttribute("material", "color:red");
      scene.appendChild(userMarker);
    }
    userMarker.setAttribute(
      "gps-projected-entity-place",
      `latitude:${userLat};longitude:${userLon}`
    );

    // 2) throttle plant updates
    const now = Date.now();
    if (!firstUpdateDone || now - lastMarkerUpdate > UPDATE_INTERVAL) {
      firstUpdateDone = true;
      lastMarkerUpdate = now;
      updatePlantMarkers(userLat, userLon);
    }
  });

  // ———————— Fetch, parse & place plants ————————
  function updatePlantMarkers(userLat, userLon) {
    fetch("./ABG.csv")
      .then(r => {
        console.log("🥣 CSV fetch status:", r.status);
        return r.text();
      })
      .then(csvText => {
        const allPlants = parseCSV(csvText);
        console.log("📋 parsed plants:", allPlants.length);

        const nearby = allPlants
          .map(p => ({
            ...p,
            distance: getDistance(userLat, userLon, p.lat, p.lon)
          }))
          // adjust radius as needed
          .filter(p => p.distance <= 1000)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 10);

        console.log("➡️ showing plants:", nearby.length, nearby);

        nearby.forEach(plant => {
          const color = getColorForSpecies(plant.species || plant.genus);

          if (plantMarkers[plant.s_id]) {
            plantMarkers[plant.s_id].setAttribute(
              "gps-projected-entity-place",
              `latitude:${plant.lat};longitude:${plant.lon}`
            );
          } else {
            const dot = document.createElement("a-sphere");
            dot.setAttribute("radius", "1");
            dot.setAttribute("material", `color:${color};opacity:0.8`);
            dot.setAttribute("look-at", "[gps-projected-camera]");
            dot.classList.add("clickable");
            dot.setAttribute(
              "gps-projected-entity-place",
              `latitude:${plant.lat};longitude:${plant.lon}`
            );
            dot.addEventListener("click", () => {
              plantInfoDisplay.style.display = "block";
              plantInfoDisplay.innerHTML = `
                <strong>${plant.cname2 ? plant.cname2 + ", " : ""}${plant.cname1}</strong><br>
                Genus: ${plant.genus || "N/A"}<br>
                Species: ${plant.species || "N/A"}
              `;
              setTimeout(() => plantInfoDisplay.style.display = "none", 3000);
            });
            scene.appendChild(dot);
            plantMarkers[plant.s_id] = dot;
          }
        });

        // Remove markers for plants no longer nearby
        Object.keys(plantMarkers).forEach(id => {
          if (!nearby.find(p => p.s_id === id)) {
            scene.removeChild(plantMarkers[id]);
            delete plantMarkers[id];
          }
        });
      })
      .catch(err => console.error("❌ CSV load error:", err));
  }

  // ———————— CSV parsing & Haversine ————————
  function parseCSV(txt) {
    return txt.split("\n").slice(1).map(r => {
      const c = r.split(",");
      while (c.length < 11) c.push("");
      return {
        s_id: c[0].trim(),
        cname1: c[1].trim() || "Unknown",
        cname2: c[2].trim() || "",
        genus: c[4].trim() || "Unknown",
        species: c[5].trim() || "",
        lon: parseFloat(c[7]) || 0,
        lat: parseFloat(c[8]) || 0
      };
    }).filter(p => p.s_id && p.lat && p.lon);
  }

  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3, toRad = Math.PI / 180;
    const φ1 = lat1 * toRad, φ2 = lat2 * toRad;
    const dφ = (lat2 - lat1) * toRad, dλ = (lon2 - lon1) * toRad;
    const a = Math.sin(dφ/2)**2 +
              Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
});
