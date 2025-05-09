window.addEventListener('load', () => {
  // ───── palette by species ─────
  const speciesColorMap = {};
  function getColor(sp) {
    if (!speciesColorMap[sp]) {
      // random hue each run
      speciesColorMap[sp] = `hsl(${Math.floor(Math.random()*360)},70%,60%)`;
    }
    return speciesColorMap[sp];
  }

  // ───── grab our AR.js camera ─────
  const cam = document.querySelector('[gps-new-camera]');
  if (!cam) {
    console.error('No <a-camera gps-new-camera> found');
    return;
  }

  // ───── apply one-time compass offset ─────
  const offset = parseFloat(localStorage.getItem('calibrationOffset') || '0');
  // AR.js’s gps-new-camera supports a rotationOffset property
  cam.setAttribute('gps-new-camera', 'rotationOffset', offset);

  const scene = document.querySelector('a-scene');
  const info  = document.getElementById('plant-info');
  let userBox = null;
  const plantDots = {};
  let lastFetch = 0;
  const FETCH_INTERVAL = 10_000; // 10 s throttle

  // ───── on each GPS update ─────
  cam.addEventListener('gps-camera-update-position', e => {
    const { latitude, longitude } = e.detail.position;

    // place or move the red “you are here” box
    if (!userBox) {
      userBox = document.createElement('a-box');
      userBox.setAttribute('scale', '1 1 1');
      userBox.setAttribute('material', 'color:red');
      scene.appendChild(userBox);
    }
    userBox.setAttribute('gps-entity-place',
      `latitude:${latitude};longitude:${longitude}`);

    // throttle how often we re-load the CSV
    const now = Date.now();
    if (now - lastFetch > FETCH_INTERVAL) {
      lastFetch = now;
      updatePlants(latitude, longitude);
    }
  });

  // ───── load & show the nearest 10 plants ─────
  function updatePlants(uLat, uLon) {
    fetch('ABG.csv')
      .then(r => r.text())
      .then(txt => {
        const all = parseCSV(txt);
        // compute distances, sort ascending
        const nearby = all
          .map(p => ({ ...p,
            dist: haversine(uLat, uLon, p.lat, p.lon)
          }))
          .filter(p => p.dist <= 100)    // show within 100 m
          .sort((a,b) => a.dist - b.dist)
          .slice(0, 10);

        nearby.forEach(p => {
          const c = getColor(p.species || p.genus);
          if (plantDots[p.s_id]) {
            plantDots[p.s_id].setAttribute('gps-entity-place',
              `latitude:${p.lat};longitude:${p.lon}`);
          } else {
            const dot = document.createElement('a-sphere');
            dot.setAttribute('radius', '1');
            dot.setAttribute('material', `color:${c};opacity:0.8`);
            dot.classList.add('clickable');
            dot.setAttribute('gps-entity-place',
              `latitude:${p.lat};longitude:${p.lon}`);
            dot.addEventListener('click', () => {
              info.style.display = 'block';
              info.innerHTML = `
                <strong>${p.cname2 ? p.cname2 + ', ' : ''}${p.cname1}</strong><br>
                Genus: ${p.genus}<br>
                Species: ${p.species}
              `;
              setTimeout(() => info.style.display = 'none', 3000);
            });
            scene.appendChild(dot);
            plantDots[p.s_id] = dot;
          }
        });

        // remove dots that are no longer in the nearest set
        Object.keys(plantDots).forEach(id => {
          if (!nearby.find(p => p.s_id === id)) {
            scene.removeChild(plantDots[id]);
            delete plantDots[id];
          }
        });
      })
      .catch(err => console.error('CSV load error:', err));
  }

  // ───── simple CSV → JS objects ─────
  function parseCSV(txt) {
    return txt.split('\n').slice(1).map(row => {
      const c = row.split(',');
      while (c.length < 11) c.push('');
      return {
        s_id:     c[0].trim(),
        cname1:   c[1].trim() || 'Unknown',
        cname2:   c[2].trim() || '',
        genus:    c[4].trim() || 'Unknown',
        species:  c[5].trim() || '',
        lon:      parseFloat(c[7]) || 0,
        lat:      parseFloat(c[8]) || 0
      };
    }).filter(p => p.s_id && p.lat && p.lon);
  }

  // ───── Haversine (m) ─────
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3, toRad = Math.PI/180;
    const φ1 = lat1 * toRad, φ2 = lat2 * toRad;
    const dφ = (lat2 - lat1) * toRad,
          dλ = (lon2 - lon1) * toRad;
    const a = Math.sin(dφ/2)**2
            + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
});
