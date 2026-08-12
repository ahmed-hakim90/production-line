/** Resolve showcase screenshots: show image if it loads, else a labeled placeholder. */
(function () {
  document.querySelectorAll("figure.shot[data-src]").forEach((fig) => {
    const src = fig.getAttribute("data-src");
    const fallback = fig.getAttribute("data-fallback") || "لقطة شاشة";
    const img = new Image();
    img.alt = fallback;
    img.onload = () => {
      fig.innerHTML = "";
      fig.appendChild(img);
      const cap = document.createElement("figcaption");
      cap.textContent = fallback;
      fig.appendChild(cap);
    };
    img.onerror = () => {
      fig.innerHTML =
        '<div class="missing-shot">لقطة حية قريبًا<small>' +
        fallback +
        "<br/>شغّل npm run showcase:screens</small></div>" +
        "<figcaption>" +
        fallback +
        "</figcaption>";
    };
    img.src = src;
  });
})();
