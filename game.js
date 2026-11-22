const menu = document.getElementById("menu");
const gameScreen = document.getElementById("gameScreen");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const weaponSelect1 = document.getElementById("weaponSelect1");
const weaponSelect2 = document.getElementById("weaponSelect2");
const mapSelect = document.getElementById("mapSelect");
const arenaName = document.getElementById("arenaName");
const roundMessage = document.getElementById("roundMessage");

const maps = {
  grass: { name: "ЗЕЛЁНАЯ АРЕНА", sky: "#8ed5f2", ground: "#65b96b", platform: "#397e50" },
  lava:  { name: "ЛАВОВАЯ АРЕНА", sky: "#493044", ground: "#e36a36", platform: "#713b36" },
  ice:   { name: "ЛЕДЯНАЯ АРЕНА", sky: "#b8e7f4", ground: "#dff7ff", platform: "#6ba8c5" },
  sky:   { name: "НЕБЕСНАЯ АРЕНА", sky: "#8a9ff0", ground: "#d5c9f5", platform: "#7867b5" }
};

const weaponInfo = {
  sword: { name: "Меч", range: 66, damage: 18, cooldown: 420, knock: 8 },
  hammer: { name: "Молот", range: 58, damage: 28, cooldown: 780, knock: 13 },
  spear: { name: "Копьё", range: 95, damage: 15, cooldown: 560, knock: 7 },
  blaster: { name: "Бластер", range: 220, damage: 12, cooldown: 650, knock: 6 }
};

let currentMap = maps.grass;
let selectedWeapons = [weaponInfo.sword, weaponInfo.hammer];
let players = [];
let scores = [0, 0];
let keys = {};
let animationId;
let lastTime = 0;
let roundOver = false;
let projectiles = [];

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

function makePlayer(x, color, direction, id) {
  return {
    x, y: 0, vx: 0, vy: 0, color, direction, id,
    health: 100, onGround: false, attackUntil: 0,
    lastAttack: 0, invulnerableUntil: 0,
    aimX: direction, aimY: 0,
    weapon: selectedWeapons[id - 1]
  };
}

function startGame() {
  const chosen = mapSelect.value;
  const mapKeys = Object.keys(maps);
  const mapKey = chosen === "random"
    ? mapKeys[Math.floor(Math.random() * mapKeys.length)]
    : chosen;

  currentMap = maps[mapKey];
  selectedWeapons = [
    weaponInfo[weaponSelect1.value],
    weaponInfo[weaponSelect2.value]
  ];
  arenaName.textContent = currentMap.name;

  menu.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  roundMessage.classList.add("hidden");

  scores = [0, 0];
  updateScores();
  resizeCanvas();
  resetRound();
  cancelAnimationFrame(animationId);
  lastTime = 0;
  animationId = requestAnimationFrame(gameLoop);
}

function resetRound() {
  projectiles = [];
  const floor = window.innerHeight - 105;
  players = [
    makePlayer(window.innerWidth * 0.28, "#50b9ff", 1, 1),
    makePlayer(window.innerWidth * 0.72, "#ff6868", -1, 2)
  ];
  players.forEach(p => {
    p.y = floor - 48;
    p.onGround = true;
  });
  roundOver = false;
}

function updateScores() {
  document.getElementById("score1").textContent = scores[0];
  document.getElementById("score2").textContent = scores[1];
}

function gameLoop(time) {
  if (!gameScreen.classList.contains("hidden")) {
    const dt = Math.min((time - (lastTime || time)) / 16.67, 2);
    lastTime = time;
    update(dt, time);
    draw(time);
    animationId = requestAnimationFrame(gameLoop);
  }
}

function getInput(player) {
  const id = player.id === 1 ? "joy1" : "joy2";
  return {
    move: joystickValues[id] || 0,
    jump: player.id === 1 ? keys["w"] || keys["W"] : keys["ArrowUp"],
    attack: attackQueued[id] || (player.id === 1 ? buttons.attack1 || keys[" "] : buttons.attack2 || keys["Enter"]),
    aimX: joystickAim[id].x,
    aimY: joystickAim[id].y
  };
}

