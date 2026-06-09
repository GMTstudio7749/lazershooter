// --- 1. KHỞI TẠO CANVAS ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- 2. QUẢN LÝ TRẠNG THÁI TRÒ CHƠI & ĐỘ KHÓ TRẬN ĐẤU ---
let gameState = 'PLAYING'; // 'PLAYING', 'GAMEOVER', 'VICTORY'
let currentLevel = 1;
let levelTimer = 0;
const LEVEL_DURATION = 1500; // 25 giây mỗi level (ở mức 60 khung hình/giây)

// --- 3. CẤU HÌNH NHÂN VẬT CHÍNH (PLAYER) ---
let player = {
    x: window.innerWidth / 2 - 25,
    y: window.innerHeight / 2 - 25,
    width: 50,
    height: 50,
    vx: 0,
    vy: 0,
    acceleration: 0.6,
    friction: 0.90,
    maxSpeed: 6.5,
    hp: 100,
    maxHp: 100,
    color: '#3498db',
    skillCooldown: 0,
    maxSkillCooldown: 200
};

const keysPressed = {
    w: false, a: false, s: false, d: false,
    arrowup: false, arrowdown: false, arrowleft: false, arrowright: false,
    ' ': false, r: false
};

// Cấu hình hoạt họa Laser Rung Động
const mouse = { x: 0, y: 0, isDown: false };
let laser = {
    currentLength: 0,
    maxLength: 2500,
    growSpeed: 150,
    currentWidth: 0,
    maxWidth: 7,
    widthGrowSpeed: 0.9,
    widthShrinkSpeed: 0.6,
    recoilForce: 0.22,
    isActive: false
};

// Các mảng đối tượng
let zombies = [];
let enemyProjectiles = []; // Chứa đạn của Skeleton bắn ra
let particles = [];
let shockwaves = [];
let zombieSpawnTimer = 0;

// Đăng ký sự kiện điều khiển nhập liệu
window.addEventListener('keydown', (e) => {
    let key = e.key.toLowerCase();
    if (key in keysPressed) keysPressed[key] = true;
    
    // Nút R dùng để reset game khi thắng hoặc thua
    if (key === 'r' && gameState !== 'PLAYING') {
        resetGame();
    }
});
window.addEventListener('keyup', (e) => {
    let key = e.key.toLowerCase();
    if (key in keysPressed) keysPressed[key] = false;
});
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});
window.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.isDown = true;
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.isDown = false;
});

// --- 4. HÀM KHỞI ĐỘNG LẠI GAME (RESET GAME) ---
function resetGame() {
    gameState = 'PLAYING';
    currentLevel = 1;
    levelTimer = 0;
    player.hp = player.maxHp;
    player.x = window.innerWidth / 2 - 25;
    player.y = window.innerHeight / 2 - 25;
    player.vx = 0;
    player.vy = 0;
    player.skillCooldown = 0;
    zombies = [];
    enemyProjectiles = [];
    particles = [];
    shockwaves = [];
    zombieSpawnTimer = 0;
}

// --- 5. HỆ THỐNG HIỆU ỨNG HẠT (PARTICLES) ---
function createExplosion(x, y, baseColorObj) {
    let count = 35;
    for (let i = 0; i < count; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = 1.5 + Math.random() * 6;
        particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 2 + Math.random() * 4,
            alpha: 1,
            decay: 0.015 + Math.random() * 0.015,
            color: Math.random() > 0.45 ? `rgb(${baseColorObj.r}, ${baseColorObj.g}, ${baseColorObj.b})` : '#ff7700'
        });
    }
}

function createSparks(x, y, angle) {
    for (let i = 0; i < 2; i++) {
        let sparkAngle = angle + Math.PI + (Math.random() * 1.0 - 0.5);
        let speed = 2 + Math.random() * 4;
        particles.push({
            x: x, y: y,
            vx: Math.cos(sparkAngle) * speed,
            vy: Math.sin(sparkAngle) * speed,
            radius: 1.5 + Math.random() * 2,
            alpha: 1,
            decay: 0.04 + Math.random() * 0.04,
            color: Math.random() > 0.3 ? '#ffffff' : '#ff3300'
        });
    }
}

