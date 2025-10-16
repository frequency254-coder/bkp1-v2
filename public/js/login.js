document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const loginBtn = document.getElementById("loginBtn");
    const alertContainer = document.getElementById("alertContainer");

    // ============================
    // Helper: Show alert messages
    // ============================
    function showAlert(message, type = "danger") {
        console.log(`[DEBUG] showAlert called with: "${message}", type: "${type}"`); // DEBUG
        alertContainer.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
    }

    if (loginForm && loginBtn) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            console.log("[DEBUG] Login form submitted"); // DEBUG

            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value.trim();
            console.log(`[DEBUG] Email: ${email}, Password length: ${password.length}`); // DEBUG

            if (!email || !password) {
                showAlert("⚠️ Please fill in all fields", "warning");
                return;
            }

            // Disable button during login
            loginBtn.disabled = true;
            loginBtn.textContent = "Logging in...";
            console.log("[DEBUG] Login button disabled"); // DEBUG

            try {
                console.log("[DEBUG] Sending fetch request to /api/v1/auth/login"); // DEBUG
                const res = await fetch("/api/v1/auth/login", {
                    method: "POST",
                    credentials: 'same-origin', // <-- ADD THIS (or 'include' for cross-site)
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });

                console.log(`[DEBUG] Fetch response status: ${res.status}`); // DEBUG

                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }

                const data = await res.json();
                console.log("[DEBUG] Response JSON:", data); // DEBUG

                if (!data || !data.status) {
                    throw new Error("Unexpected server response");
                }

                if (data.status === "success") {
                    showAlert("✅ Login successful! Redirecting...", "success");
                    console.log("[DEBUG] Login successful, redirecting in 500ms"); // DEBUG
                    setTimeout(() => (window.location.href = "/movies"), 500);
                } else {
                    showAlert(data.message || "❌ Invalid email or password", "danger");
                    console.log("[DEBUG] Login failed, showing alert"); // DEBUG
                }
            } catch (err) {
                console.error("[DEBUG] Login error:", err); // DEBUG
                showAlert("⚠️ Something went wrong. Please try again.", "danger");
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = "Login";
                console.log("[DEBUG] Login button re-enabled"); // DEBUG
            }
        });
    } else {
        console.warn("[DEBUG] loginForm or loginBtn not found in DOM"); // DEBUG
    }
});
