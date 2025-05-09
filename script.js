window.addEventListener("load", () => {
  const scene = document.querySelector("a-scene");
  const camEl = document.querySelector("[gps-projected-camera]");
  const infoEl = document.getElementById("plant-info");
  if (!camEl) {
    console.error("🔴 <a-camera gps-projected-camera> not found!");
    return;
  }

  // simple recolor‐by‐species map
  const speciesColorMap = {};
  function getColor(sp) {
    if (!speciesColorMap[sp]) {
      speciesColorMap[sp] = `hsl(${Math.floor(Math.random() * 360)},70%,60%)`;
    }
    return speciesColorMap[sp];
  }

  let userBox = null;
  const plantDots = {};
  let lastUpdate = 0,
      first = false,
      UPDATE_INTERVAL = 10000; // 10s throttle

  camEl.addEventListener("gps-camera-update-position", e => {
    const { latitude, longitude } = e.detail.position;
    // 1) your red “you are here” box
    if (!userBox) {
      userBox = document.createElement("a-box");
      userBox.setAttribute("scale","1 1 1");
      userBox.setAttribute("material","color:red;opacity:0.8");
      scene.appendChild(userBox);
    }
    userBox.setAttribute(
      "gps-projected-entity-place",
      `latitude:${latitude};longitude:${longitude}`
    );

    // 2) throttle loading plant dots
    const now = Date.now();
    if (!first || now - lastUpdate > UPDATE_INTERVAL) {
      first = true; lastUpdate = now;
      loadPlants(latitude, longitude);
    }
  });

  function loadPlants(uLat, uLon) {
    fetch("ABG.csv")
      .then(r => r.text())
      .then(txt => {
        const all = parseCSV(txt);
        const nearby = all
          .map(p => ({ ...p, dist: haversine(uLat,uLon,p.lat,p.lon) }))
          .filter(p => p.dist <= 1000)   // 1 km radius (tweak to taste)
          .sort((a,b)=>a.dist-b.dist)
          .slice(0,10);

        nearby.forEach(p => {
          const color = getColor(p.species || p.genus);
          if (!plantDots[p.s_id]) {
            const dot = document.createElement("a-sphere");
            dot.setAttribute("radius","1");
            dot.setAttribute("material",`color:${color};opacity:0.8`);
            dot.setAttribute("look-at","[gps-projected-camera]");
            dot.classList.add("clickable");
            dot.addEventListener("click", () => {
              infoEl.innerHTML = `
                <strong>${p.cname2? p.cname2 + ", " : ""}${p.cname1}</strong><br>
                Genus: ${p.genus}<br>Species: ${p.species}
              `;
              infoEl.style.display = "block";
              setTimeout(() => infoEl.style.display = "none", 3000);
            });
            scene.appendChild(dot);
            plantDots[p.s_id] = dot;
          }
          plantDots[p.s_id].setAttribute(
            "gps-projected-entity-place",
            `latitude:${p.lat};longitude:${p.lon}`
          );
        });

        // clean up old
        Object.keys(plantDots).forEach(id => {
          if (!nearby.find(p => p.s_id === id)) {
            scene.removeChild(plantDots[id]);
            delete plantDots[id];
          }
        });
      })
      .catch(err => console.error("❌ CSV error:", err));
  }

  function parseCSV(txt) {
    return txt.split("\n").slice(1).map(r => {
      const c = r.split(",");
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
    const R = 6371000, toRad = Math.PI/180;
    const φ1 = lat1*toRad, φ2 = lat2*toRad;
    const dφ = (lat2-lat1)*toRad, dλ = (lon2-lon1)*toRad;
    const a = Math.sin(dφ/2)**2 +
              Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
});