// --- 6. RAYCASTING KIỂM TRA VA CHẠM LASER ---
function getLaserImpact(startX, startY, angle, maxRange) {
    let closestDistance = maxRange;
    let hitZombie = null;
    let cos = Math.cos(angle);
    let sin = Math.sin(angle);

    for (let i = 0; i < zombies.length; i++) {
        let z = zombies[i];
        let vx = z.x - startX;
        let vy = z.y - startY;
        let dProj = vx * cos + vy * sin;
        if (dProj < 0) continue;

        let dPerpSq = (vx * vx + vy * vy) - (dProj * dProj);
        let rSq = z.radius * z.radius;
        if (dPerpSq > rSq) continue;

        let dHit = dProj - Math.sqrt(rSq - dPerpSq);
        if (dHit >= 0 && dHit < closestDistance) {
            closestDistance = dHit;
            hitZombie = z;
        }
    }
    return { distance: closestDistance, zombie: hitZombie };
}

// --- 7. VẼ TIA LASER RUNG ĐỘNG PLASMA (UPPER LAYER) ---
function drawLaser(offsetX, offsetY) {
    if (!laser.isActive) return;

    let startX = player.x + player.width / 2 + offsetX;
    let startY = player.y + player.height / 2 + offsetY;
    let dx = mouse.x - startX;
    let dy = mouse.y - startY;
    let angle = Math.atan2(dy, dx);

    let impact = getLaserImpact(startX, startY, angle, laser.currentLength);
    let actualLength = impact.distance; 

    let endX = startX + Math.cos(angle) * actualLength;
    let endY = startY + Math.sin(angle) * actualLength;

    if (impact.zombie && laser.currentWidth > 2) {
        impact.zombie.isBeingCooked = true;
        impact.zombie.hp -= 1.4; // Sát thương sấy laser
        createSparks(endX, endY, angle);
    }

    // TẠO ĐỘ RUNG NHẸ NGAU NHIÊN CHO TIA LASER THÊM CHÂN THỰC
    let jitterWidth = laser.currentWidth * (0.85 + Math.random() * 0.3);
    let jitterBlur = 12 + Math.random() * 10;

    ctx.save();
    ctx.shadowBlur = jitterBlur;
    ctx.shadowColor = '#ff1111';
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = jitterWidth;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = jitterWidth * 0.35;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
}

