/* ===== COMBAT FX: quan sát giao diện chiến đấu, không sửa logic game =====
   - Số sát thương / hồi máu bay lên (tự phát hiện từ thay đổi HP, kể cả đốt, độc, hút máu)
   - Vệt chém, nháy sáng, rung màn hình khi bạo kích
   - Thanh HP có vệt trắng tụt dần, viền đỏ khi HP thấp
   - Bảng thống kê trận đấu, phím tắt (Space = tấn công, 1-9 = kỹ năng/vật phẩm)
   - Hạt bóng tối bay lơ lửng làm nền */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const safe = fn => (...a) => { try { return fn(...a); } catch (e) { console.warn('[combat-fx]', e); } };
    const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n);
    let critUntil = 0;

    // Đánh dấu đòn bạo kích: log của game có biểu tượng 💥 ngay khi tung đòn
    const hookLog = () => {
        if (typeof window.logBattle !== 'function' || window.logBattle.__fx) return false;
        const orig = window.logBattle;
        const wrapped = function (msg) {
            try { if (typeof msg === 'string' && msg.includes('💥')) critUntil = performance.now() + 700; } catch (e) {}
            return orig.apply(this, arguments);
        };
        wrapped.__fx = true;
        window.logBattle = wrapped;
        return true;
    };

    // ---------- Thống kê trận đấu ----------
    const stats = { '': null, 'd-': null };
    const resetStats = pre => { stats[pre] = { dealt: 0, taken: 0, healed: 0, crits: 0, best: 0 }; drawHud(pre); };
    const hudEl = pre => {
        let el = $(pre + 'fxHud');
        if (!el) {
            const log = $(pre + 'battleLog');
            if (!log || !log.parentNode) return null;
            el = document.createElement('div');
            el.id = pre + 'fxHud';
            el.className = 'fx-hud';
            log.parentNode.insertBefore(el, log);
        }
        return el;
    };
    const drawHud = pre => {
        const s = stats[pre], el = hudEl(pre);
        if (!s || !el) return;
        el.innerHTML = `<span>⚔ Gây: <b class="d">${fmt(s.dealt)}</b></span><span>🩸 Nhận: <b class="t">${fmt(s.taken)}</b></span>` +
            `<span>💥 Bạo kích: <b class="c">${s.crits}</b></span><span>✚ Hồi: <b class="h">${fmt(s.healed)}</b></span><span>🏆 Đòn mạnh nhất: <b>${fmt(s.best)}</b></span>`;
    };

    // ---------- Hiệu ứng ----------
    const center = el => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.4, w: r.width, h: r.height };
    };
    const spawn = (cls, x, y, text, life) => {
        const n = document.createElement('div');
        n.className = cls; n.style.left = x + 'px'; n.style.top = y + 'px';
        if (text != null) n.textContent = text;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), life);
        return n;
    };
    const floatNum = safe((pre, who, delta, crit) => {
        const img = $(pre + who + '-img');
        if (!img || !img.offsetParent) return;
        const c = center(img);
        const dx = (Math.random() - 0.5) * c.w * 0.5;
        let cls = 'fx-num ', txt;
        if (delta > 0) { cls += 'heal'; txt = '+' + fmt(delta); }
        else { cls += (who === 'e' ? 'dmg-e' : 'dmg-p') + (crit ? ' crit' : ''); txt = (crit ? '💥' : '') + '-' + fmt(-delta) + (crit ? '!' : ''); }
        spawn(cls, c.x, c.y, txt, 1050).style.setProperty('--dx', dx + 'px');
    });
    const slash = safe((pre, who, crit) => {
        const img = $(pre + who + '-img');
        if (!img || !img.offsetParent) return;
        const c = center(img);
        const s = spawn('fx-slash' + (crit ? ' crit' : ''), c.x, c.y, null, 360);
        s.style.setProperty('--c', who === 'e' ? (crit ? '#ffb300' : '#7fdcff') : '#ff4d4d');
        s.style.setProperty('--r', (who === 'e' ? -35 : 30) + (Math.random() * 20 - 10) + 'deg');
        const frame = img.parentElement;
        if (frame) { frame.classList.remove('fx-hit'); void frame.offsetWidth; frame.classList.add('fx-hit'); setTimeout(() => frame.classList.remove('fx-hit'), 300); }
        if (crit) spawn('fx-screen', 0, 0, null, 260);
    });

    // Vệt trắng trên thanh HP
    const trail = safe((pre, who, pct, snap) => {
        const bar = $(pre + who + '-hp-bar');
        if (!bar || !bar.parentElement) return;
        const track = bar.parentElement;
        let tr = track.querySelector(':scope > .fx-trail');
        const w = Math.max(0, Math.min(100, pct * 100)) + '%';
        if (!tr) { tr = document.createElement('div'); tr.className = 'fx-trail'; track.insertBefore(tr, bar); tr.style.width = w; return; }
        if (snap || parseFloat(w) >= (parseFloat(tr.style.width) || 0)) {
            tr.style.transition = 'none'; tr.style.width = w; void tr.offsetWidth; tr.style.transition = '';
        } else tr.style.width = w;
    });

    // ---------- Theo dõi HP của từng bên ----------
    const track = (pre, who) => {
        const text = $(pre + who + '-hp-text');
        if (!text) return;
        const st = { hp: null, max: null, name: null };
        new MutationObserver(safe(() => {
            const m = /(-?\d+)\s*\/\s*(\d+)/.exec(text.textContent);
            if (!m) return;
            const hp = +m[1], max = +m[2];
            const nameEl = $(pre + who + '-name');
            const name = nameEl ? nameEl.textContent : '';
            const respawn = who === 'e' && st.hp !== null && st.hp <= 0 && hp > 0;
            const reset = st.hp === null || st.max !== max || st.name !== name || respawn;
            const delta = hp - (st.hp === null ? hp : st.hp);
            st.hp = hp; st.max = max; st.name = name;
            trail(pre, who, max ? hp / max : 0, reset);
            if (who === 'p') document.body.classList.toggle('fx-lowhp', hp > 0 && max > 0 && hp / max < 0.3);
            if (reset) { if (who === 'e' || !stats[pre]) resetStats(pre); return; }
            if (!delta) return;
            const s = stats[pre] || (resetStats(pre), stats[pre]);
            // Chờ 30ms để game kịp ghi log (cờ bạo kích)
            setTimeout(() => {
                const crit = delta < 0 && who === 'e' && performance.now() < critUntil;
                floatNum(pre, who, delta, crit);
                if (delta < 0) slash(pre, who, crit);
                if (who === 'e' && delta < 0) { s.dealt += -delta; s.best = Math.max(s.best, -delta); if (crit) s.crits++; }
                if (who === 'p' && delta < 0) s.taken += -delta;
                if (who === 'p' && delta > 0) s.healed += delta;
                drawHud(pre);
            }, 30);
        })).observe(text, { childList: true, characterData: true, subtree: true });
    };

    // ---------- Phím tắt ----------
    document.addEventListener('keydown', e => {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
        const panel = document.querySelector('.tab-panel.active');
        if (!panel || (panel.id !== 'tab-arena' && panel.id !== 'tab-dungeon')) return;
        const pre = panel.id === 'tab-dungeon' ? 'd-' : '';
        const popup = $('levelPopup');
        if (popup && getComputedStyle(popup).display !== 'none') return;
        if (e.code === 'Space') {
            const b = $(pre + 'btnAttack');
            if (b && b.offsetParent && !b.disabled) { e.preventDefault(); b.click(); }
            return;
        }
        if (/^Digit[1-9]$/.test(e.code)) {
            const row = $(pre + 'skillRow');
            if (!row) return;
            const items = [...row.querySelectorAll('[onclick]')].filter(el => el.offsetParent && !el.disabled && !el.parentElement.closest('[onclick]'));
            const el = items[+e.code.slice(5) - 1];
            if (el) { e.preventDefault(); el.click(); }
        }
    });

    // ---------- Hạt nền ----------
    const ambient = () => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const cv = document.createElement('canvas');
        cv.id = 'fxAmbient'; document.body.appendChild(cv);
        const ctx = cv.getContext('2d');
        let W, H;
        const resize = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
        resize(); addEventListener('resize', resize);
        const mk = init => ({ x: Math.random() * W, y: init ? Math.random() * H : H + 10, r: Math.random() * 2 + .6,
            v: Math.random() * .5 + .15, a: Math.random() * .5 + .2, p: Math.random() * 6.28, hue: Math.random() < .7 ? 200 : 270 });
        const ps = Array.from({ length: 45 }, () => mk(true));
        (function loop() {
            if (!document.hidden) {
                ctx.clearRect(0, 0, W, H);
                for (const p of ps) {
                    p.y -= p.v; p.p += .02; p.x += Math.sin(p.p) * .3;
                    if (p.y < -10) Object.assign(p, mk(false));
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
                    ctx.fillStyle = `hsla(${p.hue},90%,65%,${p.a})`; ctx.shadowColor = `hsl(${p.hue},100%,60%)`; ctx.shadowBlur = 8; ctx.fill();
                }
            }
            requestAnimationFrame(loop);
        })();
    };

    // ---------- Khởi động ----------
    const init = () => {
        if (!hookLog()) { let n = 0; const iv = setInterval(() => { if (hookLog() || ++n > 40) clearInterval(iv); }, 250); }
        const v = document.createElement('div'); v.className = 'fx-vignette'; document.body.appendChild(v);
        ['', 'd-'].forEach(pre => ['e', 'p'].forEach(who => track(pre, who)));
        ambient();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
