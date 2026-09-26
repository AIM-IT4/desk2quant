// Homepage mentor grid: appends every published guest mentor after the
// founder card. Uses the same public catalog as /mentors.html.
(function () {
    const grid = document.getElementById('home-mentors-grid');
    if (!grid) return;
    const MAX_GUESTS = 5; // founder + 5 = two tidy rows; the rest are on /mentors.html
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const rupees = (paise) => '₹' + Math.round(paise / 100).toLocaleString('en-IN');

    function card(m, fromPaise) {
        const photo = m.photo_url && /^https:\/\//.test(m.photo_url)
            ? `<img class="mentor-photo" src="${esc(m.photo_url)}" alt="${esc(m.name)}" width="72" height="72" loading="lazy" referrerpolicy="no-referrer">`
            : `<span class="mentor-photo mentor-initials" aria-hidden="true">${esc(m.name.split(' ').map((n) => n[0]).slice(0, 2).join(''))}</span>`;
        const tags = (m.specialties || []).slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join('');
        const href = `/mentors.html?mentor=${encodeURIComponent(m.slug)}`;
        return `<article class="mentor-card">
            <span class="mentor-badge mentor-badge-guest">Guest mentor</span>
            <div class="mentor-card-top">${photo}<div>
                <h3 class="mentor-name">${esc(m.name)}</h3>
                <p class="mentor-headline">${esc(m.headline)}</p>
            </div></div>
            <div class="mentor-tags">${tags}</div>
            ${fromPaise ? `<p class="mentor-price">Sessions from <strong>${rupees(fromPaise)}</strong></p>` : ''}
            <a class="mentor-cta" href="${href}">View &amp; book <i class="fas fa-arrow-right" aria-hidden="true"></i></a>
        </article>`;
    }

    fetch('/api/products?action=mentors', { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((catalog) => {
            if (!catalog || !Array.isArray(catalog.mentors) || !catalog.mentors.length) return;
            const minPrice = {};
            (catalog.sessions || []).forEach((s) => {
                if (s.price_paise > 0 && (!minPrice[s.mentor_id] || s.price_paise < minPrice[s.mentor_id])) minPrice[s.mentor_id] = s.price_paise;
            });
            grid.insertAdjacentHTML('beforeend', catalog.mentors.slice(0, MAX_GUESTS).map((m) => card(m, minPrice[m.id])).join(''));
            grid.dataset.count = String(grid.children.length);
        })
        .catch(() => { /* founder card stays on its own */ });
})();