function update(dt, time) {
  if (roundOver) return;

  const floor = window.innerHeight - 105;

  players.forEach((p, index) => {
    const input = getInput(p);
    const hold = joystickHold[p.id === 1 ? "joy1" : "joy2"];
    // После секунды удержания вверх разрешаем ровно один прыжок за касание.
    if (hold.since !== null && !hold.triggered && time - hold.since >= 1000) {
      hold.triggered = true;
    }
    const opponent = players[1 - index];

    p.vx += input.move * 0.75 * dt;
    p.vx *= Math.pow(0.82, dt);
    p.vx = Math.max(-5.5, Math.min(5.5, p.vx));

    // Направление прицеливания сохраняется после отпускания джойстика.
    // Это важно: выстрел производится в последнем выбранном направлении.
    if (Math.hypot(input.aimX, input.aimY) > 0.18) {
      p.aimX = input.aimX;
      p.aimY = input.aimY;
    }

    if ((input.jump || (hold.triggered && !hold.jumped)) && p.onGround) {
      p.vy = -12;
      p.onGround = false;
      if (hold.triggered) hold.jumped = true;
    }

    p.vy += 0.58 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.x = Math.max(25, Math.min(window.innerWidth - 25, p.x));

    if (p.y >= floor - 48) {
      p.y = floor - 48;
      p.vy = 0;
      p.onGround = true;
    }

    p.direction = opponent.x >= p.x ? 1 : -1;

    if (input.attack && time - p.lastAttack > p.weapon.cooldown) {
      p.lastAttack = time;
      p.attackUntil = time + 170;
      const len = Math.hypot(p.aimX, p.aimY) || 1;
      const ax = p.aimX / len, ay = p.aimY / len;
      if (p.weapon.name === "Бластер") {
        // Снаряд появляется у дула оружия и летит по полному вектору прицеливания.
        const handX = Math.cos(Math.atan2(p.aimY, p.aimX)) * 27;
        const handY = -34 + Math.sin(Math.atan2(p.aimY, p.aimX)) * 27;
        projectiles.push({
          x: p.x + handX + ax * 38,
          y: p.y + handY + ay * 38,
          vx: ax * 11,
          vy: ay * 11,
          owner: p.id,
          damage: p.weapon.damage,
          knock: p.weapon.knock,
          life: 90
        });
      } else {
        const dx = opponent.x - p.x, dy = opponent.y - p.y;
        const along = dx * ax + dy * ay;
        const side = Math.abs(dx * ay - dy * ax);
        if (along > 0 && along < p.weapon.range && side < 48 &&
            time > opponent.invulnerableUntil) {
          opponent.health -= p.weapon.damage;
          opponent.vx += ax * p.weapon.knock;
          opponent.vy += ay * p.weapon.knock * 0.35 - 2;
          opponent.invulnerableUntil = time + 280;
        }
      }
    }
    attackQueued[p.id === 1 ? "joy1" : "joy2"] = false;
  });

  projectiles = projectiles.filter(shot => {
    shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
    const target = players.find(pl => pl.id !== shot.owner);
    if (target && Math.hypot(target.x - shot.x, target.y - 28 - shot.y) < 24 &&
        time > target.invulnerableUntil) {
      target.health -= shot.damage; target.vx += Math.sign(shot.vx) * shot.knock;
      target.vy -= 2.5; target.invulnerableUntil = time + 280;
      return false;
    }
    return shot.life > 0 && shot.x > -30 && shot.x < window.innerWidth + 30 &&
      shot.y > -30 && shot.y < window.innerHeight + 30;
  });

  // Простое отталкивание персонажей друг от друга
  const [a, b] = players;
  if (Math.abs(a.x - b.x) < 38 && Math.abs(a.y - b.y) < 48) {
    const push = a.x < b.x ? -1 : 1;
    a.x += push * 1.5;
    b.x -= push * 1.5;
  }

  players.forEach((p, index) => {
    if (p.health <= 0) {
      scores[1 - index]++;
      updateScores();
      roundOver = true;
      roundMessage.textContent = `ИГРОК ${2 - index} ПОБЕДИЛ!`;
      roundMessage.classList.remove("hidden");
      setTimeout(() => {
        if (!gameScreen.classList.contains("hidden")) {
          roundMessage.classList.add("hidden");
          resetRound();
        }
      }, 1500);
    }
  });
}

