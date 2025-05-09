window.addEventListener("load", () => {
  const scene = document.querySelector("a-scene");
  const camEl = document.querySelector("[gps-new-camera]");
  const info  = document.getElementById("plant-info");
  if (!camEl) {
    console.error("🔴 No <a-camera gps-new-camera> found!");
    return;
  }

  // —————————— species → color map ——————————
  const speciesColorMap = {};
  function getColorForSpecies(sp) {
    if (!speciesColorMap[sp]) {
      // pick a random hue, 70% saturation, 60% lightness
      const hue = Math.floor(Math.random() * 360);
      speciesColorMap[sp] = `hsl(${hue},70%,60%)`;
    }
    return speciesColorMap[sp];
  }

  let userBox = null;
  const plantDots = {};
  let lastFetch = 0;
  const FETCH_INTERVAL = 10_000; // 10s

  camEl.addEventListener("gps-camera-update-position", e => {
    const { latitude, longitude } = e.detail.position;

    // your “you are here” box
    if (!userBox) {
      userBox = document.createElement("a-box");
      userBox.setAttribute("scale","0.5 0.5 0.5");
      userBox.setAttribute("material","color:red;opacity:0.8");
      userBox.setAttribute("position","0 -1 0"); // on ground
      scene.appendChild(userBox);
    }
    userBox.setAttribute(
      "gps-entity-place",
      `latitude:${latitude};longitude:${longitude}`
    );

    const now = Date.now();
    if (now - lastFetch > FETCH_INTERVAL) {
      lastFetch = now;
      loadAndPlacePlants(latitude, longitude);
    }
  });

  function loadAndPlacePlants(uLat, uLon) {
    fetch("./ABG.csv")
      .then(r => r.text())
      .then(txt => {
        const all = parseCSV(txt);
        const nearby = all
          .map(p => ({ ...p, dist: haversine(uLat,uLon,p.lat,p.lon) }))
          .filter(p => p.dist <= 10)
          .sort((a,b)=>a.dist-b.dist)
          .slice(0,10);

        nearby.forEach(p => {
          const speciesKey = p.species || p.genus;
          const color      = getColorForSpecies(speciesKey);

          if (plantDots[p.s_id]) {
            plantDots[p.s_id].setAttribute(
              "gps-entity-place",
              `latitude:${p.lat};longitude:${p.lon}`
            );
          } else {
            const dot = document.createElement("a-sphere");
            dot.setAttribute("radius","1");
            dot.setAttribute("position","0 1 0");
            dot.setAttribute("material", `color:${color};opacity:0.8`);
            dot.setAttribute(
              "gps-entity-place",
              `latitude:${p.lat};longitude:${p.lon}`
            );
            dot.addEventListener("click", () => {
              info.innerHTML = `
                <strong>${p.cname1}${p.cname2 ? ", "+p.cname2 : ""}</strong><br>
                Genus: ${p.genus}<br>
                Species: ${p.species}
              `;
              info.style.display = "block";
              setTimeout(() => info.style.display = "none", 3000);
            });
            scene.appendChild(dot);
            plantDots[p.s_id] = dot;
          }
        });

        // clean up old
        Object.keys(plantDots).forEach(id => {
          if (!nearby.find(x => x.s_id === id)) {
            scene.removeChild(plantDots[id]);
            delete plantDots[id];
          }
        });
      })
      .catch(console.error);
  }

  function parseCSV(txt) {
    return txt.split("\n").slice(1).map(r => {
      const c = r.split(",");
      while (c.length < 11) c.push("");
      return {
        s_id:    c[0].trim(),
        cname1:  c[1].trim() || "Unknown",
        cname2:  c[2].trim() || "",
        genus:   c[4].trim() || "Unknown",
        species: c[5].trim() || "",
        lon: +c[7] || 0,
        lat: +c[8] || 0
      };
    }).filter(p => p.s_id && p.lat && p.lon);
  }

  function haversine(lat1,lon1,lat2,lon2) {
    const R=6371e3, toRad=Math.PI/180;
    const φ1=lat1*toRad, φ2=lat2*toRad;
    const dφ=(lat2-lat1)*toRad, dλ=(lon2-lon1)*toRad;
    const a = Math.sin(dφ/2)**2 +
              Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
});
