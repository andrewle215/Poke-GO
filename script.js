
window.addEventListener("load", () => {
  // Set up the camera offset.
  const camera = document.querySelector("[gps-new-camera]");
  const offset = parseFloat(localStorage.getItem("calibrationOffset") || "0");
  camera.setAttribute("gps-new-camera", {
    gpsMinDistance: 3,
    rotate: true,
    rotationOffset: offset,
  });

  // Force a layout resize after a short delay.
  setTimeout(() => {
    window.dispatchEvent(new Event("resize"));
    console.log("🔁 Forced layout resize");
  }, 500);

  let userMarker = null;
  // Object to track plant markers keyed by their unique identifier.
  let plantMarkers = {};

  const scene = document.querySelector("a-scene");
  // Use the new top info container for displaying only the plant name.
  const plantInfoDisplay = document.getElementById("plant-info");

  // Throttle marker updates to avoid excessive DOM operations.
  let lastMarkerUpdate = 0;
  const updateInterval = 10000; // update markers every 10 seconds

  // Listen for GPS camera updates.
  camera.addEventListener("gps-camera-update-position", (e) => {
    const userLat = e.detail.position.latitude;
    const userLon = e.detail.position.longitude;

    // Update or create the red user marker.
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

    // Throttle plant marker updates.
    const now = Date.now();
    if (now - lastMarkerUpdate > updateInterval) {
      lastMarkerUpdate = now;
      updatePlantMarkers(userLat, userLon);
    }
  });

  // Main function to update plant markers.
  function updatePlantMarkers(userLat, userLon) {
    fetch("./ABG.csv")
      .then((response) => response.text())
      .then((csvText) => {
        // Parse CSV data and compute each plant's distance.
        const plants = parseCSV(csvText)
          .map((p) => ({
            ...p,
            distance: getDistance(userLat, userLon, p.lat, p.lon),
          }))
          .filter((p) => p.distance <= 10)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 10);

        // Create or update markers for each plant.
        plants.forEach((plant) => {
          // Calculate adjusted height for vertical positioning.
          const heightScale = getAdjustedHeight(plant.height);
          const yPos = heightScale / 2;

          if (plantMarkers[plant.s_id]) {
            // Update an existing marker's location.
            plantMarkers[plant.s_id].setAttribute(
              "gps-new-entity-place",
              `latitude: ${plant.lat}; longitude: ${plant.lon}`
            );
          } else {
            // Create an entity to hold a 3D model (GLB file).
            const marker = document.createElement("a-entity");
            marker.setAttribute("gltf-model", getPolyModelURL(plant.height));
            marker.setAttribute("scale", "2 2 2");
            marker.setAttribute("position", `0 ${yPos} 0`);
            marker.setAttribute("look-at", "[gps-new-camera]");
            marker.setAttribute(
              "gps-new-entity-place",
              `latitude: ${plant.lat}; longitude: ${plant.lon}`
            );
            marker.setAttribute("class", "clickable");

            // On marker click, display the plant's name at the top.
            marker.addEventListener("click", () => {
            plantInfoDisplay.style.display = "block";
            plantInfoDisplay.innerHTML = `
                <div style="font-size: 2em; font-weight: bold;">
                Common Name: ${plant.cname2 ? plant.cname2 + ", " : ""}${plant.cname1 || "Unknown"}
                </div>
                <div style="font-size: 1em;">
                Genus: ${plant.genus || "N/A"} &nbsp;&nbsp; Species: ${plant.species || "N/A"}
                </div>
            `;
            // Hide the display after 3 seconds.
            setTimeout(() => {
                plantInfoDisplay.style.display = "none";
            }, 3000);
            });


            scene.appendChild(marker);
            plantMarkers[plant.s_id] = marker;
          }
        });

        // Remove markers that no longer appear in the CSV data.
        for (const id in plantMarkers) {
          if (!plants.find((plant) => plant.s_id === id)) {
            scene.removeChild(plantMarkers[id]);
            delete plantMarkers[id];
          }
        }
      })
      .catch((err) => console.error("CSV load error:", err));
  }

  // --- Helper Functions ---

  // Parse CSV text into an array of plant objects.
  function parseCSV(csvText) {
    const rows = csvText.split("\n").slice(1);
    return rows
      .map((row) => {
        const columns = row.split(",");
        // Ensure there are at least 11 columns (indices 0–10).
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
          height: parseFloat(columns[10]) || 1, // Height is in index 10.
        };
      })
      .filter((p) => p.s_id && p.lat !== 0 && p.lon !== 0);
  }

  // Returns an adjusted height based on a mapping.
  function getAdjustedHeight(h) {
    const mapping = {
      0.5: 0.2,
      1: 0.3,
      1.5: 0.45,
      2: 0.6,
      2.5: 0.8,
      3: 1.1,
      4.5: 1.5,
    };
    const rounded = Math.round(h * 10) / 10;
    return mapping[rounded] || 0.4;
  }

  // Calculate the distance between two lat/lon points using the Haversine formula.
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters.
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // Returns the URL of a GLB model based on the plant's height.
  // (Ensure these files are placed in your "./models/" folder.)
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
});