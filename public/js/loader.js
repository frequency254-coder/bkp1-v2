// frontend/js/loader.js — Universal loader controller
const ajaxLoader = document.getElementById("ajax-loading");

export const showLoader = (text = "Loading…") => {
    if (!ajaxLoader) return;
    ajaxLoader.querySelector(".loader-text").innerHTML = text;
    ajaxLoader.classList.add("active");
    ajaxLoader.classList.remove("hidden");
};

export const hideLoader = () => {
    if (!ajaxLoader) return;
    ajaxLoader.classList.remove("active");
    setTimeout(() => ajaxLoader.classList.add("hidden"), 400);
};

// Optional auto-hide after fetch or page transition
document.addEventListener("ajaxStart", () => showLoader("Fetching data..."));
document.addEventListener("ajaxComplete", hideLoader);
