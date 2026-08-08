/**
 * TORQQ Global Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth check for landing page
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '') {
        if (localStorage.getItem('isLoggedIn') === 'true') {
            window.location.href = 'dashboard.html';
        }
    }

    // 2. Global Auth Protection for protected routes
    const protectedPages = ['dashboard.html', 'my-trips.html', 'tracking.html', 'wallet.html', 'profile.html', 'passes.html', 'invoice.html', 'complaints.html', 'settings.html', 'digital-pass.html', 'ride-history.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (protectedPages.includes(currentPage)) {
        if (localStorage.getItem('isLoggedIn') !== 'true') {
            // Redirect to login (landing page) if not logged in
            // Ideally we'd show the modal on the current page, but they need to be on index.html or we need the auth modal injected everywhere.
            // Since authModal is in index.html, we redirect them to index.html
            window.location.href = 'index.html';
        }
    }

    // 3. Inject Floating Enquiry HTML if not present
    if (!document.getElementById('floatingEnquiryBtn')) {
        const enquiryHTML = `
            <!-- Floating Enquiry Button -->
            <button class="floating-enquiry-btn" id="floatingEnquiryBtn" aria-label="Open Enquiry Form">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </button>

            <!-- Enquiry Modal -->
            <div class="modal-overlay" id="enquiryModal">
                <div class="modal-container modal-enquiry">
                    <button class="modal-close" id="enquiryModalCloseBtn" aria-label="Close modal">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>

                    <div class="modal-header">
                        <h3 class="modal-title">Enquiry / Support</h3>
                        <p class="modal-subtitle">How can we help you today?</p>
                    </div>

                    <div class="modal-step active" id="enquiryFormStep">
                        <form id="enquiryForm" class="modal-form">
                            <div class="form-group">
                                <label for="enquiryName">Full Name</label>
                                <input type="text" id="enquiryName" placeholder="Enter your full name" required>
                            </div>
                            <div class="form-group">
                                <label for="enquiryMobile">Mobile Number</label>
                                <div class="input-with-prefix">
                                    <span class="prefix">+91</span>
                                    <input type="tel" id="enquiryMobile" placeholder="Enter 10-digit number" pattern="[0-9]{10}" required>
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="enquiryEmail">Email (Optional)</label>
                                <input type="email" id="enquiryEmail" placeholder="Enter your email">
                            </div>
                            <div class="form-group">
                                <label for="enquiryCategory">Enquiry Category</label>
                                <select id="enquiryCategory" required class="modal-select">
                                    <option value="" disabled selected>Select category</option>
                                    <option value="pass">Commute Pass</option>
                                    <option value="billing">Billing & Refund</option>
                                    <option value="routes">Routes & Timings</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="enquiryMessage">Message</label>
                                <textarea id="enquiryMessage" placeholder="Type your message here..." rows="3" required class="modal-textarea"></textarea>
                            </div>
                            <div class="modal-actions" style="display:flex;gap:12px;margin-top:20px;">
                                <button type="button" class="btn-text" id="enquiryCancelBtn" style="flex:1;">Cancel</button>
                                <button type="submit" class="btn-primary" style="flex:1;">Submit</button>
                            </div>
                        </form>
                    </div>
                    
                    <div class="modal-step" id="enquirySuccessStep" style="display:none; text-align:center; padding: 40px 20px;">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#1DB954" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        <h3 class="modal-title">Thank you!</h3>
                        <p class="modal-subtitle">Our team will contact you shortly.</p>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', enquiryHTML);
    }

    // 4. Floating Enquiry Modal Logic
    const enquiryBtn = document.getElementById('floatingEnquiryBtn');
    const enquiryModal = document.getElementById('enquiryModal');
    const enquiryCloseBtn = document.getElementById('enquiryModalCloseBtn');
    const enquiryCancelBtn = document.getElementById('enquiryCancelBtn');
    const enquiryForm = document.getElementById('enquiryForm');
    const enquiryFormStep = document.getElementById('enquiryFormStep');
    const enquirySuccessStep = document.getElementById('enquirySuccessStep');

    if (enquiryBtn && enquiryModal) {
        // Open Modal
        enquiryBtn.addEventListener('click', () => {
            enquiryModal.classList.add('show');
            // Reset to form step
            enquiryFormStep.style.display = 'block';
            enquirySuccessStep.style.display = 'none';
            enquiryForm.reset();

            // Pre-fill if logged in
            if (localStorage.getItem('isLoggedIn') === 'true') {
                const nameInput = document.getElementById('enquiryName');
                const mobileInput = document.getElementById('enquiryMobile');
                if (nameInput) nameInput.value = localStorage.getItem('userName') || '';
                if (mobileInput) mobileInput.value = localStorage.getItem('mobileNumber') || '';
            }
        });

        // Close Modal Functions
        const closeEnquiryModal = () => {
            enquiryModal.classList.remove('show');
        };

        if (enquiryCloseBtn) enquiryCloseBtn.addEventListener('click', closeEnquiryModal);
        if (enquiryCancelBtn) enquiryCancelBtn.addEventListener('click', closeEnquiryModal);
        enquiryModal.addEventListener('click', (e) => {
            if (e.target === enquiryModal) closeEnquiryModal();
        });

        // Handle Submission
        if (enquiryForm) {
            enquiryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                submitEnquiry();
            });
        }
    }

    // Function to submit enquiry
    function submitEnquiry() {
        console.log("Submitting enquiry...");
        
        // Save to local storage temporarily
        const name = document.getElementById('enquiryName').value;
        const mobile = document.getElementById('enquiryMobile').value;
        const email = document.getElementById('enquiryEmail').value;
        const category = document.getElementById('enquiryCategory').value;
        const message = document.getElementById('enquiryMessage').value;

        const enquiryData = { name, mobile, email, category, message, date: new Date().toISOString() };
        localStorage.setItem('lastEnquiry', JSON.stringify(enquiryData));

        if (localStorage.getItem('isLoggedIn') === 'true' && typeof CUSTOMER_API !== 'undefined' && CUSTOMER_API.createTicket) {
            CUSTOMER_API.createTicket({ category, message, priority: 'Medium' })
                .then(res => {
                    console.log("Enquiry submitted to backend support ticket system:", res);
                })
                .catch(err => {
                    console.warn("Failed to log enquiry to backend:", err.message);
                });
        }

        // Show success animation/step
        if (enquiryFormStep && enquirySuccessStep) {
            enquiryFormStep.style.display = 'none';
            enquirySuccessStep.style.display = 'block';
            
            // Auto close after 3 seconds
            setTimeout(() => {
                if(enquiryModal) enquiryModal.classList.remove('show');
            }, 3000);
        }
    }
});