// --- 8. VÒNG LẶP CHÍNH CỦA GAME (GAME LOOP) ---
function gameLoop() {
    // Nếu trạng thái là màn hình kết thúc, ngưng xử lý cốt lõi, chỉ vẽ màn hình tĩnh
    if (gameState !== 'PLAYING') {
        drawScreenOverlay();
        requestAnimationFrame(gameLoop);
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Tiến trình Level & Đếm thời gian thăng cấp
    levelTimer++;
    if (levelTimer >= LEVEL_DURATION) {
        if (currentLevel < 3) {
            currentLevel++;
            levelTimer = 0; // Reset thanh thời gian của level mới
        } else {
            gameState = 'VICTORY'; // Vượt qua màn 3 thành công -> VICTORY!
        }
    }

    if (player.skillCooldown > 0) player.skillCooldown--;

    // --- A. DI CHUYỂN NHÂN VẬT PLAYER ---
    if (keysPressed['w'] || keysPressed['arrowup'])    player.vy -= player.acceleration;
    if (keysPressed['s'] || keysPressed['arrowdown'])  player.vy += player.acceleration;
    if (keysPressed['a'] || keysPressed['arrowleft'])  player.vx -= player.acceleration;
    if (keysPressed['d'] || keysPressed['arrowright']) player.vx += player.acceleration;

    player.vx *= player.friction;
    player.vy *= player.friction;

    // Kích hoạt Sóng Xung Kích [SPACEBAR]
    if (keysPressed[' '] && player.skillCooldown === 0) {
        shockwaves.push({
            x: player.x + player.width / 2, y: player.y + player.height / 2,
            radius: 10, maxRadius: 230, speed: 7.5, force: 15
        });
        player.skillCooldown = player.maxSkillCooldown;
    }

    // Phóng to thu nhỏ laser bằng chuột
    if (mouse.isDown) {
        laser.isActive = true;
        if (laser.currentLength < laser.maxLength) laser.currentLength += laser.growSpeed;
        if (laser.currentWidth < laser.maxWidth) laser.currentWidth += laser.widthGrowSpeed;

        let pAngle = Math.atan2(mouse.y - (player.y + player.height/2), mouse.x - (player.x + player.width/2));
        player.vx -= Math.cos(pAngle) * laser.recoilForce;
        player.vy -= Math.sin(pAngle) * laser.recoilForce;
    } else {
        if (laser.currentWidth > 0) {
            laser.currentWidth -= laser.widthShrinkSpeed;
        } else {
            laser.currentLength = 0;
            laser.isActive = false;
        }
    }

    // Giới hạn vận tốc
    if (player.vx > player.maxSpeed) player.vx = player.maxSpeed;
    if (player.vx < -player.maxSpeed) player.vx = -player.maxSpeed;
    if (player.vy > player.maxSpeed) player.vy = player.maxSpeed;
    if (player.vy < -player.maxSpeed) player.vy = -player.maxSpeed;

    player.x += player.vx; player.y += player.vy;

    // Giữ chân nhân vật trong map
    if (player.x < 0) { player.x = 0; player.vx = 0; }
    if (player.y < 0) { player.y = 0; player.vy = 0; }
    if (player.x > canvas.width - player.width) { player.x = canvas.width - player.width; player.vx = 0; }
    if (player.y > canvas.height - player.height) { player.y = canvas.height - player.height; player.vy = 0; }

    // --- B. CẬP NHẬT SKILL SÓNG XUNG KÍCH ---
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        let sw = shockwaves[i];
        sw.radius += sw.speed;

        let alpha = 1 - (sw.radius / sw.maxRadius);
        ctx.save();
        ctx.strokeStyle = `rgba(52, 152, 219, ${alpha})`;
        ctx.lineWidth = 5;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#3498db';
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        for (let j = 0; j < zombies.length; j++) {
            let z = zombies[j];
            let sdx = z.x - sw.x; let sdy = z.y - sw.y;
            let sDist = Math.sqrt(sdx * sdx + sdy * sdy);
            if (sDist < sw.radius && sDist > sw.radius - 35) {
                z.hp -= 30;
                z.heat += 0.4;
                let pushAngle = Math.atan2(sdy, sdx);
                z.x += Math.cos(pushAngle) * sw.force;
                z.y += Math.sin(pushAngle) * sw.force;
            }
        }
        if (sw.radius >= sw.maxRadius) shockwaves.splice(i, 1);
    }

    // --- C. ĐIỀU ĐỘ SPAWN ZOMBIE (TỰ ĐỘNG TĂNG HARDNESS THEO LEVEL) ---
    zombieSpawnTimer++;
    let dynamicSpawnInterval = Math.max(30, 90 - (currentLevel * 25)); 
    if (zombieSpawnTimer >= dynamicSpawnInterval) {
        zombieSpawnTimer = 0;
        
        let randType = Math.random();
        let r, speed, maxHp, baseColor, type = 'normal';

        if (currentLevel >= 2 && randType < 0.22) {
            type = 'skeleton'; r = 18; speed = 0.9; maxHp = 70;
            baseColor = { r: 189, g: 195, b: 199 }; 
        } else if (randType < 0.50) {
            type = 'normal'; r = 21; speed = 1.0 + (currentLevel * 0.15); maxHp = 90;
            baseColor = { r: 46, g: 204, b: 113 };
        } else if (randType < 0.80) {
            type = 'runner'; r = 15; speed = 1.8 + (currentLevel * 0.15); maxHp = 40;
            baseColor = { r: 241, g: 196, b: 15 };
        } else {
            type = 'tanker'; r = 29; speed = 0.5 + (currentLevel * 0.1); maxHp = 240;
            baseColor = { r: 142, g: 68, b: 173 };
        }

        let zx, zy;
        let edge = Math.floor(Math.random() * 4);
        if (edge === 0) { zx = Math.random() * canvas.width; zy = -r; }
        else if (edge === 1) { zx = canvas.width + r; zy = Math.random() * canvas.height; }
        else if (edge === 2) { zx = Math.random() * canvas.width; zy = canvas.height + r; }
        else { zx = -r; zy = Math.random() * canvas.height; }

        zombies.push({
            x: zx, y: zy, vx: 0, vy: 0, radius: r, maxSpeed: speed,
            maxHp: maxHp, hp: maxHp, baseColor: baseColor, type: type,
            heat: 0, isBeingCooked: false, shootCooldown: Math.floor(60 + Math.random() * 80)
        });
    }

    // --- D. THUẬT TOÁN BẦY ĐÀN BOIDS CHO ZOMBIE CORDE ---
    let targetX = player.x + player.width / 2;
    let targetY = player.y + player.height / 2;

    for (let i = 0; i < zombies.length; i++) {
        let z = zombies[i];

        let sepX = 0, sepY = 0;
        let aliX = 0, aliY = 0;
        let cohX = 0, cohY = 0;
        let neighbors = 0;

        let seekX = targetX - z.x;
        let seekY = targetY - z.y;
        let seekDist = Math.sqrt(seekX * seekX + seekY * seekY);
        if (seekDist > 0) { seekX /= seekDist; seekY /= seekDist; }

        for (let j = 0; j < zombies.length; j++) {
            if (i === j) continue;
            let z2 = zombies[j];
            let dx = z2.x - z.x;
            let dy = z2.y - z.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 90) {
                neighbors++;
                if (dist < z.radius + z2.radius + 12) {
                    sepX -= dx / (dist || 1);
                    sepY -= dy / (dist || 1);
                }
                aliX += z2.vx;
                aliY += z2.vy;
                cohX += z2.x;
                cohY += z2.y;
            }
        }

        if (neighbors > 0) {
            aliX /= neighbors; aliY /= neighbors;
            cohX /= neighbors; cohY /= neighbors;
            cohX = cohX - z.x; cohY = cohY - z.y;
            let cohLen = Math.sqrt(cohX * cohX + cohY * cohY);
            if (cohLen > 0) { cohX /= cohLen; cohY /= cohLen; }
        }

        if (z.type === 'skeleton' && seekDist < 250) {
            seekX *= -0.7;
            seekY *= -0.7;
        }

        // --- ĐÃ VÁ LỖI CÚ PHÁP TẠI ĐÂY ---
        z.vx += seekX * 0.35 + sepX * 0.55 + aliX * 0.08 + cohX * 0.05;
        z.vy += seekY * 0.35 + sepY * 0.55 + aliY * 0.08 + cohX * 0.05;

        let totalSpeed = Math.sqrt(z.vx * z.vx + z.vy * z.vy);
        if (totalSpeed > z.maxSpeed) {
            z.vx = (z.vx / totalSpeed) * z.maxSpeed;
            z.vy = (z.vy / totalSpeed) * z.maxSpeed;
        }

        z.x += z.vx;
        z.y += z.vy;

        // --- HÀNH VI BẮN TIẢ CỦA SKELETON ---
        if (z.type === 'skeleton') {
            z.shootCooldown--;
            if (z.shootCooldown <= 0) {
                z.shootCooldown = 110 + Math.random() * 60;
                let projAngle = Math.atan2(targetY - z.y, targetX - z.x);
                enemyProjectiles.push({
                    x: z.x, y: z.y,
                    vx: Math.cos(projAngle) * 4.2,
                    vy: Math.sin(projAngle) * 4.2,
                    radius: 5,
                    color: '#e67e22'
                });
            }
        }

        let closeX = Math.max(player.x, Math.min(z.x, player.x + player.width));
        let closeY = Math.max(player.y, Math.min(z.y, player.y + player.height));
        let pcdx = z.x - closeX; let pcdy = z.y - closeY;
        if (Math.sqrt(pcdx * pcdx + pcdy * pcdy) < z.radius) {
            player.hp -= 0.18; 
            if (player.hp <= 0) gameState = 'GAMEOVER';
        }

        if (z.isBeingCooked) z.heat += 0.025;
        else { z.heat -= 0.008; if (z.heat < 0) z.heat = 0; }
        z.isBeingCooked = false;

        if (z.hp <= 0 || z.heat >= 1) {
            createExplosion(z.x, z.y, z.baseColor);
            zombies.splice(i, 1);
            i--;
            continue;
        }

        let rColor = Math.floor(z.baseColor.r + (255 - z.baseColor.r) * z.heat);
        let gColor = Math.floor(z.baseColor.g + (35 - z.baseColor.g) * z.heat);
        let bColor = Math.floor(z.baseColor.b + (0 - z.baseColor.b) * z.heat);

        ctx.fillStyle = `rgb(${rColor}, ${gColor}, ${bColor})`;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        let barW = z.radius * 1.5; let barH = 3.5;
        let barX = z.x - barW / 2; let barY = z.y - z.radius - 7;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(barX, barY, barW, barH);
        let hpRatio = Math.max(0, z.hp / z.maxHp);
        ctx.fillStyle = hpRatio > 0.45 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(barX, barY, barW * hpRatio, barH);
    }

    // --- E. CẬP NHẬT ĐẠN CỦA SKELETON BẮN RA ---
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        let ep = enemyProjectiles[i];
        ep.x += ep.vx;
        ep.y += ep.vy;

        ctx.save();
        ctx.fillStyle = ep.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#e67e22';
        ctx.beginPath();
        ctx.arc(ep.x, ep.y, ep.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (ep.x > player.x && ep.x < player.x + player.width &&
            ep.y > player.y && ep.y < player.y + player.height) {
            player.hp -= 12; 
            if (player.hp <= 0) gameState = 'GAMEOVER';
            enemyProjectiles.splice(i, 1);
            continue;
        }

        if (ep.x < -20 || ep.x > canvas.width + 20 || ep.y < -20 || ep.y > canvas.height + 20) {
            enemyProjectiles.splice(i, 1);
        }
    }

    // --- F. XỬ LÝ HẠT NỔ PARTICLES ---
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; p.alpha -= p.decay;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // --- G. VẼ MÔ HÌNH NHÂN VẬT PLAYER ---
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.roundRect(player.x, player.y, player.width, player.height, 8);
    ctx.fill();

    ctx.save();
    ctx.fillStyle = '#ff1111';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff0000';
    ctx.beginPath();
    ctx.arc(player.x + player.width/2 - 11, player.y + player.height/2 - 3, 3.5, 0, Math.PI * 2);
    ctx.arc(player.x + player.width/2 + 11, player.y + player.height/2 - 3, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    let pBarW = 64;
    let pBarX = player.x + (player.width - pBarW) / 2;
    let pBarY = player.y - 15;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(pBarX, pBarY, pBarW, 5);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(pBarX, pBarY, pBarW * (player.hp / player.maxHp), 5);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(pBarX, pBarY + 7, pBarW, 3.5);
    if (player.skillCooldown === 0) {
        ctx.fillStyle = '#3498db'; ctx.fillRect(pBarX, pBarY + 7, pBarW, 3.5);
    } else {
        ctx.fillStyle = '#95a5a6';
        ctx.fillRect(pBarX, pBarY + 7, pBarW * (1 - player.skillCooldown / player.maxSkillCooldown), 3.5);
    }

    if (player.hp < player.maxHp) player.hp += 0.015; 

    // --- H. VẼ TIA LASER ĐÈ TRÊN BỀ MẶT ---
    drawLaser(-11, -3);
    drawLaser(11, -3);

    // --- I. VẼ THANH TIẾN TRÌNH LEVEL ---
    drawTopUI();

    requestAnimationFrame(gameLoop);
}

