/**
 * TORQQ Authentication Flow & Modal Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const authModal = document.getElementById('authModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    
    const stepMobile = document.getElementById('stepMobile');
    const stepOTP = document.getElementById('stepOTP');
    
    const mobileForm = document.getElementById('mobileForm');
    const otpForm = document.getElementById('otpForm');
    
    const nameGroup = document.getElementById('nameGroup');
    const fullNameInput = document.getElementById('fullName');
    const mobileNumberInput = document.getElementById('mobileNumber');
    
    const otpSentNumber = document.getElementById('otpSentNumber');
    const btnChangeNumber = document.getElementById('btnChangeNumber');
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
        if(btn) {
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

    function resetModalState() {
        stepMobile.classList.add('active');
        stepOTP.classList.remove('active');
        mobileForm.reset();
        otpForm.reset();
        
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

    var API_BASE_URL = 'http://localhost:4000/api/v1';
    var FETCH_OPTS = { credentials: 'include' };

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
            alert('Failed to connect to backend server. Make sure it is running on port 5000.');
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
            if (data.success && data.data && data.data.accessToken) {
                // Save to LocalStorage
                localStorage.setItem('accessToken', data.data.accessToken);
                localStorage.setItem('refreshToken', data.data.refreshToken);
                localStorage.setItem('userName', data.data.user.name);
                localStorage.setItem('mobileNumber', data.data.user.phone);
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userRole', data.data.user.role);
                localStorage.setItem('userId', data.data.user.id || data.data.user._id);
                
                closeModal();
                
                // Redirect to dashboard
                window.location.href = 'dashboard.html';
            } else {
                alert(data.message || 'Invalid OTP code.');
            }
        })
        .catch(err => {
            console.error(err);
            alert('Verification connection error.');
        });
    });

    function loginSuccess() {
        // Save to LocalStorage
        if (!isReturningUser) {
            localStorage.setItem('userName', fullNameInput.value.trim());
        }
        localStorage.setItem('mobileNumber', currentMobile);
        localStorage.setItem('isLoggedIn', 'true');
        
        closeModal();
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
    }
});
