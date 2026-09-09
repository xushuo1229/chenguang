/**
 * 晨光自律台 · 交互式粒子背景
 * ============================================================
 * 粒子会感知鼠标位置，靠近时散开，远离时缓慢回归。
 * 使用 requestAnimationFrame 实现流畅动画。
 */
'use strict';

(function () {
  var container = null;
  var canvas = null;
  var ctx = null;
  var particles = [];
  var mouse = { x: -1000, y: -1000 };
  var PARTICLE_COUNT = 85;
  var MOUSE_RADIUS = 120;
  var SCATTER_FORCE = 8;
  var PALETTE = [187, 195, 205, 271, 300, 330, 160];

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function Particle() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = 1 + Math.random() * 4;
    this.baseX = this.x;
    this.baseY = this.y;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0.02 + Math.random() * 0.03;
    this.opacity = 0.15 + Math.random() * 0.25;
    // 赛博能量色系：青 / 蓝 / 紫 / 品红 / 薄荷 混合
    var hue = PALETTE[Math.floor(Math.random() * PALETTE.length)] + (Math.random() * 8 - 4);
    var sat = 85 + Math.random() * 15;
    var light = 58 + Math.random() * 20;
    this.color = 'hsla(' + hue + ',' + sat + '%,' + light + '%,';
  }

  Particle.prototype.update = function () {
    // 鼠标斥力
    var dx = this.x - mouse.x;
    var dy = this.y - mouse.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < MOUSE_RADIUS) {
      var force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
      var angle = Math.atan2(dy, dx);
      // 吸引：方向指向鼠标（与散开相反）
      this.vx -= Math.cos(angle) * SCATTER_FORCE * force * 0.08;
      this.vy -= Math.sin(angle) * SCATTER_FORCE * force * 0.08;
    }

    // 回归原位
    var homeX = this.baseX - this.x;
    var homeY = this.baseY - this.y;
    this.vx += homeX * this.speed * 0.05;
    this.vy += homeY * this.speed * 0.05;

    // 缓慢漂移
    this.baseX += Math.sin(Date.now() * 0.0003 + this.x) * 0.3;
    this.baseY += Math.cos(Date.now() * 0.0002 + this.y) * 0.2;

    // 阻尼
    this.vx *= 0.92;
    this.vy *= 0.92;

    this.x += this.vx;
    this.y += this.vy;
  };

  Particle.prototype.draw = function () {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color + this.opacity + ')';
    ctx.fill();
    // 发光
    ctx.shadowBlur = this.size * 4;
    ctx.shadowColor = this.color + '0.4)';
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }
    requestAnimationFrame(animate);
  }

  function init() {
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new Particle());
    }

    // 跟踪鼠标
    document.addEventListener('mousemove', function (e) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });
    document.addEventListener('mouseleave', function () {
      mouse.x = -1000;
      mouse.y = -1000;
    });

    // 点击爆发
    document.addEventListener('click', function (e) {
      var cx = e.clientX;
      var cy = e.clientY;
      var BURST_RADIUS = 400;
      var BURST_FORCE = 20;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var dx = p.x - cx;
        var dy = p.y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < BURST_RADIUS) {
          var force = (BURST_RADIUS - dist) / BURST_RADIUS;
          var angle = Math.atan2(dy, dx);
          p.vx += Math.cos(angle) * BURST_FORCE * force;
          p.vy += Math.sin(angle) * BURST_FORCE * force;
        }
      }
    });

    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
