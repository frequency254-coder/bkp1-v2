// picks body[data-theme] if server set it else fallback to saved theme
(function(){
    try {
        const saved = sessionStorage.getItem('freqent.theme');
        if(saved && !document.body.getAttribute('data-theme')) {
            document.body.setAttribute('data-theme', saved);
        }
        const current = document.body.getAttribute('data-theme') || saved || 'cinematic';
        document.body.setAttribute('data-theme', current);
        // persist choice
        document.addEventListener('theme:change', (e) => {
            const t = e.detail || current;
            document.body.setAttribute('data-theme', t);
            sessionStorage.setItem('freqent.theme', t);
        });
    }catch(e){}
})();
