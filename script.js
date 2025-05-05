<script>
window.addEventListener("load", () => {
  // per-species color map (in-memory, reset on reload)
  const speciesColorMap = {};

  function getColorForSpecies(species) {
    if (!speciesColorMap[species]) {
      // generate a random pastel color
      const hue = Math.floor(Math.random() * 360);
      speciesColorMap[species] = `hsl(${hue}, 70%, 60%)`;
    }
    return speciesColorMap[species];
  }

  // Set up the camera offset.
  const camera = document.querySelector("[gps-new-camera]");
  const offset = parseFloat(localStorage.getItem("calibrationOffset") || "0");
  camera.setAttribute("gps-new-camera", {
    gpsMinDistance: 3,
    rotate: true,
    rotationOffset: offset,
  });

  setTimeout(() => {
    window.dispatchEvent(new Event("resize"));
    console.log("🔁 Forced layout resize");
  }, 500);

  let userMarker = null;
  let plantMarkers = {};

  const scene = document.querySelector("a-scene");
  const plantInfoDisplay = document.getElementById("plant-info");

  let lastMarkerUpdate = 0;
  const updateInterval = 10000; // 10s

  let firstUpdateDone = false;

  camera.addEventListener("gps-camera-update-position", (e) => {
    const userLat = e.detail.position.latitude;
    const userLon = e.detail.position.longitude;

    // user marker
    if (!userMarker) {
      userMarker = document.createElement("a-box");
      userMarker.setAttribute("scale", "1 1 1");
      userMarker.setAttribute("material", "color: red");
      scene.appendChild(userMarker);
    }
    userMarker.setAttribute(
      "gps-new-entity-place",
      `latitude: ${userLat}; longitude: ${userLon}`
    );

    const now = Date.now();
    if (!firstUpdateDone || now - lastMarkerUpdate > updateInterval) {
      firstUpdateDone = true;
      lastMarkerUpdate = now;
      updatePlantMarkers(userLat, userLon);
    }
  });

  function updatePlantMarkers(userLat, userLon) {
    fetch("./ABG.csv")
      .then((r) => r.text())
      .then((csvText) => {
        const plants = parseCSV(csvText)
          .map((p) => ({
            ...p,
            distance: getDistance(userLat, userLon, p.lat, p.lon),
          }))
          .filter((p) => p.distance <= 10)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 10);

        // add/update
        plants.forEach((plant) => {
          const color = getColorForSpecies(plant.species || plant.genus);

          if (plantMarkers[plant.s_id]) {
            // just move existing sphere
            plantMarkers[plant.s_id].setAttribute(
              "gps-new-entity-place",
              `latitude: ${plant.lat}; longitude: ${plant.lon}`
            );
          } else {
            // create new colored dot
            const dot = document.createElement("a-sphere");
            dot.setAttribute("radius", "1");           // adjust size here
            dot.setAttribute("material", `color: ${color}; opacity: 0.8`);
            dot.setAttribute("look-at", "[gps-new-camera]"); 
            dot.classList.add("clickable");
            dot.setAttribute(
              "gps-new-entity-place",
              `latitude: ${plant.lat}; longitude: ${plant.lon}`
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

        // remove old
        Object.keys(plantMarkers).forEach((id) => {
          if (!plants.find((p) => p.s_id === id)) {
            scene.removeChild(plantMarkers[id]);
            delete plantMarkers[id];
          }
        });
      })
      .catch(console.error);
  }

  // … rest of your helpers unchanged …
  function parseCSV(csvText) {
    const rows = csvText.split("\n").slice(1);
    return rows.map((r) => {
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
        height: parseFloat(c[10]) || 1,
      };
    }).filter((p) => p.s_id && p.lat && p.lon);
  }

  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3, toRad = Math.PI/180;
    const φ1 = lat1*toRad, φ2 = lat2*toRad;
    const dφ = (lat2-lat1)*toRad, dλ = (lon2-lon1)*toRad;
    const a = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
});
</script>
