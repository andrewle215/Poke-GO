window.onload = () => {
  let userMarker = null;
  let blueMarkers = [];

  const scene = document.querySelector('a-scene');
  const camera = document.querySelector('[gps-new-camera]');
  const userLocation = document.getElementById('user-location');
  const headingDisplay = document.getElementById('heading');
  const plantList = document.getElementById('plant-list');
  const selectedPlantInfo = document.getElementById('selected-plant-info');
  const debugInfo = document.getElementById('debug-info');

  const offset = parseFloat(localStorage.getItem('calibrationOffset') || '0');
  debugInfo.textContent = `Offset loaded: ${offset}°`;

  // 🎯 Heading + Pitch Tracker
  scene.addEventListener('loaded', () => {
    scene.addEventListener('frame', () => {
      const rotation = camera.getAttribute('rotation');
      headingDisplay.textContent = `Heading: ${Math.round(rotation.y)}°, Pitch: ${Math.round(rotation.x)}°`;
    });
  });

  // 📍 Main update logic on GPS update
  camera.addEventListener("gps-camera-update-position", (e) => {
    const userLat = e.detail.position.latitude;
    const userLon = e.detail.position.longitude;

    userLocation.textContent = `Lat: ${userLat}, Lon: ${userLon}`;

    // 🔴 Red marker
    if (!userMarker) {
      userMarker = document.createElement("a-box");
      userMarker.setAttribute("scale", "1 1 1");
      userMarker.setAttribute("material", "color: red");
      scene.appendChild(userMarker);
    }
    userMarker.setAttribute("gps-new-entity-place", `latitude: ${userLat}; longitude: ${userLon}`);

    // 🔁 Remove old blue markers
    blueMarkers.forEach(marker => scene.removeChild(marker));
    blueMarkers = [];

    // 📦 Load plant data
    fetch("./ABG.csv")
      .then(response => response.text())
      .then(csvText => {
        const plants = parseCSV(csvText)
          .map(p => ({
            ...p,
            distance: getDistance(userLat, userLon, p.lat, p.lon)
          }))
          .filter(p => p.distance <= 10)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 10);

        plantList.innerHTML = "";

        plants.forEach(plant => {

          const heightScale = getAdjustedHeight(plant.height);
          const yPos = heightScale / 2;

         const marker = document.createElement("a-image");
        marker.setAttribute("src", getEmojiImageURL(plant.cname1));
        marker.setAttribute("scale", "2 2 2");
        marker.setAttribute("position", `0 ${yPos} 0`);
        marker.setAttribute("material", "transparent: true");
        marker.setAttribute("look-at", "[gps-new-camera]");





          
          marker.setAttribute("gps-new-entity-place", `latitude: ${plant.lat}; longitude: ${plant.lon}`);
          marker.setAttribute("class", "clickable");

          marker.addEventListener("click", () => {
            selectedPlantInfo.innerHTML = `
              🌱 <strong>${plant.cname1 || "Unknown"}</strong><br>
              Genus: ${plant.genus || "N/A"}<br>
              Species: ${plant.species || "N/A"}<br>
              Distance: ${plant.distance.toFixed(1)} meters<br>
              Height: ${plant.height || "N/A"}
            `;
          });

          scene.appendChild(marker);
          blueMarkers.push(marker);

          const listItem = document.createElement("li");
          listItem.innerText = `Height ${plant.height}, ${plant.cname1 || "N/A"} - Genus: ${plant.genus}, Species: ${plant.species} (${plant.distance.toFixed(1)}m)`;
          plantList.appendChild(listItem);
        });
      })
      .catch(err => console.error("CSV load error:", err));
  });
};

// --- Helpers ---
function parseCSV(csvText) {
  const rows = csvText.split("\n").slice(1);
  return rows.map(row => {
    const columns = row.split(",");
    while (columns.length < 10) columns.push("");
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
      height: parseFloat(columns[9]) || 1
    };
  }).filter(p => p.s_id && p.lat !== 0 && p.lon !== 0);
}

function getAdjustedHeight(h) {
  const mapping = {
    0.5: 0.2,
    1: 0.3,
    1.5: 0.45,
    2: 0.6,
    2.5: 0.8,
    3: 1.1,
    4.5: 1.5
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

  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}


function getEmojiImageURL(cname1) {
  const lower = cname1.toLowerCase();
  if (lower.includes("oak") || lower.includes("maple") || lower.includes("elm") || lower.includes("birch")) {
    return "./sprites/1f333.png"; // 🌳
  } else if (lower.includes("fern")) {
    return "./sprites/1f33f.png"; // 🌿
  } else if (lower.includes("grass") || lower.includes("reed")) {
    return "./sprites/1f33e.png"; // 🌾
  } else if (lower.includes("flower") || lower.includes("rose") || lower.includes("daisy")) {
    return "./sprites/1f338.png"; // 🌸
  } else if (lower.includes("shrub") || lower.includes("bush") || lower.includes("holly") || lower.includes("boxwood")) {
    return "./sprites/1f331.png"; // 🌱
  } else if (lower.includes("cactus") || lower.includes("succulent")) {
    return "./sprites/1f335.png"; // 🌵
  } else {
    return "./sprites/1fab4.png"; // 🪴 (default potted plant)
  }
}