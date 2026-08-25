/**
 * TORQQ Authentication Flow & Modal Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const authModal = document.getElementById('authModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');

    const stepMobile = document.getElementById('stepMobile');
    const stepOTP = document.getElementById('stepOTP');
    const stepPassword = document.getElementById('stepPassword');

    const mobileForm = document.getElementById('mobileForm');
    const otpForm = document.getElementById('otpForm');
    const passwordForm = document.getElementById('passwordForm');

    const nameGroup = document.getElementById('nameGroup');
    const fullNameInput = document.getElementById('fullName');
    const mobileNumberInput = document.getElementById('mobileNumber');
    const passwordMobileNumberInput = document.getElementById('passwordMobileNumber');
    const passwordInput = document.getElementById('password');
    const passwordError = document.getElementById('passwordError');

    const otpSentNumber = document.getElementById('otpSentNumber');
    const btnChangeNumber = document.getElementById('btnChangeNumber');
    const btnUseOTP = document.getElementById('btnUseOTP');
    const btnUsePassword = document.getElementById('btnUsePassword');
    const btnSwitchToOTP = document.getElementById('btnSwitchToOTP');
    const btnSwitchToPassword = document.getElementById('btnSwitchToPassword');
    const otpBoxes = document.querySelectorAll('.otp-box');

    let currentMobile = '';
    let isReturningUser = false;

    // --- Modal Triggers ---
    // Instead of using global functions, we listen to clicks on buttons that require auth
    const authRequiredButtons = [
        document.querySelector('.btn-login'),
        document.querySelector('.cta-btn'),
        ...document.querySelectorAll('.btn-card')
    ];

    authRequiredButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                checkAuthAndProceed();
            });
        }
    });

    // --- Core Logic ---
    function checkAuthAndProceed() {
        if (localStorage.getItem('isLoggedIn') === 'true') {
            // User is already logged in, go to dashboard
            window.location.href = 'dashboard.html';
        } else {
            // Open Login Modal
            openModal();
        }
    }

    function openModal() {
        authModal.classList.add('show');
        resetModalState();
    }

    function closeModal() {
        authModal.classList.remove('show');
    }

    function updateLoginMethod(method) {
        const isOtp = method === 'otp';
        if (btnUseOTP) {
            btnUseOTP.classList.toggle('is-active', isOtp);
            btnUseOTP.setAttribute('aria-pressed', String(isOtp));
        }
        if (btnUsePassword) {
            btnUsePassword.classList.toggle('is-active', !isOtp);
            btnUsePassword.setAttribute('aria-pressed', String(!isOtp));
        }
    }

    function clearPasswordError() {
        if (passwordError) {
            passwordError.textContent = '';
            passwordError.hidden = true;
        }
    }

    function showPasswordError(message) {
        if (passwordError) {
            passwordError.textContent = message;
            passwordError.hidden = false;
        } else {
            alert(message);
        }
    }

    function showPasswordStep(message = '') {
        const mobile = currentMobile || mobileNumberInput.value.trim();
        currentMobile = mobile;

        stepMobile.classList.remove('active');
        stepOTP.classList.remove('active');
        if (stepPassword) stepPassword.classList.add('active');
        otpForm.reset();
        sessionStorage.removeItem('pendingName');

        if (passwordMobileNumberInput) passwordMobileNumberInput.value = mobile;
        if (passwordInput) passwordInput.value = '';
        updateLoginMethod('password');
        clearPasswordError();

        if (message) showPasswordError(message);
        if (passwordMobileNumberInput) passwordMobileNumberInput.focus();
    }

    function showOtpStep() {
        const mobile = passwordMobileNumberInput ? passwordMobileNumberInput.value.trim() : '';
        if (mobile) mobileNumberInput.value = mobile;

        if (stepPassword) stepPassword.classList.remove('active');
        stepOTP.classList.remove('active');
        stepMobile.classList.add('active');
        if (passwordForm) passwordForm.reset();
        clearPasswordError();
        updateLoginMethod('otp');
        mobileNumberInput.focus();
    }

    function resetModalState() {
        stepMobile.classList.add('active');
        stepOTP.classList.remove('active');
        if (stepPassword) stepPassword.classList.remove('active');
        mobileForm.reset();
        otpForm.reset();
        if (passwordForm) passwordForm.reset();
        clearPasswordError();
        updateLoginMethod('otp');
        currentMobile = '';

        // Check if we have a saved user to determine returning user flow
        const savedName = localStorage.getItem('userName');
        const savedMobile = localStorage.getItem('mobileNumber');

        if (savedMobile) {
            isReturningUser = true;
            nameGroup.style.display = 'none'; // Hide name field
            mobileNumberInput.value = savedMobile; // Pre-fill
        } else {
            isReturningUser = false;
            nameGroup.style.display = 'block'; // Show name field
        }
    }

    modalCloseBtn.addEventListener('click', closeModal);
    authModal.addEventListener('click', (e) => {
        if (e.target === authModal) closeModal();
    });

    var API_BASE_URL = (window.TORQQ_API_BASE || '/api/v1');

    function completeLegacyLogin(data) {
        const loginData = data && data.data;
        const user = loginData && loginData.user;

        if (!data || !data.success || !loginData || !loginData.accessToken || !user) {
            return false;
        }

        if (user.role !== 'Customer') {
            return false;
        }

        localStorage.setItem('accessToken', loginData.accessToken);
        if (loginData.refreshToken) {
            localStorage.setItem('refreshToken', loginData.refreshToken);
        } else {
            localStorage.removeItem('refreshToken');
        }
        localStorage.setItem('userName', user.name);
        localStorage.setItem('mobileNumber', user.phone);
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userRole', user.role);
        localStorage.setItem('userId', user.id || user._id);

        closeModal();
        window.location.href = 'dashboard.html';
        return true;
    }

    function isPasswordLoginDirection(data) {
        return Boolean(data && /use password login/i.test(data.message || ''));
    }

    // --- Step 1: Mobile Form Submit ---
    mobileForm.addEventListener('submit', (e) => {
        e.preventDefault();

        if (!isReturningUser && !fullNameInput.value.trim()) {
            alert('Please enter your full name');
            return;
        }

        currentMobile = mobileNumberInput.value.trim();
        const pendingName = isReturningUser ? '' : fullNameInput.value.trim();
        sessionStorage.setItem('pendingName', pendingName);

        console.log(`Sending OTP to +91 ${currentMobile}...`);

        fetch(`${API_BASE_URL}/auth/send-otp`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentMobile, purpose: 'LOGIN' })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    // Transition to OTP Step
                    otpSentNumber.textContent = `+91 ${currentMobile}`;
                    stepMobile.classList.remove('active');
                    stepOTP.classList.add('active');
                    otpBoxes[0].focus();
                } else {
                    alert(data.message || 'Failed to send OTP. Please try again.');
                }
            })
            .catch(err => {
                console.error(err);
                alert(`Could not reach the TORQQ backend at ${API_BASE_URL}.\n\nStart it with "npm run dev" and open this page from the address it prints.`);
            });
    });

    // --- Step 2: OTP Form Logic ---
    // Handle OTP Box auto-advance
    otpBoxes.forEach((box, index) => {
        box.addEventListener('input', (e) => {
            if (e.target.value.length === 1) {
                if (index < otpBoxes.length - 1) {
                    otpBoxes[index + 1].focus();
                }
            }
        });

        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && e.target.value === '') {
                if (index > 0) {
                    otpBoxes[index - 1].focus();
                }
            }
        });
    });

    btnChangeNumber.addEventListener('click', () => {
        stepOTP.classList.remove('active');
        stepMobile.classList.add('active');
        mobileNumberInput.focus();
    });

    document.getElementById('btnResendOTP').addEventListener('click', () => {
        console.log('Resending OTP...');
        fetch(`${API_BASE_URL}/auth/send-otp`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentMobile, purpose: 'LOGIN' })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert('OTP Resent!');
                } else {
                    alert(data.message || 'Failed to resend OTP.');
                }
            })
            .catch(err => {
                console.error(err);
                alert('Failed to resend OTP. Server connection error.');
            });
    });

    otpForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const otpValue = Array.from(otpBoxes).map(box => box.value).join('');
        if (otpValue.length !== 6) {
            alert('Please enter complete OTP');
            return;
        }

        const pendingName = sessionStorage.getItem('pendingName') || '';

        fetch(`${API_BASE_URL}/auth/verify-otp`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: currentMobile,
                otp: otpValue,
                purpose: 'LOGIN',
                name: pendingName
            })
        })
            .then(res => res.json())
            .then(data => {
                if (completeLegacyLogin(data)) {
                    return;
                }

                if (isPasswordLoginDirection(data)) {
                    showPasswordStep(data.message);
                    return;
                }

                alert(data.message || 'Invalid OTP code.');
            })
            .catch(err => {
                console.error(err);
                alert('Verification connection error.');
            });
    });

    // --- Password Login ---
    if (btnUsePassword) btnUsePassword.addEventListener('click', () => showPasswordStep());
    if (btnSwitchToPassword) btnSwitchToPassword.addEventListener('click', () => showPasswordStep());
    if (btnUseOTP) btnUseOTP.addEventListener('click', showOtpStep);
    if (btnSwitchToOTP) btnSwitchToOTP.addEventListener('click', showOtpStep);

    if (passwordForm) {
        passwordForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const phone = passwordMobileNumberInput.value.trim();
            const password = passwordInput.value;
            clearPasswordError();

            if (!/^\d{10}$/.test(phone)) {
                showPasswordError('Please enter a valid 10-digit mobile number.');
                passwordMobileNumberInput.focus();
                return;
            }

            if (!password) {
                showPasswordError('Please enter your password.');
                passwordInput.focus();
                return;
            }

            currentMobile = phone;
            fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            })
                .then(res => res.json())
                .then(data => {
                    if (data && data.success && data.data && data.data.user && data.data.user.role !== 'Customer') {
                        showPasswordError('This account cannot access the customer portal.');
                        return;
                    }

                    if (completeLegacyLogin(data)) {
                        return;
                    }

                    showPasswordError(data.message || 'Unable to sign in. Please check your credentials.');
                })
                .catch(err => {
                    console.error(err);
                    showPasswordError('Unable to connect to the server. Please try again.');
                });
        });
    }
});
