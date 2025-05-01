window.addEventListener("load", () => {
  // offset of camera is set up here
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
  const updateInterval = 2000; 

  let firstUpdateDone = false;

  camera.addEventListener("gps-camera-update-position", (e) => {
    const userLat = e.detail.position.latitude;
    const userLon = e.detail.position.longitude;

    // the users marker
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

    
    // how often code is updated
    if (!firstUpdateDone) {
      firstUpdateDone = true; 
      lastMarkerUpdate = now; 
      updatePlantMarkers(userLat, userLon);
    } else {
      
      if (now - lastMarkerUpdate > updateInterval) {
        lastMarkerUpdate = now;
        updatePlantMarkers(userLat, userLon);
      }
    }
  });

  function updatePlantMarkers(userLat, userLon) {
    fetch("./ABG.csv")
      .then((response) => response.text())
      .then((csvText) => {
        const plants = parseCSV(csvText)
          .map((p) => ({
            ...p,
            distance: getDistance(userLat, userLon, p.lat, p.lon),
          }))
          .filter((p) => p.distance <= 10)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 10);

        plants.forEach((plant) => {
          const heightScale = getAdjustedHeight(plant.height);
          const yPos = heightScale / 2;

          if (plantMarkers[plant.s_id]) {
            plantMarkers[plant.s_id].setAttribute(
              "gps-new-entity-place",
              `latitude: ${plant.lat}; longitude: ${plant.lon}`
            );
          } else {
            const marker = document.createElement("a-entity");
            marker.setAttribute("gltf-model", getPolyModelURL(plant.height));
            marker.setAttribute("scale", getScaleFromHeight(plant.height));
            marker.setAttribute("position", `0 ${yPos} 0`);
            marker.setAttribute("look-at", "[gps-new-camera]");
            marker.setAttribute(
              "gps-new-entity-place",
              `latitude: ${plant.lat}; longitude: ${plant.lon}`
            );
            marker.setAttribute("class", "clickable");

            // displays the info
            marker.addEventListener("click", () => {
              plantInfoDisplay.style.display = "block";
              plantInfoDisplay.innerHTML = `
                <div style="font-size: 1em; font-weight: bold;">
                  Common Name:
                </div>
                <div style="font-size: 0.7em;">
                  ${plant.cname2 ? plant.cname2 + ", " : ""}${plant.cname1 || ""}
                </div>
                <div style="font-size: 0.5em;">
                  Genus: ${plant.genus || "N/A"} &nbsp;&nbsp;
                  Species: ${plant.species || "N/A"}
                </div>
              `;
              // hides the display
              setTimeout(() => {
                plantInfoDisplay.style.display = "none";
              }, 3000);
            });

            scene.appendChild(marker);
            plantMarkers[plant.s_id] = marker;
          }
        });

        for (const id in plantMarkers) {
          if (!plants.find((p) => p.s_id === id)) {
            scene.removeChild(plantMarkers[id]);
            delete plantMarkers[id];
          }
        }
      })
      .catch((err) => console.error("CSV load error:", err));
  }

  function parseCSV(csvText) {
    const rows = csvText.split("\n").slice(1);
    return rows
      .map((row) => {
        const columns = row.split(",");
        while (columns.length < 11) columns.push("");
        return {
          s_id: columns[0]?.trim(),
          cname1: columns[1]?.trim() || "Unknown",
          cname2: columns[2]?.trim() || "",
          cname3: columns[3]?.trim() || "",
          genus: columns[4]?.trim() || "Unknown",
          species: columns[5]?.trim() || "",
          cultivar: columns[6]?.trim() || "",
          lon: parseFloat(columns[7]) || 0,
          lat: parseFloat(columns[8]) || 0,
          height: parseFloat(columns[10]) || 1,
        };
      })
      .filter((p) => p.s_id && p.lat !== 0 && p.lon !== 0);
  }

  function getAdjustedHeight(h) {
    const mapping = {
      0.5: 0,
      1: 0.1,
      1.5: 0.35,
      2: 0.55,
      2.5: 0.7,
      3: 0.9,
      4.5: 1.2,
    };
    const rounded = Math.round(h * 10) / 10;
    return mapping[rounded] || 0.4;
  }

  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function getPolyModelURL(h) {
    if (h <= 1) {
      return "./models/Shrub.glb";
    } else if (h > 1 && h <= 1.5) {
      return "./models/Bush.glb";
    } else if (h > 1.5 && h < 3) {
      return "./models/SmallTree.glb";
    } else if (h >= 3 && h <= 4.5) {
      return "./models/Tree.glb";
    } else {
      return "./models/BigTree.glb";
    }
  }


function getScaleFromHeight(h) {
  if (h <= 1) {
    return "1 1 1"; 
  } else if (h > 1 && h <= 1.5) {
    return "1.5 1.5 1.5"; 
  } else if (h > 1.5 && h < 3) {
    return "2 2 2"; 
  } else if (h >= 3 && h <= 4.5) {
    return "2.2 2.2 2.2"; 
  } else {
    return "2.4 2.4 2.4"; 
  }
}


});