function draw(time) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const floor = h - 105;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = currentMap.sky;
  ctx.fillRect(0, 0, w, h);

  // Декоративные облака
  ctx.fillStyle = "#ffffff55";
  for (let i = 0; i < 5; i++) {
    const x = (i * 237 + 60) % (w + 100);
    const y = 65 + (i % 2) * 45;
    ctx.beginPath();
    ctx.arc(x, y, 19, 0, Math.PI * 2);
    ctx.arc(x + 22, y - 8, 24, 0, Math.PI * 2);
    ctx.arc(x + 47, y, 17, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = currentMap.platform;
  ctx.fillRect(0, floor, w, 18);
  ctx.fillStyle = currentMap.ground;
  ctx.fillRect(0, floor + 18, w, h - floor);

  // Индикаторы здоровья
  players.forEach((p, i) => {
    const barW = Math.min(150, w * 0.22);
    const x = i === 0 ? 16 : w - barW - 16;
    ctx.fillStyle = "#18243a99";
    ctx.fillRect(x, 43, barW, 9);
    ctx.fillStyle = p.color;
    ctx.fillRect(x, 43, barW * Math.max(0, p.health) / 100, 9);
  });

  players.forEach(p => drawStickman(p, time));
  projectiles.forEach(shot => {
    ctx.save(); ctx.translate(shot.x, shot.y);
    ctx.rotate(Math.atan2(shot.vy, shot.vx));
    ctx.fillStyle = "#ffe36e"; ctx.shadowColor = "#ffb52e"; ctx.shadowBlur = 12;
    ctx.fillRect(-10, -4, 20, 8); ctx.restore();
  });
}

function drawStickman(p, time) {
  const x = p.x;
  const y = p.y;
  const dir = p.direction;
  const attacking = time < p.attackUntil;

  ctx.save();
  ctx.translate(x, y);

  // Ноги
  ctx.strokeStyle = "#172333";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  const step = Math.sin(time / 90 + p.id) * Math.min(7, Math.abs(p.vx) * 1.5);
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(-9 + step, 0);
  ctx.moveTo(0, -13);
  ctx.lineTo(10 - step, 0);
  ctx.stroke();

  // Тело
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, -42);
  ctx.lineTo(0, -14);
  ctx.stroke();

  // Рука постоянно держит оружие и поворачивается вслед за джойстиком
  const aimAngle = Math.atan2(p.aimY, p.aimX);
  const handX = Math.cos(aimAngle) * 27;
  const handY = -34 + Math.sin(aimAngle) * 27;
  ctx.strokeStyle = "#172333"; ctx.lineWidth = 6; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(-dir * 13, -25);
  ctx.moveTo(0, -36); ctx.lineTo(handX, handY); ctx.stroke();
  ctx.save(); ctx.translate(handX, handY); ctx.rotate(aimAngle);
  ctx.lineCap = "round";
  if (p.weapon.name === "Бластер") {
    ctx.fillStyle = "#33465f"; ctx.strokeStyle = "#172333"; ctx.lineWidth = 2;
    ctx.fillRect(0, -6, 34, 12); ctx.strokeRect(0, -6, 34, 12);
    ctx.fillStyle = "#ffe36e"; ctx.fillRect(25, -3, 12, 6);
    ctx.fillStyle = "#8bdcff"; ctx.fillRect(8, -9, 10, 3);
  } else if (p.weapon.name === "Меч") {
    ctx.strokeStyle = "#dce8f5"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(38, 0); ctx.stroke();
    ctx.strokeStyle = "#b98545"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(4, 7); ctx.stroke();
  } else if (p.weapon.name === "Молот") {
    ctx.strokeStyle = "#9a6a3c"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(30, 0); ctx.stroke();
    ctx.fillStyle = "#9eabb9"; ctx.fillRect(25, -10, 14, 20);
  } else {
    ctx.strokeStyle = "#dce8f5"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(46, 0); ctx.stroke();
    ctx.fillStyle = "#c5d4e5"; ctx.beginPath();
    ctx.moveTo(48, 0); ctx.lineTo(38, -6); ctx.lineTo(38, 6); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // Голова
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(0, -54, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#172333";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Условное изображение оружия во время удара
  if (attacking) {
    ctx.save();
    ctx.translate(dir * 30, -29);
    ctx.rotate(dir * -0.25);
    ctx.strokeStyle = p.weapon.name === "Бластер" ? "#ffe36e" : "#dce8f5";
    ctx.lineWidth = p.weapon.name === "Молот" ? 9 : 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dir * (p.weapon.name === "Копьё" ? 48 : 34), -5);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// Управление джойстиками: каждый работает независимо
const joystickValues = { joy1: 0, joy2: 0 };
const joystickAim = { joy1: { x: 1, y: 0 }, joy2: { x: -1, y: 0 } };
const joystickHold = {
  joy1: { since: null, triggered: false, jumped: false },
  joy2: { since: null, triggered: false, jumped: false }
};
const attackQueued = { joy1: false, joy2: false };
const buttons = { attack1: false, attack2: false };

function setupJoystick(id) {
  const zone = document.getElementById(id);
  const stick = zone.querySelector(".stick");
  let pointerId = null;
  const hold = joystickHold[id];
  function move(event) {
    if (event.pointerId !== pointerId) return;
    const rect = zone.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const max = rect.width * 0.32;
    const valueX = Math.max(-1, Math.min(1, dx / max));
    const valueY = Math.max(-1, Math.min(1, dy / max));
    joystickValues[id] = valueX;
    joystickAim[id] = { x: valueX, y: valueY };
    if (valueY < -0.70 && Math.abs(valueX) < 0.50) {
      if (hold.since === null) {
        hold.since = performance.now();
        hold.triggered = false;
        hold.jumped = false;
      }
    } else {
      hold.since = null;
      hold.triggered = false;
      hold.jumped = false;
    }
    stick.style.transform = `translate(calc(-50% + ${valueX * max}px), calc(-50% + ${valueY * max}px))`;
  }
  zone.addEventListener("pointerdown", event => {
    event.preventDefault(); if (pointerId !== null) return;
    pointerId = event.pointerId;
    hold.since = null;
    hold.triggered = false;
    hold.jumped = false;
    zone.setPointerCapture(pointerId);
    move(event);
  });
  zone.addEventListener("pointermove", move);
  function stop(event) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    joystickValues[id] = 0;
    // Не сбрасываем joystickAim: атака после отпускания должна идти туда,
    // куда игрок только что направил джойстик.
    hold.since = null;
    hold.triggered = false;
    hold.jumped = false;
    attackQueued[id] = true;
    stick.style.transform = "translate(-50%, -50%)";
  }
  zone.addEventListener("pointerup", stop);
  zone.addEventListener("pointercancel", stop);
}

function setupButton(id) {
  const button = document.getElementById(id);
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    buttons[id] = true;
    button.classList.add("pressed");
    button.setPointerCapture(event.pointerId);
  });
  const stop = () => {
    buttons[id] = false;
    button.classList.remove("pressed");
  };
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);
}

setupJoystick("joy1");
setupJoystick("joy2");
Object.keys(buttons).forEach(setupButton);

window.addEventListener("keydown", event => {
  keys[event.key] = true;
  if ([" ", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
});
window.addEventListener("keyup", event => keys[event.key] = false);

document.getElementById("startButton").addEventListener("click", startGame);
document.getElementById("backButton").addEventListener("click", () => {
  cancelAnimationFrame(animationId);
  gameScreen.classList.add("hidden");
  menu.classList.remove("hidden");
});

// Запрет контекстного меню при долгом касании на телефоне
document.addEventListener("contextmenu", event => event.preventDefault());
