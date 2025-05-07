window.addEventListener("load", () => {
  // —––– Color palette keyed by species string —––––
  const speciesColorMap = {};
  function getColorForSpecies(species) {
    if (!speciesColorMap[species]) {
      const hue = Math.floor(Math.random() * 360);
      speciesColorMap[species] = `hsl(${hue},70%,60%)`;
    }
    return speciesColorMap[species];
  }

  // —––– Grab our scene, camera & info box —––––
  const scene = document.querySelector("a-scene");
  const camEl = document.querySelector("[gps-projected-camera]");
  const info  = document.getElementById("plant-info");
  if (!camEl) {
    console.error("🔴 No <a-camera gps-projected-camera> found!");
    return;
  }

  // —––– State —––––
  let userMarker    = null;
  const plantDots   = {};
  let lastUpdate    = 0;
  const INTERVAL_MS = 10_000;
  let firstDone     = false;

  // —––– On each GPS position update —––––
  camEl.addEventListener("gps-camera-update-position", e => {
    const { latitude, longitude } = e.detail.position;
    console.log("🌐 GPS update:", latitude, longitude);

    // 1) “You are here” red box
    if (!userMarker) {
      userMarker = document.createElement("a-box");
      userMarker.setAttribute("scale","1 1 1");
      userMarker.setAttribute("material","color:red");
      scene.appendChild(userMarker);
    }
    userMarker.setAttribute(
      "gps-projected-entity-place",
      `latitude:${latitude};longitude:${longitude}`
    );

    // 2) throttle plant loading
    const now = Date.now();
    if (!firstDone || now - lastUpdate > INTERVAL_MS) {
      firstDone = true;
      lastUpdate = now;
      updatePlantMarkers(latitude, longitude);
    }
  });

  // —––– Fetch, parse, display nearest 10 plants —––––
  function updatePlantMarkers(userLat, userLon) {
    fetch("./ABG.csv")
      .then(r => {
        console.log("🥣 CSV fetch status:", r.status);
        return r.text();
      })
      .then(txt => {
        const all = parseCSV(txt);
        console.log("📋 parsed plants:", all.length);

        // compute distance, filter to 1000 m (tweak to taste), sort & take 10
        const nearby = all
          .map(p => ({
            ...p,
            dist: haversine(userLat, userLon, p.lat, p.lon)
          }))
          .filter(p => p.dist <= 1000)
          .sort((a,b) => a.dist - b.dist)
          .slice(0, 10);
        console.log("➡️ showing:", nearby);

        nearby.forEach(p => {
          const color = getColorForSpecies(p.species || p.genus);
          if (plantDots[p.s_id]) {
            // just update position
            plantDots[p.s_id].setAttribute(
              "gps-projected-entity-place",
              `latitude:${p.lat};longitude:${p.lon}`
            );
          } else {
            // create a new colored dot
            const dot = document.createElement("a-sphere");
            dot.setAttribute("radius","1");
            dot.setAttribute("material",`color:${color};opacity:0.8`);
            dot.setAttribute("look-at","[gps-projected-camera]");
            dot.classList.add("clickable");
            dot.setAttribute(
              "gps-projected-entity-place",
              `latitude:${p.lat};longitude:${p.lon}`
            );
            dot.addEventListener("click", () => {
              info.style.display = "block";
              info.innerHTML = `
                <strong>${p.cname2? p.cname2 + ", " : ""}${p.cname1}</strong><br>
                Genus: ${p.genus}<br>
                Species: ${p.species}
              `;
              setTimeout(() => (info.style.display = "none"), 3000);
            });
            scene.appendChild(dot);
            plantDots[p.s_id] = dot;
          }
        });

        // remove any old markers no longer in the nearby list
        Object.keys(plantDots).forEach(id => {
          if (!nearby.find(p => p.s_id === id)) {
            scene.removeChild(plantDots[id]);
            delete plantDots[id];
          }
        });
      })
      .catch(err => console.error("❌ CSV load error:", err));
  }

  // —––– CSV→JS & Haversine —––––
  function parseCSV(txt) {
    return txt.split("\n").slice(1).map(row => {
      const c = row.split(",");
      while (c.length < 11) c.push("");
      return {
        s_id:      c[0].trim(),
        cname1:    c[1].trim() || "Unknown",
        cname2:    c[2].trim() || "",
        genus:     c[4].trim() || "Unknown",
        species:   c[5].trim() || "",
        lon:       parseFloat(c[7]) || 0,
        lat:       parseFloat(c[8]) || 0
      };
    }).filter(p => p.s_id && p.lat && p.lon);
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3, toRad = Math.PI/180;
    const φ1 = lat1 * toRad, φ2 = lat2 * toRad;
    const dφ = (lat2 - lat1) * toRad, dλ = (lon2 - lon1) * toRad;
    const a = Math.sin(dφ/2)**2 +
              Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
});
