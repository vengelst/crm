(function() {
  const canvas = document.getElementById('particle-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 18;

  const NODE_COUNT = 90;
  const nodes = [];
  const connectionPairs = [];
  const packetObjects = [];
  const group = new THREE.Group();
  scene.add(group);

  function randomNode() {
    return new THREE.Vector3(
      (Math.random() - 0.5) * 26,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 8
    );
  }

  for (let i = 0; i < NODE_COUNT; i++) nodes.push(randomNode());

  const pointsGeometry = new THREE.BufferGeometry().setFromPoints(nodes);
  const pointsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.09,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true
  });
  const points = new THREE.Points(pointsGeometry, pointsMaterial);
  group.add(points);

  for (let i = 0; i < nodes.length; i++) {
    const distances = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      distances.push({ j, d: nodes[i].distanceTo(nodes[j]) });
    }
    distances.sort((a, b) => a.d - b.d);
    for (const item of distances.slice(0, 3)) {
      const a = Math.min(i, item.j);
      const b = Math.max(i, item.j);
      const key = `${a}-${b}`;
      if (!connectionPairs.find(p => p.key === key) && item.d < 5.2) {
        connectionPairs.push({ key, a, b, distance: item.d });
      }
    }
  }

  const linePositions = [];
  for (const pair of connectionPairs) {
    const na = nodes[pair.a], nb = nodes[pair.b];
    linePositions.push(na.x, na.y, na.z, nb.x, nb.y, nb.z);
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16
  });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  group.add(lines);

  const packetGeometry = new THREE.SphereGeometry(0.055, 10, 10);
  const packetMaterial = new THREE.MeshBasicMaterial({ color: 0xc8a96e });

  function spawnPacket() {
    const pair = connectionPairs[Math.floor(Math.random() * connectionPairs.length)];
    if (!pair) return;
    const start = nodes[pair.a];
    const end = nodes[pair.b];
    const mesh = new THREE.Mesh(packetGeometry, packetMaterial.clone());
    mesh.material.transparent = true;
    mesh.material.opacity = 1;
    group.add(mesh);
    packetObjects.push({
      mesh,
      start,
      end,
      progress: Math.random() * 0.15,
      speed: 0.004 + Math.random() * 0.008
    });
  }

  for (let i = 0; i < 24; i++) spawnPacket();

  let mouseX = 0, mouseY = 0, time = 0;
  document.addEventListener('mousemove', e => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 0.9;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 0.45;
  });

  function animate() {
    requestAnimationFrame(animate);
    time += 0.0035;

    group.rotation.y += (mouseX - group.rotation.y) * 0.03;
    group.rotation.x += ((-mouseY) - group.rotation.x) * 0.03;

    points.material.opacity = 0.78 + Math.sin(time * 2.2) * 0.06;

    for (const packet of packetObjects) {
      packet.progress += packet.speed;
      if (packet.progress >= 1) {
        const pair = connectionPairs[Math.floor(Math.random() * connectionPairs.length)];
        packet.start = nodes[pair.a];
        packet.end = nodes[pair.b];
        packet.progress = 0;
        packet.speed = 0.004 + Math.random() * 0.008;
      }
      packet.mesh.position.lerpVectors(packet.start, packet.end, packet.progress);
      packet.mesh.material.opacity = 0.55 + Math.sin(packet.progress * Math.PI) * 0.45;
      const s = 0.8 + Math.sin(packet.progress * Math.PI) * 1.35;
      packet.mesh.scale.setScalar(s);
    }

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();