// --- 9. CÁC HÀM GIAO DIỆN PHỤ TRỢ (UI DRAWING) ---
function drawTopUI() {
    let barW = 340; let barH = 14;
    let barX = (canvas.width - barW) / 2;
    let barY = 25;

    ctx.fillStyle = 'rgba(236, 240, 241, 0.85)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 6);
    ctx.fill();

    let progressRatio = levelTimer / LEVEL_DURATION;
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * progressRatio, barH, 6);
    ctx.fill();

    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${currentLevel} / 3`, canvas.width / 2, barY - 8);
}

function drawScreenOverlay() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    if (gameState === 'GAMEOVER') {
        ctx.fillStyle = '#e74c3c';
        ctx.font = 'bold 45px sans-serif';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px sans-serif';
        ctx.fillText('Bầy đàn quái vật đã xé xác bạn.', canvas.width / 2, canvas.height / 2 + 20);
        ctx.fillText('Bấm phím [R] để hồi sinh phục thù!', canvas.width / 2, canvas.height / 2 + 55);
    } else if (gameState === 'VICTORY') {
        ctx.fillStyle = '#2ecc71';
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText('VICTORY!', canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#ffffff';
        ctx.font = '18px sans-serif';
        ctx.fillText('Chúc mừng chiến binh! Bạn đã sống sót thần kỳ qua 3 Cấp độ.', canvas.width / 2, canvas.height / 2 + 20);
        ctx.fillText('Bấm phím [R] để thách thức lại từ đầu.', canvas.width / 2, canvas.height / 2 + 55);
    }
}

// Khởi động toàn diện trò chơi
requestAnimationFrame(gameLoop);