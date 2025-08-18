/** Custom context menu shown when right-clicking anywhere that's NOT the search bar **/
export function runModule() {
    const menu = document.getElementById('contextMenu');

    function showAt(x, y) {
        const pad = 8; const vw = window.innerWidth, vh = window.innerHeight;
        menu.classList.add('show')
        const rect = menu.getBoundingClientRect();
        const left = Math.min(x, vw - rect.width - pad);
        const top = Math.min(y, vh - rect.height - pad);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }
    function hide() { menu.classList.remove('show'); }

    document.addEventListener('contextmenu', (e) => {
        const insideSearch = !!e.target.closest('#search-wrap, button, a');
        if (!insideSearch) {
            e.preventDefault();
            showAt(e.clientX, e.clientY);
        } else {
            hide();
        }
    });

    document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target)) hide(); });
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}