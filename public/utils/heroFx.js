export function initHeroParticles() {
    const canvas = document.getElementById("heroParticles");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const particles = Array.from({ length: 25 }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 2 + 0.5,
        d: Math.random() * 0.5 + 0.2,
    }));

    function draw() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent");
        particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });
        move();
    }

    function move() {
        particles.forEach(p => {
            p.y += p.d;
            if (p.y > canvas.height) {
                p.y = -10;
                p.x = Math.random() * canvas.width;
            }
        });
    }

    function animate() {
        draw();
        requestAnimationFrame(animate);
    }

    animate();
}
